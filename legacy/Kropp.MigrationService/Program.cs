using Kropp.Data;
using Microsoft.EntityFrameworkCore;

var builder = Host.CreateApplicationBuilder(args);

builder.AddServiceDefaults();

builder.Services.AddDbContext<KroppContext>(options =>
    options.UseNpgsql(
        builder.Configuration.GetConnectionString("kroppdb"),
        npgsql => npgsql.EnableRetryOnFailure()));

builder.Services.AddHostedService<Kropp.MigrationService.MigrationService>();

var host = builder.Build();
host.Run();
