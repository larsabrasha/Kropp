using System.Text.Json;
using Kropp.Shared;
using Kropp.Shared.Sync;
using Kropp.Shared.Training;
using Shouldly;

namespace Kropp.UnitTests.Sync;

public class AggregateValidatorTests
{
    private static readonly DateTimeOffset Now = new(2026, 9, 23, 8, 0, 0, TimeSpan.Zero);

    private static SyncChange WorkoutChange(Workout workout, Guid? id = null) =>
        new(AggregateTypes.Workout, id ?? workout.Id, Now, false, JsonSerializer.Serialize(workout, KroppJson.Options));

    private static Workout ValidWorkout() => new()
    {
        Id = Guid.NewGuid(),
        Date = new DateOnly(2026, 9, 21),
        SessionNumber = 101,
        Status = WorkoutStatus.Done,
        Exercises =
        [
            new WorkoutExercise
            {
                ExerciseId = Guid.NewGuid(),
                TargetSets = 3, TargetReps = 8, TargetWeightKg = 20,
                Comment = "45 grader",
                Sets = [new SetResult { Reps = 8 }, new SetResult { Reps = 8 }, new SetResult { Reps = 10 }],
            },
        ],
    };

    [Fact]
    public void A_complete_workout_is_valid() =>
        AggregateValidator.Validate(WorkoutChange(ValidWorkout())).ShouldBeNull();

    [Fact]
    public void An_exercise_is_valid() =>
        AggregateValidator.Validate(new SyncChange(AggregateTypes.Exercise, Guid.Parse("11111111-1111-1111-1111-111111111111"), Now, false,
            """{"id":"11111111-1111-1111-1111-111111111111","name":"Bröst maskin","kind":"Strength","settingsNote":"Sitthöjd 11"}"""))
            .ShouldBeNull();

    [Fact]
    public void A_tombstone_without_data_is_valid() =>
        AggregateValidator.Validate(new SyncChange(AggregateTypes.Workout, Guid.NewGuid(), Now, true, null)).ShouldBeNull();

    [Fact]
    public void A_mismatched_id_is_refused() =>
        AggregateValidator.Validate(WorkoutChange(ValidWorkout(), id: Guid.NewGuid())).ShouldNotBeNull();

    [Fact]
    public void An_unknown_type_is_refused() =>
        AggregateValidator.Validate(new SyncChange("weight", Guid.NewGuid(), Now, false, "{}")).ShouldNotBeNull();

    [Fact]
    public void A_tombstone_with_data_is_refused() =>
        AggregateValidator.Validate(new SyncChange(AggregateTypes.Workout, Guid.NewGuid(), Now, true, "{}")).ShouldNotBeNull();

    [Fact]
    public void Malformed_json_is_refused() =>
        AggregateValidator.Validate(new SyncChange(AggregateTypes.Workout, Guid.NewGuid(), Now, false, "{not json")).ShouldNotBeNull();

    [Fact]
    public void A_negative_weight_is_refused()
    {
        var workout = ValidWorkout();
        workout.Exercises[0].Sets.Add(new SetResult { Reps = 8, WeightKg = -5 });
        AggregateValidator.Validate(WorkoutChange(workout)).ShouldNotBeNull();
    }

    [Fact]
    public void An_exercise_without_a_name_is_refused() =>
        AggregateValidator.Validate(new SyncChange(AggregateTypes.Exercise, Guid.Parse("11111111-1111-1111-1111-111111111111"), Now, false,
            """{"id":"11111111-1111-1111-1111-111111111111","name":"  "}"""))
            .ShouldNotBeNull();
}
