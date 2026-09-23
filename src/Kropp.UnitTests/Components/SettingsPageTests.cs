using Bunit;
using Kropp.Client.Pages;
using Kropp.Shared.Sync;
using Kropp.Shared.Training;
using Shouldly;

namespace Kropp.UnitTests.Components;

public class SettingsPageTests : ClientTestContext
{
    [Fact]
    public async Task Sessions_a_week_start_at_three_and_are_saved_when_changed()
    {
        var page = Render<SettingsPage>();

        page.WaitForElement("[data-testid=stepper] input").GetAttribute("value").ShouldBe("3");
        page.Find("[data-testid=settings-effect]").TextContent.ShouldContain("2 dagar");

        page.Find("[data-testid=decrease]").Click();

        page.WaitForAssertion(() => page.Find("[data-testid=settings-effect]").TextContent.ShouldContain("3 dagar"));
        (await Repository.GetAsync<UserSettings>(UserSettings.SingletonId))!.SessionsPerWeek.ShouldBe(2);
        (await Store.GetPendingAsync()).Single().Type.ShouldBe(AggregateTypes.Settings);
    }

    [Fact]
    public void Templates_are_reached_from_settings() =>
        Render<SettingsPage>().WaitForElement("[data-testid=templates-link]").GetAttribute("href").ShouldBe("templates");

    [Fact]
    public void Exercises_are_reached_from_settings() =>
        Render<SettingsPage>().WaitForElement("[data-testid=exercises-link]").GetAttribute("href").ShouldBe("exercises");

    [Fact]
    public void The_trash_is_reached_from_settings() =>
        Render<SettingsPage>().WaitForElement("[data-testid=trash-link]").GetAttribute("href").ShouldBe("trash");

    [Fact]
    public async Task Seven_a_week_is_the_most()
    {
        await Repository.SaveAsync(UserSettings.SingletonId, new UserSettings { SessionsPerWeek = 7 });
        var page = Render<SettingsPage>();

        page.WaitForElement("[data-testid=increase]").HasAttribute("disabled").ShouldBeTrue();
        page.Find("[data-testid=settings-effect]").TextContent.ShouldContain("dagen efter");
    }
}
