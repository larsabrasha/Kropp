using System.Text.Json;
using Kropp.Shared.Training;

namespace Kropp.Shared.Sync;

/// <summary>
/// Checks a change before it is stored. Used by the server on every push; the client never
/// relies on it for anything the server does not check again.
/// </summary>
public static class AggregateValidator
{
    private const int MaxText = 2000;
    private const int MaxName = 200;
    private const int MaxExercisesPerWorkout = 100;
    private const int MaxSetsPerExercise = 50;

    /// <returns>An English description of the first problem, or null when the change is valid.</returns>
    public static string? Validate(SyncChange change)
    {
        if (!AggregateTypes.All.Contains(change.Type))
            return $"Unknown aggregate type '{change.Type}'.";
        if (change.Id == Guid.Empty)
            return "The id is empty.";
        if (change.IsDeleted)
            return change.Data is null ? null : "A tombstone carries no data.";
        if (change.Data is null)
            return "A change that is not a tombstone must carry data.";
        if (change.Data.Length > SyncLimits.MaxDocumentLength)
            return "The document is too large.";

        try
        {
            return change.Type switch
            {
                AggregateTypes.Workout => ValidateWorkout(change.Id, Deserialize<Workout>(change.Data)),
                AggregateTypes.Exercise => ValidateExercise(change.Id, Deserialize<Exercise>(change.Data)),
                _ => null,
            };
        }
        catch (JsonException ex)
        {
            return $"The document is not a valid {change.Type}: {ex.Message}";
        }
    }

    private static T Deserialize<T>(string data) =>
        JsonSerializer.Deserialize<T>(data, KroppJson.Options)
        ?? throw new JsonException("The document is null.");

    private static string? ValidateWorkout(Guid id, Workout workout)
    {
        if (workout.Id != id)
            return "The document's id does not match the change's id.";
        if (workout.Date.Year is < 2000 or > 2100)
            return "The date is out of range.";
        if (workout.Note?.Length > MaxText)
            return "The note is too long.";
        if (workout.Exercises.Count > MaxExercisesPerWorkout)
            return "The workout has too many exercises.";

        foreach (var entry in workout.Exercises)
        {
            if (entry.ExerciseId == Guid.Empty)
                return "An exercise entry has no exercise.";
            if (entry.Comment?.Length > MaxText || entry.Settings?.Length > MaxText)
                return "An exercise entry has too long a text.";
            if (entry.Sets.Count > MaxSetsPerExercise)
                return "An exercise entry has too many sets.";
            if (IsNegative(entry.TargetSets, entry.TargetReps, entry.TargetSeconds, entry.AvgHeartRate)
                || IsNegative(entry.TargetWeightKg, entry.DurationMinutes, entry.DistanceKm)
                || entry.Sets.Any(s => IsNegative(s.Reps, s.Seconds) || IsNegative(s.WeightKg)))
                return "An exercise entry has a negative value.";
        }

        return null;
    }

    private static string? ValidateExercise(Guid id, Exercise exercise)
    {
        if (exercise.Id != id)
            return "The document's id does not match the change's id.";
        if (string.IsNullOrWhiteSpace(exercise.Name))
            return "The exercise has no name.";
        if (exercise.Name.Length > MaxName)
            return "The exercise name is too long.";
        if (exercise.SettingsNote?.Length > MaxText)
            return "The settings note is too long.";
        return null;
    }

    private static bool IsNegative(params int?[] values) => values.Any(v => v < 0);
    private static bool IsNegative(params decimal?[] values) => values.Any(v => v < 0);
}
