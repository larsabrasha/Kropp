using System.Globalization;
using Bunit;
using Kropp.Shared.Sync;
using Kropp.UnitTests.Sync;
using Microsoft.Extensions.DependencyInjection;

namespace Kropp.UnitTests.Components;

/// <summary>A Swedish test context with the client's local store in memory.</summary>
public abstract class ClientTestContext : BunitContext
{
    protected readonly MemoryLocalStore Store = new();
    protected readonly LocalRepository Repository;

    protected ClientTestContext()
    {
        CultureInfo.CurrentCulture = CultureInfo.CurrentUICulture = new CultureInfo("sv-SE");
        Repository = new LocalRepository(Store);
        Services.AddLocalization();
        Services.AddSingleton(Repository);
        Services.AddSingleton(new SyncEngine(Store, new FakeSyncApi()));
        JSInterop.Mode = JSRuntimeMode.Loose;
    }
}
