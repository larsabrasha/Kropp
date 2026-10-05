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

/**
 * Whether a trashed workout is due to go: 30 days have passed, or the workout is alive as well
 * (another device edited it after it was trashed here, and the later edit won; the workout holds
 * the data, so the trash copy can go).
 */
const isDue = (trashed: TrashedWorkout, alive: ReadonlySet<string>, nowMs: number) =>
  nowMs >= deletedForGoodAt(trashed).getTime() || alive.has(trashed.id)

/** What the trash shows: what purge keeps, newest first. */
export function inTrash(trashed: readonly TrashedWorkout[], workouts: readonly Workout[], nowMs = Date.now()) {
  const alive = new Set(workouts.map((w) => w.id))
  return trashed
    .filter((t) => !isDue(t, alive, nowMs))
    .sort((a, b) => Date.parse(b.deletedAt) - Date.parse(a.deletedAt))
}

/** Deletes for good what has been in the trash for 30 days, and returns the rest, newest first. */
export async function purge(repository: LocalRepository): Promise<TrashedWorkout[]> {
  const nowMs = Date.now()
  const workouts = await repository.getAll('workout')
  const alive = new Set(workouts.map((w) => w.id))
  const trashed = await repository.getAll('trashedWorkout')
  for (const item of trashed) if (isDue(item, alive, nowMs)) await repository.delete('trashedWorkout', item.id)
  return inTrash(trashed, workouts, nowMs)
}
