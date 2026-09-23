using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Kropp.Shared;
using Kropp.Shared.Sync;
using Kropp.Shared.Training;
using Shouldly;

namespace Kropp.IntegrationTests;

[Collection(ApiCollection.Name)]
public sealed class SyncEndpointTests(KroppApiFixture api) : IAsyncLifetime
{
    private static readonly DateTimeOffset T0 = new(2026, 9, 23, 8, 0, 0, TimeSpan.Zero);
    private readonly HttpClient http = api.CreateClient();

    public Task InitializeAsync() => api.ResetAsync();

    public Task DisposeAsync() => Task.CompletedTask;

    private static SyncChange Change(Workout workout, DateTimeOffset at) =>
        new(AggregateTypes.Workout, workout.Id, at, false, JsonSerializer.Serialize(workout, KroppJson.Options));

    private static Workout NewWorkout(string note) => new() { Id = Guid.NewGuid(), Date = new DateOnly(2026, 9, 21), Note = note };

    private async Task<PushResponse> PushAsync(params SyncChange[] changes)
    {
        var response = await http.PostAsJsonAsync("api/sync/push", new PushRequest(changes));
        response.StatusCode.ShouldBe(HttpStatusCode.OK);
        return (await response.Content.ReadFromJsonAsync<PushResponse>())!;
    }

    private async Task<PullResponse> PullAsync(long since) =>
        (await http.GetFromJsonAsync<PullResponse>($"api/sync/pull?since={since}"))!;

    [Fact]
    public async Task A_pushed_change_comes_back_on_pull_with_a_sequence_number()
    {
        var workout = NewWorkout("Ben");
        (await PushAsync(Change(workout, T0))).Rejected.ShouldBeEmpty();

        var pull = await PullAsync(0);

        var record = pull.Changes.Single();
        record.Id.ShouldBe(workout.Id);
        record.ModifiedAt.ShouldBe(T0);
        record.ServerSeq.ShouldBe(1);
        pull.ServerSeq.ShouldBe(1);
        pull.HasMore.ShouldBeFalse();
        JsonSerializer.Deserialize<Workout>(record.Data!, KroppJson.Options)!.Note.ShouldBe("Ben");
    }

    [Fact]
    public async Task Trashing_and_deleting_for_good_leave_no_workout_data_on_the_server()
    {
        var workout = NewWorkout("Ben");
        await PushAsync(Change(workout, T0));
        var trashed = new TrashedWorkout { Id = workout.Id, DeletedAt = T0.AddMinutes(1), Workout = workout };

        (await PushAsync(
            new SyncChange(AggregateTypes.TrashedWorkout, workout.Id, T0.AddMinutes(1), false, JsonSerializer.Serialize(trashed, KroppJson.Options)),
            new SyncChange(AggregateTypes.Workout, workout.Id, T0.AddMinutes(1), true, null))).Rejected.ShouldBeEmpty();
        var inTrash = (await PullAsync(0)).Changes.Single(c => c.Type == AggregateTypes.TrashedWorkout);
        JsonSerializer.Deserialize<TrashedWorkout>(inTrash.Data!, KroppJson.Options)!.Workout.Note.ShouldBe("Ben");

        await PushAsync(new SyncChange(AggregateTypes.TrashedWorkout, workout.Id, T0.AddDays(31), true, null));

        (await PullAsync(0)).Changes.ShouldAllBe(c => c.IsDeleted && c.Data == null);
    }

    [Fact]
    public async Task Pushing_the_same_batch_twice_changes_nothing()
    {
        var change = Change(NewWorkout("Ben"), T0);
        await PushAsync(change);

        var again = await PushAsync(change);

        again.Rejected.Single().ServerSeq.ShouldBe(1);
        (await PullAsync(0)).Changes.Count.ShouldBe(1);
        (await PullAsync(1)).Changes.ShouldBeEmpty();
    }

    [Fact]
    public async Task A_newer_change_wins_and_an_older_one_is_refused()
    {
        var workout = NewWorkout("v1");
        await PushAsync(Change(workout, T0));
        await PushAsync(Change(workout with { Note = "v2" }, T0.AddMinutes(1)));

        var stale = await PushAsync(Change(workout with { Note = "old" }, T0.AddSeconds(30)));

        var current = stale.Rejected.Single();
        current.ServerSeq.ShouldBe(2);
        JsonSerializer.Deserialize<Workout>(current.Data!, KroppJson.Options)!.Note.ShouldBe("v2");
    }

    [Fact]
    public async Task An_invalid_change_refuses_the_whole_batch()
    {
        var good = Change(NewWorkout("ok"), T0);
        var bad = new SyncChange(AggregateTypes.Workout, Guid.NewGuid(), T0, false, "{\"nope\":");

        var response = await http.PostAsJsonAsync("api/sync/push", new PushRequest([good, bad]));

        response.StatusCode.ShouldBe(HttpStatusCode.BadRequest);
        (await response.Content.ReadAsStringAsync()).ShouldContain("changes[1]");
        (await PullAsync(0)).Changes.ShouldBeEmpty();
    }

    [Fact]
    public async Task A_tombstone_replaces_the_document()
    {
        var workout = NewWorkout("Ben");
        await PushAsync(Change(workout, T0));

        await PushAsync(new SyncChange(AggregateTypes.Workout, workout.Id, T0.AddMinutes(1), true, null));

        var record = (await PullAsync(0)).Changes.Single();
        record.IsDeleted.ShouldBeTrue();
        record.Data.ShouldBeNull();
        record.ServerSeq.ShouldBe(2);
    }

    [Fact]
    public async Task Two_devices_converge_through_the_server()
    {
        var phoneStore = new MemoryLocalStore();
        var laptopStore = new MemoryLocalStore();
        var phone = new LocalRepository(phoneStore);
        var laptop = new LocalRepository(laptopStore);
        var phoneSync = new SyncEngine(phoneStore, new HttpSyncApi(http));
        var laptopSync = new SyncEngine(laptopStore, new HttpSyncApi(http));

        var fromPhone = NewWorkout("från telefonen");
        var fromLaptop = NewWorkout("från datorn");
        await phone.SaveAsync(fromPhone.Id, fromPhone);
        await laptop.SaveAsync(fromLaptop.Id, fromLaptop);

        await phoneSync.SyncAsync();
        await laptopSync.SyncAsync();
        await phoneSync.SyncAsync();

        (await phone.GetAllAsync<Workout>()).Select(w => w.Note).Order().ShouldBe(["från datorn", "från telefonen"]);
        (await laptop.GetAllAsync<Workout>()).Select(w => w.Note).Order().ShouldBe(["från datorn", "från telefonen"]);
        phoneSync.Status.State.ShouldBe(SyncState.Idle);
        phoneSync.Status.PendingCount.ShouldBe(0);
        laptopSync.Status.PendingCount.ShouldBe(0);

        await laptop.DeleteAsync<Workout>(fromPhone.Id);
        await laptopSync.SyncAsync();
        await phoneSync.SyncAsync();

        (await phone.GetAllAsync<Workout>()).Single().Note.ShouldBe("från datorn");
    }

    [Fact]
    public async Task Pull_rejects_a_negative_watermark() =>
        (await http.GetAsync("api/sync/pull?since=-1")).StatusCode.ShouldBe(HttpStatusCode.BadRequest);
}
