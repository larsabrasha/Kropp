using Bunit;
using Kropp.Client.Pages;
using Kropp.Shared.Sync;
using Kropp.Shared.Training;
using Microsoft.AspNetCore.Components;
using Microsoft.Extensions.DependencyInjection;
using Shouldly;

namespace Kropp.UnitTests.Components;

public class HomeTests : ClientTestContext
{
    [Fact]
    public void Shows_the_empty_state_when_there_are_no_workouts()
    {
        var home = Render<Home>();

        home.WaitForAssertion(() => home.Find("[data-testid=empty-state]").TextContent.ShouldContain("Inga pass än"));
        home.FindAll("[data-testid=copy-latest]").ShouldBeEmpty();
    }

    [Fact]
    public async Task Adding_a_workout_saves_it_locally_and_opens_it()
    {
        await Repository.SaveAsync(Guid.NewGuid(), new Workout { Id = Guid.NewGuid(), Date = new DateOnly(2026, 9, 14), SessionNumber = 103 });
        var home = Render<Home>();
        home.WaitForElement("[data-testid=workout-list]");

        home.Find("input[type=date]").Change("2026-09-21");
        home.Find("form").Submit();

        home.WaitForAssertion(() => Services.GetRequiredService<NavigationManager>().Uri.ShouldContain("/workouts/"));
        var added = (await Repository.GetAllAsync<Workout>()).Single(w => w.Date == new DateOnly(2026, 9, 21));
        added.SessionNumber.ShouldBe(104);
        added.Status.ShouldBe(WorkoutStatus.Skipped);
        Services.GetRequiredService<NavigationManager>().Uri.ShouldEndWith($"/workouts/{added.Id}");
    }

    [Fact]
    public async Task Lists_workouts_as_links_with_a_summary()
    {
        var squat = new Exercise { Id = Guid.NewGuid(), Name = "Benböj lår framsida" };
        var bench = new Exercise { Id = Guid.NewGuid(), Name = "Bröst maskin" };
        await Repository.SaveAsync(squat.Id, squat);
        await Repository.SaveAsync(bench.Id, bench);
        var workout = new Workout
        {
            Id = Guid.NewGuid(), Date = new DateOnly(2026, 9, 21), SessionNumber = 101, Status = WorkoutStatus.Done,
            Exercises = [new WorkoutExercise { ExerciseId = squat.Id, Sets = [new SetResult { Reps = 8 }] }, new WorkoutExercise { ExerciseId = bench.Id, Order = 1 }],
        };
        await Repository.SaveAsync(workout.Id, workout);

        var home = Render<Home>();

        home.WaitForAssertion(() =>
        {
            var link = home.Find("[data-testid=workout-list] a");
            link.GetAttribute("href").ShouldBe($"workouts/{workout.Id}");
            link.QuerySelector("[data-testid=workout-name]")!.TextContent.ShouldBe("Ben och bröst");
            link.QuerySelector("[data-testid=workout-meta]")!.TextContent.ShouldContain("måndag 21 sep", Case.Insensitive);
            link.QuerySelector("[data-testid=workout-icon]")!.GetAttribute("src").ShouldBe(Kropp.Client.Components.ExerciseIllustrations.Picture("squat"));
            link.TextContent.ShouldContain("Nr 101");
            link.TextContent.ShouldContain("2 övningar");
            link.TextContent.ShouldContain("Genomfört");
        });
    }

    [Fact]
    public async Task Workouts_are_grouped_by_weeks_that_start_on_monday()
    {
        foreach (var day in new[] { new DateOnly(2026, 9, 20), new DateOnly(2026, 9, 21), new DateOnly(2026, 9, 23), new DateOnly(2026, 9, 14) })
        {
            var w = new Workout { Id = Guid.NewGuid(), Date = day };
            await Repository.SaveAsync(w.Id, w);
        }

        var home = Render<Home>();

        home.WaitForAssertion(() =>
        {
            var weeks = home.FindAll("[data-testid=week]");
            weeks.Select(w => string.Join(" ", w.QuerySelectorAll("h3 span").Select(x => x.TextContent.Trim()))).ShouldBe(["Vecka 39 21–27 september", "Vecka 38 14–20 september"]);
            weeks.Select(w => w.QuerySelectorAll("li").Length).ShouldBe([2, 2]);
        });
    }

    [Fact]
    public async Task One_exercise_is_singular()
    {
        var workout = new Workout { Id = Guid.NewGuid(), Date = new DateOnly(2026, 9, 21), Exercises = [new WorkoutExercise { ExerciseId = Guid.NewGuid() }] };
        await Repository.SaveAsync(workout.Id, workout);

        var home = Render<Home>();

        home.WaitForAssertion(() => home.Find("[data-testid=workout-list] a").TextContent.ShouldContain("1 övning"));
        home.Find("[data-testid=workout-list] a").TextContent.ShouldNotContain("övningar");
    }

    [Fact]
    public async Task Copying_the_latest_workout_makes_a_plan_without_results()
    {
        var exerciseId = Guid.NewGuid();
        var source = new Workout
        {
            Id = Guid.NewGuid(), Date = new DateOnly(2026, 9, 21), SessionNumber = 101, Status = WorkoutStatus.Done,
            Exercises = [new WorkoutExercise { ExerciseId = exerciseId, TargetSets = 3, TargetReps = 8, Sets = [new SetResult { Reps = 8 }] }],
        };
        await Repository.SaveAsync(source.Id, source);
        var home = Render<Home>();

        home.WaitForElement("[data-testid=copy-latest]").Click();

        home.WaitForAssertion(() => Store.GetPendingAsync().Result.Count.ShouldBe(2));
        var copy = (await Repository.GetAllAsync<Workout>()).Single(w => w.Id != source.Id);
        copy.SessionNumber.ShouldBe(102);
        copy.Exercises.Single().Sets.ShouldBeEmpty();
        copy.Exercises.Single().TargetReps.ShouldBe(8);
        Services.GetRequiredService<NavigationManager>().Uri.ShouldEndWith($"/workouts/{copy.Id}");
    }
}
