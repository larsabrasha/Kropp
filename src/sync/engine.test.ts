import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { FakeSyncApi } from '../test/fakeSyncApi'
import { readWorkout, toJson, type Workout } from '../training/model'
import { moveToTrash, purge, RETENTION_DAYS } from '../training/trash'
import { nextStamp } from './clock'
import { SyncEngine } from './engine'
import { IndexedDbStore } from './indexedDbStore'
import { LocalRepository } from './localRepo'
import { keyOf, type LocalStore } from './localStore'
import { MemoryStore } from './memoryStore'
import { AggregateTypes } from './protocol'

// The same rules hold for both local stores, so every test runs against each of them.
let dbCount = 0
const stores: [string, () => LocalStore][] = [
  ['memory', () => new MemoryStore()],
  ['IndexedDB', () => new IndexedDbStore(`kropp-test-${++dbCount}`)],
]

const START = new Date('2026-09-23T08:00:00Z')
const advance = (ms: number) => vi.setSystemTime(Date.now() + ms)

const newWorkout = (note?: string): Workout => ({
  id: crypto.randomUUID(),
  date: '2026-09-21',
  note,
  status: 'Planned',
  exercises: [],
})

const workoutKey = (id: string) => keyOf(AggregateTypes.workout, id)

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(START)
})
afterEach(() => vi.useRealTimers())

describe.each(stores)('sync against the %s store', (_, createStore) => {
  let store: LocalStore
  let api: FakeSyncApi
  let repository: LocalRepository
  let engine: SyncEngine

  beforeEach(() => {
    store = createStore()
    api = new FakeSyncApi()
    repository = new LocalRepository(store)
    engine = new SyncEngine(store, api)
  })

  it('keeps a save made while offline in the outbox', async () => {
    api.failWith = FakeSyncApi.unreachable()
    const workout = newWorkout()
    await repository.save('workout', workout.id, workout)

    await engine.sync()

    expect(engine.status.state).toBe('Offline')
    expect(engine.status.pendingCount).toBe(1)
    expect((await store.getPending()).map((r) => r.id)).toEqual([workout.id])
  })

  it('empties the outbox on a successful push', async () => {
    const workout = newWorkout()
    await repository.save('workout', workout.id, workout)

    await engine.sync()

    expect(engine.status).toEqual({ state: 'Idle', pendingCount: 0, lastSyncedAt: START })
    expect(await store.getPending()).toEqual([])
    expect(api.all.map((d) => d.id)).toEqual([workout.id])
  })

  it('keeps the outbox while offline and pushes it when back', async () => {
    api.failWith = FakeSyncApi.unreachable()
    const workout = newWorkout()
    await repository.save('workout', workout.id, workout)
    await engine.sync()

    api.failWith = null
    await engine.sync()

    expect(engine.status.state).toBe('Idle')
    expect(engine.status.pendingCount).toBe(0)
    expect(api.all.map((d) => d.id)).toEqual([workout.id])
  })

  it('keeps an edit made during a push pending', async () => {
    const workout = newWorkout('first')
    await repository.save('workout', workout.id, workout)
    api.duringPush = async () => {
      advance(1000)
      api.duringPush = null
      await repository.save('workout', workout.id, { ...workout, note: 'second' })
    }

    await engine.sync()

    const local = await store.get(workoutKey(workout.id))
    expect(local!.pending).toBe(true)
    expect(readWorkout(JSON.parse(local!.data!)).note).toBe('second')
  })

  it("takes the server's newer copy of a rejected change", async () => {
    const workout = newWorkout('phone')
    await repository.save('workout', workout.id, workout)
    api.seedFromOtherDevice({
      type: AggregateTypes.workout,
      id: workout.id,
      modifiedAt: new Date(START.getTime() + 5 * 60_000).toISOString(),
      isDeleted: false,
      data: toJson({ ...workout, note: 'laptop' }),
    })

    await engine.sync()

    const local = await store.get(workoutKey(workout.id))
    expect(local!.pending).toBe(false)
    expect(readWorkout(JSON.parse(local!.data!)).note).toBe('laptop')
    expect(engine.status.pendingCount).toBe(0)
  })

  it('pulls page by page until done and moves the watermark', async () => {
    api.pageSize = 2
    for (let i = 0; i < 5; i++) {
      const w = newWorkout(`w${i}`)
      api.seedFromOtherDevice({
        type: AggregateTypes.workout,
        id: w.id,
        modifiedAt: START.toISOString(),
        isDeleted: false,
        data: toJson(w),
      })
    }

    await engine.sync()

    expect(api.pulls).toEqual([0, 2, 4])
    expect(await store.getWatermark()).toBe(5)
    expect(await repository.getAll('workout')).toHaveLength(5)
  })

  it('does not let a pull overwrite a newer local edit', async () => {
    const workout = newWorkout('server')
    api.seedFromOtherDevice({
      type: AggregateTypes.workout,
      id: workout.id,
      modifiedAt: new Date(START.getTime() - 5 * 60_000).toISOString(),
      isDeleted: false,
      data: toJson(workout),
    })
    await repository.save('workout', workout.id, { ...workout, note: 'local' })

    // Apply as a pull would, while the local edit is still waiting to be pushed.
    await store.applyFromServer(api.all)

    const local = await store.get(workoutKey(workout.id))
    expect(local!.pending).toBe(true)
    expect(readWorkout(JSON.parse(local!.data!)).note).toBe('local')
  })

  it('sends a delete as a tombstone', async () => {
    const workout = newWorkout()
    await repository.save('workout', workout.id, workout)
    await engine.sync()
    advance(1000)

    await repository.delete('workout', workout.id)
    await engine.sync()

    const [stored] = api.all
    expect(stored!.isDeleted).toBe(true)
    expect(stored!.data).toBeNull()
    expect(await repository.getAll('workout')).toEqual([])
  })

  it('brings a trashed workout to another device, and removes its data everywhere after 30 days', async () => {
    const other = createStore()
    const otherRepository = new LocalRepository(other)
    const otherEngine = new SyncEngine(other, api)
    const workout = newWorkout('Ben')
    await repository.save('workout', workout.id, workout)
    await engine.sync()
    await otherEngine.sync()
    advance(1000)

    await moveToTrash(repository, workout)
    await engine.sync()
    await otherEngine.sync()

    expect(await otherRepository.getAll('workout')).toEqual([])
    expect((await otherRepository.getAll('trashedWorkout')).map((t) => t.workout.note)).toEqual(['Ben'])

    advance(RETENTION_DAYS * 86_400_000)
    await purge(otherRepository)
    await otherEngine.sync()
    await engine.sync()

    expect(api.all.every((d) => d.isDeleted && d.data === null)).toBe(true)
    expect(await repository.getAll('trashedWorkout')).toEqual([])
    expect((await store.get(keyOf(AggregateTypes.trashedWorkout, workout.id)))!.data).toBeNull()
  })

  it('reports a server error as failed, not offline', async () => {
    api.failWith = FakeSyncApi.serverError()
    const workout = newWorkout()
    await repository.save('workout', workout.id, workout)

    await engine.sync()

    expect(engine.status.state).toBe('Failed')
    expect(engine.status.pendingCount).toBe(1)
  })

  it('runs once more after a sync requested during a round', async () => {
    const first = newWorkout('first')
    const second = newWorkout('second')
    await repository.save('workout', first.id, first)

    let overlapping: Promise<void> | null = null
    api.duringPush = async () => {
      api.duringPush = null
      await repository.save('workout', second.id, second)
      overlapping = engine.sync()
    }

    const running = engine.sync()
    await running

    expect(overlapping).toBe(running)
    expect(api.pushes).toHaveLength(2)
    expect(api.all).toHaveLength(2)
    expect(engine.status.pendingCount).toBe(0)
  })

  it('gives two saves in the same millisecond distinct stamps', async () => {
    const workout = newWorkout('a')
    await repository.save('workout', workout.id, workout)
    const first = (await store.get(workoutKey(workout.id)))!.modifiedAt

    await repository.save('workout', workout.id, { ...workout, note: 'b' })

    const second = (await store.get(workoutKey(workout.id)))!.modifiedAt
    expect(Date.parse(second)).toBeGreaterThan(Date.parse(first))
  })

  it('reads a record as the .NET version stored it', async () => {
    // Written by Blazor through kropp-db.js before the port: a +00:00 stamp and the C# JSON.
    const id = '6f9619ff-8b86-d011-b42d-00c04fc964ff'
    await store.put({
      key: workoutKey(id),
      type: 'workout',
      id,
      modifiedAt: '2026-09-22T18:30:00.123+00:00',
      isDeleted: false,
      data: `{"id":"${id}","date":"2026-09-22","sessionNumber":7,"status":"Done","exercises":[{"exerciseId":"11111111-1111-1111-1111-111111111111","order":0,"targetSets":3,"targetReps":8,"targetWeightKg":22.5,"sets":[{"reps":8,"weightKg":22.5}],"isSkipped":false}]}`,
      pending: true,
    })

    const [workout] = await repository.getAll('workout')
    expect(workout!.exercises[0]!.sets).toEqual([{ reps: 8, weightKg: 22.5 }])

    await engine.sync()
    expect(api.all[0]!.modifiedAt).toBe('2026-09-22T18:30:00.123+00:00')
    expect(await store.getPending()).toEqual([])
  })
})

describe('clock', () => {
  it('stamps in whole milliseconds, in UTC', () => {
    vi.setSystemTime(new Date('2026-09-23T10:00:00.1234+02:00'))
    expect(new Date().toISOString()).toBe('2026-09-23T08:00:00.123Z')
  })

  it('moves a stamp past the stored one', () => {
    expect(nextStamp('2026-09-23T08:00:00.000Z', '2026-09-23T08:00:00.000+00:00')).toBe('2026-09-23T08:00:00.001Z')
    expect(nextStamp('2026-09-23T08:00:00.005Z', '2026-09-23T08:00:00.000Z')).toBe('2026-09-23T08:00:00.005Z')
  })
})
