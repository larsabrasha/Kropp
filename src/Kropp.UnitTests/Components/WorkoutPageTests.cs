using Microsoft.AspNetCore.Components;
using Microsoft.Extensions.DependencyInjection;
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
        first.QuerySelectorAll("span").Where(x => x.Children.Length == 0).Select(x => x.TextContent.Trim()).Where(t => t != "").ShouldBe(["8", "22,5 kg"]);
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
        page.Find("[data-testid=settings-line]").TextContent.Trim().ShouldBe("Sitthöjd 11 · 45 grader");
        page.Find("[data-testid=comment]").TextContent.Trim().ShouldBe("tungt");
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

        page.WaitForElement("[data-testid=edit]").Click();
        page.FindAll("[data-testid=editor] h4").ShouldBeEmpty();
        page.Find("[data-testid=notes-editor]").QuerySelectorAll("label").Select(l => l.QuerySelector("span")!.TextContent).ShouldBe(["Inställning", "Kommentar"]);
        var kg = StepperFor(page.Find("[data-testid=target-editor]"), "kg");
        kg.Children[0].TextContent.ShouldBe("kg");
        kg.Children[1].Children.Select(c => c.TagName).ShouldBe(["INPUT", "DIV"]);
        kg.Children[1].Children[1].QuerySelectorAll("button").Select(b => b.GetAttribute("data-testid")).ShouldBe(["decrease", "increase"]);
        page.FindAll("[data-testid=target-editor] input")[2].Change("25");
        page.Find("[data-testid=close-editor]").TextContent.Trim().ShouldBe("Stäng");
        page.Find("[data-testid=close-editor]").Click();

        page.WaitForAssertion(() => page.Find("[data-testid=target]").TextContent.Trim().ShouldBe("3 × 8 @ 25 kg"));
        page.FindAll("[data-testid=editor]").ShouldBeEmpty();
        (await ReloadAsync(workout.Id)).Exercises.Single().TargetWeightKg.ShouldBe(25);
    }

    private static AngleSharp.Dom.IElement StepperFor(AngleSharp.Dom.IElement scope, string label) =>
        scope.QuerySelectorAll("[data-testid=stepper]").Single(s => s.GetAttribute("data-label") == label);

    [Fact]
    public async Task Typed_values_stay_within_the_limits_and_texts_have_a_length()
    {
        var workout = await SeedAsync(new Workout
        {
            Id = Guid.NewGuid(), Date = new DateOnly(2026, 9, 23),
            Exercises = [new WorkoutExercise { ExerciseId = Bench.Id, TargetSets = 3, TargetReps = 8, TargetWeightKg = 20 }],
        });
        var page = Render<WorkoutPage>(p => p.Add(x => x.Id, workout.Id));
        page.WaitForElement("[data-testid=edit]").Click();
        var editor = page.Find("[data-testid=target-editor]");

        StepperFor(editor, "Rep").QuerySelector("input")!.GetAttribute("max").ShouldBe("100");
        StepperFor(editor, "Rep").QuerySelector("input")!.Change("800");
        StepperFor(page.Find("[data-testid=target-editor]"), "kg").QuerySelector("input")!.Change("-5");

        page.WaitForAssertion(async () =>
        {
            var saved = (await ReloadAsync(workout.Id)).Exercises.Single();
            (saved.TargetReps, saved.TargetWeightKg).ShouldBe((100, 0m));
        });
        page.Find("[data-testid=notes-editor] input").GetAttribute("maxlength").ShouldBe("200");
        page.Find("[data-testid=notes-editor] textarea").GetAttribute("maxlength").ShouldBe("1000");
    }

    [Fact]
    public async Task Plus_and_minus_adjust_the_plan_by_one_rep_and_the_exercise_weight_step()
    {
        var workout = await SeedAsync(new Workout
        {
            Id = Guid.NewGuid(), Date = new DateOnly(2026, 9, 23),
            Exercises = [new WorkoutExercise { ExerciseId = Bench.Id, TargetSets = 3, TargetReps = 8, TargetWeightKg = 20 }],
        });
        var page = Render<WorkoutPage>(p => p.Add(x => x.Id, workout.Id));
        page.WaitForElement("[data-testid=edit]").Click();

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
    public async Task Cardio_is_planned_at_the_top_and_what_was_done_is_corrected_on_its_button()
    {
        var walk = new Exercise { Id = Guid.NewGuid(), Name = "Gång i maskin", Kind = ExerciseKind.Cardio };
        await Repository.SaveAsync(walk.Id, walk);
        var workout = await SeedAsync(new Workout
        {
            Id = Guid.NewGuid(), Date = new DateOnly(2026, 9, 23),
            Exercises = [new WorkoutExercise { ExerciseId = walk.Id, TargetDurationMinutes = 5, Settings = "60" }],
        });
        var page = Render<WorkoutPage>(p => p.Add(x => x.Id, workout.Id));

        page.WaitForElement("[data-testid=target]").TextContent.Trim().ShouldBe("5 min · 60");
        page.Find("[data-testid=edit]").Click();
        var editor = page.Find("[data-testid=target-editor]");
        editor.QuerySelectorAll("[data-testid=stepper]").Select(s => s.GetAttribute("data-label")).ShouldBe(["Minuter", "km"]);
        StepperFor(editor, "Minuter").QuerySelector("[data-testid=increase]")!.Click();

        page.WaitForAssertion(() => page.Find("[data-testid=target]").TextContent.Trim().ShouldBe("5,5 min · 60"));
        (await ReloadAsync(workout.Id)).Status.ShouldBe(WorkoutStatus.Planned);
        page.FindAll("[data-testid=cardio]").ShouldBeEmpty();

        page.Find("[data-testid=close-editor]").Click();
        page.Find("[data-testid=cardio-next]").Click();
        page.WaitForElement("[data-testid=cardio-done]").Click();
        StepperFor(page.Find("[data-testid=cardio-editor]"), "Snittpuls").QuerySelector("[data-testid=increase]")!.Click();

        page.WaitForAssertion(async () =>
        {
            var saved = await ReloadAsync(workout.Id);
            (saved.Exercises.Single().DurationMinutes, saved.Exercises.Single().AvgHeartRate, saved.Status).ShouldBe((5.5m, (int?)120, WorkoutStatus.Done));
        });
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

        page.WaitForAssertion(() => page.Find("[data-testid=set-done] [data-testid=set-main]").TextContent.Trim().ShouldBe("6"));
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

        page.WaitForElements("[data-testid=edit]")[0].Click();
        page.FindAll("[data-testid=edit]")[1].Click();

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
        await page.InvokeAsync(() => page.FindComponent<Kropp.Client.Components.ExerciseList>().Instance.OnEntryReordered(1, 0));

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

        page.WaitForElements("[data-testid=edit]")[0].Click();
        page.Find("[data-testid=editor] [data-testid=remove]").TextContent.Trim().ShouldBe("Radera övning");
        page.Find("[data-testid=editor] [data-testid=remove]").Click();

        page.WaitForAssertion(() => page.FindAll("[data-testid=exercise-entry] h3").Select(h => h.TextContent).ShouldBe(["Vader"]));
        (await ReloadAsync(workout.Id)).Exercises.Single().ExerciseId.ShouldBe(other.Id);
    }

    [Fact]
    public async Task The_picture_shows_small_and_large_and_links_to_the_exercise()
    {
        var workout = await SeedAsync(new Workout
        {
            Id = Guid.NewGuid(), Date = new DateOnly(2026, 9, 23),
            Exercises = [new WorkoutExercise { ExerciseId = Bench.Id, TargetSets = 3, TargetReps = 8 }],
        });
        Services.GetRequiredService<NavigationManager>().NavigateTo($"workouts/{workout.Id}");
        var page = Render<WorkoutPage>(p => p.Add(x => x.Id, workout.Id));

        var thumbnail = page.WaitForElement("[data-testid=thumbnail]");
        var picture = ExerciseIllustrations.Picture("machine-chest-press");
        thumbnail.QuerySelector("img")!.GetAttribute("src").ShouldBe(picture);

        thumbnail.Click();
        page.Find("[data-testid=illustration-large] img").GetAttribute("src").ShouldBe(picture);
        page.FindAll("[data-testid=illustration-picker]").ShouldBeEmpty();
        page.Find("[data-testid=illustration]").TextContent.ShouldNotContain("Bryl Lim");
        page.Find("[data-testid=illustration] [data-testid=edit-exercise]").GetAttribute("href").ShouldBe($"exercises/{Bench.Id}?back=workouts%2F{workout.Id}");
    }

    [Fact]
    public async Task The_card_changes_only_the_occasion_and_links_to_the_exercise_for_the_rest()
    {
        var workout = await SeedAsync(new Workout
        {
            Id = Guid.NewGuid(), Date = new DateOnly(2026, 9, 23),
            Exercises = [new WorkoutExercise { ExerciseId = Bench.Id, TargetSets = 3, TargetReps = 8, TargetWeightKg = 20 }],
        });
        var page = Render<WorkoutPage>(p => p.Add(x => x.Id, workout.Id));

        page.WaitForElement("[data-testid=edit]").Click();
        page.FindAll("[data-testid=editor] [data-testid=category-chips]").ShouldBeEmpty();
        page.FindAll("[data-testid=editor] [data-testid=edit-exercise]").ShouldBeEmpty();

        page.Find("[data-testid=edit]").Click();
        page.FindAll("[data-testid=weight-step]").ShouldBeEmpty();
    }

    [Fact]
    public async Task The_weight_step_of_the_exercise_is_what_plus_adds()
    {
        await Repository.SaveAsync(Bench.Id, Bench with { WeightStepKg = 1 });
        var workout = new Workout
        {
            Id = Guid.NewGuid(), Date = new DateOnly(2026, 9, 23),
            Exercises = [new WorkoutExercise { ExerciseId = Bench.Id, TargetSets = 3, TargetReps = 8, TargetWeightKg = 20 }],
        };
        await Repository.SaveAsync(workout.Id, workout);
        var page = Render<WorkoutPage>(p => p.Add(x => x.Id, workout.Id));

        page.WaitForElement("[data-testid=edit]").Click();
        StepperFor(page.Find("[data-testid=target-editor]"), "kg").QuerySelector("[data-testid=increase]")!.Click();

        page.WaitForAssertion(() => page.Find("[data-testid=target]").TextContent.Trim().ShouldBe("3 × 8 @ 21 kg"));
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

        page.WaitForAssertion(() => page.Find("[data-testid=set-done] [data-testid=set-main]").TextContent.Trim().ShouldBe("6"));
        page.Find("[data-testid=set-done]").GetAttribute("data-short").ShouldBe("true");
        (await ReloadAsync(workout.Id)).Exercises.Single().Sets.Single().Reps.ShouldBe(6);
    }

    [Fact]
    public async Task A_done_set_always_shows_its_weight()
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
        sets[0].QuerySelector("[data-testid=set-weight]")!.TextContent.ShouldBe("20 kg");
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

        page.WaitForAssertion(() => page.Find("[data-testid=last-time]"));
        var last = page.Find("[data-testid=last-time]");
        last.QuerySelector("[data-testid=last-time-date]")!.TextContent.ShouldBe("mån 21 sep (2 dagar sedan)");
        last.QuerySelectorAll("[data-testid=last-sets] > span").Select(x => x.TextContent.Trim()).ShouldBe(["8", "8", "10", "× 60 kg"]);
        last.GetAttribute("aria-label").ShouldBe("Förra gången: mån 21 sep (2 dagar sedan), 8, 8, 10 × 60 kg");
    }

    [Fact]
    public async Task Last_time_marks_the_sets_that_fell_short_and_shows_what_was_said()
    {
        await SeedAsync(new Workout
        {
            Id = Guid.NewGuid(), Date = new DateOnly(2026, 9, 22), Status = WorkoutStatus.Done,
            Exercises = [new WorkoutExercise
            {
                ExerciseId = Bench.Id, TargetSets = 3, TargetReps = 8, TargetWeightKg = 10, Comment = "För tungt",
                Sets = [new() { Reps = 8, WeightKg = 10 }, new() { Reps = 8, WeightKg = 12.5m }, new() { Reps = 3, WeightKg = 10 }],
            }],
        });
        var today = await SeedAsync(new Workout
        {
            Id = Guid.NewGuid(), Date = new DateOnly(2026, 9, 23),
            Exercises = [new WorkoutExercise { ExerciseId = Bench.Id, TargetSets = 3, TargetReps = 8 }],
        });

        var page = Render<WorkoutPage>(p => p.Add(x => x.Id, today.Id));

        var chips = page.WaitForElements("[data-testid=last-sets] > span");
        chips.Select(x => x.TextContent.Trim()).ShouldBe(["8\u202F×\u202F10", "8\u202F×\u202F12,5", "3\u202F×\u202F10"]);
        chips.Select(x => x.GetAttribute("data-short")).ShouldBe(["false", "false", "true"]);
        page.Find("[data-testid=last-time-date]").TextContent.ShouldBe("tis 22 sep (i går)");
        page.Find("[data-testid=last-comment]").TextContent.Trim().ShouldBe("För tungt");
        page.Find("[data-testid=last-comment]").QuerySelectorAll("svg").Length.ShouldBe(2);
        page.FindAll("[data-testid=comment]").ShouldBeEmpty();
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

        var meta = page.WaitForElement("[data-testid=workout-meta]");
        meta.TextContent.Trim().ShouldBe("måndag 21 sep. · 0 övningar · Nr 101");
        page.Find("h1").TextContent.ShouldBe("Träningspass");
        page.FindAll("input[type=date]").ShouldBeEmpty();

        meta.Click();
        page.Find("[data-testid=details-editor] input[type=text]").Change("Ben och bröst");
        page.Find("[data-testid=details-editor] button").Click();

        page.WaitForAssertion(() => page.Find("h1").TextContent.ShouldBe("Ben och bröst"));
        page.FindAll("[data-testid=details-editor]").ShouldBeEmpty();
        (await ReloadAsync(workout.Id)).Note.ShouldBe("Ben och bröst");
    }

    [Fact]
    public async Task The_workout_shows_what_its_row_in_the_list_shows_with_the_same_badge()
    {
        var workout = await SeedAsync(new Workout
        {
            Id = Guid.NewGuid(), Date = new DateOnly(2026, 9, 23), SessionNumber = 102, Note = "lätt",
            Exercises = [new WorkoutExercise { ExerciseId = Bench.Id, TargetSets = 1, TargetReps = 8, Sets = [new SetResult { Reps = 8 }] }],
        });
        var page = Render<WorkoutPage>(p => p.Add(x => x.Id, workout.Id));

        page.WaitForElement("h1").TextContent.ShouldBe("Bröst");
        page.Find("[data-testid=workout-meta]").TextContent.Trim().ShouldBe("onsdag 23 sep. · 1 övning · Nr 102 · lätt");
        page.Find("[data-testid=details] [data-testid=workout-icon]");
        var badge = page.Find("[data-testid=details] [data-testid=status]");
        (badge.TextContent, badge.GetAttribute("data-status")).ShouldBe(("Genomfört", "Done"));
        badge.ClassList.ShouldContain("bg-green-100");
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

        page.WaitForAssertion(() => page.Find("[data-testid=details]").TextContent.ShouldContain("Påbörjat"));
        (await ReloadAsync(workout.Id)).Status.ShouldBe(WorkoutStatus.InProgress);

        page.Find("[data-testid=set-next]").Click();
        page.WaitForElement("[data-testid=set-next]").Click();
        page.WaitForAssertion(() => page.Find("[data-testid=details]").TextContent.ShouldContain("Genomfört"));
        (await ReloadAsync(workout.Id)).Status.ShouldBe(WorkoutStatus.Done);

        page.Find("[data-testid=set-done]").Click();
        page.Find("[data-testid=set-editor] [data-testid=remove-set]").Click();
        page.WaitForAssertion(() => page.Find("[data-testid=details]").TextContent.ShouldContain("Påbörjat"));
        page.Find("[data-testid=set-done]").Click();
        page.Find("[data-testid=set-editor] [data-testid=remove-set]").Click();
        page.Find("[data-testid=set-done]").Click();
        page.Find("[data-testid=set-editor] [data-testid=remove-set]").TextContent.Trim().ShouldBe("Radera set");
        page.Find("[data-testid=set-editor] [data-testid=remove-set]").Click();

        page.WaitForAssertion(() => page.Find("[data-testid=details]").TextContent.ShouldContain("Planerat"));
        (await ReloadAsync(workout.Id)).Status.ShouldBe(WorkoutStatus.Planned);
    }

    [Fact]
    public async Task Deleting_asks_first_and_then_moves_the_workout_to_the_trash()
    {
        var workout = await SeedAsync(new Workout { Id = Guid.NewGuid(), Date = new DateOnly(2026, 9, 23) });
        var page = Render<WorkoutPage>(p => p.Add(x => x.Id, workout.Id));

        page.WaitForElements("button").Single(b => b.TextContent.Trim() == "Ta bort passet").Click();
        (await Repository.GetAllAsync<Workout>()).ShouldNotBeEmpty();
        page.Find("[role=alertdialog] button").Click();

        page.WaitForAssertion(() => Repository.GetAllAsync<Workout>().Result.ShouldBeEmpty());
        (await Store.GetAsync($"workout:{workout.Id}")).ShouldNotBeNull().IsDeleted.ShouldBeTrue();
        (await Repository.GetAsync<TrashedWorkout>(workout.Id)).ShouldNotBeNull().Workout.Id.ShouldBe(workout.Id);
    }

    [Fact]
    public async Task Today_the_first_unfinished_exercise_is_marked_and_the_mark_moves_on()
    {
        var workout = await SeedAsync(new Workout
        {
            Id = Guid.NewGuid(), Date = new DateOnly(2026, 9, 23),
            Exercises =
            [
                new WorkoutExercise { ExerciseId = Bench.Id, Order = 0, TargetSets = 1, TargetReps = 8 },
                new WorkoutExercise { ExerciseId = Bench.Id, Order = 1, TargetSets = 1, TargetReps = 8 },
            ],
        });
        var page = Render<WorkoutPage>(p => p.Add(x => x.Id, workout.Id));

        page.WaitForAssertion(() => Marks().ShouldBe(["true", "false"]));
        page.FindAll("[data-testid=exercise-entry]")[0].GetAttribute("aria-current").ShouldBe("step");

        page.FindAll("[data-testid=set-next]")[0].Click();

        page.WaitForAssertion(() => Marks().ShouldBe(["false", "true"]));

        string?[] Marks() => [.. page.FindAll("[data-testid=exercise-entry]").Select(c => c.GetAttribute("data-current"))];
    }

    [Fact]
    public async Task A_workout_on_another_day_marks_its_exercise_too_so_it_can_be_logged_afterwards()
    {
        var workout = await SeedAsync(new Workout
        {
            Id = Guid.NewGuid(), Date = new DateOnly(2026, 9, 21),
            Exercises = [new WorkoutExercise { ExerciseId = Bench.Id, TargetSets = 3, TargetReps = 8 }],
        });
        var page = Render<WorkoutPage>(p => p.Add(x => x.Id, workout.Id));

        page.WaitForElement("[data-testid=exercise-entry]").GetAttribute("data-current").ShouldBe("true");
        page.Find("[data-testid=set-next]").Click();

        page.WaitForAssertion(async () => (await ReloadAsync(workout.Id)).Exercises.Single().Sets.Count.ShouldBe(1));
    }
    [Fact]
    public async Task Cardio_is_finished_with_one_tap_at_last_times_values_and_can_be_cleared()
    {
        var walk = new Exercise { Id = Guid.NewGuid(), Name = "Gång i maskin", Kind = ExerciseKind.Cardio };
        await Repository.SaveAsync(walk.Id, walk);
        var monday = new Workout
        {
            Id = Guid.NewGuid(), Date = new DateOnly(2026, 9, 21), Status = WorkoutStatus.Done,
            Exercises = [new WorkoutExercise { ExerciseId = walk.Id, DurationMinutes = 3.5m, AvgHeartRate = 130 }],
        };
        await Repository.SaveAsync(monday.Id, monday);
        var workout = await SeedAsync(new Workout
        {
            Id = Guid.NewGuid(), Date = new DateOnly(2026, 9, 23),
            Exercises =
            [
                new WorkoutExercise { ExerciseId = walk.Id, Order = 0, Settings = "60" },
                new WorkoutExercise { ExerciseId = Bench.Id, Order = 1, TargetSets = 3, TargetReps = 8 },
            ],
        });
        var page = Render<WorkoutPage>(p => p.Add(x => x.Id, workout.Id));

        page.WaitForElement("[data-testid=cardio-next]").Click();

        page.WaitForAssertion(() => page.Find("[data-testid=cardio-done]").TextContent.Trim().ShouldBe("3,5 min · 130 bpm"));
        page.FindAll("[data-testid=exercise-entry]").Select(c => c.GetAttribute("data-current")).ShouldBe(["false", "true"]);
        var saved = (await ReloadAsync(workout.Id)).Exercises[0];
        (saved.DurationMinutes, saved.DistanceKm, saved.AvgHeartRate).ShouldBe((3.5m, (decimal?)null, 130));

        page.Find("[data-testid=cardio-done]").Click();
        page.Find("[data-testid=cardio-editor] [data-testid=clear-cardio]").Click();

        page.WaitForElement("[data-testid=cardio-next]");
        (await ReloadAsync(workout.Id)).Exercises[0].DurationMinutes.ShouldBeNull();
    }

    [Fact]
    public async Task Cardio_with_nothing_planned_or_done_before_opens_its_fields_to_finish()
    {
        var walk = new Exercise { Id = Guid.NewGuid(), Name = "Gång i maskin", Kind = ExerciseKind.Cardio };
        await Repository.SaveAsync(walk.Id, walk);
        var workout = await SeedAsync(new Workout
        {
            Id = Guid.NewGuid(), Date = new DateOnly(2026, 9, 23),
            Exercises = [new WorkoutExercise { ExerciseId = walk.Id }],
        });
        var page = Render<WorkoutPage>(p => p.Add(x => x.Id, workout.Id));

        page.WaitForElement("[data-testid=cardio-next]").Click();

        page.WaitForElement("[data-testid=cardio-editor]");
        page.FindAll("[data-testid=cardio-next]").ShouldBeEmpty();
        (await ReloadAsync(workout.Id)).Exercises.Single().DurationMinutes.ShouldBeNull();

        page.Find("[data-testid=cardio-editor] [data-testid=close-editor]").Click();
        page.WaitForElement("[data-testid=cardio-next]");
    }

    [Fact]
    public async Task Finishing_cardio_records_the_plan_before_last_time()
    {
        var walk = new Exercise { Id = Guid.NewGuid(), Name = "Gång i maskin", Kind = ExerciseKind.Cardio };
        await Repository.SaveAsync(walk.Id, walk);
        var monday = new Workout
        {
            Id = Guid.NewGuid(), Date = new DateOnly(2026, 9, 21), Status = WorkoutStatus.Done,
            Exercises = [new WorkoutExercise { ExerciseId = walk.Id, DurationMinutes = 3.5m, DistanceKm = 0.3m, AvgHeartRate = 130 }],
        };
        await Repository.SaveAsync(monday.Id, monday);
        var workout = await SeedAsync(new Workout
        {
            Id = Guid.NewGuid(), Date = new DateOnly(2026, 9, 23),
            Exercises = [new WorkoutExercise { ExerciseId = walk.Id, TargetDurationMinutes = 5 }],
        });
        var page = Render<WorkoutPage>(p => p.Add(x => x.Id, workout.Id));

        page.WaitForElement("[data-testid=cardio-next]").Click();

        page.WaitForAssertion(() => page.Find("[data-testid=cardio-done]").TextContent.Trim().ShouldBe("5 min · 0,3 km · 130 bpm"));
    }
    [Theory]
    [InlineData("thumbnail", "illustration")]
    [InlineData("edit", "editor")]
    [InlineData("set-done", "set-editor")]
    public async Task An_open_panel_ends_the_card_so_its_close_button_is_last(string tap, string panel)
    {
        var workout = await SeedAsync(new Workout
        {
            Id = Guid.NewGuid(), Date = new DateOnly(2026, 9, 23),
            Exercises = [new WorkoutExercise { ExerciseId = Bench.Id, TargetSets = 3, TargetReps = 8, Comment = "tungt", Sets = [new SetResult { Reps = 8 }] }],
        });
        var page = Render<WorkoutPage>(p => p.Add(x => x.Id, workout.Id));
        page.WaitForElement("[data-testid=comment]");

        page.Find($"[data-testid={tap}]").Click();

        var card = page.Find("[data-testid=exercise-entry]");
        card.Children.Last().GetAttribute("data-testid").ShouldBe(panel);
        card.QuerySelectorAll("[data-testid=comment]").ShouldBeEmpty();
        card.QuerySelectorAll("button").Last().TextContent.Trim().ShouldBe("Stäng");
        if (panel == "set-editor")
            card.QuerySelector("[data-testid=set-done]")!.GetAttribute("data-open").ShouldBe("true");
    }

    [Fact]
    public async Task Sets_wrap_three_to_a_row_and_stop_at_ten()
    {
        var workout = await SeedAsync(new Workout
        {
            Id = Guid.NewGuid(), Date = new DateOnly(2026, 9, 23),
            Exercises = [new WorkoutExercise { ExerciseId = Bench.Id, TargetSets = 10, TargetReps = 8, Sets = [.. Enumerable.Repeat(new SetResult { Reps = 8 }, 10)] }],
        });
        var page = Render<WorkoutPage>(p => p.Add(x => x.Id, workout.Id));

        page.WaitForElement("[data-testid=sets]").ClassList.ShouldContain("grid-cols-3");
        page.FindAll("[data-testid=set-done]").Count.ShouldBe(10);

        page.Find("[data-testid=edit]").Click();
        StepperFor(page.Find("[data-testid=target-editor]"), "Set").QuerySelector("[data-testid=increase]")!.HasAttribute("disabled").ShouldBeTrue();
    }

    [Fact]
    public async Task Sets_not_yet_done_show_the_plan_they_record()
    {
        var workout = await SeedAsync(new Workout
        {
            Id = Guid.NewGuid(), Date = new DateOnly(2026, 9, 23),
            Exercises = [new WorkoutExercise { ExerciseId = Bench.Id, TargetSets = 3, TargetReps = 8, TargetWeightKg = 10, Sets = [new SetResult { Reps = 8, WeightKg = 12.5m }] }],
        });
        var page = Render<WorkoutPage>(p => p.Add(x => x.Id, workout.Id));

        var next = page.WaitForElement("[data-testid=set-next]");
        next.QuerySelectorAll("span").Select(x => x.TextContent).ShouldBe(["8", "10 kg"]);
        next.GetAttribute("aria-label").ShouldBe("Set 2: 8\u202F×\u202F10");
        page.Find("[data-testid=set-planned]").QuerySelectorAll("span").Select(x => x.TextContent).ShouldBe(["8", "10 kg"]);
    }

    [Fact]
    public async Task A_set_with_nothing_planned_is_just_numbered()
    {
        var workout = await SeedAsync(new Workout
        {
            Id = Guid.NewGuid(), Date = new DateOnly(2026, 9, 23),
            Exercises = [new WorkoutExercise { ExerciseId = Bench.Id, TargetSets = 2 }],
        });
        var page = Render<WorkoutPage>(p => p.Add(x => x.Id, workout.Id));

        page.WaitForElement("[data-testid=set-next]").TextContent.Trim().ShouldBe("Set 1");
        page.Find("[data-testid=set-planned]").TextContent.Trim().ShouldBe("Set 2");
    }

    [Fact]
    public async Task Cardio_not_yet_done_shows_the_plan_it_records()
    {
        var walk = new Exercise { Id = Guid.NewGuid(), Name = "Gång i maskin", Kind = ExerciseKind.Cardio };
        await Repository.SaveAsync(walk.Id, walk);
        var workout = await SeedAsync(new Workout
        {
            Id = Guid.NewGuid(), Date = new DateOnly(2026, 9, 23),
            Exercises =
            [
                new WorkoutExercise { ExerciseId = walk.Id, TargetDurationMinutes = 5, TargetDistanceKm = 0.4m },
                new WorkoutExercise { ExerciseId = walk.Id, Order = 1 },
            ],
        });
        var page = Render<WorkoutPage>(p => p.Add(x => x.Id, workout.Id));

        var next = page.WaitForElement("[data-testid=cardio-next]");
        next.QuerySelectorAll("span").Select(x => x.TextContent).ShouldBe(["5 min", "0,4 km"]);
        next.GetAttribute("aria-label").ShouldBe("Klar med 5 min · 0,4 km");
        page.FindAll("[data-testid=cardio-next]").Count.ShouldBe(1);
        page.FindAll("[data-testid=cardio]").Count.ShouldBe(1);
    }

    [Fact]
    public async Task Only_the_current_exercise_takes_new_sets_but_done_sets_and_plus_stay_tappable()
    {
        var workout = await SeedAsync(new Workout
        {
            Id = Guid.NewGuid(), Date = new DateOnly(2026, 9, 23),
            Exercises =
            [
                new WorkoutExercise { ExerciseId = Bench.Id, Order = 0, TargetSets = 1, TargetReps = 8, Sets = [new SetResult { Reps = 8 }] },
                new WorkoutExercise { ExerciseId = Bench.Id, Order = 1, TargetSets = 2, TargetReps = 8 },
                new WorkoutExercise { ExerciseId = Bench.Id, Order = 2, TargetSets = 2, TargetReps = 8 },
            ],
        });
        var page = Render<WorkoutPage>(p => p.Add(x => x.Id, workout.Id));

        page.WaitForAssertion(() => page.FindAll("[data-testid=exercise-entry]").Select(c => c.GetAttribute("data-current")).ShouldBe(["false", "true", "false"]));
        var cards = page.FindAll("[data-testid=exercise-entry]");
        cards[1].QuerySelectorAll("[data-testid=set-next]").Length.ShouldBe(1);
        cards[2].QuerySelectorAll("[data-testid=sets]").ShouldBeEmpty();
        cards[2].QuerySelectorAll("[data-testid=set-next]").ShouldBeEmpty();

        // Another set is planned with Set in the editor, and the exercise is the current one again.
        cards[0].QuerySelector("[data-testid=edit]")!.Click();
        StepperFor(page.Find("[data-testid=target-editor]"), "Set").QuerySelector("[data-testid=increase]")!.Click();
        page.Find("[data-testid=close-editor]").Click();
        page.WaitForElement("[data-testid=set-next]").Click();
        page.WaitForAssertion(async () => (await ReloadAsync(workout.Id)).Exercises[0].Sets.Count.ShouldBe(2));
        page.FindAll("[data-testid=exercise-entry]")[0].QuerySelector("[data-testid=set-done]")!.Click();
        page.WaitForElement("[data-testid=set-editor]");
    }
    [Fact]
    public async Task Cardio_with_no_plan_of_its_own_shows_last_time_as_the_plan()
    {
        var walk = new Exercise { Id = Guid.NewGuid(), Name = "Gång i maskin", Kind = ExerciseKind.Cardio };
        await Repository.SaveAsync(walk.Id, walk);
        var monday = new Workout
        {
            Id = Guid.NewGuid(), Date = new DateOnly(2026, 9, 21), Status = WorkoutStatus.Done,
            Exercises = [new WorkoutExercise { ExerciseId = walk.Id, DurationMinutes = 3.5m, DistanceKm = 0.3m, AvgHeartRate = 130 }],
        };
        await Repository.SaveAsync(monday.Id, monday);
        var workout = await SeedAsync(new Workout
        {
            Id = Guid.NewGuid(), Date = new DateOnly(2026, 9, 23),
            Exercises = [new WorkoutExercise { ExerciseId = walk.Id, Settings = "60" }],
        });
        var page = Render<WorkoutPage>(p => p.Add(x => x.Id, workout.Id));

        page.WaitForElement("[data-testid=target]").TextContent.Trim().ShouldBe("3,5 min · 0,3 km · 60");
        page.Find("[data-testid=edit]").Click();
        var editor = page.Find("[data-testid=target-editor]");
        StepperFor(editor, "Minuter").QuerySelector("input")!.GetAttribute("value").ShouldBe("3.5");
        StepperFor(editor, "km").QuerySelector("input")!.GetAttribute("value").ShouldBe("0.3");

        StepperFor(editor, "Minuter").QuerySelector("[data-testid=increase]")!.Click();

        page.WaitForAssertion(async () =>
        {
            var entry = (await ReloadAsync(workout.Id)).Exercises.Single();
            (entry.TargetDurationMinutes, entry.TargetDistanceKm, entry.DurationMinutes).ShouldBe((4m, (decimal?)0.3m, (decimal?)null));
        });
    }

    [Fact]
    public async Task The_rest_of_an_exercise_is_skipped_to_move_on_and_the_skip_can_be_undone()
    {
        var workout = await SeedAsync(new Workout
        {
            Id = Guid.NewGuid(), Date = new DateOnly(2026, 9, 23),
            Exercises =
            [
                new WorkoutExercise { ExerciseId = Bench.Id, Order = 0, TargetSets = 3, TargetReps = 8, Sets = [new SetResult { Reps = 8 }] },
                new WorkoutExercise { ExerciseId = Bench.Id, Order = 1, TargetSets = 3, TargetReps = 8 },
            ],
        });
        var page = Render<WorkoutPage>(p => p.Add(x => x.Id, workout.Id));

        page.FindAll("[data-testid=skip]").ShouldBeEmpty();
        page.WaitForElements("[data-testid=edit]")[0].Click();
        var skip = page.WaitForElement("[data-testid=skip]");
        skip.TextContent.Trim().ShouldBe("Hoppa över resten");
        page.FindAll("[data-testid=skip]").Count.ShouldBe(1);
        skip.Click();

        page.WaitForAssertion(() => page.FindAll("[data-testid=exercise-entry]").Select(c => c.GetAttribute("data-current")).ShouldBe(["false", "true"]));
        var first = page.FindAll("[data-testid=exercise-entry]")[0];
        first.QuerySelectorAll("[data-testid=set-planned]").Select(x => x.GetAttribute("data-skipped")).ShouldBe(["true", "true"]);
        page.FindAll("[data-testid=edit]")[1].Click();
        page.FindAll("[data-testid=exercise-entry]")[1].QuerySelector("[data-testid=skip]")!.TextContent.Trim().ShouldBe("Hoppa över övningen");
        var saved = (await ReloadAsync(workout.Id)).Exercises[0];
        (saved.IsSkipped, saved.TargetSets, saved.Sets.Count).ShouldBe((true, (int?)3, 1));

        page.FindAll("[data-testid=edit]")[0].Click();
        page.FindAll("[data-testid=exercise-entry]")[0].QuerySelector("[data-testid=unskip]")!.Click();

        page.WaitForAssertion(() => page.FindAll("[data-testid=exercise-entry]").Select(c => c.GetAttribute("data-current")).ShouldBe(["true", "false"]));
        (await ReloadAsync(workout.Id)).Exercises[0].IsSkipped.ShouldBeFalse();
    }

    [Fact]
    public async Task A_template_offers_no_skip()
    {
        var template = new WorkoutTemplate { Id = Guid.NewGuid(), Name = "Bröst", Exercises = [new WorkoutExercise { ExerciseId = Bench.Id, TargetSets = 3, TargetReps = 8 }] };
        await Repository.SaveAsync(Bench.Id, Bench);
        await Repository.SaveAsync(template.Id, template);

        var page = Render<TemplatePage>(p => p.Add(x => x.Id, template.Id));

        page.WaitForElement("[data-testid=exercise-entry]");
        page.FindAll("[data-testid=skip]").ShouldBeEmpty();
    }

    [Fact]
    public async Task The_comment_is_written_in_a_text_area_over_several_lines()
    {
        var workout = await SeedAsync(new Workout
        {
            Id = Guid.NewGuid(), Date = new DateOnly(2026, 9, 23),
            Exercises = [new WorkoutExercise { ExerciseId = Bench.Id, TargetSets = 3, TargetReps = 8, Comment = "tungt" }],
        });
        var page = Render<WorkoutPage>(p => p.Add(x => x.Id, workout.Id));

        page.WaitForElement("[data-testid=edit]").Click();
        var comment = page.Find("[data-testid=editor] textarea");
        comment.GetAttribute("value").ShouldBe("tungt");
        comment.Change("tungt\nsista setet kort");

        page.WaitForAssertion(async () => (await ReloadAsync(workout.Id)).Exercises.Single().Comment.ShouldBe("tungt\nsista setet kort"));
    }

    [Fact]
    public async Task Exercises_neither_current_nor_done_show_only_their_top_row()
    {
        var workout = await SeedAsync(new Workout
        {
            Id = Guid.NewGuid(), Date = new DateOnly(2026, 9, 23),
            Exercises =
            [
                new WorkoutExercise { ExerciseId = Bench.Id, Order = 0, TargetSets = 2, TargetReps = 8, Sets = [new SetResult { Reps = 8 }, new SetResult { Reps = 8 }] },
                new WorkoutExercise { ExerciseId = Bench.Id, Order = 1, TargetSets = 3, TargetReps = 8, Sets = [new SetResult { Reps = 8 }], IsSkipped = true },
                new WorkoutExercise { ExerciseId = Bench.Id, Order = 2, TargetSets = 3, TargetReps = 8 },
                new WorkoutExercise { ExerciseId = Bench.Id, Order = 3, TargetSets = 3, TargetReps = 8, Comment = "tungt" },
            ],
        });
        var page = Render<WorkoutPage>(p => p.Add(x => x.Id, workout.Id));

        page.WaitForAssertion(() => page.FindAll("[data-testid=exercise-entry]").Select(c => c.QuerySelector("[data-testid=sets]") is not null).ShouldBe([true, true, true, false]));
        var quiet = page.FindAll("[data-testid=exercise-entry]")[3];
        quiet.QuerySelector("[data-testid=comment]").ShouldBeNull();
        quiet.QuerySelector("[data-testid=target]")!.TextContent.Trim().ShouldBe("3 × 8");

        quiet.QuerySelector("[data-testid=edit]")!.Click();
        page.FindAll("[data-testid=exercise-entry]")[3].QuerySelector("[data-testid=editor]").ShouldNotBeNull();
    }

    [Fact]
    public async Task An_exercise_skipped_whole_shows_only_its_struck_top_row()
    {
        var workout = await SeedAsync(new Workout
        {
            Id = Guid.NewGuid(), Date = new DateOnly(2026, 9, 23),
            Exercises =
            [
                new WorkoutExercise { ExerciseId = Bench.Id, Order = 0, TargetSets = 3, TargetReps = 8, IsSkipped = true },
                new WorkoutExercise { ExerciseId = Bench.Id, Order = 1, TargetSets = 3, TargetReps = 8, Sets = [new SetResult { Reps = 8 }], IsSkipped = true },
                new WorkoutExercise { ExerciseId = Bench.Id, Order = 2, TargetSets = 3, TargetReps = 8 },
            ],
        });
        var page = Render<WorkoutPage>(p => p.Add(x => x.Id, workout.Id));

        var cards = page.WaitForElements("[data-testid=exercise-entry]");
        cards[0].QuerySelector("[data-testid=sets]").ShouldBeNull();
        cards[0].QuerySelector("h3")!.GetAttribute("data-skipped").ShouldBe("true");
        cards[0].QuerySelector("h3")!.TextContent.ShouldContain("Överhoppad");
        cards[0].QuerySelector("[data-testid=target]")!.ClassList.ShouldContain("line-through");

        cards[1].QuerySelector("h3")!.GetAttribute("data-skipped").ShouldBe("false");
        cards[1].QuerySelectorAll("[data-testid=set-planned]").Select(x => x.GetAttribute("data-skipped")).ShouldBe(["true", "true"]);
    }

    [Fact]
    public async Task The_sets_step_aside_while_the_editor_is_open()
    {
        var workout = await SeedAsync(new Workout
        {
            Id = Guid.NewGuid(), Date = new DateOnly(2026, 9, 23),
            Exercises = [new WorkoutExercise { ExerciseId = Bench.Id, TargetSets = 3, TargetReps = 8 }],
        });
        var page = Render<WorkoutPage>(p => p.Add(x => x.Id, workout.Id));

        page.WaitForElement("[data-testid=sets]");
        page.Find("[data-testid=edit]").Click();
        page.FindAll("[data-testid=sets]").ShouldBeEmpty();

        page.Find("[data-testid=close-editor]").Click();
        page.WaitForElement("[data-testid=sets]");

        page.Find("[data-testid=settings-line]").Click();
        page.Find("[data-testid=editor]");
        page.FindAll("[data-testid=sets]").ShouldBeEmpty();
    }

    [Fact]
    public async Task A_done_set_has_its_check_beside_the_number()
    {
        var workout = await SeedAsync(new Workout
        {
            Id = Guid.NewGuid(), Date = new DateOnly(2026, 9, 23),
            Exercises = [new WorkoutExercise { ExerciseId = Bench.Id, TargetSets = 2, TargetReps = 8, Sets = [new SetResult { Reps = 8 }] }],
        });
        var page = Render<WorkoutPage>(p => p.Add(x => x.Id, workout.Id));

        var check = page.WaitForElement("[data-testid=set-done] [data-testid=check]");
        check.ClassList.ShouldNotContain("absolute");
        check.ParentElement!.TextContent.Trim().ShouldBe("8");
    }

    [Fact]
    public async Task Cardio_measured_by_time_alone_shows_and_records_only_minutes()
    {
        var walk = new Exercise { Id = Guid.NewGuid(), Name = "Gång i maskin", Kind = ExerciseKind.Cardio, MeasuresTimeOnly = true };
        await Repository.SaveAsync(walk.Id, walk);
        var monday = new Workout
        {
            Id = Guid.NewGuid(), Date = new DateOnly(2026, 9, 21), Status = WorkoutStatus.Done,
            Exercises = [new WorkoutExercise { ExerciseId = walk.Id, DurationMinutes = 3.5m, DistanceKm = 0, AvgHeartRate = 130 }],
        };
        await Repository.SaveAsync(monday.Id, monday);
        var workout = await SeedAsync(new Workout
        {
            Id = Guid.NewGuid(), Date = new DateOnly(2026, 9, 23),
            Exercises = [new WorkoutExercise { ExerciseId = walk.Id, Settings = "60" }],
        });
        var page = Render<WorkoutPage>(p => p.Add(x => x.Id, workout.Id));

        page.WaitForElement("[data-testid=target]").TextContent.Trim().ShouldBe("3,5 min · 60");
        page.Find("[data-testid=last-time]").GetAttribute("aria-label").ShouldBe("Förra gången: mån 21 sep (2 dagar sedan), 3,5 min");
        page.Find("[data-testid=cardio-next]").QuerySelectorAll("span").Select(x => x.TextContent).ShouldBe(["3,5 min"]);

        page.Find("[data-testid=cardio-next]").Click();
        page.WaitForAssertion(async () =>
        {
            var entry = (await ReloadAsync(workout.Id)).Exercises.Single();
            (entry.DurationMinutes, entry.DistanceKm, entry.AvgHeartRate).ShouldBe((3.5m, (decimal?)null, (int?)null));
        });

        page.Find("[data-testid=cardio-done]").Click();
        page.Find("[data-testid=cardio-editor]").QuerySelectorAll("[data-testid=stepper]").Select(x => x.GetAttribute("data-label")).ShouldBe(["Minuter"]);
        page.Find("[data-testid=cardio-editor] [data-testid=close-editor]").Click();
        page.Find("[data-testid=edit]").Click();
        page.Find("[data-testid=target-editor]").QuerySelectorAll("[data-testid=stepper]").Select(x => x.GetAttribute("data-label")).ShouldBe(["Minuter"]);
    }

    [Fact]
    public async Task Only_the_current_exercise_wraps_its_name()
    {
        var workout = await SeedAsync(new Workout
        {
            Id = Guid.NewGuid(), Date = new DateOnly(2026, 9, 23),
            Exercises =
            [
                new WorkoutExercise { ExerciseId = Bench.Id, Order = 0, TargetSets = 3, TargetReps = 8 },
                new WorkoutExercise { ExerciseId = Bench.Id, Order = 1, TargetSets = 3, TargetReps = 8 },
            ],
        });
        var page = Render<WorkoutPage>(p => p.Add(x => x.Id, workout.Id));

        page.WaitForAssertion(() => page.FindAll("[data-testid=exercise-entry] h3").Select(h => h.ClassList.Contains("truncate")).ShouldBe([false, true]));
    }

    [Fact]
    public async Task The_comment_has_a_line_of_its_own_that_opens_the_editor()
    {
        var workout = await SeedAsync(new Workout
        {
            Id = Guid.NewGuid(), Date = new DateOnly(2026, 9, 23),
            Exercises = [new WorkoutExercise { ExerciseId = Bench.Id, TargetSets = 3, TargetReps = 8, Comment = "tungt\nsista kort" }],
        });
        var page = Render<WorkoutPage>(p => p.Add(x => x.Id, workout.Id));

        var comment = page.WaitForElement("[data-testid=comment]");
        comment.TextContent.Trim().ShouldBe("tungt\nsista kort");
        comment.QuerySelector("svg").ShouldNotBeNull();
        page.Find("[data-testid=settings-line]").TextContent.ShouldNotContain("tungt");

        comment.Click();
        page.Find("[data-testid=editor]");
        page.FindAll("[data-testid=comment]").ShouldBeEmpty();
    }
}
