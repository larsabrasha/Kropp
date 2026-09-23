using System.Globalization;
using Kropp.Shared.Training;

namespace Kropp.Client.Components;

/// <summary>Short, unit-bearing texts for targets and sets, formatted in the current culture ("22,5 kg" in Swedish).</summary>
internal static class TrainingText
{
    public static string Number(decimal value) => value.ToString("0.##", CultureInfo.CurrentCulture);

    /// <summary>"3 × 8 @ 20 kg", "3 × 30 s", "3 set @ 5 kg" — or empty when nothing is planned.</summary>
    public static string Target(WorkoutExercise entry, ExerciseKind kind)
    {
        if (kind == ExerciseKind.Cardio)
            return Cardio(entry);

        var (sets, each, unit) = kind == ExerciseKind.Timed
            ? (entry.TargetSets, entry.TargetSeconds, " s")
            : (entry.TargetSets, entry.TargetReps, "");
        var head = (sets, each) switch
        {
            ({ } s, { } e) => $"{s} × {e}{unit}",
            ({ } s, null) => $"{s} set",
            (null, { } e) => kind == ExerciseKind.Timed ? $"{e} s" : $"{e} rep",
            _ => null,
        };
        var weight = kind == ExerciseKind.Strength && entry.TargetWeightKg is { } kg ? $"@ {Number(kg)} kg" : null;
        return string.Join(" ", new[] { head, weight }.Where(p => p is not null));
    }

    /// <summary>The big text on a done set: the reps, or the seconds for a timed exercise.</summary>
    public static string SetMain(SetResult set, ExerciseKind kind) =>
        kind == ExerciseKind.Timed ? $"{set.Seconds} s" : $"{set.Reps}";

    /// <summary>The weight, but only when it differs from the plan — the plan already says it once.</summary>
    public static string? SetWeightIfChanged(SetResult set, WorkoutExercise entry, ExerciseKind kind) =>
        kind == ExerciseKind.Strength && set.WeightKg is { } kg && kg != entry.TargetWeightKg ? $"{Number(kg)} kg" : null;

    /// <summary>Fewer reps (or seconds) than planned, which the set button shows in another colour.</summary>
    public static bool IsShort(SetResult set, WorkoutExercise entry, ExerciseKind kind) => kind == ExerciseKind.Timed
        ? set.Seconds < entry.TargetSeconds
        : set.Reps < entry.TargetReps;

    // Narrow no-break spaces keep "10 × 100" on one line.
    public static string Set(SetResult set, ExerciseKind kind) => kind switch
    {
        ExerciseKind.Strength => set.WeightKg is { } kg ? $"{set.Reps}\u202F×\u202F{Number(kg)}" : $"{set.Reps}",
        ExerciseKind.Timed => $"{set.Seconds} s",
        _ => $"{set.Reps}",
    };

    /// <summary>What was done: the sets in order, or for cardio the distance and time.</summary>
    public static string Result(WorkoutExercise entry, ExerciseKind kind)
    {
        if (kind == ExerciseKind.Cardio)
            return Cardio(entry);
        if (kind == ExerciseKind.Strength && entry.Sets.Count > 0 && entry.Sets.All(s => s.WeightKg == entry.Sets[0].WeightKg) && entry.Sets[0].WeightKg is { } kg)
            return $"{string.Join(", ", entry.Sets.Select(s => s.Reps))} × {Number(kg)} kg";
        return string.Join(", ", entry.Sets.Select(s => Set(s, kind)));
    }

    private static string Cardio(WorkoutExercise entry) =>
        string.Join(" · ", new[]
        {
            entry.DurationMinutes is { } min ? $"{Number(min)} min" : null,
            entry.DistanceKm is { } km ? $"{Number(km)} km" : null,
            entry.AvgHeartRate is { } bpm ? $"{bpm} bpm" : null,
        }.Where(s => s is not null));

    public static int? ParseInt(object? value) =>
        int.TryParse(value?.ToString(), NumberStyles.Integer, CultureInfo.InvariantCulture, out var n) && n >= 0 ? n : null;

    /// <summary>Number inputs report "22.5" whatever the culture; a comma is accepted too.</summary>
    public static decimal? ParseDecimal(object? value) =>
        decimal.TryParse(value?.ToString()?.Replace(',', '.'), NumberStyles.Number, CultureInfo.InvariantCulture, out var d) && d >= 0 ? d : null;

    public static string Invariant(decimal? value) => value?.ToString(CultureInfo.InvariantCulture) ?? "";

    public static string Invariant(int? value) => value?.ToString(CultureInfo.InvariantCulture) ?? "";
}
