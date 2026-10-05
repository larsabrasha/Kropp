using Kropp.Shared.Training;

namespace Kropp.Shared.Sync;

/// <summary>The names aggregates travel under. Stored in the database, so never rename one.</summary>
public static class AggregateTypes
{
    public const string Workout = "workout";
    public const string Exercise = "exercise";
    public const string Template = "template";
    public const string Settings = "settings";
    public const string TrashedWorkout = "trashedWorkout";

    public static readonly IReadOnlySet<string> All = new HashSet<string> { Workout, Exercise, Template, Settings, TrashedWorkout };

    public static string Of<T>() => typeof(T) switch
    {
        var t when t == typeof(Workout) => Workout,
        var t when t == typeof(Exercise) => Exercise,
        var t when t == typeof(WorkoutTemplate) => Template,
        var t when t == typeof(UserSettings) => Settings,
        var t when t == typeof(TrashedWorkout) => TrashedWorkout,
        var t => throw new ArgumentException($"{t.Name} is not a synced aggregate."),
    };
}
