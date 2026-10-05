namespace Kropp.Shared.Sync;

/// <summary>
/// <see cref="ILocalStore"/> in memory. The tests run the sync engine against it, so it is also
/// the reference for the rules <c>kropp-db.js</c> must follow.
/// </summary>
public sealed class MemoryLocalStore : ILocalStore
{
    private readonly Lock gate = new();
    private readonly Dictionary<string, LocalRecord> records = [];
    private long watermark;

    public Task<LocalRecord?> GetAsync(string key)
    {
        lock (gate) return Task.FromResult(records.GetValueOrDefault(key));
    }

    public Task<IReadOnlyList<LocalRecord>> GetAllAsync(string type)
    {
        lock (gate) return Task.FromResult<IReadOnlyList<LocalRecord>>([.. records.Values.Where(r => r.Type == type)]);
    }

    public Task<IReadOnlyList<LocalRecord>> GetPendingAsync()
    {
        lock (gate) return Task.FromResult<IReadOnlyList<LocalRecord>>([.. records.Values.Where(r => r.Pending)]);
    }

    public Task PutAsync(LocalRecord record)
    {
        lock (gate) records[record.Key] = record;
        return Task.CompletedTask;
    }

    public Task MarkSyncedAsync(IReadOnlyList<PushedVersion> pushed)
    {
        lock (gate)
        {
            foreach (var p in pushed)
            {
                if (records.TryGetValue(p.Key, out var local) && local.Pending && local.ModifiedAt == p.ModifiedAt)
                    records[p.Key] = local with { Pending = false };
            }
        }
        return Task.CompletedTask;
    }

    public Task ApplyFromServerAsync(IReadOnlyList<SyncRecord> incoming)
    {
        lock (gate)
        {
            foreach (var r in incoming)
            {
                var key = LocalRecord.KeyOf(r.Type, r.Id);
                if (records.TryGetValue(key, out var local) && local.Pending && local.ModifiedAt > r.ModifiedAt)
                    continue;
                records[key] = LocalRecord.FromServer(r);
            }
        }
        return Task.CompletedTask;
    }

    public Task<long> GetWatermarkAsync()
    {
        lock (gate) return Task.FromResult(watermark);
    }

    public Task SetWatermarkAsync(long serverSeq)
    {
        lock (gate) watermark = serverSeq;
        return Task.CompletedTask;
    }
}
