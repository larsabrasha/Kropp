using Kropp.Client;
using Kropp.Client.Storage;
using Kropp.Client.Sync;
using Kropp.Shared.Sync;
using Microsoft.AspNetCore.Components.Web;
using Microsoft.AspNetCore.Components.WebAssembly.Hosting;

var builder = WebAssemblyHostBuilder.CreateDefault(args);
builder.RootComponents.Add<App>("#app");
builder.RootComponents.Add<HeadOutlet>("head::after");

builder.Services.AddLocalization();
builder.Services.AddSingleton(TimeProvider.System);

// A short timeout, because on a weak gym signal a request that hangs is worse than one that
// fails: the change is safe in IndexedDB either way and the next trigger retries.
builder.Services.AddScoped(_ => new HttpClient
{
    BaseAddress = new Uri(builder.HostEnvironment.BaseAddress),
    Timeout = TimeSpan.FromSeconds(15),
});

builder.Services.AddScoped<ILocalStore, IndexedDbLocalStore>();
builder.Services.AddScoped<ISyncApi, HttpSyncApi>();
builder.Services.AddScoped<LocalRepository>();
builder.Services.AddScoped<SyncEngine>();
builder.Services.AddScoped<SyncCoordinator>();

var host = builder.Build();
try
{
    await host.Services.GetRequiredService<SyncCoordinator>().StartAsync();
}
catch (Exception ex)
{
    // Without IndexedDB (a private window, storage blocked) the app still opens; saving then
    // shows its own error instead of the whole app failing to start.
    host.Services.GetRequiredService<ILogger<Program>>().LogError(ex, "Sync could not start");
}
await host.RunAsync();
