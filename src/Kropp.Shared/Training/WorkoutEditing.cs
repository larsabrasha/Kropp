namespace Kropp.Shared.Training;

/// <summary>
/// The edits the workout page makes, as pure functions on the immutable model. Each returns a new
/// aggregate for the page to save whole, which is also the unit sync sends.
/// </summary>
public static class WorkoutEditing
{
    /// <summary>
    /// A workout of an earlier day opens locked: what was logged is history, and a stray tap
    /// should not change it. A plan for today or later stays open to edit.
    /// </summary>
    public static bool OpensLocked(Workout workout, DateOnly today) => workout.Date < today;

    /// <summary>
    /// The status follows from what was logged, so there is nothing to tick: nothing recorded is a
    /// plan, whatever the date; something recorded is in progress until every exercise is finished,
    /// and done once its day has passed. A workout of an earlier day is over, even if not every
    /// planned set was logged, as in most of the log imported from Numbers.
    /// </summary>
    public static WorkoutStatus StatusOf(Workout workout, DateOnly today) =>
        !workout.Exercises.Any(HasResult) ? WorkoutStatus.Planned
        : workout.Date < today || CurrentEntry(workout) is null ? WorkoutStatus.Done
        : WorkoutStatus.InProgress;

    /// <summary>Started or done: the workout happened, which is what planning counts.</summary>
    public static bool HasHappened(Workout workout) => workout.Exercises.Any(HasResult);

    /// <summary>The workout with its stored status brought in line with <see cref="StatusOf"/>.</summary>
    public static Workout WithDerivedStatus(Workout workout, DateOnly today) =>
        workout with { Status = StatusOf(workout, today) };

    /// <summary>
    /// The body areas a workout trains, most exercises first, for naming it. Cardio is left out:
    /// the walk that warms up nearly every session would otherwise make every session "legs".
    /// Ties keep the order of <see cref="BodyArea"/>.
    /// </summary>
    public static IReadOnlyList<BodyArea> AreasOf(Workout workout, Func<Guid, Exercise?> exercise, Func<Exercise, IReadOnlyList<BodyArea>> categories) =>
        [.. workout.Exercises
            .Select(e => exercise(e.ExerciseId))
            .OfType<Exercise>()
            .Where(e => e.Kind != ExerciseKind.Cardio)
            .SelectMany(categories)
            .GroupBy(a => a)
            .OrderByDescending(g => g.Count())
            .ThenBy(g => g.Key)
            .Select(g => g.Key)];

    /// <summary>Whether the workout has only cardio, which is named as such.</summary>
    public static bool IsCardioOnly(Workout workout, Func<Guid, Exercise?> exercise) =>
        workout.Exercises.Count > 0 && workout.Exercises.All(e => exercise(e.ExerciseId)?.Kind == ExerciseKind.Cardio);

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
            TargetDurationMinutes = exercise.Kind == ExerciseKind.Cardio ? lastTime?.TargetDurationMinutes : null,
            TargetDistanceKm = exercise.Kind == ExerciseKind.Cardio ? lastTime?.TargetDistanceKm : null,
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

    /// <summary>
    /// The most sets the app offers for one exercise, planned or done. More than anyone logs, and
    /// few enough that the sets still fit the card. The server allows more, for older data.
    /// </summary>
    public const int MaxSets = Limits.Sets;

    /// <summary>Records the next set as done at the planned values, the one-tap case at the gym.</summary>
    public static WorkoutExercise CompleteNextSet(WorkoutExercise entry, ExerciseKind kind)
    {
        if (entry.Sets.Count >= MaxSets)
            return entry;

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
    /// The most recent other workout, on or before <paramref name="current"/>'s date, where the
    /// exercise has something recorded. Ties on a date go to the higher session number.
    /// </summary>
    public static WorkoutExercise? LastTime(IEnumerable<Workout> workouts, Workout current, Guid exerciseId) =>
        LastTimeOn(workouts, current, exerciseId)?.Entry;

    /// <summary><see cref="LastTime"/> with the day it was, to say how long ago.</summary>
    public static (DateOnly Date, WorkoutExercise Entry)? LastTimeOn(IEnumerable<Workout> workouts, Workout current, Guid exerciseId) =>
        workouts
            .Where(w => w.Id != current.Id && w.Date <= current.Date)
            .OrderByDescending(w => w.Date)
            .ThenByDescending(w => w.SessionNumber)
            .SelectMany(w => w.Exercises.Where(e => e.ExerciseId == exerciseId && HasResult(e)).Select(e => ((DateOnly Date, WorkoutExercise Entry)?)(w.Date, e)))
            .FirstOrDefault();

    /// <summary>The newest workout that has exercises, the natural one to copy.</summary>
    public static Workout? LatestWithExercises(IEnumerable<Workout> workouts) =>
        workouts
            .Where(w => w.Exercises.Count > 0)
            .OrderByDescending(w => w.Date)
            .ThenByDescending(w => w.SessionNumber)
            .FirstOrDefault();

    /// <summary>
    /// The exercise the user is on: the first, in order, that is not finished. Null when every
    /// exercise is finished.
    /// </summary>
    public static int? CurrentEntry(Workout workout)
    {
        var index = workout.Exercises.FindIndex(e => !IsFinished(e));
        return index < 0 ? null : index;
    }

    /// <summary>
    /// Skipped, or done: cardio with a time or a distance, anything else with its planned sets
    /// (one set when nothing is planned). Cardio has no sets, so it needs no kind to tell.
    /// </summary>
    public static bool IsFinished(WorkoutExercise e) =>
        e.IsSkipped || e.DurationMinutes is not null || e.DistanceKm is not null || e.Sets.Count >= Math.Max(e.TargetSets ?? 1, 1);

    /// <summary>
    /// Records cardio as done at the planned time and distance — the cardio twin of
    /// <see cref="CompleteNextSet"/>. What is not planned comes from last time, and so does the pulse.
    /// </summary>
    public static WorkoutExercise CompleteCardio(WorkoutExercise entry, WorkoutExercise? lastTime) =>
        entry with
        {
            DurationMinutes = entry.TargetDurationMinutes ?? lastTime?.DurationMinutes,
            DistanceKm = entry.TargetDistanceKm ?? lastTime?.DistanceKm,
            AvgHeartRate = lastTime?.AvgHeartRate,
        };

    /// <summary>
    /// Cardio's planned minutes in a template. Templates from before cardio had targets kept them
    /// in <see cref="WorkoutExercise.DurationMinutes"/>, which a template never uses for a result.
    /// </summary>
    public static decimal? CardioTargetMinutes(WorkoutExercise templateEntry) =>
        templateEntry.TargetDurationMinutes ?? templateEntry.DurationMinutes;

    public static decimal? CardioTargetKm(WorkoutExercise templateEntry) =>
        templateEntry.TargetDistanceKm ?? templateEntry.DistanceKm;

    public static WorkoutExercise ClearCardio(WorkoutExercise entry) =>
        entry with { DurationMinutes = null, DistanceKm = null, AvgHeartRate = null };

    /// <summary>Whether anything was recorded: a set, or for cardio a time or a distance.</summary>
    public static bool HasResult(WorkoutExercise e) =>
        e.Sets.Count > 0 || e.DurationMinutes is not null || e.DistanceKm is not null;

    private static int? DefaultSets(ExerciseKind kind) => kind == ExerciseKind.Cardio ? null : 3;

    private static int? DefaultReps(ExerciseKind kind) => kind switch
    {
        ExerciseKind.Strength or ExerciseKind.Bodyweight => 8,
        _ => null,
    };
}
