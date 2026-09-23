namespace Kropp.Shared.Sync;

/// <summary>
/// An aggregate as the client keeps it. <see cref="Pending"/> marks a local change the server
/// has not confirmed yet — the outbox is simply every pending record.
/// </summary>
public sealed record LocalRecord(
    string Type,
    Guid Id,
    DateTimeOffset ModifiedAt,
    bool IsDeleted,
    string? Data,
    bool Pending)
{
    public string Key => KeyOf(Type, Id);

    public static string KeyOf(string type, Guid id) => $"{type}:{id}";

    public SyncChange ToChange() => new(Type, Id, ModifiedAt, IsDeleted, Data);

    public static LocalRecord FromServer(SyncRecord record) =>
        new(record.Type, record.Id, record.ModifiedAt, record.IsDeleted, record.Data, Pending: false);
}

/// <summary>Identifies a pushed change, so confirming it cannot clear an edit made after the push.</summary>
public sealed record PushedVersion(string Key, DateTimeOffset ModifiedAt);
