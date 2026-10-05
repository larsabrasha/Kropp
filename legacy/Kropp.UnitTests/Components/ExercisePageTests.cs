using Bunit;
using Kropp.Client.Components;
using Kropp.Client.Pages;
using Kropp.Shared.Sync;
using Kropp.Shared.Training;
using Microsoft.AspNetCore.Components;
using Microsoft.Extensions.DependencyInjection;
using Shouldly;

namespace Kropp.UnitTests.Components;

public class ExercisePageTests : ClientTestContext
{
    private static readonly Exercise Bench = new() { Id = Guid.NewGuid(), Name = "Bröst maskin", Kind = ExerciseKind.Strength };
    private static readonly Exercise Walk = new() { Id = Guid.NewGuid(), Name = "Gång i maskin", Kind = ExerciseKind.Cardio };
    private static readonly Exercise Old = new() { Id = Guid.NewGuid(), Name = "Armhävningar", Kind = ExerciseKind.Bodyweight, IsArchived = true };

    private async Task SeedAsync()
    {
        foreach (var exercise in new[] { Bench, Walk, Old })
            await Repository.SaveAsync(exercise.Id, exercise);
    }

    private IRenderedComponent<ExercisePage> RenderExercise(Guid id, string? back = null)
    {
        Services.GetRequiredService<NavigationManager>().NavigateTo(back is null ? $"exercises/{id}" : $"exercises/{id}?back={Uri.EscapeDataString(back)}");
        return Render<ExercisePage>(p => p.Add(x => x.Id, id));
    }

    private async Task<Exercise> ReloadAsync(Guid id) => (await Repository.GetAsync<Exercise>(id))!;

    // For WaitForAssertion, which retries only a synchronous assertion: an async lambda there
    // becomes async void, and a failing assertion in it is never seen.
    private Exercise Reload(Guid id) => ReloadAsync(id).GetAwaiter().GetResult();

    [Fact]
    public void Without_exercises_the_list_says_where_they_come_from() =>
        Render<ExercisesPage>().WaitForElement("[data-testid=exercises-empty]");

    [Fact]
    public async Task The_list_is_by_name_with_hidden_ones_last_and_can_be_searched()
    {
        await SeedAsync();
        var list = Render<ExercisesPage>();

        list.WaitForAssertion(() => list.FindAll("[data-testid=exercises] a .font-semibold").Select(n => n.TextContent).ShouldBe(["Bröst maskin", "Gång i maskin", "Armhävningar"]));
        list.Find("[data-testid=exercises] a").GetAttribute("href").ShouldBe($"exercises/{Bench.Id}");
        list.FindAll("[data-testid=exercises] a")[2].TextContent.ShouldContain("Dold");

        list.Find("[data-testid=exercise-search]").Input("gång");
        list.FindAll("[data-testid=exercises] a").Count.ShouldBe(1);
        list.Find("[data-testid=exercise-search]").Input("xyz");
        list.Find("[data-testid=exercises-no-match]");
    }

    [Fact]
    public void An_unknown_exercise_shows_not_found() =>
        RenderExercise(Guid.NewGuid()).WaitForElement("[data-testid=not-found]");

    [Fact]
    public async Task Categories_are_changed_for_the_exercise_and_name_the_workouts()
    {
        await SeedAsync();
        var workout = new Workout { Id = Guid.NewGuid(), Date = new DateOnly(2026, 9, 23), Exercises = [new WorkoutExercise { ExerciseId = Bench.Id }] };
        await Repository.SaveAsync(workout.Id, workout);
        var page = RenderExercise(Bench.Id);

        page.WaitForElement("[data-testid=usage]").TextContent.ShouldContain("Används i 1 pass");
        var chips = page.Find("[data-testid=category-chips]");
        chips.QuerySelector("[data-area=Chest]")!.HasAttribute("disabled").ShouldBeTrue();
        chips.QuerySelector("[data-area=Arms]")!.Click();

        page.WaitForAssertion(() => (Reload(Bench.Id)).Categories.ShouldBe([BodyArea.Chest, BodyArea.Arms]));
        (await Store.GetPendingAsync()).ShouldContain(c => c.Type == AggregateTypes.Exercise && c.Id == Bench.Id);

        var workoutPage = Render<WorkoutPage>(p => p.Add(x => x.Id, workout.Id));
        workoutPage.WaitForAssertion(() => workoutPage.Find("[data-testid=details]").TextContent.ShouldContain("Bröst och armar"));
    }

    [Fact]
    public async Task Name_setting_weight_step_and_hidden_are_saved()
    {
        await SeedAsync();
        var page = RenderExercise(Bench.Id);

        page.WaitForElement("input[type=text]").Change("Bröstpress");
        page.FindAll("input[type=text]")[1].Change("Sitthöjd 11");
        page.Find("[data-testid=weight-step]").Change("1");
        page.Find("[data-testid=archived]").Change(true);

        page.WaitForAssertion(() =>
        {
            var saved = Reload(Bench.Id);
            (saved.Name, saved.SettingsNote, saved.WeightStepKg, saved.IsArchived).ShouldBe(("Bröstpress", "Sitthöjd 11", (decimal?)1, true));
        });
        page.Find("h1").TextContent.ShouldBe("Bröstpress");
    }

    [Fact]
    public async Task An_empty_name_is_refused_and_the_old_one_kept()
    {
        await SeedAsync();
        var page = RenderExercise(Bench.Id);

        page.WaitForElement("input[type=text]").Change("  ");

        page.Find("[role=alert]").TextContent.ShouldBe("Övningen behöver ett namn.");
        page.Find("input[type=text]").GetAttribute("value").ShouldBe("Bröst maskin");
        (await ReloadAsync(Bench.Id)).Name.ShouldBe("Bröst maskin");
    }

    [Fact]
    public async Task The_weight_step_is_offered_only_for_weights()
    {
        await SeedAsync();

        var page = RenderExercise(Walk.Id);

        page.WaitForElement("[data-testid=usage]");
        page.FindAll("[data-testid=weight-step]").ShouldBeEmpty();
    }

    [Fact]
    public async Task The_picture_is_changed_here()
    {
        await SeedAsync();
        var page = RenderExercise(Bench.Id);

        page.WaitForElement("[data-testid=change-illustration]");
        page.Find("[data-testid=illustration]").TextContent.ShouldNotContain("Bryl Lim");
        page.Find("[data-testid=change-illustration]").Click();
        page.Find("[data-testid=illustration-credit]").TextContent.ShouldContain("Bryl Lim");
        page.Find("[data-testid=illustration-picker] input").Input("pec deck");
        page.Find("[data-testid=illustration-picker] [data-slug=pec-deck]").Click();

        page.WaitForAssertion(() => page.Find("[data-testid=illustration-large] img").GetAttribute("src").ShouldBe(ExerciseIllustrations.Picture("pec-deck")));
        (await ReloadAsync(Bench.Id)).Illustration.ShouldBe("pec-deck");
    }

    [Theory]
    [InlineData(null, "exercises")]
    [InlineData("workouts/0b3c5e0e-4f7a-4d0c-9d6a-2f1b8e3c7a11", "workouts/0b3c5e0e-4f7a-4d0c-9d6a-2f1b8e3c7a11")]
    [InlineData("https://example.com/", "exercises")]
    [InlineData("//example.com", "exercises")]
    public async Task Back_goes_to_where_the_user_came_from_but_only_inside_the_app(string? back, string expected)
    {
        await SeedAsync();

        RenderExercise(Bench.Id, back).WaitForElement("[data-testid=back]").GetAttribute("href").ShouldBe(expected);
    }

    [Fact]
    public async Task Cardio_can_be_set_to_measure_time_alone()
    {
        await SeedAsync();
        var page = RenderExercise(Walk.Id);

        page.WaitForElement("[data-testid=time-only]").Change(true);

        page.WaitForAssertion(() => (Reload(Walk.Id)).MeasuresTimeOnly.ShouldBeTrue());
    }

    [Fact]
    public async Task Only_cardio_offers_time_alone()
    {
        await SeedAsync();
        var page = RenderExercise(Bench.Id);

        page.WaitForElement("[data-testid=usage]");
        page.FindAll("[data-testid=time-only]").ShouldBeEmpty();
    }

    [Fact]
    public async Task The_kind_can_be_changed_and_a_weight_then_stops_showing()
    {
        await SeedAsync();
        var workout = new Workout
        {
            Id = Guid.NewGuid(), Date = new DateOnly(2026, 9, 23),
            Exercises = [new WorkoutExercise { ExerciseId = Bench.Id, TargetSets = 3, TargetReps = 20, TargetWeightKg = 5 }],
        };
        await Repository.SaveAsync(workout.Id, workout);
        var page = RenderExercise(Bench.Id);

        page.WaitForElement("[data-testid=kind]").Change("Bodyweight");

        page.WaitForAssertion(() => (Reload(Bench.Id)).Kind.ShouldBe(ExerciseKind.Bodyweight));
        page.FindAll("[data-testid=weight-step]").ShouldBeEmpty();
        var workoutPage = Render<WorkoutPage>(p => p.Add(x => x.Id, workout.Id));
        workoutPage.WaitForElement("[data-testid=target]").TextContent.Trim().ShouldBe("3 × 20");
    }
}
