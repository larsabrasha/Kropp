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
            link.TextContent.ShouldNotContain("Nr 101");
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
    public async Task Without_templates_the_card_explains_and_the_blank_form_shows()
    {
        var home = Render<Home>();

        home.WaitForElement("[data-testid=no-templates]");
        home.FindAll("form").Count.ShouldBe(1);
    }

    [Fact]
    public async Task The_suggested_template_is_planned_in_one_tap()
    {
        var bench = new Exercise { Id = Guid.NewGuid(), Name = "Bröst maskin" };
        var pull = new Exercise { Id = Guid.NewGuid(), Name = "Pull down maskin" };
        await Repository.SaveAsync(bench.Id, bench);
        await Repository.SaveAsync(pull.Id, pull);
        var chest = new WorkoutTemplate { Id = Guid.NewGuid(), Name = "Bröst", Exercises = [new WorkoutExercise { ExerciseId = bench.Id, TargetSets = 3, TargetReps = 8 }] };
        var back = new WorkoutTemplate { Id = Guid.NewGuid(), Name = "Rygg", Exercises = [new WorkoutExercise { ExerciseId = pull.Id, TargetSets = 3, TargetReps = 8 }] };
        await Repository.SaveAsync(chest.Id, chest);
        await Repository.SaveAsync(back.Id, back);
        var done = new Workout
        {
            Id = Guid.NewGuid(), Date = new DateOnly(2026, 9, 22), SessionNumber = 101,
            Exercises = [new WorkoutExercise { ExerciseId = bench.Id, TargetSets = 3, TargetReps = 8, TargetWeightKg = 60, Sets = [new SetResult { Reps = 8, WeightKg = 60 }] }],
        };
        await Repository.SaveAsync(done.Id, done);

        var home = Render<Home>();

        home.WaitForAssertion(() => home.Find("[data-testid=next-name]").TextContent.ShouldBe("Rygg"));
        home.FindAll("[data-testid=next]").ShouldBeEmpty();
        home.Find("[data-testid=plan-card] h2").TextContent.ShouldBe("Planera nästa pass");
        home.Find("[data-testid=next-date]").TextContent.ToLowerInvariant().ShouldBe("i morgon, 24 sep.");
        home.FindAll("[data-testid=template-choices] [role=radio]").Select(b => b.TextContent.Trim()).ShouldBe(["Bröst", "Rygg"]);

        home.Find("[data-testid=plan]").Click();

        home.WaitForAssertion(() => Services.GetRequiredService<NavigationManager>().Uri.ShouldContain("/workouts/"));
        var plan = (await Repository.GetAllAsync<Workout>()).Single(w => w.Id != done.Id);
        plan.TemplateId.ShouldBe(back.Id);
        plan.Date.ShouldBe(new DateOnly(2026, 9, 24));
        plan.SessionNumber.ShouldBe(102);
        plan.Exercises.Single().ExerciseId.ShouldBe(pull.Id);
    }

    [Fact]
    public async Task Another_template_can_be_chosen_before_planning()
    {
        var bench = new Exercise { Id = Guid.NewGuid(), Name = "Bröst maskin" };
        await Repository.SaveAsync(bench.Id, bench);
        var chest = new WorkoutTemplate { Id = Guid.NewGuid(), Name = "Bröst", Exercises = [new WorkoutExercise { ExerciseId = bench.Id }] };
        var other = new WorkoutTemplate { Id = Guid.NewGuid(), Name = "Annat", Exercises = [] };
        await Repository.SaveAsync(chest.Id, chest);
        await Repository.SaveAsync(other.Id, other);
        var home = Render<Home>();

        home.WaitForElements("[data-testid=template-choices] [role=radio]").Single(b => b.TextContent.Trim() == "Bröst").Click();
        home.Find("[data-testid=next-name]").TextContent.ShouldBe("Bröst");
        home.Find("[data-testid=plan]").Click();

        home.WaitForAssertion(() => Services.GetRequiredService<NavigationManager>().Uri.ShouldContain("/workouts/"));
        (await Repository.GetAllAsync<Workout>()).Single().TemplateId.ShouldBe(chest.Id);
    }

    [Fact]
    public async Task An_existing_plan_is_shown_instead_of_a_suggestion()
    {
        var template = new WorkoutTemplate { Id = Guid.NewGuid(), Name = "Bröst", Exercises = [] };
        await Repository.SaveAsync(template.Id, template);
        var planned = new Workout { Id = Guid.NewGuid(), Date = new DateOnly(2026, 9, 24) };
        await Repository.SaveAsync(planned.Id, planned);

        var home = Render<Home>();

        home.WaitForElement("[data-testid=upcoming]").GetAttribute("href").ShouldBe($"workouts/{planned.Id}");
        home.Find("[data-testid=next]").ShouldNotBeNull();
        home.Find("[data-testid=plan-card] h2").TextContent.ShouldBe("Planera ett till");
    }

    [Fact]
    public async Task Another_workout_can_be_planned_from_a_template_beside_an_existing_plan()
    {
        var bench = new Exercise { Id = Guid.NewGuid(), Name = "Bröst maskin" };
        await Repository.SaveAsync(bench.Id, bench);
        var template = new WorkoutTemplate { Id = Guid.NewGuid(), Name = "Bröst", Exercises = [new WorkoutExercise { ExerciseId = bench.Id }] };
        await Repository.SaveAsync(template.Id, template);
        var planned = new Workout { Id = Guid.NewGuid(), Date = new DateOnly(2026, 9, 23), SessionNumber = 102 };
        await Repository.SaveAsync(planned.Id, planned);
        var home = Render<Home>();

        home.WaitForElement("[data-testid=upcoming]");
        home.Find("[data-testid=next-name]").TextContent.ShouldBe("Bröst");
        home.Find("[data-testid=next-date]").TextContent.ToLowerInvariant().ShouldBe("fredag 25 sep.");
        home.Find("[data-testid=plan]").Click();

        home.WaitForAssertion(() => Services.GetRequiredService<NavigationManager>().Uri.ShouldContain("/workouts/"));
        var second = (await Repository.GetAllAsync<Workout>()).Single(w => w.Id != planned.Id);
        (second.Date, second.TemplateId, second.SessionNumber).ShouldBe((new DateOnly(2026, 9, 25), (Guid?)template.Id, (int?)103));
    }

}
