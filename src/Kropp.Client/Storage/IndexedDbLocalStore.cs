using Kropp.Shared.Sync;
using Microsoft.JSInterop;

namespace Kropp.Client.Storage;

/// <summary>The browser's <see cref="ILocalStore"/>: a thin bridge to <c>wwwroot/js/kropp-db.js</c>.</summary>
internal sealed class IndexedDbLocalStore(IJSRuntime js) : ILocalStore, IAsyncDisposable
{
    private const string WatermarkName = "watermark";
    private Task<IJSObjectReference>? module;

    private Task<IJSObjectReference> Module =>
        module ??= js.InvokeAsync<IJSObjectReference>("import", "./js/kropp-db.js").AsTask();

    public async Task<LocalRecord?> GetAsync(string key) =>
        await (await Module).InvokeAsync<LocalRecord?>("get", key);

    public async Task<IReadOnlyList<LocalRecord>> GetAllAsync(string type) =>
        await (await Module).InvokeAsync<LocalRecord[]>("getAll", type);

    public async Task<IReadOnlyList<LocalRecord>> GetPendingAsync() =>
        await (await Module).InvokeAsync<LocalRecord[]>("getPending");

    public async Task PutAsync(LocalRecord record) =>
        await (await Module).InvokeVoidAsync("put", record);

    public async Task MarkSyncedAsync(IReadOnlyList<PushedVersion> pushed)
    {
        if (pushed.Count > 0)
            await (await Module).InvokeVoidAsync("markSynced", pushed);
    }

    public async Task ApplyFromServerAsync(IReadOnlyList<SyncRecord> records)
    {
        if (records.Count > 0)
            await (await Module).InvokeVoidAsync("applyFromServer", records);
    }

    public async Task<long> GetWatermarkAsync() =>
        await (await Module).InvokeAsync<long?>("getMeta", WatermarkName) ?? 0;

    public async Task SetWatermarkAsync(long serverSeq) =>
        await (await Module).InvokeVoidAsync("setMeta", WatermarkName, serverSeq);

    public async ValueTask DisposeAsync()
    {
        if (module is not null)
            await (await module).DisposeAsync();
    }
}
