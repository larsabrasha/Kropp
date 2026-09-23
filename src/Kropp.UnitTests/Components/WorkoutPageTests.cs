using Kropp.Client.Components;
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
        var first = page.FindAll("[data-testid=set-done]")[0];
        first.TextContent.Trim().ShouldBe("8");
        first.QuerySelector("[data-testid=set-weight]").ShouldBeNull();
        first.GetAttribute("aria-label").ShouldBe("Set 1 klart: 8\u202F×\u202F22,5");
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
        page.Find("[data-testid=target-editor]").QuerySelectorAll("button").Single(b => b.TextContent.Trim() == "Klar").Click();

        page.WaitForAssertion(() => page.Find("[data-testid=target]").TextContent.Trim().ShouldBe("3 × 8 @ 25 kg"));
        page.FindAll("[data-testid=target-editor]").ShouldBeEmpty();
        (await ReloadAsync(workout.Id)).Exercises.Single().TargetWeightKg.ShouldBe(25);
    }

    private static AngleSharp.Dom.IElement StepperFor(AngleSharp.Dom.IElement scope, string label) =>
        scope.QuerySelectorAll("[data-testid=stepper]").Single(s => s.GetAttribute("data-label") == label);

    [Fact]
    public async Task Plus_and_minus_adjust_the_plan_by_one_rep_and_the_exercise_weight_step()
    {
        var workout = await SeedAsync(new Workout
        {
            Id = Guid.NewGuid(), Date = new DateOnly(2026, 9, 23),
            Exercises = [new WorkoutExercise { ExerciseId = Bench.Id, TargetSets = 3, TargetReps = 8, TargetWeightKg = 20 }],
        });
        var page = Render<WorkoutPage>(p => p.Add(x => x.Id, workout.Id));
        page.WaitForElement("[data-testid=target]").Click();

        StepperFor(page.Find("[data-testid=target-editor]"), "Rep").QuerySelector("[data-testid=increase]")!.Click();
        page.WaitForAssertion(() => page.Find("[data-testid=target]").TextContent.Trim().ShouldBe("3 × 9 @ 20 kg"));

        StepperFor(page.Find("[data-testid=target-editor]"), "kg").QuerySelector("[data-testid=increase]")!.Click();
        page.WaitForAssertion(() => page.Find("[data-testid=target]").TextContent.Trim().ShouldBe("3 × 9 @ 22,5 kg"));

        StepperFor(page.Find("[data-testid=target-editor]"), "kg").QuerySelector("[data-testid=decrease]")!.Click();
        StepperFor(page.Find("[data-testid=target-editor]"), "kg").QuerySelector("[data-testid=decrease]")!.Click();
        page.WaitForAssertion(() => page.Find("[data-testid=target]").TextContent.Trim().ShouldBe("3 × 9 @ 17,5 kg"));

        var saved = (await ReloadAsync(workout.Id)).Exercises.Single();
        (saved.TargetReps, saved.TargetWeightKg).ShouldBe((9, 17.5m));
    }

    [Fact]
    public async Task Cardio_is_adjusted_with_the_same_buttons()
    {
        var walk = new Exercise { Id = Guid.NewGuid(), Name = "Gång i maskin", Kind = ExerciseKind.Cardio };
        await Repository.SaveAsync(walk.Id, walk);
        var workout = await SeedAsync(new Workout
        {
            Id = Guid.NewGuid(), Date = new DateOnly(2026, 9, 23),
            Exercises = [new WorkoutExercise { ExerciseId = walk.Id, DurationMinutes = 3.5m, Settings = "60" }],
        });
        var page = Render<WorkoutPage>(p => p.Add(x => x.Id, workout.Id));
        page.WaitForElement("[data-testid=target]").Click();

        var editor = page.Find("[data-testid=target-editor]");
        editor.QuerySelectorAll("input:not([type=number])").ShouldBeEmpty();
        StepperFor(editor, "Minuter").QuerySelector("[data-testid=increase]")!.Click();
        StepperFor(page.Find("[data-testid=target-editor]"), "km").QuerySelector("[data-testid=increase]")!.Click();
        StepperFor(page.Find("[data-testid=target-editor]"), "Snittpuls").QuerySelector("[data-testid=increase]")!.Click();

        page.WaitForAssertion(() => page.Find("[data-testid=target]").TextContent.Trim().ShouldBe("4 min · 1 km · 120 bpm · 60"));
        var saved = (await ReloadAsync(workout.Id)).Exercises.Single();
        (saved.DurationMinutes, saved.DistanceKm, saved.AvgHeartRate).ShouldBe((4m, 1m, 120));
        (await ReloadAsync(workout.Id)).Status.ShouldBe(WorkoutStatus.Done);
    }

    [Fact]
    public async Task The_workout_is_named_from_its_exercises_and_categories_can_be_changed()
    {
        var workout = await SeedAsync(new Workout
        {
            Id = Guid.NewGuid(), Date = new DateOnly(2026, 9, 23), SessionNumber = 102,
            Exercises = [new WorkoutExercise { ExerciseId = Bench.Id, TargetSets = 3, TargetReps = 8 }],
        });
        var page = Render<WorkoutPage>(p => p.Add(x => x.Id, workout.Id));
        page.WaitForAssertion(() => page.Find("[data-testid=details]").TextContent.ShouldContain("Bröst · Nr 102"));

        page.Find("[data-testid=more]").Click();
        page.Find("[data-testid=menu]").QuerySelectorAll("button").Single(b => b.TextContent.Trim() == "Kategorier").Click();
        var chips = page.Find("[data-testid=categories-editor]");
        chips.QuerySelector("[data-area=Chest]")!.HasAttribute("disabled").ShouldBeTrue();
        chips.QuerySelector("[data-area=Arms]")!.Click();

        page.WaitForAssertion(() => page.Find("[data-testid=details]").TextContent.ShouldContain("Bröst och armar · Nr 102"));
        (await Repository.GetAllAsync<Exercise>()).Single(e => e.Id == Bench.Id).Categories.ShouldBe([BodyArea.Chest, BodyArea.Arms]);
    }

    [Fact]
    public async Task The_weight_step_is_chosen_per_exercise()
    {
        var workout = await SeedAsync(new Workout
        {
            Id = Guid.NewGuid(), Date = new DateOnly(2026, 9, 23),
            Exercises = [new WorkoutExercise { ExerciseId = Bench.Id, TargetSets = 3, TargetReps = 8, TargetWeightKg = 20 }],
        });
        var page = Render<WorkoutPage>(p => p.Add(x => x.Id, workout.Id));
        page.WaitForElement("[data-testid=target]").Click();

        page.Find("[data-testid=weight-step]").Change("1");
        page.WaitForAssertion(() => page.Find("[data-testid=weight-step]").GetAttribute("value").ShouldBe("1"));
        StepperFor(page.Find("[data-testid=target-editor]"), "kg").QuerySelector("[data-testid=increase]")!.Click();

        page.WaitForAssertion(() => page.Find("[data-testid=target]").TextContent.Trim().ShouldBe("3 × 8 @ 21 kg"));
        (await Repository.GetAllAsync<Exercise>()).Single(e => e.Id == Bench.Id).WeightStepKg.ShouldBe(1);
    }

    [Fact]
    public async Task A_done_set_is_corrected_with_the_same_buttons()
    {
        var workout = await SeedAsync(new Workout
        {
            Id = Guid.NewGuid(), Date = new DateOnly(2026, 9, 23),
            Exercises = [new WorkoutExercise { ExerciseId = Bench.Id, TargetSets = 3, TargetReps = 8, TargetWeightKg = 20, Sets = [new SetResult { Reps = 8, WeightKg = 20 }] }],
        });
        var page = Render<WorkoutPage>(p => p.Add(x => x.Id, workout.Id));

        page.WaitForElement("[data-testid=set-done]").Click();
        StepperFor(page.Find("[data-testid=set-editor]"), "Rep").QuerySelector("[data-testid=decrease]")!.Click();
        StepperFor(page.Find("[data-testid=set-editor]"), "Rep").QuerySelector("[data-testid=decrease]")!.Click();

        page.WaitForAssertion(() => page.Find("[data-testid=set-done]").TextContent.Trim().ShouldBe("6"));
        (await ReloadAsync(workout.Id)).Exercises.Single().Sets.Single().Reps.ShouldBe(6);
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
    public async Task Dropping_an_exercise_saves_the_new_order()
    {
        var module = JSInterop.SetupModule("./js/kropp-sortable.js");
        module.SetupVoid("init", _ => true);
        var other = new Exercise { Id = Guid.NewGuid(), Name = "Vader", Kind = ExerciseKind.Bodyweight };
        await Repository.SaveAsync(other.Id, other);
        var workout = await SeedAsync(new Workout
        {
            Id = Guid.NewGuid(), Date = new DateOnly(2026, 9, 23),
            Exercises = [new WorkoutExercise { ExerciseId = Bench.Id }, new WorkoutExercise { ExerciseId = other.Id, Order = 1 }],
        });
        var page = Render<WorkoutPage>(p => p.Add(x => x.Id, workout.Id));
        page.WaitForElements("[data-testid=drag-handle]").Count.ShouldBe(2);
        page.WaitForAssertion(() => module.VerifyInvoke("init"));

        // What kropp-sortable.js calls when a card is dropped at a new position.
        await page.InvokeAsync(() => page.Instance.OnEntryReordered(1, 0));

        page.WaitForAssertion(() => page.FindAll("[data-testid=exercise-entry] h3").Select(h => h.TextContent).ShouldBe(["Vader", "Bröst maskin"]));
        var saved = (await ReloadAsync(workout.Id)).Exercises;
        saved.Select(e => e.ExerciseId).ShouldBe([other.Id, Bench.Id]);
        saved.Select(e => e.Order).ShouldBe([0, 1]);
    }

    [Fact]
    public async Task The_menu_removes_an_exercise()
    {
        var other = new Exercise { Id = Guid.NewGuid(), Name = "Vader", Kind = ExerciseKind.Bodyweight };
        await Repository.SaveAsync(other.Id, other);
        var workout = await SeedAsync(new Workout
        {
            Id = Guid.NewGuid(), Date = new DateOnly(2026, 9, 23),
            Exercises = [new WorkoutExercise { ExerciseId = Bench.Id }, new WorkoutExercise { ExerciseId = other.Id, Order = 1 }],
        });
        var page = Render<WorkoutPage>(p => p.Add(x => x.Id, workout.Id));

        page.WaitForElements("[data-testid=more]")[0].Click();
        var menu = page.Find("[data-testid=menu]").QuerySelectorAll("button").Select(b => b.TextContent.Trim()).ToList();
        menu.ShouldNotContain("Flytta upp");
        page.Find("[data-testid=menu]").QuerySelectorAll("button").Single(b => b.TextContent.Trim() == "Ta bort övningen").Click();

        page.WaitForAssertion(() => page.FindAll("[data-testid=exercise-entry] h3").Select(h => h.TextContent).ShouldBe(["Vader"]));
        (await ReloadAsync(workout.Id)).Exercises.Single().ExerciseId.ShouldBe(other.Id);
    }

    [Fact]
    public async Task The_picture_shows_small_and_large_and_can_be_changed()
    {
        var workout = await SeedAsync(new Workout
        {
            Id = Guid.NewGuid(), Date = new DateOnly(2026, 9, 23),
            Exercises = [new WorkoutExercise { ExerciseId = Bench.Id, TargetSets = 3, TargetReps = 8 }],
        });
        var page = Render<WorkoutPage>(p => p.Add(x => x.Id, workout.Id));

        var thumbnail = page.WaitForElement("[data-testid=thumbnail]");
        var picture = ExerciseIllustrations.Picture("machine-chest-press");
        thumbnail.QuerySelector("img")!.GetAttribute("src").ShouldBe(picture);

        thumbnail.Click();
        page.Find("[data-testid=illustration-large] img").GetAttribute("src").ShouldBe(picture);

        page.Find("[data-testid=change-illustration]").Click();
        page.Find("[data-testid=illustration-picker] input").Input("pec deck");
        page.Find("[data-testid=illustration-picker] [data-slug=pec-deck]").Click();

        page.WaitForAssertion(() => page.Find("[data-testid=thumbnail] img").GetAttribute("src").ShouldBe(ExerciseIllustrations.Picture("pec-deck")));
        (await Repository.GetAllAsync<Exercise>()).Single(e => e.Id == Bench.Id).Illustration.ShouldBe("pec-deck");
    }

    [Fact]
    public async Task A_workout_prefetches_only_the_pictures_it_uses()
    {
        var module = JSInterop.SetupModule("./js/kropp-ui.js");
        module.SetupVoid("scrollToTop");
        module.SetupVoid("prefetch", _ => true);
        var workout = await SeedAsync(new Workout
        {
            Id = Guid.NewGuid(), Date = new DateOnly(2026, 9, 23),
            Exercises = [new WorkoutExercise { ExerciseId = Bench.Id }],
        });

        var page = Render<WorkoutPage>(p => p.Add(x => x.Id, workout.Id));

        JSRuntimeInvocation call = default;
        page.WaitForAssertion(() => call = module.VerifyInvoke("prefetch"));
        ((string[])call.Arguments[0]!).ShouldBe([ExerciseIllustrations.Picture("machine-chest-press")]);
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

        page.WaitForAssertion(() => page.Find("[data-testid=set-done]").TextContent.Trim().ShouldBe("6"));
        page.Find("[data-testid=set-done]").GetAttribute("data-short").ShouldBe("true");
        (await ReloadAsync(workout.Id)).Exercises.Single().Sets.Single().Reps.ShouldBe(6);
    }

    [Fact]
    public async Task A_set_shows_its_weight_only_when_it_differs_from_the_plan()
    {
        var workout = await SeedAsync(new Workout
        {
            Id = Guid.NewGuid(), Date = new DateOnly(2026, 9, 23),
            Exercises = [new WorkoutExercise
            {
                ExerciseId = Bench.Id, TargetSets = 3, TargetReps = 8, TargetWeightKg = 20,
                Sets = [new() { Reps = 8, WeightKg = 20 }, new() { Reps = 10, WeightKg = 17.5m }],
            }],
        });
        var page = Render<WorkoutPage>(p => p.Add(x => x.Id, workout.Id));

        var sets = page.WaitForElements("[data-testid=set-done]");
        sets[0].QuerySelector("[data-testid=set-weight]").ShouldBeNull();
        sets[1].QuerySelector("[data-testid=set-weight]")!.TextContent.ShouldBe("17,5 kg");
        sets.Select(b => b.GetAttribute("data-short")).ShouldBe(["false", "false"]);
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
        page.Find("[data-testid=create-exercise]").HasAttribute("disabled").ShouldBeTrue();
        page.Find("[data-testid=exercise-picker] [data-area=Core]").Click();
        page.Find("[data-testid=create-exercise]").Click();

        page.WaitForAssertion(() => page.Find("[data-testid=exercise-entry] h3").TextContent.ShouldBe("Plankan"));
        var plank = (await Repository.GetAllAsync<Exercise>()).Single(e => e.Name == "Plankan");
        plank.Kind.ShouldBe(ExerciseKind.Timed);
        plank.Categories.ShouldBe([BodyArea.Core]);
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
        page.Find("[data-testid=exercise-picker] li [data-testid=picker-thumbnail]").GetAttribute("src").ShouldBe(ExerciseIllustrations.Picture("machine-chest-press"));
        page.Find("[data-testid=exercise-picker] li button").Click();

        page.WaitForAssertion(() => page.Find("[data-testid=exercise-entry] h3").TextContent.ShouldBe("Bröst maskin"));
        (await ReloadAsync(workout.Id)).Exercises.Single().ExerciseId.ShouldBe(Bench.Id);
    }

    [Fact]
    public async Task The_details_are_text_until_tapped_and_then_editable()
    {
        var workout = await SeedAsync(new Workout { Id = Guid.NewGuid(), Date = new DateOnly(2026, 9, 21), SessionNumber = 101 });
        var page = Render<WorkoutPage>(p => p.Add(x => x.Id, workout.Id));

        var details = page.WaitForElement("[data-testid=details]");
        details.TextContent.ShouldContain("Måndag 21 september 2026", Case.Insensitive);
        details.TextContent.ShouldContain("Nr 101");
        page.FindAll("input[type=date]").ShouldBeEmpty();

        details.QuerySelector("h1 button")!.Click();
        page.Find("[data-testid=details-editor] input[type=text]").Change("Ben och bröst");
        page.Find("[data-testid=details-editor] button").Click();

        page.WaitForAssertion(() => page.Find("[data-testid=details]").TextContent.ShouldContain("Nr 101 · Inte gjort · Ben och bröst"));
        page.FindAll("[data-testid=details-editor]").ShouldBeEmpty();
        (await ReloadAsync(workout.Id)).Note.ShouldBe("Ben och bröst");
    }

    [Fact]
    public async Task A_workout_opens_scrolled_to_the_top_also_when_the_page_is_reused()
    {
        var module = JSInterop.SetupModule("./js/kropp-ui.js");
        module.SetupVoid("scrollToTop");
        var first = await SeedAsync(new Workout { Id = Guid.NewGuid(), Date = new DateOnly(2026, 9, 21) });
        var second = await SeedAsync(new Workout { Id = Guid.NewGuid(), Date = new DateOnly(2026, 9, 23) });

        var page = Render<WorkoutPage>(p => p.Add(x => x.Id, first.Id));
        page.WaitForAssertion(() => module.VerifyInvoke("scrollToTop", calledTimes: 1));

        page.Render(p => p.Add(x => x.Id, second.Id));
        page.WaitForAssertion(() => module.VerifyInvoke("scrollToTop", calledTimes: 2));

        page.Render(p => p.Add(x => x.Id, second.Id));
        module.VerifyInvoke("scrollToTop", calledTimes: 2);
    }

    [Fact]
    public async Task The_status_follows_from_the_sets_and_has_no_switch()
    {
        var workout = await SeedAsync(new Workout
        {
            Id = Guid.NewGuid(), Date = new DateOnly(2026, 9, 23), Status = WorkoutStatus.Planned,
            Exercises = [new WorkoutExercise { ExerciseId = Bench.Id, TargetSets = 3, TargetReps = 8 }],
        });
        var page = Render<WorkoutPage>(p => p.Add(x => x.Id, workout.Id));

        page.WaitForElement("[data-testid=details]").TextContent.ShouldContain("Planerat");
        page.FindAll("[role=radio]").ShouldBeEmpty();

        page.Find("[data-testid=set-next]").Click();

        page.WaitForAssertion(() => page.Find("[data-testid=details]").TextContent.ShouldContain("Genomfört"));
        (await ReloadAsync(workout.Id)).Status.ShouldBe(WorkoutStatus.Done);

        page.Find("[data-testid=set-done]").Click();
        page.Find("[data-testid=set-editor]").QuerySelectorAll("button").Single(b => b.TextContent.Trim() == "Ta bort set").Click();

        page.WaitForAssertion(() => page.Find("[data-testid=details]").TextContent.ShouldContain("Planerat"));
        (await ReloadAsync(workout.Id)).Status.ShouldBe(WorkoutStatus.Planned);
    }

    [Fact]
    public async Task A_workout_can_be_saved_as_a_template()
    {
        var workout = await SeedAsync(new Workout
        {
            Id = Guid.NewGuid(), Date = new DateOnly(2026, 9, 21),
            Exercises = [new WorkoutExercise { ExerciseId = Bench.Id, TargetSets = 3, TargetReps = 8, TargetWeightKg = 60, Sets = [new SetResult { Reps = 8, WeightKg = 60 }] }],
        });
        var page = Render<WorkoutPage>(p => p.Add(x => x.Id, workout.Id));

        page.WaitForElement("[data-testid=save-template]").Click();

        page.WaitForAssertion(() => page.Find("[data-testid=template-saved]").TextContent.ShouldContain("Bröst"));
        var template = (await Repository.GetAllAsync<WorkoutTemplate>()).Single();
        template.Name.ShouldBe("Bröst");
        template.Exercises.Single().Sets.ShouldBeEmpty();
        template.Exercises.Single().TargetWeightKg.ShouldBe(60);
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
