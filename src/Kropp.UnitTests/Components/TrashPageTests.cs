using Bunit;
using Kropp.Client.Pages;
using Kropp.Shared.Training;
using Shouldly;

namespace Kropp.UnitTests.Components;

public class TrashPageTests : ClientTestContext
{
    private async Task<Workout> TrashAsync(string note)
    {
        var workout = new Workout { Id = Guid.NewGuid(), Date = new DateOnly(2026, 9, 21), Note = note };
        await Repository.SaveAsync(workout.Id, workout);
        await Services.GetService<WorkoutTrash>()!.MoveToTrashAsync(workout);
        return workout;
    }

    [Fact]
    public void An_empty_trash_says_so() =>
        Render<TrashPage>().WaitForElement("[data-testid=trash-empty]").TextContent.ShouldContain("Papperskorgen är tom");

    [Fact]
    public async Task A_trashed_workout_shows_when_it_goes_and_can_be_restored()
    {
        var workout = await TrashAsync("Ben");
        Time.Advance(TimeSpan.FromDays(10));
        var page = Render<TrashPage>();

        page.WaitForElement("[data-testid=trashed-name]").TextContent.ShouldBe("Ben");
        page.Find("[data-testid=deleted-for-good]").TextContent.ShouldBe("Raderas för gott om 20 dagar");

        page.Find("[data-testid=restore]").Click();

        page.WaitForElement("[data-testid=trash-empty]");
        (await Repository.GetAsync<Workout>(workout.Id)).ShouldNotBeNull().Note.ShouldBe("Ben");
    }

    [Fact]
    public async Task Deleting_now_asks_first()
    {
        var workout = await TrashAsync("Ben");
        var page = Render<TrashPage>();

        page.WaitForElement("[data-testid=delete-now]").Click();
        (await Repository.GetAsync<TrashedWorkout>(workout.Id)).ShouldNotBeNull();
        page.Find("[data-testid=confirm-delete]").Click();

        page.WaitForElement("[data-testid=trash-empty]");
        (await Repository.GetAsync<TrashedWorkout>(workout.Id)).ShouldBeNull();
        (await Repository.GetAsync<Workout>(workout.Id)).ShouldBeNull();
    }

    [Fact]
    public async Task Opening_the_trash_deletes_what_has_been_there_30_days()
    {
        await TrashAsync("Gammalt");
        Time.Advance(TimeSpan.FromDays(20));
        await TrashAsync("Nytt");
        Time.Advance(TimeSpan.FromDays(10));

        var page = Render<TrashPage>();

        page.WaitForElements("[data-testid=trashed-name]").Select(e => e.TextContent).ShouldBe(["Nytt"]);
    }
}
