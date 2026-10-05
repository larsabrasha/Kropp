// The sync contract between the app and the server. Shared by both (server/ imports it), and the
// same on the wire as the .NET version, so an app that is not yet updated keeps syncing.

/** The names aggregates travel under. Stored in the database, so never rename one. */
export const AggregateTypes = {
  workout: 'workout',
  exercise: 'exercise',
  template: 'template',
  settings: 'settings',
  trashedWorkout: 'trashedWorkout',
} as const

export type AggregateType = (typeof AggregateTypes)[keyof typeof AggregateTypes]

export const ALL_AGGREGATE_TYPES: ReadonlySet<string> = new Set(Object.values(AggregateTypes))

/**
 * One aggregate as it travels. data is the aggregate's JSON, null for a tombstone. modifiedAt is an
 * ISO timestamp stamped by the client that made the change; the latest wins.
 */
export interface SyncChange {
  type: string
  id: string
  modifiedAt: string
  isDeleted: boolean
  data: string | null
}

/** A change as the server holds it, with the sequence number it was given on arrival. */
export interface SyncRecord extends SyncChange {
  serverSeq: number
}

export interface PushRequest {
  changes: SyncChange[]
}

/**
 * rejected holds the server's copy of every change that lost to a newer one, so the client can
 * take it even when that copy is older than the client's pull watermark.
 */
export interface PushResponse {
  rejected: SyncRecord[]
}

/**
 * serverSeq is the watermark for the next pull: the last sequence number in changes, or the
 * requested one when there was nothing new.
 */
export interface PullResponse {
  changes: SyncRecord[]
  serverSeq: number
  hasMore: boolean
}

export const SyncLimits = {
  maxChangesPerPush: 200,
  maxChangesPerPull: 500,
  maxDocumentLength: 64 * 1024,
} as const

/** Milliseconds since the epoch. Stamps written by .NET end in +00:00, the app's in Z; both parse. */
export const stampTime = (iso: string) => Date.parse(iso)
