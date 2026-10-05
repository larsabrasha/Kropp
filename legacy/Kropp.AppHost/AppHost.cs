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

var api = builder
    .AddProject<Projects.Kropp_Api>("api")
    .WithReference(database)
    .WaitForCompletion(migrations)
    .WithExternalHttpEndpoints();

// `dotnet run -- --Lan=true` opens the app to the local network, to try it on a phone. Off by
// default: the API has no sign-in and holds health data.
if (bool.TryParse(builder.Configuration["Lan"], out var lan) && lan)
    api.WithEndpoint("http", endpoint => endpoint.TargetHost = "0.0.0.0");

builder.Build().Run();
