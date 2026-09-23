using System.Globalization;
using Kropp.Client.Components;
using Kropp.Client.Resources;
using Kropp.Shared.Training;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Localization;
using Shouldly;

namespace Kropp.UnitTests.Components;

public class WorkoutNameTests
{
    private readonly IStringLocalizer<SharedResource> L;
    private readonly Dictionary<Guid, Exercise> exercises = [];

    public WorkoutNameTests()
    {
        CultureInfo.CurrentCulture = CultureInfo.CurrentUICulture = new CultureInfo("sv-SE");
        L = new ServiceCollection().AddLogging().AddLocalization().BuildServiceProvider().GetRequiredService<IStringLocalizer<SharedResource>>();
    }

    private Guid Add(string name, ExerciseKind kind = ExerciseKind.Strength, params BodyArea[] areas)
    {
        var e = new Exercise { Id = Guid.NewGuid(), Name = name, Kind = kind, Categories = [.. areas] };
        exercises[e.Id] = e;
        return e.Id;
    }

    private string? Name(params Guid[] ids) => ExerciseCategories.WorkoutName(
        new Workout { Id = Guid.NewGuid(), Date = new DateOnly(2026, 9, 23), Exercises = [.. ids.Select((id, i) => new WorkoutExercise { ExerciseId = id, Order = i })] },
        exercises, L);

    [Fact]
    public void Areas_are_named_most_exercises_first()
    {
        var squat = Add("Benböj lår framsida");
        var calf = Add("Vader");
        var pull = Add("Pull down maskin");
        var sit = Add("Sit ups");

        Name(pull, squat, sit, calf).ShouldBe("Ben, rygg och mage");
    }

    [Fact]
    public void Two_areas_are_joined_with_och() =>
        Name(Add("Benböj lår framsida"), Add("Bröst maskin")).ShouldBe("Ben och bröst");

    [Fact]
    public void An_exercise_in_two_areas_counts_for_both() =>
        Name(Add("Deadlift")).ShouldBe("Ben och rygg");

    [Fact]
    public void The_warm_up_walk_does_not_make_it_a_leg_day() =>
        Name(Add("Gång i maskin", ExerciseKind.Cardio), Add("Bröst maskin"), Add("Biceps hantlar"), Add("Triceps maskin")).ShouldBe("Armar och bröst");

    [Fact]
    public void Only_cardio_is_named_cardio() =>
        Name(Add("Löpning på band", ExerciseKind.Cardio)).ShouldBe("Kondition");

    [Fact]
    public void Chosen_categories_win_over_the_default() =>
        Name(Add("Bröst maskin", ExerciseKind.Strength, BodyArea.Shoulders)).ShouldBe("Axlar");

    [Fact]
    public void An_exercise_without_known_categories_gives_no_name() =>
        Name(Add("Något nytt")).ShouldBeNull();
}
