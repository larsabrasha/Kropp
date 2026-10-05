using Kropp.Api.Sync;
using Kropp.Data;
using Microsoft.EntityFrameworkCore;

var builder = WebApplication.CreateBuilder(args);

builder.AddServiceDefaults();

builder.Services.AddDbContext<KroppContext>(options =>
    options.UseNpgsql(
        builder.Configuration.GetConnectionString("kroppdb"),
        npgsql => npgsql.EnableRetryOnFailure()));

builder.Services.AddScoped<SyncService>();
builder.Services.AddProblemDetails();

var app = builder.Build();

app.UseExceptionHandler();

if (app.Environment.IsDevelopment())
    app.UseWebAssemblyDebugging();

// MapStaticAssets serves the client's _framework files too. The older UseBlazorFrameworkFiles
// must not be added beside it: its branch swallows those requests and answers 500.
app.MapStaticAssets();

app.MapDefaultEndpoints();
app.MapSyncEndpoints();

// Unknown /api paths answer 404 instead of the app shell, so a mistyped call fails loudly.
app.MapFallback("/api/{**path}", () => Results.NotFound());
app.MapFallbackToFile("index.html");

app.Run();

public partial class Program;
