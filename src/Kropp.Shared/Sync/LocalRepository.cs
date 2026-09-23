using System.Text.Json;

namespace Kropp.Shared.Sync;

/// <summary>
/// Typed reads and writes against the local store. Every write lands in the outbox and raises
/// <see cref="Changed"/>, which the sync scheduler listens to.
/// </summary>
public sealed class LocalRepository(ILocalStore store, TimeProvider? time = null)
{
    private readonly TimeProvider time = time ?? TimeProvider.System;

    public event Action? Changed;

    public async Task<IReadOnlyList<T>> GetAllAsync<T>()
    {
        var records = await store.GetAllAsync(AggregateTypes.Of<T>());
        return [.. records
            .Where(r => !r.IsDeleted && r.Data is not null)
            .Select(r => JsonSerializer.Deserialize<T>(r.Data!, KroppJson.Options)!)];
    }

    public Task SaveAsync<T>(Guid id, T aggregate) =>
        PutAsync(AggregateTypes.Of<T>(), id, JsonSerializer.Serialize(aggregate, KroppJson.Options), isDeleted: false);

    /// <summary>Leaves a tombstone, so the deletion reaches the server and every other device.</summary>
    public Task DeleteAsync<T>(Guid id) => PutAsync(AggregateTypes.Of<T>(), id, data: null, isDeleted: true);

    private async Task PutAsync(string type, Guid id, string? data, bool isDeleted)
    {
        var modifiedAt = SyncClock.Now(time);

        // Two saves inside one millisecond would otherwise share a stamp, and the second could be
        // mistaken for the already-confirmed first.
        var existing = await store.GetAsync(LocalRecord.KeyOf(type, id));
        if (existing is not null && modifiedAt <= existing.ModifiedAt)
            modifiedAt = existing.ModifiedAt.AddMilliseconds(1);

        await store.PutAsync(new LocalRecord(type, id, modifiedAt, isDeleted, data, Pending: true));
        Changed?.Invoke();
    }
}
