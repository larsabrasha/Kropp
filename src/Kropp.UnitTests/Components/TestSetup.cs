using System.Globalization;
using Bunit;
using Kropp.Shared.Sync;
using Kropp.Shared.Training;
using Kropp.UnitTests.Sync;
using Microsoft.Extensions.DependencyInjection;

namespace Kropp.UnitTests.Components;

/// <summary>A Swedish test context with the client's local store in memory.</summary>
public abstract class ClientTestContext : BunitContext
{
    protected readonly MemoryLocalStore Store = new();
    protected readonly LocalRepository Repository;
    private protected readonly ManualTimeProvider Time = new(new DateTimeOffset(2026, 9, 23, 10, 0, 0, TimeSpan.Zero));

    protected ClientTestContext()
    {
        CultureInfo.CurrentCulture = CultureInfo.CurrentUICulture = new CultureInfo("sv-SE");
        Repository = new LocalRepository(Store);
        Services.AddLocalization();
        // Tests name dates around 23 September 2026; the pages read "today" from this.
        Services.AddSingleton<TimeProvider>(Time);
        Services.AddSingleton(Repository);
        Services.AddSingleton(new WorkoutTrash(Repository, Time));
        Services.AddSingleton(new SyncEngine(Store, new FakeSyncApi()));
        JSInterop.Mode = JSRuntimeMode.Loose;
    }
}
