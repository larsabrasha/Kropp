using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Logging.Abstractions;

namespace Kropp.Shared.Sync;

/// <summary>
/// Pushes the outbox, then pulls everything newer than the watermark. Only one round runs at a
/// time; a request that arrives during a round makes it run once more when it ends, so a change
/// saved mid-sync is never left waiting for the next trigger.
/// </summary>
public sealed class SyncEngine(ILocalStore store, ISyncApi api, TimeProvider? time = null, ILogger<SyncEngine>? logger = null)
{
    private readonly TimeProvider time = time ?? TimeProvider.System;
    private readonly ILogger logger = logger ?? NullLogger<SyncEngine>.Instance;
    private readonly Lock gate = new();
    private Task? running;
    private bool rerun;

    public SyncStatus Status { get; private set; } = SyncStatus.Initial;

    /// <summary>Raised when <see cref="Status"/> changes.</summary>
    public event Action<SyncStatus>? StatusChanged;

    /// <summary>Raised after a pull stored data from the server, so views can reload.</summary>
    public event Action? DataChanged;

    public Task SyncAsync(CancellationToken cancellationToken = default)
    {
        lock (gate)
        {
            if (running is not null)
            {
                rerun = true;
                return running;
            }

            running = RunAsync(cancellationToken);
            return running;
        }
    }

    /// <summary>Recounts the outbox after a local save, without contacting the server.</summary>
    public async Task RefreshPendingCountAsync()
    {
        var pending = await store.GetPendingAsync();
        SetStatus(Status with { PendingCount = pending.Count });
    }

    /// <summary>Tells the engine the browser has no network, so it does not have to fail a request to find out.</summary>
    public async Task MarkOfflineAsync()
    {
        var pending = await store.GetPendingAsync();
        SetStatus(Status with { State = SyncState.Offline, PendingCount = pending.Count });
    }

    private async Task RunAsync(CancellationToken cancellationToken)
    {
        // Leave SyncAsync's lock before doing anything. A round against stores that complete
        // synchronously would otherwise finish, clear `running`, and then have SyncAsync assign the
        // finished task to it — after which no sync would ever start again.
        await Task.Yield();

        try
        {
            while (true)
            {
                lock (gate) rerun = false;

                await RoundAsync(cancellationToken);

                lock (gate)
                {
                    if (!rerun)
                    {
                        running = null;
                        return;
                    }
                }
            }
        }
        catch
        {
            lock (gate) running = null;
            throw;
        }
    }

    private async Task RoundAsync(CancellationToken cancellationToken)
    {
        SetStatus(Status with { State = SyncState.Syncing });
        var receivedData = false;

        try
        {
            await PushAsync(cancellationToken);
            receivedData = await PullAsync(cancellationToken);

            var pending = await store.GetPendingAsync();
            SetStatus(new SyncStatus(SyncState.Idle, pending.Count, time.GetUtcNow()));
        }
        catch (Exception ex) when (!cancellationToken.IsCancellationRequested)
        {
            // Nothing is lost here: the outbox is only cleared for changes the server confirmed,
            // and the watermark only moves past changes already stored. The next round retries.
            var unreachable = ex is HttpRequestException { StatusCode: null } or TaskCanceledException;
            if (unreachable)
                logger.LogInformation("Sync could not reach the server: {Message}", ex.Message);
            else
                logger.LogWarning(ex, "Sync failed");

            var pending = await store.GetPendingAsync();
            SetStatus(Status with { State = unreachable ? SyncState.Offline : SyncState.Failed, PendingCount = pending.Count });
        }
        finally
        {
            if (receivedData)
                DataChanged?.Invoke();
        }
    }

    private async Task PushAsync(CancellationToken cancellationToken)
    {
        var pending = await store.GetPendingAsync();

        foreach (var batch in pending.Chunk(SyncLimits.MaxChangesPerPush))
        {
            var response = await api.PushAsync(new PushRequest([.. batch.Select(r => r.ToChange())]), cancellationToken);

            // Rejected changes lost to a newer copy on the server. Taking that copy settles them;
            // marking the rest synced clears them from the outbox.
            var rejected = response.Rejected.Select(r => LocalRecord.KeyOf(r.Type, r.Id)).ToHashSet();
            if (response.Rejected.Count > 0)
            {
                await store.MarkSyncedAsync([.. batch
                    .Where(r => rejected.Contains(r.Key))
                    .Select(r => new PushedVersion(r.Key, r.ModifiedAt))]);
                await store.ApplyFromServerAsync(response.Rejected);
                DataChanged?.Invoke();
            }

            await store.MarkSyncedAsync([.. batch
                .Where(r => !rejected.Contains(r.Key))
                .Select(r => new PushedVersion(r.Key, r.ModifiedAt))]);
        }
    }

    private async Task<bool> PullAsync(CancellationToken cancellationToken)
    {
        var receivedData = false;
        var since = await store.GetWatermarkAsync();

        while (true)
        {
            var response = await api.PullAsync(since, cancellationToken);

            if (response.Changes.Count > 0)
            {
                await store.ApplyFromServerAsync(response.Changes);
                receivedData = true;
            }

            // Stored after the changes, so a crash in between re-pulls them instead of skipping them.
            if (response.ServerSeq != since)
                await store.SetWatermarkAsync(response.ServerSeq);
            since = response.ServerSeq;

            if (!response.HasMore)
                return receivedData;
        }
    }

    private void SetStatus(SyncStatus status)
    {
        if (status == Status)
            return;
        Status = status;
        StatusChanged?.Invoke(status);
    }
}
