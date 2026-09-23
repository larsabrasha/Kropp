namespace Kropp.Shared.Sync;

/// <summary>
/// One aggregate as it travels. <see cref="Data"/> is the aggregate's JSON, null for a tombstone.
/// <see cref="ModifiedAt"/> is stamped by the client that made the change and decides conflicts.
/// </summary>
public sealed record SyncChange(
    string Type,
    Guid Id,
    DateTimeOffset ModifiedAt,
    bool IsDeleted,
    string? Data);

/// <summary>A change as the server holds it, with the sequence number it was given on arrival.</summary>
public sealed record SyncRecord(
    string Type,
    Guid Id,
    DateTimeOffset ModifiedAt,
    bool IsDeleted,
    string? Data,
    long ServerSeq);

public sealed record PushRequest(IReadOnlyList<SyncChange> Changes);

/// <summary>
/// <see cref="Rejected"/> holds the server's copy of every change that lost to a newer one, so
/// the client can take it even when that copy is older than the client's pull watermark.
/// </summary>
public sealed record PushResponse(IReadOnlyList<SyncRecord> Rejected);

/// <summary>
/// <see cref="ServerSeq"/> is the watermark for the next pull: the last sequence number in
/// <see cref="Changes"/>, or the requested one when there was nothing new.
/// </summary>
public sealed record PullResponse(IReadOnlyList<SyncRecord> Changes, long ServerSeq, bool HasMore);

public static class SyncLimits
{
    public const int MaxChangesPerPush = 200;
    public const int MaxChangesPerPull = 500;
    public const int MaxDocumentLength = 64 * 1024;
}
