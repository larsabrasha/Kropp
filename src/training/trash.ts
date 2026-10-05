import { now } from '../sync/clock'
import type { LocalRepository } from '../sync/localRepo'
import type { TrashedWorkout, Workout } from './model'

// Moves workouts to the trash and back. A trashed workout is an aggregate of its own under the
// workout's id, so every view of workouts leaves it out without a filter. After 30 days it becomes
// a tombstone, which removes its data locally, on the server and on every other device.

export const RETENTION_DAYS = 30
const RETENTION_MS = RETENTION_DAYS * 86_400_000

export const deletedForGoodAt = (trashed: TrashedWorkout) => new Date(Date.parse(trashed.deletedAt) + RETENTION_MS)

export async function moveToTrash(repository: LocalRepository, workout: Workout) {
  // Trash first: a failure between the two writes leaves the workout twice, never lost.
  await repository.save('trashedWorkout', workout.id, { id: workout.id, deletedAt: now(), workout })
  await repository.delete('workout', workout.id)
}

export async function restore(repository: LocalRepository, trashed: TrashedWorkout) {
  // Workout first, for the same reason. Its new stamp outranks the workout's tombstone.
  await repository.save('workout', trashed.id, trashed.workout)
  await repository.delete('trashedWorkout', trashed.id)
}

export const deleteForGood = (repository: LocalRepository, id: string) => repository.delete('trashedWorkout', id)

/** Deletes for good what has been in the trash for 30 days, and returns the rest, newest first. */
export async function purge(repository: LocalRepository): Promise<TrashedWorkout[]> {
  const nowMs = Date.now()
  const alive = new Set((await repository.getAll('workout')).map((w) => w.id))
  const kept: TrashedWorkout[] = []
  for (const trashed of await repository.getAll('trashedWorkout')) {
    // Alive as well: another device edited the workout after it was trashed here, and the
    // later edit won. The workout holds the data, so the trash copy can go.
    if (nowMs >= deletedForGoodAt(trashed).getTime() || alive.has(trashed.id))
      await repository.delete('trashedWorkout', trashed.id)
    else kept.push(trashed)
  }
  return kept.sort((a, b) => Date.parse(b.deletedAt) - Date.parse(a.deletedAt))
}
