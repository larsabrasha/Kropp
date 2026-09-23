namespace Kropp.Shared.Training;

/// <summary>
/// A standard workout to plan from: its exercises in order with their targets, never any results.
/// An aggregate of its own, so it syncs and can be renamed or deleted without touching workouts.
/// </summary>
public sealed record WorkoutTemplate
{
    public required Guid Id { get; init; }
    public required string Name { get; init; }
    public List<WorkoutExercise> Exercises { get; init; } = [];
}
