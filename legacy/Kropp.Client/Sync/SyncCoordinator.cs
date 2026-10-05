using Kropp.Shared.Sync;
using Kropp.Shared.Training;
using Microsoft.JSInterop;

namespace Kropp.Client.Sync;

/// <summary>
/// Decides when to sync: at start, when the network returns, when the app becomes visible,
/// a few seconds after a local save, and every minute while open. iOS offers no background sync,
/// so a closed app catches up the next time it is opened.
/// </summary>
internal sealed class SyncCoordinator(SyncEngine engine, LocalRepository repository, WorkoutTrash trash, IJSRuntime js, ILogger<SyncCoordinator> logger)
    : IAsyncDisposable
{
    internal static readonly TimeSpan SaveDebounce = TimeSpan.FromSeconds(3);
    internal static readonly TimeSpan Interval = TimeSpan.FromSeconds(60);

    private IJSObjectReference? module;
    private IJSObjectReference? registration;
    private DotNetObjectReference<SyncCoordinator>? self;
    private CancellationTokenSource? debounce;
    private readonly CancellationTokenSource stopping = new();

    public async Task StartAsync()
    {
        module = await js.InvokeAsync<IJSObjectReference>("import", "./js/kropp-sync.js");
        self = DotNetObjectReference.Create(this);
        registration = await module.InvokeAsync<IJSObjectReference>("register", self);
        await module.InvokeAsync<bool>("requestPersistentStorage");

        repository.Changed += OnLocalChange;
        await PurgeTrashAsync();
        await engine.RefreshPendingCountAsync();

        _ = RunPeriodicAsync(stopping.Token);

        // Not awaited: on a weak signal the first round can take until the HTTP timeout, and the
        // app must open at once from local data.
        _ = RequestSyncAsync();
    }

    /// <summary>Before the first sync, so what is deleted for good goes out with it.</summary>
    private async Task PurgeTrashAsync()
    {
        try
        {
            await trash.PurgeAsync();
        }
        catch (Exception ex)
        {
            logger.LogWarning(ex, "Could not empty the trash");
        }
    }

    [JSInvokable]
    public Task OnOnline() => RequestSyncAsync();

    [JSInvokable]
    public Task OnOffline() => engine.MarkOfflineAsync();

    [JSInvokable]
    public Task OnVisible() => RequestSyncAsync();

    private void OnLocalChange()
    {
        _ = engine.RefreshPendingCountAsync();

        debounce?.Cancel();
        debounce = CancellationTokenSource.CreateLinkedTokenSource(stopping.Token);
        _ = SyncAfterAsync(SaveDebounce, debounce.Token);
    }

    private async Task SyncAfterAsync(TimeSpan delay, CancellationToken cancellationToken)
    {
        try
        {
            await Task.Delay(delay, cancellationToken);
            await RequestSyncAsync();
        }
        catch (OperationCanceledException)
        {
            // A newer save restarted the wait.
        }
    }

    private async Task RunPeriodicAsync(CancellationToken cancellationToken)
    {
        using var timer = new PeriodicTimer(Interval);
        try
        {
            while (await timer.WaitForNextTickAsync(cancellationToken))
                await RequestSyncAsync();
        }
        catch (OperationCanceledException)
        {
        }
    }

    public Task SyncNowAsync() => RequestSyncAsync();

    private async Task RequestSyncAsync()
    {
        try
        {
            if (module is not null && !await module.InvokeAsync<bool>("isOnline"))
            {
                await engine.MarkOfflineAsync();
                return;
            }

            await engine.SyncAsync(stopping.Token);
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            logger.LogWarning(ex, "Could not start a sync");
        }
    }

    public async ValueTask DisposeAsync()
    {
        repository.Changed -= OnLocalChange;
        await stopping.CancelAsync();
        if (registration is not null)
        {
            await registration.InvokeVoidAsync("dispose");
            await registration.DisposeAsync();
        }
        if (module is not null)
            await module.DisposeAsync();
        self?.Dispose();
    }
}
