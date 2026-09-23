using System.Globalization;

namespace Kropp.Shared.Training;

/// <summary>What to do next and when: templates, the suggested next template and the suggested day.</summary>
public static class Planning
{
    /// <summary>A workout counts as one of a template's when this share of their exercises match.</summary>
    private const double SimilarityThreshold = 0.5;

    /// <summary>
    /// A planned workout from a template. Each exercise starts from what it was last time, so the
    /// plan continues where training left off; the template's targets are for exercises never done.
    /// </summary>
    public static Workout PlanFrom(WorkoutTemplate template, Guid id, DateOnly date, int sessionNumber, IReadOnlyList<Workout> history)
    {
        var plan = new Workout { Id = id, Date = date, SessionNumber = sessionNumber, Status = WorkoutStatus.Planned, TemplateId = template.Id };
        return plan with
        {
            Exercises = [.. template.Exercises.Select((entry, i) =>
            {
                var last = WorkoutEditing.LastTime(history, plan, entry.ExerciseId);
                return entry with
                {
                    Order = i,
                    Sets = [],
                    Comment = null,
                    TargetSets = last?.TargetSets ?? entry.TargetSets,
                    TargetReps = last?.TargetReps ?? entry.TargetReps,
                    TargetWeightKg = last?.TargetWeightKg ?? entry.TargetWeightKg,
                    TargetSeconds = last?.TargetSeconds ?? entry.TargetSeconds,
                    TargetDurationMinutes = last?.TargetDurationMinutes ?? WorkoutEditing.CardioTargetMinutes(entry),
                    TargetDistanceKm = last?.TargetDistanceKm ?? WorkoutEditing.CardioTargetKm(entry),
                    Settings = last?.Settings ?? entry.Settings,
                    // A plan has nothing done yet, whatever the template holds.
                    IsSkipped = false,
                    DurationMinutes = null,
                    DistanceKm = null,
                    AvgHeartRate = null,
                };
            })],
        };
    }

    /// <summary>
    /// When the template was last done: by the template it was planned from, or for older workouts
    /// by how many exercises they share with it. Cardio is left out of the comparison, as in naming.
    /// </summary>
    public static DateOnly? LastDone(WorkoutTemplate template, IEnumerable<Workout> workouts, Func<Guid, Exercise?> exercise, DateOnly today)
    {
        var core = Core(template.Exercises, exercise);
        return workouts
            .Where(WorkoutEditing.HasHappened)
            .Where(w => w.TemplateId == template.Id || (w.TemplateId is null && Similarity(core, Core(w.Exercises, exercise)) >= SimilarityThreshold))
            .Select(w => (DateOnly?)w.Date)
            .Max();
    }

    /// <summary>
    /// The template done longest ago; one never done comes first. Ties keep the given order. A template
    /// something is already planned from counts as used on that plan's day, so it is not suggested twice.
    /// </summary>
    public static WorkoutTemplate? SuggestTemplate(IReadOnlyList<WorkoutTemplate> templates, IEnumerable<Workout> workouts, Func<Guid, Exercise?> exercise, DateOnly today)
    {
        var history = workouts.ToList();
        var planned = history.Where(w => w.TemplateId is not null && WorkoutEditing.StatusOf(w) == WorkoutStatus.Planned && w.Date >= today).ToList();
        DateOnly? PlannedFor(WorkoutTemplate t) => planned.Where(w => w.TemplateId == t.Id).Select(w => (DateOnly?)w.Date).Max();
        return templates
            .Select((t, i) => (t, i, last: Max(LastDone(t, history, exercise, today), PlannedFor(t)) ?? DateOnly.MinValue))
            .OrderBy(x => x.last)
            .ThenBy(x => x.i)
            .Select(x => x.t)
            .FirstOrDefault();
    }

    /// <summary>
    /// <see cref="UserSettings.DaysBetweenSessions"/> after the last session, but not before today.
    /// When that week already holds <see cref="UserSettings.SessionsPerWeek"/> sessions, the Monday after it.
    /// </summary>
    public static DateOnly SuggestDate(IEnumerable<Workout> workouts, DateOnly today, UserSettings settings)
    {
        var done = workouts.Where(WorkoutEditing.HasHappened).Select(w => w.Date).ToList();
        var next = done.Count > 0 ? done.Max().AddDays(settings.DaysBetweenSessions) : today;
        var candidate = next > today ? next : today;

        var monday = MondayOf(candidate);
        var inWeek = done.Count(d => d >= monday && d < monday.AddDays(7));
        return inWeek >= settings.SessionsPerWeek ? monday.AddDays(7) : candidate;
    }

    /// <summary>
    /// The day for a workout planned while <paramref name="upcoming"/> is already planned: the usual
    /// suggestion, but no sooner than the days between sessions after that plan.
    /// </summary>
    public static DateOnly SuggestDateAfter(Workout upcoming, IEnumerable<Workout> workouts, DateOnly today, UserSettings settings)
    {
        var usual = SuggestDate(workouts, today, settings);
        var afterPlan = upcoming.Date.AddDays(settings.DaysBetweenSessions);
        return usual > afterPlan ? usual : afterPlan;
    }

    private static DateOnly? Max(DateOnly? a, DateOnly? b) => a is null ? b : b is null ? a : a > b ? a : b;

    /// <summary>The earliest planned workout from today on, which the suggestion then is.</summary>
    public static Workout? Upcoming(IEnumerable<Workout> workouts, DateOnly today) =>
        workouts
            .Where(w => w.Date >= today && WorkoutEditing.StatusOf(w) is WorkoutStatus.Planned or WorkoutStatus.InProgress)
            .OrderBy(w => w.Date)
            .ThenBy(w => w.SessionNumber)
            .FirstOrDefault();

    public static DateOnly MondayOf(DateOnly date) => date.AddDays(-(((int)date.DayOfWeek + 6) % 7));

    public static int WeekNumber(DateOnly date) => ISOWeek.GetWeekOfYear(date.ToDateTime(TimeOnly.MinValue));

    private static HashSet<Guid> Core(IEnumerable<WorkoutExercise> entries, Func<Guid, Exercise?> exercise) =>
        [.. entries.Where(e => exercise(e.ExerciseId)?.Kind != ExerciseKind.Cardio).Select(e => e.ExerciseId)];

    private static double Similarity(HashSet<Guid> a, HashSet<Guid> b)
    {
        var union = a.Union(b).Count();
        return union == 0 ? 0 : (double)a.Intersect(b).Count() / union;
    }
}
