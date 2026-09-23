using System.Text.Json;
using Kropp.Shared;
using Kropp.Shared.Sync;
using Kropp.Shared.Training;
using Shouldly;

namespace Kropp.UnitTests.Sync;

public class SyncEngineTests
{
    private static readonly DateTimeOffset Start = new(2026, 9, 23, 8, 0, 0, TimeSpan.Zero);

    private readonly ManualTimeProvider time = new(Start);
    private readonly MemoryLocalStore store = new();
    private readonly FakeSyncApi api = new();
    private readonly LocalRepository repository;
    private readonly SyncEngine engine;

    public SyncEngineTests()
    {
        repository = new LocalRepository(store, time);
        engine = new SyncEngine(store, api, time);
    }

    private static Workout NewWorkout(string? note = null) =>
        new() { Id = Guid.NewGuid(), Date = new DateOnly(2026, 9, 21), Note = note };

    [Fact]
    public async Task A_save_while_offline_stays_in_the_outbox()
    {
        api.FailWith = FakeSyncApi.Unreachable();
        var workout = NewWorkout();
        await repository.SaveAsync(workout.Id, workout);

        await engine.SyncAsync();

        engine.Status.State.ShouldBe(SyncState.Offline);
        engine.Status.PendingCount.ShouldBe(1);
        (await store.GetPendingAsync()).Single().Id.ShouldBe(workout.Id);
    }

    [Fact]
    public async Task A_successful_push_empties_the_outbox()
    {
        var workout = NewWorkout();
        await repository.SaveAsync(workout.Id, workout);

        await engine.SyncAsync();

        engine.Status.ShouldBe(new SyncStatus(SyncState.Idle, 0, Start));
        (await store.GetPendingAsync()).ShouldBeEmpty();
        api.Documents.Single().Id.ShouldBe(workout.Id);
    }

    [Fact]
    public async Task The_outbox_survives_going_offline_and_is_pushed_when_back()
    {
        api.FailWith = FakeSyncApi.Unreachable();
        var workout = NewWorkout();
        await repository.SaveAsync(workout.Id, workout);
        await engine.SyncAsync();

        api.FailWith = null;
        await engine.SyncAsync();

        engine.Status.State.ShouldBe(SyncState.Idle);
        engine.Status.PendingCount.ShouldBe(0);
        api.Documents.Single().Id.ShouldBe(workout.Id);
    }

    [Fact]
    public async Task An_edit_made_during_a_push_stays_pending()
    {
        var workout = NewWorkout("first");
        await repository.SaveAsync(workout.Id, workout);
        api.DuringPush = async () =>
        {
            time.Advance(TimeSpan.FromSeconds(1));
            api.DuringPush = null;
            await repository.SaveAsync(workout.Id, workout with { Note = "second" });
        };

        await engine.SyncAsync();

        var local = await store.GetAsync(LocalRecord.KeyOf(AggregateTypes.Workout, workout.Id));
        local!.Pending.ShouldBeTrue();
        Deserialize<Workout>(local.Data).Note.ShouldBe("second");
    }

    [Fact]
    public async Task A_rejected_change_takes_the_servers_newer_copy()
    {
        var workout = NewWorkout("phone");
        await repository.SaveAsync(workout.Id, workout);
        api.SeedFromOtherDevice(new SyncChange(AggregateTypes.Workout, workout.Id, Start.AddMinutes(5), false,
            Serialize(workout with { Note = "laptop" })));

        await engine.SyncAsync();

        var local = await store.GetAsync(LocalRecord.KeyOf(AggregateTypes.Workout, workout.Id));
        local!.Pending.ShouldBeFalse();
        Deserialize<Workout>(local.Data).Note.ShouldBe("laptop");
        engine.Status.PendingCount.ShouldBe(0);
    }

    [Fact]
    public async Task A_pull_pages_until_done_and_moves_the_watermark()
    {
        api.PageSize = 2;
        for (var i = 0; i < 5; i++)
        {
            var w = NewWorkout($"w{i}");
            api.SeedFromOtherDevice(new SyncChange(AggregateTypes.Workout, w.Id, Start, false, Serialize(w)));
        }

        await engine.SyncAsync();

        api.Pulls.ShouldBe([0, 2, 4]);
        (await store.GetWatermarkAsync()).ShouldBe(5);
        (await repository.GetAllAsync<Workout>()).Count.ShouldBe(5);
    }

    [Fact]
    public async Task A_pull_does_not_overwrite_a_newer_local_edit()
    {
        var workout = NewWorkout("server");
        api.SeedFromOtherDevice(new SyncChange(AggregateTypes.Workout, workout.Id, Start.AddMinutes(-5), false, Serialize(workout)));
        api.FailWith = FakeSyncApi.Unreachable();
        await repository.SaveAsync(workout.Id, workout with { Note = "local" });

        // Apply as a pull would, while the local edit is still waiting to be pushed.
        await store.ApplyFromServerAsync([.. api.Documents]);

        var local = await store.GetAsync(LocalRecord.KeyOf(AggregateTypes.Workout, workout.Id));
        local!.Pending.ShouldBeTrue();
        Deserialize<Workout>(local.Data).Note.ShouldBe("local");
    }

    [Fact]
    public async Task A_delete_travels_as_a_tombstone()
    {
        var workout = NewWorkout();
        await repository.SaveAsync(workout.Id, workout);
        await engine.SyncAsync();
        time.Advance(TimeSpan.FromSeconds(1));

        await repository.DeleteAsync<Workout>(workout.Id);
        await engine.SyncAsync();

        var stored = api.Documents.Single();
        stored.IsDeleted.ShouldBeTrue();
        stored.Data.ShouldBeNull();
        (await repository.GetAllAsync<Workout>()).ShouldBeEmpty();
    }

    [Fact]
    public async Task A_server_error_is_reported_as_failed_not_offline()
    {
        api.FailWith = FakeSyncApi.ServerError();
        var workout = NewWorkout();
        await repository.SaveAsync(workout.Id, workout);

        await engine.SyncAsync();

        engine.Status.State.ShouldBe(SyncState.Failed);
        engine.Status.PendingCount.ShouldBe(1);
    }

    [Fact]
    public async Task A_sync_requested_during_a_round_runs_once_more_afterwards()
    {
        var first = NewWorkout("first");
        var second = NewWorkout("second");
        await repository.SaveAsync(first.Id, first);

        Task? overlapping = null;
        api.DuringPush = async () =>
        {
            api.DuringPush = null;
            await repository.SaveAsync(second.Id, second);
            overlapping = engine.SyncAsync();
        };

        var running = engine.SyncAsync();
        await running;

        overlapping.ShouldBeSameAs(running);
        api.Pushes.Count.ShouldBe(2);
        api.Documents.Count.ShouldBe(2);
        engine.Status.PendingCount.ShouldBe(0);
    }

    [Fact]
    public async Task Two_saves_in_the_same_millisecond_get_distinct_stamps()
    {
        var workout = NewWorkout("a");
        await repository.SaveAsync(workout.Id, workout);
        var firstStamp = (await store.GetAsync(LocalRecord.KeyOf(AggregateTypes.Workout, workout.Id)))!.ModifiedAt;

        await repository.SaveAsync(workout.Id, workout with { Note = "b" });

        var second = await store.GetAsync(LocalRecord.KeyOf(AggregateTypes.Workout, workout.Id));
        second!.ModifiedAt.ShouldBeGreaterThan(firstStamp);
    }

    [Fact]
    public void The_clock_truncates_to_whole_milliseconds()
    {
        var precise = new DateTimeOffset(2026, 9, 23, 10, 0, 0, TimeSpan.FromHours(2)).AddTicks(1_234_567);

        var truncated = SyncClock.Truncate(precise);

        truncated.Offset.ShouldBe(TimeSpan.Zero);
        (truncated.Ticks % TimeSpan.TicksPerMillisecond).ShouldBe(0);
        (precise - truncated).ShouldBeLessThan(TimeSpan.FromMilliseconds(1));
    }

    private static string Serialize<T>(T value) => JsonSerializer.Serialize(value, KroppJson.Options);

    private static T Deserialize<T>(string? json) => JsonSerializer.Deserialize<T>(json!, KroppJson.Options)!;
}
