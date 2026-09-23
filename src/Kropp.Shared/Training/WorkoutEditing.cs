namespace Kropp.Shared.Training;

/// <summary>
/// The edits the workout page makes, as pure functions on the immutable model. Each returns a new
/// aggregate for the page to save whole, which is also the unit sync sends.
/// </summary>
public static class WorkoutEditing
{
    public static int NextSessionNumber(IEnumerable<Workout> workouts) =>
        (workouts.Max(w => w.SessionNumber) ?? 0) + 1;

    /// <summary>
    /// Adds an exercise at the end. Targets come from the last time it was done, so a plan starts
    /// where the previous session left off; the user raises the weight when it is time.
    /// </summary>
    public static Workout AddExercise(Workout workout, Exercise exercise, WorkoutExercise? lastTime)
    {
        var entry = new WorkoutExercise
        {
            ExerciseId = exercise.Id,
            Order = workout.Exercises.Count,
            Settings = lastTime?.Settings,
            TargetSets = lastTime?.TargetSets ?? (lastTime?.Sets.Count > 0 ? lastTime.Sets.Count : DefaultSets(exercise.Kind)),
            TargetReps = lastTime?.TargetReps ?? DefaultReps(exercise.Kind),
            TargetWeightKg = exercise.Kind == ExerciseKind.Strength ? lastTime?.TargetWeightKg : null,
            TargetSeconds = exercise.Kind == ExerciseKind.Timed ? lastTime?.TargetSeconds ?? 30 : null,
        };
        return workout with { Exercises = [.. workout.Exercises, entry] };
    }

    public static Workout ReplaceEntry(Workout workout, int index, WorkoutExercise entry)
    {
        var entries = workout.Exercises.ToList();
        entries[index] = entry with { Order = index };
        return workout with { Exercises = entries };
    }

    public static Workout RemoveEntry(Workout workout, int index) =>
        workout with
        {
            Exercises = [.. workout.Exercises.Where((_, i) => i != index).Select((e, i) => e with { Order = i })],
        };

    /// <summary>Moves an entry to a new position, as a drag and drop does.</summary>
    public static Workout MoveEntry(Workout workout, int from, int to)
    {
        if (from == to || from < 0 || to < 0 || from >= workout.Exercises.Count || to >= workout.Exercises.Count)
            return workout;
        var entries = workout.Exercises.ToList();
        var moved = entries[from];
        entries.RemoveAt(from);
        entries.Insert(to, moved);
        return workout with { Exercises = [.. entries.Select((e, i) => e with { Order = i })] };
    }

    /// <summary>Records the next set as done at the planned values, the one-tap case at the gym.</summary>
    public static WorkoutExercise CompleteNextSet(WorkoutExercise entry, ExerciseKind kind)
    {
        var previous = entry.Sets.LastOrDefault();
        var set = kind switch
        {
            ExerciseKind.Timed => new SetResult { Seconds = entry.TargetSeconds ?? previous?.Seconds },
            ExerciseKind.Bodyweight => new SetResult { Reps = entry.TargetReps ?? previous?.Reps },
            _ => new SetResult
            {
                Reps = entry.TargetReps ?? previous?.Reps,
                WeightKg = entry.TargetWeightKg ?? previous?.WeightKg,
            },
        };
        return entry with { Sets = [.. entry.Sets, set] };
    }

    public static WorkoutExercise ReplaceSet(WorkoutExercise entry, int index, SetResult set)
    {
        var sets = entry.Sets.ToList();
        sets[index] = set;
        return entry with { Sets = sets };
    }

    public static WorkoutExercise RemoveSet(WorkoutExercise entry, int index) =>
        entry with { Sets = [.. entry.Sets.Where((_, i) => i != index)] };

    /// <summary>
    /// A new planned workout with the same exercises and targets and nothing done yet — how the
    /// weekly sheet in Numbers was built. Comments belong to the occasion and are left behind.
    /// </summary>
    public static Workout CopyAsPlan(Workout source, Guid id, DateOnly date, int sessionNumber) =>
        new()
        {
            Id = id,
            Date = date,
            SessionNumber = sessionNumber,
            Status = WorkoutStatus.Planned,
            Exercises = [.. source.Exercises.Select((e, i) => e with
            {
                Order = i,
                Comment = null,
                Sets = [],
                DurationMinutes = null,
                DistanceKm = null,
                AvgHeartRate = null,
            })],
        };

    /// <summary>
    /// The most recent other workout, on or before <paramref name="current"/>'s date, where the
    /// exercise has something recorded. Ties on a date go to the higher session number.
    /// </summary>
    public static WorkoutExercise? LastTime(IEnumerable<Workout> workouts, Workout current, Guid exerciseId) =>
        workouts
            .Where(w => w.Id != current.Id && w.Date <= current.Date && w.Status != WorkoutStatus.Skipped)
            .OrderByDescending(w => w.Date)
            .ThenByDescending(w => w.SessionNumber)
            .SelectMany(w => w.Exercises.Where(e => e.ExerciseId == exerciseId && HasResult(e)))
            .FirstOrDefault();

    /// <summary>The newest workout that has exercises, the natural one to copy.</summary>
    public static Workout? LatestWithExercises(IEnumerable<Workout> workouts) =>
        workouts
            .Where(w => w.Exercises.Count > 0)
            .OrderByDescending(w => w.Date)
            .ThenByDescending(w => w.SessionNumber)
            .FirstOrDefault();

    private static bool HasResult(WorkoutExercise e) =>
        e.Sets.Count > 0 || e.DurationMinutes is not null || e.DistanceKm is not null;

    private static int? DefaultSets(ExerciseKind kind) => kind == ExerciseKind.Cardio ? null : 3;

    private static int? DefaultReps(ExerciseKind kind) => kind switch
    {
        ExerciseKind.Strength or ExerciseKind.Bodyweight => 8,
        _ => null,
    };
}
