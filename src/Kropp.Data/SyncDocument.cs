namespace Kropp.Data;

/// <summary>
/// One aggregate as the server stores it: its JSON, the client's stamp that decides conflicts,
/// and the sequence number pulls page by. Every aggregate type shares this table, so a new type
/// needs no migration.
/// </summary>
public sealed class SyncDocument
{
    public required string Type { get; set; }
    public required Guid Id { get; set; }
    public required DateTimeOffset ModifiedAt { get; set; }
    public bool IsDeleted { get; set; }

    /// <summary>Stored as jsonb, so it can be queried in place until a read model is needed.</summary>
    public string? Data { get; set; }

    /// <summary>Taken from <see cref="KroppContext.SyncSequence"/> on every accepted write.</summary>
    public long ServerSeq { get; set; }
}
