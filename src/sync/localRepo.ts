import {
  readExercise,
  readSettings,
  readTemplate,
  readTrashedWorkout,
  readWorkout,
  toJson,
  type Exercise,
  type TrashedWorkout,
  type UserSettings,
  type Workout,
  type WorkoutTemplate,
} from '../training/model'
import { now, nextStamp } from './clock'
import { keyOf, type LocalStore } from './localStore'
import { AggregateTypes, type AggregateType } from './protocol'

export interface Aggregates {
  workout: Workout
  exercise: Exercise
  template: WorkoutTemplate
  settings: UserSettings
  trashedWorkout: TrashedWorkout
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const readers: { [T in AggregateType]: (json: any) => Aggregates[T] } = {
  [AggregateTypes.workout]: readWorkout,
  [AggregateTypes.exercise]: readExercise,
  [AggregateTypes.template]: readTemplate,
  [AggregateTypes.settings]: readSettings,
  [AggregateTypes.trashedWorkout]: readTrashedWorkout,
}

/**
 * Typed reads and writes against the local store. Every write lands in the outbox and notifies
 * the listeners, which the sync scheduler and the views use.
 */
export class LocalRepository {
  private listeners = new Set<() => void>()

  constructor(readonly store: LocalStore) {}

  onChange(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  async getAll<T extends AggregateType>(type: T): Promise<Aggregates[T][]> {
    const records = await this.store.getAll(type)
    return records.filter((r) => !r.isDeleted && r.data !== null).map((r) => readers[type](JSON.parse(r.data!)))
  }

  /** One aggregate by id, or undefined when there is none or it was deleted. */
  async get<T extends AggregateType>(type: T, id: string): Promise<Aggregates[T] | undefined> {
    const r = await this.store.get(keyOf(type, id))
    return r && !r.isDeleted && r.data !== null ? readers[type](JSON.parse(r.data)) : undefined
  }

  save<T extends AggregateType>(type: T, id: string, aggregate: Aggregates[T]): Promise<void> {
    return this.put(type, id, toJson(aggregate), false)
  }

  /** Leaves a tombstone, so the deletion reaches the server and every other device. */
  delete(type: AggregateType, id: string): Promise<void> {
    return this.put(type, id, null, true)
  }

  private async put(type: string, id: string, data: string | null, isDeleted: boolean) {
    const key = keyOf(type, id)
    // Two saves inside one millisecond would otherwise share a stamp, and the second could be
    // mistaken for the already-confirmed first.
    const existing = await this.store.get(key)
    const modifiedAt = nextStamp(now(), existing?.modifiedAt)
    await this.store.put({ key, type, id, modifiedAt, isDeleted, data, pending: true })
    for (const listener of this.listeners) listener()
  }
}
