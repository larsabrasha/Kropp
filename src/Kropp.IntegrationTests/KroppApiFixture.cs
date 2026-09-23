using Kropp.Data;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Testcontainers.PostgreSql;

namespace Kropp.IntegrationTests;

/// <summary>The API against a real Postgres in a container, migrated the way the migration service does it.</summary>
public sealed class KroppApiFixture : WebApplicationFactory<Program>, IAsyncLifetime
{
    private readonly PostgreSqlContainer postgres = new PostgreSqlBuilder("postgres:17-alpine").Build();

    public async Task InitializeAsync()
    {
        await postgres.StartAsync();
        using var scope = Services.CreateScope();
        await scope.ServiceProvider.GetRequiredService<KroppContext>().Database.MigrateAsync();
    }

    protected override void ConfigureWebHost(IWebHostBuilder builder) =>
        builder.UseSetting("ConnectionStrings:kroppdb", postgres.GetConnectionString());

    /// <summary>Empties the table and restarts the sequence, so every test starts from seq 1.</summary>
    public async Task ResetAsync()
    {
        using var scope = Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<KroppContext>();
        await db.Database.ExecuteSqlRawAsync($"""TRUNCATE "SyncDocuments"; ALTER SEQUENCE {KroppContext.SyncSequence} RESTART WITH 1""");
    }

    async Task IAsyncLifetime.DisposeAsync()
    {
        await base.DisposeAsync();
        await postgres.DisposeAsync();
    }
}

[CollectionDefinition(Name)]
public sealed class ApiCollection : ICollectionFixture<KroppApiFixture>
{
    public const string Name = "api";
}
