var builder = DistributedApplication.CreateBuilder(args);

// No password here: Aspire generates one on first run and keeps it in this project's user
// secrets, so it never reaches the repository.
var postgres = builder
    .AddPostgres("postgres")
    .WithPgWeb(pgWeb => pgWeb
        // 5051 rather than 5050, which GospelPresenter's pgweb already holds.
        .WithHostPort(5051)
        .WithLifetime(ContainerLifetime.Persistent))
    .WithDataVolume(isReadOnly: false)
    .WithLifetime(ContainerLifetime.Persistent);

var database = postgres.AddDatabase("kroppdb");

var migrations = builder
    .AddProject<Projects.Kropp_MigrationService>("migrations")
    .WithReference(database)
    .WaitFor(database);

builder
    .AddProject<Projects.Kropp_Api>("api")
    .WithReference(database)
    .WaitForCompletion(migrations)
    .WithExternalHttpEndpoints();

builder.Build().Run();
