namespace Kropp.Shared.Training;

public enum ExerciseKind
{
    /// <summary>Repetitions with a load in kilograms.</summary>
    Strength,

    /// <summary>Repetitions without an added load.</summary>
    Bodyweight,

    /// <summary>Held for a number of seconds, like a plank or a dead hang.</summary>
    Timed,

    /// <summary>Duration, distance and heart rate, like the treadmill.</summary>
    Cardio,
}

/// <summary>
/// An entry in the exercise register. An aggregate of its own, so a workout refers to it by id and
/// renaming it does not rewrite every workout that used it.
/// </summary>
public sealed record Exercise
{
    public required Guid Id { get; init; }
    public required string Name { get; init; }
    public ExerciseKind Kind { get; init; }

    /// <summary>A setting that holds between workouts, like "Sitthöjd 11".</summary>
    public string? SettingsNote { get; init; }

    public bool IsArchived { get; init; }

    /// <summary>
    /// What the exercise trains; at least one when chosen in the app. Empty for exercises from
    /// before categories, which the client then gives a default by name.
    /// </summary>
    public List<BodyArea> Categories { get; init; } = [];

    /// <summary>
    /// The picture chosen for the exercise, by its folder name in the client's illustrations; null
    /// for the client's default by name, <see cref="NoIllustration"/> for none at all.
    /// </summary>
    public string? Illustration { get; init; }

    public const string NoIllustration = "none";

    /// <summary>How much − and + change the weight; null for <see cref="DefaultWeightStepKg"/>.</summary>
    public decimal? WeightStepKg { get; init; }

    public const decimal DefaultWeightStepKg = 2.5m;

    /// <summary>The steps offered: plates and machines mostly go by 2.5, dumbbells by 1 or 2.</summary>
    public static readonly IReadOnlyList<decimal> WeightSteps = [0.5m, 1m, 1.25m, 2m, 2.5m, 5m];
}
