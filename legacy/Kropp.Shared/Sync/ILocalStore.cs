namespace Kropp.Shared.Sync;

/// <summary>
/// The client's own copy of the data. In the browser it is IndexedDB; in tests it is memory.
/// </summary>
public interface ILocalStore
{
    Task<LocalRecord?> GetAsync(string key);

    Task<IReadOnlyList<LocalRecord>> GetAllAsync(string type);

    Task<IReadOnlyList<LocalRecord>> GetPendingAsync();

    Task PutAsync(LocalRecord record);

    /// <summary>
    /// Clears <see cref="LocalRecord.Pending"/> on each record whose <see cref="LocalRecord.ModifiedAt"/>
    /// still equals the pushed one, and leaves a record edited since then pending. Must be atomic
    /// per record against <see cref="PutAsync"/>.
    /// </summary>
    Task MarkSyncedAsync(IReadOnlyList<PushedVersion> pushed);

    /// <summary>
    /// Stores each server record unless the local copy is pending and newer, in which case the
    /// local change wins and is pushed on the next round. Same atomicity as <see cref="MarkSyncedAsync"/>.
    /// </summary>
    Task ApplyFromServerAsync(IReadOnlyList<SyncRecord> records);

    Task<long> GetWatermarkAsync();

    Task SetWatermarkAsync(long serverSeq);
}
