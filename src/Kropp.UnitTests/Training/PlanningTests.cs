using Kropp.Shared.Training;
using Shouldly;

namespace Kropp.UnitTests.Training;

public class PlanningTests
{
    private static readonly DateOnly Wednesday = new(2026, 9, 23);

    private static readonly Exercise Walk = new() { Id = Guid.NewGuid(), Name = "Gång i maskin", Kind = ExerciseKind.Cardio };
    private static readonly Exercise Bench = new() { Id = Guid.NewGuid(), Name = "Bröst maskin" };
    private static readonly Exercise Curl = new() { Id = Guid.NewGuid(), Name = "Biceps hantlar" };
    private static readonly Exercise Squat = new() { Id = Guid.NewGuid(), Name = "Benböj lår framsida" };
    private static readonly Exercise PullDown = new() { Id = Guid.NewGuid(), Name = "Pull down maskin" };
    private static readonly Dictionary<Guid, Exercise> Exercises = new[] { Walk, Bench, Curl, Squat, PullDown }.ToDictionary(e => e.Id);

    private static Exercise? Find(Guid id) => Exercises.GetValueOrDefault(id);

    private static Workout Done(DateOnly date, params Exercise[] exercises) => new()
    {
        Id = Guid.NewGuid(), Date = date, Status = WorkoutStatus.Done,
        Exercises = [.. exercises.Select((e, i) => new WorkoutExercise { ExerciseId = e.Id, Order = i, TargetSets = 3, TargetReps = 8, TargetWeightKg = 20 + i, Sets = [new SetResult { Reps = 8 }] })],
    };

    private static WorkoutTemplate Template(string name, params Exercise[] exercises) => new()
    {
        Id = Guid.NewGuid(), Name = name,
        Exercises = [.. exercises.Select((e, i) => new WorkoutExercise { ExerciseId = e.Id, Order = i, TargetSets = 3, TargetReps = 10 })],
    };

    [Fact]
    public void The_next_day_is_two_days_after_the_last_session() =>
        Planning.SuggestDate([Done(new DateOnly(2026, 9, 21), Bench)], new DateOnly(2026, 9, 22), UserSettings.Default).ShouldBe(Wednesday);

    [Fact]
    public void The_next_day_is_never_in_the_past() =>
        Planning.SuggestDate([Done(new DateOnly(2026, 9, 14), Bench)], Wednesday, UserSettings.Default).ShouldBe(Wednesday);

    [Fact]
    public void A_week_with_three_sessions_moves_the_next_to_monday() =>
        Planning.SuggestDate([Done(new DateOnly(2026, 9, 21), Bench), Done(new DateOnly(2026, 9, 23), Bench), Done(new DateOnly(2026, 9, 25), Bench)], new DateOnly(2026, 9, 25), UserSettings.Default)
            .ShouldBe(new DateOnly(2026, 9, 28));

    [Fact]
    public void With_no_history_the_next_day_is_today() =>
        Planning.SuggestDate([], Wednesday, UserSettings.Default).ShouldBe(Wednesday);

    [Theory]
    [InlineData(1, 7)]
    [InlineData(2, 3)]
    [InlineData(3, 2)]
    [InlineData(4, 1)]
    [InlineData(7, 1)]
    public void The_days_between_sessions_follow_from_sessions_a_week(int perWeek, int days) =>
        new UserSettings { SessionsPerWeek = perWeek }.DaysBetweenSessions.ShouldBe(days);

    [Fact]
    public void Two_sessions_a_week_suggest_three_days_later_and_fill_the_week_sooner()
    {
        var twice = new UserSettings { SessionsPerWeek = 2 };

        Planning.SuggestDate([Done(new DateOnly(2026, 9, 21), Bench)], new DateOnly(2026, 9, 22), twice).ShouldBe(new DateOnly(2026, 9, 24));
        Planning.SuggestDate([Done(new DateOnly(2026, 9, 21), Bench), Done(new DateOnly(2026, 9, 24), Bench)], new DateOnly(2026, 9, 24), twice)
            .ShouldBe(new DateOnly(2026, 9, 28));
    }

    [Fact]
    public void The_template_done_longest_ago_is_suggested()
    {
        var upper = Template("Armar och bröst", Walk, Bench, Curl);
        var legs = Template("Ben", Walk, Squat);
        var back = Template("Rygg", PullDown);
        var history = new[] { Done(new DateOnly(2026, 9, 21), Walk, Squat), Done(new DateOnly(2026, 9, 19), Walk, Bench, Curl), Done(new DateOnly(2026, 9, 16), PullDown) };

        Planning.SuggestTemplate([upper, legs, back], history, Find, Wednesday).ShouldBe(back);
    }

    [Fact]
    public void A_template_never_done_comes_first()
    {
        var upper = Template("Armar och bröst", Bench, Curl);
        var back = Template("Rygg", PullDown);

        Planning.SuggestTemplate([upper, back], [Done(new DateOnly(2026, 9, 21), Bench, Curl)], Find, Wednesday).ShouldBe(back);
    }

    [Fact]
    public void A_workout_planned_from_a_template_counts_for_it_whatever_its_exercises()
    {
        var upper = Template("Armar och bröst", Bench, Curl);
        var legs = Template("Ben", Squat);
        var fromLegs = Done(new DateOnly(2026, 9, 21), Bench, Curl) with { TemplateId = legs.Id };

        Planning.LastDone(legs, [fromLegs], Find, Wednesday).ShouldBe(new DateOnly(2026, 9, 21));
        Planning.LastDone(upper, [fromLegs], Find, Wednesday).ShouldBeNull();
    }

    [Fact]
    public void The_warm_up_walk_does_not_make_workouts_alike()
    {
        var legs = Template("Ben", Walk, Squat);

        Planning.LastDone(legs, [Done(new DateOnly(2026, 9, 21), Walk, Bench)], Find, Wednesday).ShouldBeNull();
    }

    [Fact]
    public void A_plan_starts_where_last_time_left_off()
    {
        var template = Template("Armar och bröst", Bench, PullDown);
        var history = new[] { Done(new DateOnly(2026, 9, 19), Bench) };

        var plan = Planning.PlanFrom(template, Guid.NewGuid(), Wednesday, 102, history);

        plan.TemplateId.ShouldBe(template.Id);
        plan.Status.ShouldBe(WorkoutStatus.Planned);
        plan.SessionNumber.ShouldBe(102);
        plan.Exercises.Select(e => e.ExerciseId).ShouldBe([Bench.Id, PullDown.Id]);
        (plan.Exercises[0].TargetReps, plan.Exercises[0].TargetWeightKg).ShouldBe((8, 20m));
        (plan.Exercises[1].TargetReps, plan.Exercises[1].TargetWeightKg).ShouldBe((10, (decimal?)null));
        plan.Exercises.ShouldAllBe(e => e.Sets.Count == 0);
    }

    [Fact]
    public void A_template_keeps_the_plan_and_drops_the_results()
    {
        var workout = Done(Wednesday, Walk, Bench) with { Note = "tungt" };
        workout.Exercises[0] = workout.Exercises[0] with { DurationMinutes = 5, Comment = "lätt" };

        var template = Planning.TemplateFrom(workout, Guid.NewGuid(), "Bröst");

        template.Exercises.Select(e => e.ExerciseId).ShouldBe([Walk.Id, Bench.Id]);
        template.Exercises.ShouldAllBe(e => e.Sets.Count == 0 && e.Comment == null && e.DurationMinutes == null);
        template.Exercises[1].TargetWeightKg.ShouldBe(21);
    }

    [Fact]
    public void The_upcoming_plan_is_the_earliest_from_today()
    {
        var later = new Workout { Id = Guid.NewGuid(), Date = new DateOnly(2026, 9, 25) };
        var soon = new Workout { Id = Guid.NewGuid(), Date = Wednesday };
        var past = new Workout { Id = Guid.NewGuid(), Date = new DateOnly(2026, 9, 21) };

        Planning.Upcoming([later, past, soon, Done(Wednesday, Bench)], Wednesday).ShouldBe(soon);
    }
}
