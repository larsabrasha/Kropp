using System.Globalization;
using Bunit;
using Kropp.Client.Pages;
using Kropp.Shared.Sync;
using Kropp.Shared.Training;
using Kropp.UnitTests.Sync;
using Microsoft.Extensions.DependencyInjection;
using Shouldly;

namespace Kropp.UnitTests.Components;

public class HomeTests : TestContext
{
    private readonly MemoryLocalStore store = new();
    private readonly LocalRepository repository;

    public HomeTests()
    {
        CultureInfo.CurrentCulture = CultureInfo.CurrentUICulture = new CultureInfo("sv-SE");
        repository = new LocalRepository(store);
        Services.AddLocalization();
        Services.AddSingleton(repository);
        Services.AddSingleton(new SyncEngine(store, new FakeSyncApi()));
    }

    [Fact]
    public void Shows_the_empty_state_when_there_are_no_workouts()
    {
        var home = RenderComponent<Home>();

        home.WaitForAssertion(() => home.Find("[data-testid=empty-state]").TextContent.ShouldContain("Inga pass än"));
    }

    [Fact]
    public async Task Adding_a_workout_saves_it_locally_and_lists_it()
    {
        var home = RenderComponent<Home>();
        home.WaitForElement("[data-testid=empty-state]");

        home.Find("input[type=date]").Change("2026-09-21");
        home.Find("input:not([type=date])").Change("Ben och bröst");
        home.Find("form").Submit();

        home.WaitForAssertion(() =>
        {
            var item = home.Find("[data-testid=workout-list] li");
            item.TextContent.ShouldContain("måndag 21 september 2026");
            item.TextContent.ShouldContain("Ben och bröst");
        });
        (await store.GetPendingAsync()).Single().Type.ShouldBe(AggregateTypes.Workout);
        (await repository.GetAllAsync<Workout>()).Single().Date.ShouldBe(new DateOnly(2026, 9, 21));
    }
}
