import { stampTime, type SyncRecord } from './protocol'

/**
 * An aggregate as the app keeps it. pending marks a local change the server has not confirmed
 * yet: the outbox is simply every pending record. key is `${type}:${id}`.
 */
export interface LocalRecord {
  key: string
  type: string
  id: string
  modifiedAt: string
  isDeleted: boolean
  data: string | null
  pending: boolean
}

export const keyOf = (type: string, id: string) => `${type}:${id}`

export const fromServer = (r: SyncRecord): LocalRecord => ({
  key: keyOf(r.type, r.id),
  type: r.type,
  id: r.id,
  modifiedAt: r.modifiedAt,
  isDeleted: r.isDeleted,
  data: r.data,
  pending: false,
})

/** Identifies a pushed change, so confirming it cannot clear an edit made after the push. */
export interface PushedVersion {
  key: string
  modifiedAt: string
}

/**
 * The app's own copy of the data: IndexedDB in the browser (indexedDbStore.ts), memory in tests
 * (memoryStore.ts). Both follow the same rules, and storeRules.test.ts runs against both.
 */
export interface LocalStore {
  get(key: string): Promise<LocalRecord | undefined>
  getAll(type: string): Promise<LocalRecord[]>
  getPending(): Promise<LocalRecord[]>
  put(record: LocalRecord): Promise<void>
  /**
   * Clears pending on each record whose modifiedAt still equals the pushed one, and leaves a record
   * edited since then pending. Atomic per record against put.
   */
  markSynced(pushed: readonly PushedVersion[]): Promise<void>
  /**
   * Stores each server record unless the local copy is pending and newer, in which case the local
   * change wins and is pushed on the next round. Same atomicity as markSynced.
   */
  applyFromServer(records: readonly SyncRecord[]): Promise<void>
  getWatermark(): Promise<number>
  setWatermark(serverSeq: number): Promise<void>
}

/** The rule markSynced applies to one record. */
export const isConfirmedBy = (local: LocalRecord, pushed: PushedVersion) =>
  local.pending && stampTime(local.modifiedAt) === stampTime(pushed.modifiedAt)

/** The rule applyFromServer applies to one record: a pending local change that is newer wins. */
export const keepsLocal = (local: LocalRecord | undefined, incoming: SyncRecord) =>
  local !== undefined && local.pending && stampTime(local.modifiedAt) > stampTime(incoming.modifiedAt)
