namespace Kropp.Shared.Training;

public enum WorkoutStatus
{
    Planned,
    Done,
    Skipped,
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

    /// <summary>What was actually done, one entry per set.</summary>
    public List<SetResult> Sets { get; init; } = [];

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
