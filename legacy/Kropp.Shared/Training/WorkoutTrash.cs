using Kropp.Shared.Sync;

namespace Kropp.Shared.Training;

/// <summary>
/// A deleted workout, kept whole until <see cref="WorkoutTrash.Retention"/> has passed. An aggregate
/// of its own under the workout's id, so every view of workouts leaves it out without a filter,
/// and an app too old to know the trash never shows it.
/// </summary>
public sealed record TrashedWorkout
{
    public required Guid Id { get; init; }
    public required DateTimeOffset DeletedAt { get; init; }
    public required Workout Workout { get; init; }
}

/// <summary>
/// Moves workouts to the trash and back. After 30 days a trashed workout becomes a tombstone,
/// which removes its data locally, on the server and on every other device.
/// </summary>
public sealed class WorkoutTrash(LocalRepository repository, TimeProvider? time = null)
{
    public static readonly TimeSpan Retention = TimeSpan.FromDays(30);

    private readonly TimeProvider time = time ?? TimeProvider.System;

    public static DateTimeOffset DeletedForGoodAt(TrashedWorkout trashed) => trashed.DeletedAt + Retention;

    public async Task MoveToTrashAsync(Workout workout)
    {
        // Trash first: a failure between the two writes leaves the workout twice, never lost.
        await repository.SaveAsync(workout.Id, new TrashedWorkout { Id = workout.Id, DeletedAt = SyncClock.Now(time), Workout = workout });
        await repository.DeleteAsync<Workout>(workout.Id);
    }

    public async Task RestoreAsync(TrashedWorkout trashed)
    {
        // Workout first, for the same reason. Its new stamp outranks the workout's tombstone.
        await repository.SaveAsync(trashed.Id, trashed.Workout);
        await repository.DeleteAsync<TrashedWorkout>(trashed.Id);
    }

    public Task DeleteForGoodAsync(Guid id) => repository.DeleteAsync<TrashedWorkout>(id);

    /// <summary>
    /// Deletes for good what has been in the trash for 30 days, and returns the rest, newest first.
    /// </summary>
    public async Task<IReadOnlyList<TrashedWorkout>> PurgeAsync()
    {
        var now = time.GetUtcNow();
        var alive = (await repository.GetAllAsync<Workout>()).Select(w => w.Id).ToHashSet();
        var kept = new List<TrashedWorkout>();

        foreach (var trashed in await repository.GetAllAsync<TrashedWorkout>())
        {
            // Alive as well: another device edited the workout after it was trashed here, and the
            // later edit won. The workout holds the data, so the trash copy can go.
            if (now >= DeletedForGoodAt(trashed) || alive.Contains(trashed.Id))
                await repository.DeleteAsync<TrashedWorkout>(trashed.Id);
            else
                kept.Add(trashed);
        }

        return [.. kept.OrderByDescending(t => t.DeletedAt)];
    }
}
