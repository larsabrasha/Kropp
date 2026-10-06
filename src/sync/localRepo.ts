import {
  readExercise,
  readSettings,
  readTemplate,
  readTrashedWorkout,
  readWorkout,
  DEFAULT_SETTINGS,
  SETTINGS_ID,
  toJson,
  type Exercise,
  type TrashedWorkout,
  type UserSettings,
  type Workout,
  type WorkoutTemplate,
} from '../training/model'
import { now, nextStamp } from './clock'
import { keyOf, type LocalStore } from './localStore'
import { ALL_AGGREGATE_TYPES, AggregateTypes, stampTime, type AggregateType, type SyncChange } from './protocol'

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

type Memory = { [T in AggregateType]: Map<string, Aggregates[T]> }

const emptyMemory = (): Memory => ({
  workout: new Map(),
  exercise: new Map(),
  template: new Map(),
  settings: new Map(),
  trashedWorkout: new Map(),
})

/**
 * Typed reads and writes against the local store. Every write lands in the outbox and notifies
 * the listeners, which the sync scheduler and the views use.
 *
 * It also keeps every aggregate in memory (a few hundred kB), read once before the app first
 * renders (load) and kept current by every save and by refresh after a sync. The pages read that
 * with peek and peekAll, synchronously, so a page has its data in its very first render and never
 * flashes empty. The store stays the truth: getAll and get read it, and nothing is kept only here.
 */
export class LocalRepository {
  private listeners = new Set<(type: AggregateType) => void>()
  private remoteListeners = new Set<() => void>()
  private memory = emptyMemory()
  private loadError: unknown = undefined
  // Counts saves, so a load that a save overtook reads again instead of dropping the save.
  private saves = 0

  constructor(readonly store: LocalStore) {}

  /** Calls listener after every local save, with memory already updated, with the type saved. */
  onChange(listener: (type: AggregateType) => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  /** Calls listener after refresh has read what a sync stored. */
  onRemoteChange(listener: () => void): () => void {
    this.remoteListeners.add(listener)
    return () => this.remoteListeners.delete(listener)
  }

  /** Reads every aggregate from the store into memory. main.tsx awaits it before the first render. */
  async load(): Promise<void> {
    try {
      for (;;) {
        const before = this.saves
        const next = emptyMemory()
        for (const type of ALL_AGGREGATE_TYPES as ReadonlySet<AggregateType>) {
          const memory = next[type] as Map<string, unknown>
          for (const r of await this.store.getAll(type))
            if (!r.isDeleted && r.data !== null) memory.set(r.id, readers[type](JSON.parse(r.data)))
        }
        if (before !== this.saves) continue
        this.memory = next
        this.loadError = undefined
        return
      }
    } catch (error) {
      this.loadError = error
      throw error
    }
  }

  /** After a sync stored data from the server: reads it into memory, then tells the views. */
  async refresh(): Promise<void> {
    await this.load()
    for (const listener of this.remoteListeners) listener()
  }

  /**
   * Every aggregate of a type, from memory, in the order the store gave them and new ones last.
   * Throws when the store could not be read.
   */
  peekAll<T extends AggregateType>(type: T): Aggregates[T][] {
    if (this.loadError !== undefined) throw this.loadError
    return [...this.memory[type].values()]
  }

  /** One aggregate from memory, or undefined. Throws when the store could not be read. */
  peek<T extends AggregateType>(type: T, id: string): Aggregates[T] | undefined {
    if (this.loadError !== undefined) throw this.loadError
    return this.memory[type].get(id)
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

  /**
   * Stores aggregates from a backup under the stamps they had when it was made, each only when the
   * local copy, or its tombstone, is older. The outbox pushes them, and the server keeps whichever
   * copy is newer, as for a device that was offline for long: so a restore never overwrites a later
   * change anywhere, nor brings back what was deleted after the backup. Tells the listeners once
   * per type. @returns how many were stored.
   */
  async restore(changes: readonly SyncChange[]): Promise<number> {
    const types = new Set<AggregateType>()
    let stored = 0
    for (const change of changes) {
      if (change.data === null) continue
      const type = change.type as AggregateType
      const key = keyOf(type, change.id)
      const existing = await this.store.get(key)
      if (existing && stampTime(existing.modifiedAt) >= stampTime(change.modifiedAt)) continue
      await this.store.put({ ...change, key, type, isDeleted: false, pending: true })
      this.saves++
      ;(this.memory[type] as Map<string, unknown>).set(change.id, readers[type](JSON.parse(change.data)))
      types.add(type)
      stored++
    }
    for (const type of types) for (const listener of this.listeners) listener(type)
    return stored
  }

  /**
   * Deletes all data, on every device: a tombstone for every aggregate but the settings, which
   * keep the user's preferences and get resetAt, when it happened. An import afterwards treats
   * what this deleted as missing (planImport), so a backup brings it back. Tells the listeners
   * once per type. @returns how many were deleted.
   */
  async deleteAll(): Promise<number> {
    let deleted = 0
    let latest = now()
    const types = new Set<AggregateType>()
    for (const type of ALL_AGGREGATE_TYPES as ReadonlySet<AggregateType>) {
      if (type === AggregateTypes.settings) continue
      for (const r of await this.store.getAll(type)) {
        if (r.isDeleted) continue
        const modifiedAt = nextStamp(now(), r.modifiedAt)
        if (stampTime(modifiedAt) > stampTime(latest)) latest = modifiedAt
        await this.store.put({ ...r, modifiedAt, isDeleted: true, data: null, pending: true })
        this.saves++
        this.memory[type].delete(r.id)
        types.add(type)
        deleted++
      }
    }
    for (const type of types) for (const listener of this.listeners) listener(type)
    const current = (await this.get(AggregateTypes.settings, SETTINGS_ID)) ?? DEFAULT_SETTINGS
    await this.save(AggregateTypes.settings, SETTINGS_ID, { ...current, resetAt: latest })
    return deleted
  }

  private async put(type: AggregateType, id: string, data: string | null, isDeleted: boolean) {
    const key = keyOf(type, id)
    // Two saves inside one millisecond would otherwise share a stamp, and the second could be
    // mistaken for the already-confirmed first.
    const existing = await this.store.get(key)
    const modifiedAt = nextStamp(now(), existing?.modifiedAt)
    await this.store.put({ key, type, id, modifiedAt, isDeleted, data, pending: true })
    this.saves++
    // Read back as load reads it, so memory holds the same shape either way.
    const memory = this.memory[type] as Map<string, unknown>
    if (isDeleted || data === null) memory.delete(id)
    else memory.set(id, readers[type](JSON.parse(data)))
    for (const listener of this.listeners) listener(type)
  }
}
