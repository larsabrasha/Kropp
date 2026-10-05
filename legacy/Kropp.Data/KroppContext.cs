using Microsoft.EntityFrameworkCore;

namespace Kropp.Data;

public sealed class KroppContext(DbContextOptions<KroppContext> options) : DbContext(options)
{
    public const string SyncSequence = "sync_seq";

    public DbSet<SyncDocument> SyncDocuments => Set<SyncDocument>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.HasSequence<long>(SyncSequence);

        modelBuilder.Entity<SyncDocument>(e =>
        {
            e.HasKey(d => new { d.Type, d.Id });
            e.Property(d => d.Type).HasMaxLength(50);
            e.Property(d => d.Data).HasColumnType("jsonb");
            e.HasIndex(d => d.ServerSeq).IsUnique();
        });
    }
}
