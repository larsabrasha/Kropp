using Kropp.Data;
using Kropp.Shared.Sync;
using Microsoft.EntityFrameworkCore;

namespace Kropp.Api.Sync;

internal sealed class SyncService(KroppContext db, ILogger<SyncService> logger)
{
    // Any fixed number; it only has to be the same for every push.
    private const long PushLockKey = 0x4b726f7070;

    /// <summary>
    /// Stores a batch in one transaction. Newer <see cref="SyncChange.ModifiedAt"/> wins; an equal
    /// or older one is rejected and the server's copy returned, which also makes a repeated push
    /// of the same batch harmless.
    /// </summary>
    public async Task<PushResponse> PushAsync(IReadOnlyList<SyncChange> changes, CancellationToken cancellationToken)
    {
        var rejected = new List<SyncRecord>();
        var accepted = 0;

        var strategy = db.Database.CreateExecutionStrategy();
        await strategy.ExecuteAsync(async () =>
        {
            rejected.Clear();
            accepted = 0;
            db.ChangeTracker.Clear();

            await using var transaction = await db.Database.BeginTransactionAsync(cancellationToken);

            // Pushes run one at a time, so sequence numbers are committed in the order they are
            // taken. Without that a pull could see seq 8 before a slower push commits seq 7, move
            // its watermark past 7 and never receive it.
            await db.Database.ExecuteSqlAsync($"SELECT pg_advisory_xact_lock({PushLockKey})", cancellationToken);

            // Oldest first, so when one batch carries the same aggregate twice the newest ends up stored.
            foreach (var change in changes.OrderBy(c => c.ModifiedAt))
            {
                var modifiedAt = SyncClock.Truncate(change.ModifiedAt);
                var existing = await db.SyncDocuments.FindAsync([change.Type, change.Id], cancellationToken);

                if (existing is not null && modifiedAt <= existing.ModifiedAt)
                {
                    rejected.RemoveAll(r => r.Type == existing.Type && r.Id == existing.Id);
                    rejected.Add(ToRecord(existing));
                    continue;
                }

                var seq = await NextSequenceAsync(cancellationToken);
                if (existing is null)
                {
                    db.SyncDocuments.Add(new SyncDocument
                    {
                        Type = change.Type,
                        Id = change.Id,
                        ModifiedAt = modifiedAt,
                        IsDeleted = change.IsDeleted,
                        Data = change.Data,
                        ServerSeq = seq,
                    });
                }
                else
                {
                    existing.ModifiedAt = modifiedAt;
                    existing.IsDeleted = change.IsDeleted;
                    existing.Data = change.Data;
                    existing.ServerSeq = seq;
                }

                // A later change to the same aggregate in this batch may have been rejected earlier.
                rejected.RemoveAll(r => r.Type == change.Type && r.Id == change.Id);
                accepted++;
            }

            await db.SaveChangesAsync(cancellationToken);
            await transaction.CommitAsync(cancellationToken);
        });

        logger.LogInformation("Sync push: {Accepted} accepted, {Rejected} rejected", accepted, rejected.Count);
        return new PushResponse(rejected);
    }

    public async Task<PullResponse> PullAsync(long since, CancellationToken cancellationToken)
    {
        var page = await db.SyncDocuments
            .AsNoTracking()
            .Where(d => d.ServerSeq > since)
            .OrderBy(d => d.ServerSeq)
            .Take(SyncLimits.MaxChangesPerPull + 1)
            .ToListAsync(cancellationToken);

        var hasMore = page.Count > SyncLimits.MaxChangesPerPull;
        var changes = page.Take(SyncLimits.MaxChangesPerPull).Select(ToRecord).ToList();
        var watermark = changes.Count > 0 ? changes[^1].ServerSeq : since;
        return new PullResponse(changes, watermark, hasMore);
    }

    private async Task<long> NextSequenceAsync(CancellationToken cancellationToken) =>
        await db.Database
            .SqlQueryRaw<long>($"SELECT nextval('{KroppContext.SyncSequence}') AS \"Value\"")
            .SingleAsync(cancellationToken);

    private static SyncRecord ToRecord(SyncDocument d) =>
        new(d.Type, d.Id, d.ModifiedAt, d.IsDeleted, d.Data, d.ServerSeq);
}
