using Kropp.Shared.Training;
using Shouldly;

namespace Kropp.UnitTests.Training;

public class WorkoutEditingTests
{
    private static readonly Exercise Bench = new() { Id = Guid.NewGuid(), Name = "Bröst maskin", Kind = ExerciseKind.Strength };
    private static readonly Exercise Plank = new() { Id = Guid.NewGuid(), Name = "Plankan", Kind = ExerciseKind.Timed };

    private static Workout Workout(DateOnly date, int? session = null, WorkoutStatus status = WorkoutStatus.Done, params WorkoutExercise[] entries) =>
        new() { Id = Guid.NewGuid(), Date = date, SessionNumber = session, Status = status, Exercises = [.. entries] };

    private static WorkoutExercise Entry(Exercise exercise, params SetResult[] sets) =>
        new() { ExerciseId = exercise.Id, TargetSets = 3, TargetReps = 8, TargetWeightKg = 60, Settings = "Sitthöjd 11", Comment = "tungt", Sets = [.. sets] };

    [Fact]
    public void Completing_a_set_records_the_planned_reps_and_weight()
    {
        var entry = WorkoutEditing.CompleteNextSet(Entry(Bench), ExerciseKind.Strength);

        entry.Sets.ShouldHaveSingleItem().ShouldBe(new SetResult { Reps = 8, WeightKg = 60 });
    }

    [Fact]
    public void Completing_a_timed_set_records_seconds_only()
    {
        var entry = new WorkoutExercise { ExerciseId = Plank.Id, TargetSets = 2, TargetSeconds = 60 };

        WorkoutEditing.CompleteNextSet(entry, ExerciseKind.Timed).Sets.ShouldHaveSingleItem().ShouldBe(new SetResult { Seconds = 60 });
    }

    [Fact]
    public void Adding_an_exercise_takes_the_targets_from_last_time()
    {
        var last = Entry(Bench, new SetResult { Reps = 8, WeightKg = 60 });
        var workout = Workout(new DateOnly(2026, 9, 23), status: WorkoutStatus.Planned);

        var entry = WorkoutEditing.AddExercise(workout, Bench, last).Exercises.ShouldHaveSingleItem();

        entry.TargetSets.ShouldBe(3);
        entry.TargetReps.ShouldBe(8);
        entry.TargetWeightKg.ShouldBe(60);
        entry.Settings.ShouldBe("Sitthöjd 11");
        entry.Sets.ShouldBeEmpty();
    }

    [Fact]
    public void Adding_a_new_exercise_starts_at_three_by_eight()
    {
        var entry = WorkoutEditing.AddExercise(Workout(new DateOnly(2026, 9, 23)), Bench, lastTime: null).Exercises.Single();

        (entry.TargetSets, entry.TargetReps, entry.TargetWeightKg).ShouldBe((3, 8, (decimal?)null));
    }

    [Fact]
    public void Last_time_is_the_most_recent_earlier_workout_with_results()
    {
        var older = Workout(new DateOnly(2026, 9, 14), 102, WorkoutStatus.Done, Entry(Bench, new SetResult { Reps = 8, WeightKg = 55 }));
        var newer = Workout(new DateOnly(2026, 9, 21), 104, WorkoutStatus.Done, Entry(Bench, new SetResult { Reps = 8, WeightKg = 60 }));
        var plannedOnly = Workout(new DateOnly(2026, 9, 22), 105, WorkoutStatus.Planned, Entry(Bench));
        var skipped = Workout(new DateOnly(2026, 9, 22), 106, WorkoutStatus.Skipped, Entry(Bench));
        var later = Workout(new DateOnly(2026, 9, 30), 110, WorkoutStatus.Done, Entry(Bench, new SetResult { Reps = 8, WeightKg = 70 }));
        var current = Workout(new DateOnly(2026, 9, 23), 107, WorkoutStatus.Planned, Entry(Bench));

        var last = WorkoutEditing.LastTime([older, newer, plannedOnly, skipped, later, current], current, Bench.Id);

        last.ShouldNotBeNull().Sets.Single().WeightKg.ShouldBe(60);
    }

    [Fact]
    public void Copying_as_a_plan_keeps_targets_and_drops_what_was_done()
    {
        var source = Workout(new DateOnly(2026, 9, 21), 104, WorkoutStatus.Done, Entry(Bench, new SetResult { Reps = 8, WeightKg = 60 }), Entry(Plank));
        var id = Guid.NewGuid();

        var copy = WorkoutEditing.CopyAsPlan(source, id, new DateOnly(2026, 9, 23), 105);

        copy.Id.ShouldBe(id);
        copy.Status.ShouldBe(WorkoutStatus.Planned);
        copy.SessionNumber.ShouldBe(105);
        copy.Exercises.Select(e => e.ExerciseId).ShouldBe([Bench.Id, Plank.Id]);
        copy.Exercises.ShouldAllBe(e => e.Sets.Count == 0 && e.Comment == null && e.Settings == "Sitthöjd 11" && e.TargetWeightKg == 60);
        source.Exercises[0].Sets.Count.ShouldBe(1);
    }

    [Theory]
    [InlineData(true, "2026-09-20", WorkoutStatus.Done)]
    [InlineData(true, "2026-09-30", WorkoutStatus.Done)]
    [InlineData(false, "2026-09-23", WorkoutStatus.Planned)]
    [InlineData(false, "2026-09-30", WorkoutStatus.Planned)]
    [InlineData(false, "2026-09-22", WorkoutStatus.Skipped)]
    public void The_status_follows_from_what_was_logged(bool anySet, string date, WorkoutStatus expected)
    {
        var entry = Entry(Bench, anySet ? [new SetResult { Reps = 8 }] : []);
        var workout = Workout(DateOnly.Parse(date), status: WorkoutStatus.Planned, entries: entry);

        WorkoutEditing.StatusOf(workout, new DateOnly(2026, 9, 23)).ShouldBe(expected);
    }

    [Fact]
    public void Cardio_with_a_time_counts_as_done() =>
        WorkoutEditing.StatusOf(Workout(new DateOnly(2026, 9, 20), entries: new WorkoutExercise { ExerciseId = Guid.NewGuid(), DurationMinutes = 20 }), new DateOnly(2026, 9, 23))
            .ShouldBe(WorkoutStatus.Done);

    [Fact]
    public void The_next_session_number_follows_the_highest()
    {
        WorkoutEditing.NextSessionNumber([Workout(default, 101), Workout(default, 103), Workout(default)]).ShouldBe(104);
        WorkoutEditing.NextSessionNumber([]).ShouldBe(1);
    }

    [Fact]
    public void Removing_and_moving_entries_keeps_the_order_contiguous()
    {
        var a = new WorkoutExercise { ExerciseId = Guid.NewGuid() };
        var b = new WorkoutExercise { ExerciseId = Guid.NewGuid() };
        var c = new WorkoutExercise { ExerciseId = Guid.NewGuid() };
        var workout = Workout(default, entries: [a with { Order = 0 }, b with { Order = 1 }, c with { Order = 2 }]);

        var moved = WorkoutEditing.MoveEntry(workout, 2, 0);
        moved.Exercises.Select(e => e.ExerciseId).ShouldBe([c.ExerciseId, a.ExerciseId, b.ExerciseId]);
        moved.Exercises.Select(e => e.Order).ShouldBe([0, 1, 2]);

        WorkoutEditing.MoveEntry(moved, 0, 2).Exercises.Select(e => e.ExerciseId).ShouldBe([a.ExerciseId, b.ExerciseId, c.ExerciseId]);

        var removed = WorkoutEditing.RemoveEntry(moved, 0);
        removed.Exercises.Select(e => e.ExerciseId).ShouldBe([a.ExerciseId, b.ExerciseId]);
        removed.Exercises.Select(e => e.Order).ShouldBe([0, 1]);

        WorkoutEditing.MoveEntry(removed, 0, 5).ShouldBeSameAs(removed);
        WorkoutEditing.MoveEntry(removed, 1, 1).ShouldBeSameAs(removed);
    }
}
