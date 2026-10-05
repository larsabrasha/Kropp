using Kropp.Shared.Sync;
using Kropp.Shared.Training;
using Kropp.UnitTests.Sync;
using Shouldly;

namespace Kropp.UnitTests.Training;

public class WorkoutTrashTests
{
    private static readonly DateTimeOffset Start = new(2026, 9, 23, 8, 0, 0, TimeSpan.Zero);

    private readonly ManualTimeProvider time = new(Start);
    private readonly MemoryLocalStore store = new();
    private readonly LocalRepository repository;
    private readonly WorkoutTrash trash;

    public WorkoutTrashTests()
    {
        repository = new LocalRepository(store, time);
        trash = new WorkoutTrash(repository, time);
    }

    private async Task<Workout> SeedAsync()
    {
        var workout = new Workout
        {
            Id = Guid.NewGuid(),
            Date = new DateOnly(2026, 9, 21),
            Exercises = [new WorkoutExercise { ExerciseId = Guid.NewGuid(), Sets = [new SetResult { Reps = 8 }] }],
        };
        await repository.SaveAsync(workout.Id, workout);
        return workout;
    }

    [Fact]
    public async Task A_trashed_workout_leaves_the_workouts_and_keeps_its_data_in_the_trash()
    {
        var workout = await SeedAsync();

        await trash.MoveToTrashAsync(workout);

        (await repository.GetAllAsync<Workout>()).ShouldBeEmpty();
        var trashed = (await repository.GetAllAsync<TrashedWorkout>()).Single();
        trashed.Id.ShouldBe(workout.Id);
        trashed.DeletedAt.ShouldBe(Start);
        trashed.Workout.Exercises.Single().Sets.Single().Reps.ShouldBe(8);
    }

    [Fact]
    public async Task Restoring_brings_the_workout_back_as_it_was()
    {
        var workout = await SeedAsync();
        await trash.MoveToTrashAsync(workout);
        time.Advance(TimeSpan.FromDays(3));

        await trash.RestoreAsync((await repository.GetAllAsync<TrashedWorkout>()).Single());

        (await repository.GetAllAsync<TrashedWorkout>()).ShouldBeEmpty();
        (await repository.GetAsync<Workout>(workout.Id)).ShouldBe(workout, new WorkoutComparer());
    }

    [Fact]
    public async Task The_trash_keeps_a_workout_for_30_days_and_then_deletes_it_for_good()
    {
        var workout = await SeedAsync();
        await trash.MoveToTrashAsync(workout);

        time.Advance(TimeSpan.FromDays(30) - TimeSpan.FromMinutes(1));
        (await trash.PurgeAsync()).Single().Id.ShouldBe(workout.Id);

        time.Advance(TimeSpan.FromMinutes(1));
        (await trash.PurgeAsync()).ShouldBeEmpty();

        var record = await store.GetAsync(LocalRecord.KeyOf(AggregateTypes.TrashedWorkout, workout.Id));
        record.ShouldNotBeNull().IsDeleted.ShouldBeTrue();
        record.Data.ShouldBeNull();
        record.Pending.ShouldBeTrue();
    }

    [Fact]
    public async Task Deleting_for_good_leaves_only_a_tombstone()
    {
        var workout = await SeedAsync();
        await trash.MoveToTrashAsync(workout);

        await trash.DeleteForGoodAsync(workout.Id);

        (await repository.GetAllAsync<TrashedWorkout>()).ShouldBeEmpty();
        (await store.GetAsync(LocalRecord.KeyOf(AggregateTypes.TrashedWorkout, workout.Id)))!.Data.ShouldBeNull();
        (await store.GetAsync(LocalRecord.KeyOf(AggregateTypes.Workout, workout.Id)))!.Data.ShouldBeNull();
    }

    [Fact]
    public async Task A_trash_copy_goes_when_the_workout_is_alive_again_from_a_later_edit()
    {
        var workout = await SeedAsync();
        await trash.MoveToTrashAsync(workout);
        // Another device edited the workout after this one trashed it; its copy won on the server.
        time.Advance(TimeSpan.FromMinutes(5));
        await repository.SaveAsync(workout.Id, workout with { Note = "edited" });

        (await trash.PurgeAsync()).ShouldBeEmpty();

        (await repository.GetAsync<Workout>(workout.Id))!.Note.ShouldBe("edited");
    }

    [Fact]
    public async Task The_trash_lists_the_latest_deleted_first()
    {
        var first = await SeedAsync();
        var second = await SeedAsync();
        await trash.MoveToTrashAsync(first);
        time.Advance(TimeSpan.FromHours(1));
        await trash.MoveToTrashAsync(second);

        (await trash.PurgeAsync()).Select(t => t.Id).ShouldBe([second.Id, first.Id]);
    }

    /// <summary>Records holding lists compare by reference; compare the JSON instead.</summary>
    private sealed class WorkoutComparer : IEqualityComparer<Workout?>
    {
        public bool Equals(Workout? x, Workout? y) =>
            System.Text.Json.JsonSerializer.Serialize(x, Kropp.Shared.KroppJson.Options) == System.Text.Json.JsonSerializer.Serialize(y, Kropp.Shared.KroppJson.Options);

        public int GetHashCode(Workout? obj) => 0;
    }
}
