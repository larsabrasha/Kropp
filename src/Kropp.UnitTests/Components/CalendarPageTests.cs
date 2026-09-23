using Bunit;
using Kropp.Client.Pages;
using Kropp.Shared.Training;
using Microsoft.AspNetCore.Components;
using Microsoft.Extensions.DependencyInjection;
using Shouldly;

namespace Kropp.UnitTests.Components;

public class CalendarPageTests : ClientTestContext
{
    private NavigationManager Navigation => Services.GetRequiredService<NavigationManager>();

    public CalendarPageTests() => Navigation.NavigateTo("calendar");

    private async Task<Workout> SaveAsync(DateOnly date, string note)
    {
        var workout = new Workout { Id = Guid.NewGuid(), Date = date, Note = note };
        await Repository.SaveAsync(workout.Id, workout);
        return workout;
    }

    [Fact]
    public async Task Opens_on_this_month_with_the_days_that_have_workouts_as_buttons()
    {
        await SaveAsync(new DateOnly(2026, 9, 21), "Ben");
        await SaveAsync(new DateOnly(2026, 9, 21), "Löpning");
        await SaveAsync(new DateOnly(2026, 8, 31), "Förra månaden");

        var page = Render<CalendarPage>();

        page.Find("[data-testid=month]").TextContent.ShouldBe("september 2026");
        page.FindAll("[data-testid=this-month]").ShouldBeEmpty();
        // 31 August is in the first week of the grid but belongs to another month.
        var days = page.WaitForElements("[data-testid=day]");
        days.Select(d => d.GetAttribute("data-date")).ShouldBe(["2026-09-21"]);
        days[0].GetAttribute("aria-label").ShouldBe("måndag 21 september: 2 pass");
        page.Find("[data-testid=shown-heading]").TextContent.Trim().ShouldBe("Alla pass i september (2 st)");
        page.FindAll("[data-testid=calendar-workouts] [data-testid=workout-name]").Select(e => e.TextContent).ShouldBe(["Ben", "Löpning"]);
    }

    [Fact]
    public async Task Choosing_a_day_shows_its_workouts_and_the_way_back_leads_to_that_day()
    {
        var ben = await SaveAsync(new DateOnly(2026, 9, 21), "Ben");
        await SaveAsync(new DateOnly(2026, 9, 14), "Rygg");
        var page = Render<CalendarPage>();

        page.WaitForElement("[data-date='2026-09-21']").Click();

        page.Find("[data-date='2026-09-21']").GetAttribute("aria-pressed").ShouldBe("true");
        page.Find("[data-testid=shown-heading]").TextContent.Trim().ShouldBe("måndag 21 september");
        page.FindAll("[data-testid=calendar-workouts] a").Select(a => a.GetAttribute("href"))
            .ShouldBe([$"workouts/{ben.Id}?back=calendar%3Fday%3D2026-09-21"]);
        Navigation.Uri.ShouldEndWith("/calendar?day=2026-09-21");

        page.Find("[data-testid=whole-month]").Click();

        page.FindAll("[data-testid=calendar-workouts] [data-testid=workout-name]").Count.ShouldBe(2);
        Navigation.Uri.ShouldEndWith("/calendar");
    }

    [Fact]
    public async Task Steps_by_month_and_by_year()
    {
        await SaveAsync(new DateOnly(2025, 8, 4), "Ett år sedan");
        var page = Render<CalendarPage>();

        page.Find("[data-testid=previous-year]").Click();
        page.Find("[data-testid=month]").TextContent.ShouldBe("september 2025");
        page.WaitForElement("[data-testid=calendar-empty]").TextContent.ShouldContain("Inga pass i september.");

        page.Find("[data-testid=previous-month]").Click();
        page.Find("[data-testid=month]").TextContent.ShouldBe("augusti 2025");
        page.FindAll("[data-testid=day]").Select(d => d.GetAttribute("data-date")).ShouldBe(["2025-08-04"]);
        Navigation.Uri.ShouldEndWith("/calendar?month=2025-08");

        page.Find("[data-testid=this-month]").Click();
        page.Find("[data-testid=month]").TextContent.ShouldBe("september 2026");
    }

    [Fact]
    public void Opens_on_the_day_in_the_address()
    {
        Navigation.NavigateTo("calendar?day=2024-02-29");

        var page = Render<CalendarPage>();

        page.Find("[data-testid=month]").TextContent.ShouldBe("februari 2024");
        page.WaitForElement("[data-testid=calendar-empty]");
    }

    [Fact]
    public void Stops_at_the_first_month_the_app_accepts()
    {
        Navigation.NavigateTo("calendar?month=2000-01");

        var page = Render<CalendarPage>();

        page.Find("[data-testid=previous-month]").HasAttribute("disabled").ShouldBeTrue();
        page.Find("[data-testid=previous-year]").HasAttribute("disabled").ShouldBeTrue();
        page.Find("[data-testid=next-month]").HasAttribute("disabled").ShouldBeFalse();
    }

    [Theory]
    [InlineData("calendar?day=2026-09-21", "calendar?day=2026-09-21", "Kalender")]
    [InlineData("https://example.com", "", "Alla pass")]
    public async Task A_workout_leads_back_only_to_the_calendar(string back, string href, string text)
    {
        var workout = await SaveAsync(new DateOnly(2026, 9, 21), "Ben");
        Navigation.NavigateTo($"workouts/{workout.Id}?back={Uri.EscapeDataString(back)}");

        var page = Render<WorkoutPage>(p => p.Add(w => w.Id, workout.Id));

        var link = page.Find("[data-testid=back]");
        link.GetAttribute("href").ShouldBe(href);
        link.TextContent.Trim().ShouldBe(text);
    }
}
