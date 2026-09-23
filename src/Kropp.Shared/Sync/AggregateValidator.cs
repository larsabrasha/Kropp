using System.Text.Json;
using Kropp.Shared.Training;

namespace Kropp.Shared.Sync;

/// <summary>
/// Checks a change before it is stored. Used by the server on every push; the client never
/// relies on it for anything the server does not check again.
/// </summary>
public static partial class AggregateValidator
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
                AggregateTypes.Template => ValidateTemplate(change.Id, Deserialize<WorkoutTemplate>(change.Data)),
                AggregateTypes.Settings => ValidateSettings(change.Id, Deserialize<UserSettings>(change.Data)),
                AggregateTypes.TrashedWorkout => ValidateTrashedWorkout(change.Id, Deserialize<TrashedWorkout>(change.Data)),
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
        return ValidateEntries(workout.Exercises);
    }

    private static string? ValidateTrashedWorkout(Guid id, TrashedWorkout trashed)
    {
        if (trashed.Id != id)
            return "The document's id does not match the change's id.";
        if (trashed.DeletedAt.Year is < 2000 or > 2100)
            return "The deletion time is out of range.";
        return ValidateWorkout(id, trashed.Workout);
    }

    private static string? ValidateTemplate(Guid id, WorkoutTemplate template)
    {
        if (template.Id != id)
            return "The document's id does not match the change's id.";
        if (string.IsNullOrWhiteSpace(template.Name) || template.Name.Length > MaxName)
            return "The template needs a name of at most 200 characters.";
        return ValidateEntries(template.Exercises);
    }

    private static string? ValidateSettings(Guid id, UserSettings settings)
    {
        if (id != UserSettings.SingletonId || settings.Id != id)
            return "Settings are stored under their fixed id only.";
        if (settings.SessionsPerWeek is < UserSettings.MinSessionsPerWeek or > UserSettings.MaxSessionsPerWeek)
            return "Sessions per week must be between 1 and 7.";
        return null;
    }

    private static string? ValidateEntries(List<WorkoutExercise> entries)
    {
        if (entries.Count > MaxExercisesPerWorkout)
            return "The workout has too many exercises.";

        foreach (var entry in entries)
        {
            if (entry.ExerciseId == Guid.Empty)
                return "An exercise entry has no exercise.";
            if (entry.Comment?.Length > MaxText || entry.Settings?.Length > MaxText)
                return "An exercise entry has too long a text.";
            if (entry.Sets.Count > MaxSetsPerExercise)
                return "An exercise entry has too many sets.";
            if (IsNegative(entry.TargetSets, entry.TargetReps, entry.TargetSeconds, entry.AvgHeartRate)
                || IsNegative(entry.TargetWeightKg, entry.DurationMinutes, entry.DistanceKm, entry.TargetDurationMinutes, entry.TargetDistanceKm)
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
        if (!Enum.IsDefined(exercise.Kind))
            return "The exercise kind is not valid.";
        if (exercise.Categories.Count > Enum.GetValues<BodyArea>().Length || exercise.Categories.Any(c => !Enum.IsDefined(c)))
            return "The categories are not valid.";
        if (exercise.WeightStepKg is { } step && (step <= 0 || step > 50))
            return "The weight step is out of range.";
        if (exercise.Illustration is { } illustration && !IllustrationPattern().IsMatch(illustration))
            return "The illustration is not a valid name.";
        return null;
    }

    [System.Text.RegularExpressions.GeneratedRegex("^[a-z0-9-]{1,80}$")]
    private static partial System.Text.RegularExpressions.Regex IllustrationPattern();

    private static bool IsNegative(params int?[] values) => values.Any(v => v < 0);
    private static bool IsNegative(params decimal?[] values) => values.Any(v => v < 0);
}
