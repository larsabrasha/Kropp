using System.Net;
using Kropp.Shared.Sync;

namespace Kropp.UnitTests.Sync;

/// <summary>
/// A server in memory with the same rules as the real one: newer ModifiedAt wins, an equal or
/// older one is rejected with the server's copy, and every accepted write gets the next number.
/// </summary>
internal sealed class FakeSyncApi : ISyncApi
{
    private readonly Dictionary<string, SyncRecord> documents = [];
    private long seq;

    public int PageSize { get; set; } = SyncLimits.MaxChangesPerPull;
    public Exception? FailWith { get; set; }
    public Func<Task>? DuringPush { get; set; }
    public List<PushRequest> Pushes { get; } = [];
    public List<long> Pulls { get; } = [];

    public IReadOnlyCollection<SyncRecord> Documents => documents.Values;

    public async Task<PushResponse> PushAsync(PushRequest request, CancellationToken cancellationToken)
    {
        if (FailWith is not null)
            throw FailWith;
        Pushes.Add(request);
        if (DuringPush is not null)
            await DuringPush();

        var rejected = new List<SyncRecord>();
        foreach (var change in request.Changes.OrderBy(c => c.ModifiedAt))
        {
            var key = LocalRecord.KeyOf(change.Type, change.Id);
            if (documents.TryGetValue(key, out var existing) && change.ModifiedAt <= existing.ModifiedAt)
            {
                rejected.Add(existing);
                continue;
            }
            documents[key] = new SyncRecord(change.Type, change.Id, change.ModifiedAt, change.IsDeleted, change.Data, ++seq);
        }
        return new PushResponse(rejected);
    }

    public Task<PullResponse> PullAsync(long since, CancellationToken cancellationToken)
    {
        if (FailWith is not null)
            throw FailWith;
        Pulls.Add(since);

        var page = documents.Values.Where(d => d.ServerSeq > since).OrderBy(d => d.ServerSeq).Take(PageSize + 1).ToList();
        var changes = page.Take(PageSize).ToList();
        return Task.FromResult(new PullResponse(changes, changes.Count > 0 ? changes[^1].ServerSeq : since, page.Count > PageSize));
    }

    /// <summary>Stores a change as if another device had pushed it.</summary>
    public SyncRecord SeedFromOtherDevice(SyncChange change)
    {
        var record = new SyncRecord(change.Type, change.Id, change.ModifiedAt, change.IsDeleted, change.Data, ++seq);
        documents[LocalRecord.KeyOf(change.Type, change.Id)] = record;
        return record;
    }

    public static HttpRequestException Unreachable() => new("No route to host");
    public static HttpRequestException ServerError() => new("Internal Server Error", null, HttpStatusCode.InternalServerError);
}
