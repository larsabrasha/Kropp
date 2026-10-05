namespace Kropp.Shared.Sync;

public enum SyncState
{
    Idle,
    Syncing,

    /// <summary>The server could not be reached. Local changes wait in the outbox.</summary>
    Offline,

    /// <summary>The server answered with an error. Local changes wait in the outbox.</summary>
    Failed,
}

public sealed record SyncStatus(SyncState State, int PendingCount, DateTimeOffset? LastSyncedAt)
{
    public static readonly SyncStatus Initial = new(SyncState.Idle, 0, null);
}
