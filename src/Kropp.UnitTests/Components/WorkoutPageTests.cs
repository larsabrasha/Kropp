using Bunit;
using Kropp.Client.Pages;
using Kropp.Shared.Training;
using Shouldly;

namespace Kropp.UnitTests.Components;

public class WorkoutPageTests : ClientTestContext
{
    private static readonly Exercise Bench = new() { Id = Guid.NewGuid(), Name = "Bröst maskin", Kind = ExerciseKind.Strength, SettingsNote = "Sitthöjd 11" };

    private async Task<Workout> SeedAsync(Workout workout)
    {
        await Repository.SaveAsync(Bench.Id, Bench);
        await Repository.SaveAsync(workout.Id, workout);
        return workout;
    }

    private async Task<Workout> ReloadAsync(Guid id) => (await Repository.GetAllAsync<Workout>()).Single(w => w.Id == id);

    [Fact]
    public void An_unknown_id_shows_not_found()
    {
        var page = Render<WorkoutPage>(p => p.Add(x => x.Id, Guid.NewGuid()));

        page.WaitForElement("[data-testid=not-found]");
    }

    [Fact]
    public async Task Tapping_the_next_set_records_it_at_the_planned_values()
    {
        var workout = await SeedAsync(new Workout
        {
            Id = Guid.NewGuid(), Date = new DateOnly(2026, 9, 23),
            Exercises = [new WorkoutExercise { ExerciseId = Bench.Id, TargetSets = 3, TargetReps = 8, TargetWeightKg = 22.5m }],
        });
        var page = Render<WorkoutPage>(p => p.Add(x => x.Id, workout.Id));

        page.WaitForElement("[data-testid=set-next]").Click();
        page.WaitForElement("[data-testid=set-next]").Click();

        page.WaitForAssertion(() => page.FindAll("[data-testid=set-done]").Count.ShouldBe(2));
        page.FindAll("[data-testid=set-done]")[0].TextContent.ShouldContain("8\u202F×\u202F22,5");
        (await ReloadAsync(workout.Id)).Exercises.Single().Sets.ShouldBe([new SetResult { Reps = 8, WeightKg = 22.5m }, new SetResult { Reps = 8, WeightKg = 22.5m }]);
    }

    [Fact]
    public async Task A_card_shows_no_input_fields_until_something_is_tapped()
    {
        var workout = await SeedAsync(new Workout
        {
            Id = Guid.NewGuid(), Date = new DateOnly(2026, 9, 23),
            Exercises = [new WorkoutExercise { ExerciseId = Bench.Id, TargetSets = 3, TargetReps = 8, TargetWeightKg = 22.5m, Settings = "45 grader", Comment = "tungt" }],
        });
        var page = Render<WorkoutPage>(p => p.Add(x => x.Id, workout.Id));

        var card = page.WaitForElement("[data-testid=exercise-entry]");
        card.QuerySelectorAll("input").ShouldBeEmpty();
        page.Find("[data-testid=target]").TextContent.Trim().ShouldBe("3 × 8 @ 22,5 kg");
        page.Find("[data-testid=context]").TextContent.ShouldBe("Sitthöjd 11 · 45 grader · \u201dtungt\u201d");
        page.FindAll("[data-testid=set-next]").Count.ShouldBe(1);
    }

    [Fact]
    public async Task Tapping_the_target_opens_its_fields_and_a_change_is_saved()
    {
        var workout = await SeedAsync(new Workout
        {
            Id = Guid.NewGuid(), Date = new DateOnly(2026, 9, 23),
            Exercises = [new WorkoutExercise { ExerciseId = Bench.Id, TargetSets = 3, TargetReps = 8, TargetWeightKg = 20 }],
        });
        var page = Render<WorkoutPage>(p => p.Add(x => x.Id, workout.Id));

        page.WaitForElement("[data-testid=target]").Click();
        page.FindAll("[data-testid=target-editor] input")[2].Change("25");
        page.Find("[data-testid=target-editor] button").Click();

        page.WaitForAssertion(() => page.Find("[data-testid=target]").TextContent.Trim().ShouldBe("3 × 8 @ 25 kg"));
        page.FindAll("[data-testid=target-editor]").ShouldBeEmpty();
        (await ReloadAsync(workout.Id)).Exercises.Single().TargetWeightKg.ShouldBe(25);
    }

    [Fact]
    public async Task Only_one_card_has_an_open_panel_at_a_time()
    {
        var workout = await SeedAsync(new Workout
        {
            Id = Guid.NewGuid(), Date = new DateOnly(2026, 9, 23),
            Exercises = [new WorkoutExercise { ExerciseId = Bench.Id, TargetSets = 3, TargetReps = 8 }, new WorkoutExercise { ExerciseId = Bench.Id, Order = 1, TargetSets = 2, TargetReps = 10 }],
        });
        var page = Render<WorkoutPage>(p => p.Add(x => x.Id, workout.Id));

        page.WaitForElements("[data-testid=target]")[0].Click();
        page.FindAll("[data-testid=target]")[1].Click();

        page.FindAll("[data-testid=target-editor]").Count.ShouldBe(1);
        page.FindAll("[data-testid=exercise-entry]")[1].QuerySelector("[data-testid=target-editor]").ShouldNotBeNull();
    }

    [Fact]
    public async Task The_menu_moves_and_removes_an_exercise()
    {
        var other = new Exercise { Id = Guid.NewGuid(), Name = "Vader", Kind = ExerciseKind.Bodyweight };
        await Repository.SaveAsync(other.Id, other);
        var workout = await SeedAsync(new Workout
        {
            Id = Guid.NewGuid(), Date = new DateOnly(2026, 9, 23),
            Exercises = [new WorkoutExercise { ExerciseId = Bench.Id }, new WorkoutExercise { ExerciseId = other.Id, Order = 1 }],
        });
        var page = Render<WorkoutPage>(p => p.Add(x => x.Id, workout.Id));

        page.WaitForElements("[data-testid=more]")[1].Click();
        page.Find("[data-testid=menu]").QuerySelectorAll("button").Single(b => b.TextContent.Trim() == "Flytta upp").Click();
        page.WaitForAssertion(() => page.FindAll("[data-testid=exercise-entry] h3").Select(h => h.TextContent).ShouldBe(["Vader", "Bröst maskin"]));

        page.FindAll("[data-testid=more]")[0].Click();
        page.Find("[data-testid=menu]").QuerySelectorAll("button").Single(b => b.TextContent.Trim() == "Ta bort övningen").Click();

        page.WaitForAssertion(() => page.FindAll("[data-testid=exercise-entry] h3").Select(h => h.TextContent).ShouldBe(["Bröst maskin"]));
        (await ReloadAsync(workout.Id)).Exercises.Single().ExerciseId.ShouldBe(Bench.Id);
    }

    [Fact]
    public async Task A_done_set_can_be_corrected()
    {
        var workout = await SeedAsync(new Workout
        {
            Id = Guid.NewGuid(), Date = new DateOnly(2026, 9, 23),
            Exercises = [new WorkoutExercise { ExerciseId = Bench.Id, TargetSets = 3, TargetReps = 8, TargetWeightKg = 60, Sets = [new SetResult { Reps = 8, WeightKg = 60 }] }],
        });
        var page = Render<WorkoutPage>(p => p.Add(x => x.Id, workout.Id));

        page.WaitForElement("[data-testid=set-done]").Click();
        page.Find("[data-testid=set-editor] input").Change("6");

        page.WaitForAssertion(() => page.Find("[data-testid=set-done]").TextContent.ShouldContain("6\u202F×\u202F60"));
        (await ReloadAsync(workout.Id)).Exercises.Single().Sets.Single().Reps.ShouldBe(6);
    }

    [Fact]
    public async Task Shows_what_was_done_last_time()
    {
        await SeedAsync(new Workout
        {
            Id = Guid.NewGuid(), Date = new DateOnly(2026, 9, 21), Status = WorkoutStatus.Done,
            Exercises = [new WorkoutExercise { ExerciseId = Bench.Id, Sets = [new() { Reps = 8, WeightKg = 60 }, new() { Reps = 8, WeightKg = 60 }, new() { Reps = 10, WeightKg = 60 }] }],
        });
        var today = await SeedAsync(new Workout
        {
            Id = Guid.NewGuid(), Date = new DateOnly(2026, 9, 23),
            Exercises = [new WorkoutExercise { ExerciseId = Bench.Id, TargetSets = 3, TargetReps = 8 }],
        });

        var page = Render<WorkoutPage>(p => p.Add(x => x.Id, today.Id));

        page.WaitForAssertion(() => page.Find("[data-testid=context]").TextContent.ShouldStartWith("Förra gången: 8, 8, 10 × 60 kg"));
    }

    [Fact]
    public async Task A_new_exercise_can_be_created_and_added_from_the_picker()
    {
        var workout = await SeedAsync(new Workout { Id = Guid.NewGuid(), Date = new DateOnly(2026, 9, 23) });
        var page = Render<WorkoutPage>(p => p.Add(x => x.Id, workout.Id));

        page.WaitForElement("[data-testid=add-exercise]").Click();
        page.Find("[data-testid=exercise-picker] input[type=search]").Input("Plankan");
        page.Find("[data-testid=exercise-picker] select").Change(nameof(ExerciseKind.Timed));
        page.Find("[data-testid=create-exercise]").Click();

        page.WaitForAssertion(() => page.Find("[data-testid=exercise-entry] h3").TextContent.ShouldBe("Plankan"));
        var plank = (await Repository.GetAllAsync<Exercise>()).Single(e => e.Name == "Plankan");
        plank.Kind.ShouldBe(ExerciseKind.Timed);
        var entry = (await ReloadAsync(workout.Id)).Exercises.Single();
        entry.ExerciseId.ShouldBe(plank.Id);
        entry.TargetSeconds.ShouldBe(30);
    }

    [Fact]
    public async Task An_existing_exercise_can_be_picked()
    {
        var workout = await SeedAsync(new Workout { Id = Guid.NewGuid(), Date = new DateOnly(2026, 9, 23) });
        var page = Render<WorkoutPage>(p => p.Add(x => x.Id, workout.Id));

        page.WaitForElement("[data-testid=add-exercise]").Click();
        page.Find("[data-testid=exercise-picker] input[type=search]").Input("bröst");
        page.FindAll("[data-testid=exercise-picker] li").Count.ShouldBe(1);
        page.Find("[data-testid=exercise-picker] li button").Click();

        page.WaitForAssertion(() => page.Find("[data-testid=exercise-entry] h3").TextContent.ShouldBe("Bröst maskin"));
        (await ReloadAsync(workout.Id)).Exercises.Single().ExerciseId.ShouldBe(Bench.Id);
    }

    [Fact]
    public async Task Marking_the_workout_done_saves_the_status()
    {
        var workout = await SeedAsync(new Workout { Id = Guid.NewGuid(), Date = new DateOnly(2026, 9, 23) });
        var page = Render<WorkoutPage>(p => p.Add(x => x.Id, workout.Id));

        page.WaitForElements("[role=radio]")[1].Click();

        page.WaitForAssertion(() => page.FindAll("[role=radio]")[1].GetAttribute("aria-checked").ShouldBe("true"));
        (await ReloadAsync(workout.Id)).Status.ShouldBe(WorkoutStatus.Done);
    }

    [Fact]
    public async Task Deleting_asks_first_and_then_leaves_a_tombstone()
    {
        var workout = await SeedAsync(new Workout { Id = Guid.NewGuid(), Date = new DateOnly(2026, 9, 23) });
        var page = Render<WorkoutPage>(p => p.Add(x => x.Id, workout.Id));

        page.WaitForElements("button").Single(b => b.TextContent.Trim() == "Ta bort passet").Click();
        (await Repository.GetAllAsync<Workout>()).ShouldNotBeEmpty();
        page.Find("[role=alertdialog] button").Click();

        page.WaitForAssertion(() => Repository.GetAllAsync<Workout>().Result.ShouldBeEmpty());
        (await Store.GetAsync($"workout:{workout.Id}")).ShouldNotBeNull().IsDeleted.ShouldBeTrue();
    }
}
