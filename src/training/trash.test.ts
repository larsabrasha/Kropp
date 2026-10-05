import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { LocalRepository } from '../sync/localRepo'
import { keyOf } from '../sync/localStore'
import { MemoryStore } from '../sync/memoryStore'
import { AggregateTypes } from '../sync/protocol'
import type { Workout } from './model'
import { deleteForGood, moveToTrash, purge, restore } from './trash'

const START = new Date('2026-09-23T08:00:00Z')
const MINUTE = 60_000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR
const advance = (ms: number) => vi.setSystemTime(Date.now() + ms)

describe('workout trash', () => {
  let store: MemoryStore
  let repository: LocalRepository

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(START)
    store = new MemoryStore()
    repository = new LocalRepository(store)
  })
  afterEach(() => vi.useRealTimers())

  const seed = async (): Promise<Workout> => {
    const workout: Workout = {
      id: crypto.randomUUID(),
      date: '2026-09-21',
      status: 'Planned',
      exercises: [{ exerciseId: crypto.randomUUID(), order: 0, sets: [{ reps: 8 }], isSkipped: false }],
    }
    await repository.save('workout', workout.id, workout)
    return workout
  }

  it('a trashed workout leaves the workouts and keeps its data in the trash', async () => {
    const workout = await seed()

    await moveToTrash(repository, workout)

    expect(await repository.getAll('workout')).toEqual([])
    const all = await repository.getAll('trashedWorkout')
    expect(all).toHaveLength(1)
    const trashed = all[0]!
    expect(trashed.id).toBe(workout.id)
    expect(trashed.deletedAt).toBe(START.toISOString())
    expect(trashed.workout.exercises).toHaveLength(1)
    expect(trashed.workout.exercises[0]!.sets).toHaveLength(1)
    expect(trashed.workout.exercises[0]!.sets[0]!.reps).toBe(8)
  })

  it('restoring brings the workout back as it was', async () => {
    const workout = await seed()
    await moveToTrash(repository, workout)
    advance(3 * DAY)

    const trashed = await repository.getAll('trashedWorkout')
    expect(trashed).toHaveLength(1)
    await restore(repository, trashed[0]!)

    expect(await repository.getAll('trashedWorkout')).toEqual([])
    expect(await repository.get('workout', workout.id)).toEqual(workout)
  })

  it('the trash keeps a workout for 30 days and then deletes it for good', async () => {
    const workout = await seed()
    await moveToTrash(repository, workout)

    advance(30 * DAY - MINUTE)
    const kept = await purge(repository)
    expect(kept).toHaveLength(1)
    expect(kept[0]!.id).toBe(workout.id)

    advance(MINUTE)
    expect(await purge(repository)).toEqual([])

    const record = await store.get(keyOf(AggregateTypes.trashedWorkout, workout.id))
    expect(record).toBeDefined()
    expect(record!.isDeleted).toBe(true)
    expect(record!.data).toBeNull()
    expect(record!.pending).toBe(true)
  })

  it('deleting for good leaves only a tombstone', async () => {
    const workout = await seed()
    await moveToTrash(repository, workout)

    await deleteForGood(repository, workout.id)

    expect(await repository.getAll('trashedWorkout')).toEqual([])
    expect((await store.get(keyOf(AggregateTypes.trashedWorkout, workout.id)))!.data).toBeNull()
    expect((await store.get(keyOf(AggregateTypes.workout, workout.id)))!.data).toBeNull()
  })

  it('a trash copy goes when the workout is alive again from a later edit', async () => {
    const workout = await seed()
    await moveToTrash(repository, workout)
    // Another device edited the workout after this one trashed it; its copy won on the server.
    advance(5 * MINUTE)
    await repository.save('workout', workout.id, { ...workout, note: 'edited' })

    expect(await purge(repository)).toEqual([])

    expect((await repository.get('workout', workout.id))!.note).toBe('edited')
  })

  it('the trash lists the latest deleted first', async () => {
    const first = await seed()
    const second = await seed()
    await moveToTrash(repository, first)
    advance(HOUR)
    await moveToTrash(repository, second)

    expect((await purge(repository)).map((t) => t.id)).toEqual([second.id, first.id])
  })
})
