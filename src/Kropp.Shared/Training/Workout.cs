namespace Kropp.Shared.Training;

public enum WorkoutStatus
{
    /// <summary>Nothing logged yet, also when its day has passed.</summary>
    Planned,

    /// <summary>Every exercise finished: its sets done, its time logged, or skipped.</summary>
    Done,

    /// <summary>No longer derived; kept so workouts stored with it can still be read.</summary>
    Skipped,

    /// <summary>Something logged, with exercises still to go.</summary>
    InProgress,
}

/// <summary>
/// One visit to the gym, and the unit of sync: the exercises and sets travel with it, so a
/// workout edited offline on the phone is never half-applied on the server.
/// </summary>
public sealed record Workout
{
    public required Guid Id { get; init; }

    /// <summary>A calendar date rather than a timestamp, so a time zone can never move it a day.</summary>
    public required DateOnly Date { get; init; }

    public int? SessionNumber { get; init; }
    public WorkoutStatus Status { get; init; }
    public string? Note { get; init; }

    /// <summary>The template the workout was planned from, if any.</summary>
    public Guid? TemplateId { get; init; }

    public List<WorkoutExercise> Exercises { get; init; } = [];
}

public sealed record WorkoutExercise
{
    public required Guid ExerciseId { get; init; }
    public int Order { get; init; }
    public string? Comment { get; init; }

    /// <summary>A setting for this occasion only, like "45 grader".</summary>
    public string? Settings { get; init; }

    public int? TargetSets { get; init; }
    public int? TargetReps { get; init; }
    public decimal? TargetWeightKg { get; init; }
    public int? TargetSeconds { get; init; }

    /// <summary>Cardio's plan. What was done is <see cref="DurationMinutes"/> and <see cref="DistanceKm"/>.</summary>
    public decimal? TargetDurationMinutes { get; init; }
    public decimal? TargetDistanceKm { get; init; }

    /// <summary>What was actually done, one entry per set.</summary>
    public List<SetResult> Sets { get; init; } = [];

    /// <summary>
    /// Ended by the user before the plan was done: fewer sets than planned, or none. The plan is
    /// kept as it was, so the next workout plans the same.
    /// </summary>
    public bool IsSkipped { get; init; }

    public decimal? DurationMinutes { get; init; }
    public decimal? DistanceKm { get; init; }
    public int? AvgHeartRate { get; init; }
}

public sealed record SetResult
{
    public int? Reps { get; init; }
    public decimal? WeightKg { get; init; }
    public int? Seconds { get; init; }
}
