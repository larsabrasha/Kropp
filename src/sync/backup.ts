import { validateChange, isSyncChange } from '../training/validate'
import { now, restoredStamp } from './clock'
import { keyOf, type LocalStore } from './localStore'
import { ALL_AGGREGATE_TYPES, stampTime, type AggregateType, type SyncChange } from './protocol'

// A backup of everything on the device, as one JSON file the user keeps: every aggregate as it is
// stored, with the stamp of its last change, so a restore can tell it from a later one. Deleted
// aggregates are left out; a restore never deletes. ADR 0004 describes the format and its versions.

export const BACKUP_FORMAT = 'kropp'

type BackupFile = Record<string, unknown>

/**
 * One step per version: MIGRATIONS[0] takes a file of version 1 to version 2, and so on. The
 * current version is one more than the steps, so there is no new version without its step, even
 * when the step only has to pass the file on. Never change or remove a step: files of every
 * version are kept by users, and each must import for as long as the app lives. A new step comes
 * with a file of its version in src/contract.test.ts.
 */
const MIGRATIONS: readonly ((file: BackupFile) => BackupFile)[] = []

export const BACKUP_VERSION = MIGRATIONS.length + 1

export interface BackupRecord {
  type: AggregateType
  id: string
  modifiedAt: string
  /** The aggregate's JSON, as an object rather than a string, so the file reads as JSON. */
  data: unknown
}

export interface Backup {
  format: typeof BACKUP_FORMAT
  version: number
  exportedAt: string
  records: BackupRecord[]
}

/** Every aggregate the device holds, also those not yet synced. */
export async function createBackup(store: LocalStore): Promise<Backup> {
  const records: BackupRecord[] = []
  for (const type of ALL_AGGREGATE_TYPES as ReadonlySet<AggregateType>)
    for (const r of await store.getAll(type))
      if (!r.isDeleted && r.data !== null)
        records.push({ type, id: r.id, modifiedAt: r.modifiedAt, data: JSON.parse(r.data) as unknown })
  return { format: BACKUP_FORMAT, version: BACKUP_VERSION, exportedAt: now(), records }
}

/**
 * NotABackup: not JSON, or not a file this app wrote. NewerVersion: written by a later version of
 * the app. Invalid: a record the server would refuse.
 */
export type BackupProblem = 'NotABackup' | 'NewerVersion' | 'Invalid'

export class BackupError extends Error {
  constructor(
    readonly problem: BackupProblem,
    detail: string,
  ) {
    super(detail)
  }
}

export interface ParsedBackup {
  /** The version the file was written in, before it was upgraded. */
  version: number
  exportedAt?: string
  changes: SyncChange[]
  counts: Record<AggregateType, number>
}

/** Runs the steps from the file's version up to the current one. migrations is for tests. */
export function upgrade(file: BackupFile, version: number, migrations = MIGRATIONS): BackupFile {
  return migrations.slice(version - 1).reduce((f, step, i) => ({ ...step(f), version: version + i + 1 }), file)
}

/**
 * Reads a backup of any version into changes for LocalRepository.restore, checked as the server
 * checks a push. Refuses the whole file for a single bad record, so a restore is never half done.
 * An aggregate in the file twice counts once, by its latest stamp.
 */
export function parseBackup(text: string, migrations = MIGRATIONS): ParsedBackup {
  let json: unknown
  try {
    json = JSON.parse(text)
  } catch {
    throw new BackupError('NotABackup', 'The file is not JSON.')
  }
  if (typeof json !== 'object' || json === null || Array.isArray(json))
    throw new BackupError('NotABackup', 'The file is not an object.')
  const file = json as BackupFile
  const version = file.version
  if (file.format !== BACKUP_FORMAT || !Number.isSafeInteger(version) || (version as number) < 1)
    throw new BackupError('NotABackup', 'The file is not a backup from this app.')
  if ((version as number) > migrations.length + 1) throw new BackupError('NewerVersion', `Version ${String(version)}.`)

  const backup = upgrade(file, version as number, migrations) as Partial<Backup>
  if (!Array.isArray(backup.records)) throw new BackupError('NotABackup', 'The file has no records.')

  const byKey = new Map<string, SyncChange>()
  backup.records.forEach((record: unknown, i) => {
    const r = (typeof record === 'object' && record !== null ? record : {}) as Partial<BackupRecord>
    const raw = {
      type: r.type,
      id: r.id,
      modifiedAt: r.modifiedAt,
      isDeleted: false,
      data: JSON.stringify(r.data ?? null),
    }
    if (!isSyncChange(raw)) throw new BackupError('Invalid', `Record ${i} is not a record.`)
    const change: SyncChange = { ...raw, id: raw.id.toLowerCase(), modifiedAt: restoredStamp(raw.modifiedAt) }
    const problem = validateChange(change)
    if (problem !== null) throw new BackupError('Invalid', `Record ${i}: ${problem}`)
    const key = keyOf(change.type, change.id)
    const seen = byKey.get(key)
    if (!seen || stampTime(change.modifiedAt) > stampTime(seen.modifiedAt)) byKey.set(key, change)
  })

  const changes = [...byKey.values()]
  const counts = Object.fromEntries([...ALL_AGGREGATE_TYPES].map((type) => [type, 0])) as Record<AggregateType, number>
  for (const change of changes) counts[change.type as AggregateType]++
  return {
    version: version as number,
    exportedAt: typeof file.exportedAt === 'string' ? file.exportedAt : undefined,
    changes,
    counts,
  }
}

/**
 * How an aggregate in the file stands to the device's copy. new: the device has none. same: the
 * device has the same. The rest are conflicts, where the device has another version:
 * newerInFile, newerHere, or deletedHere.
 */
export type ImportKind = 'new' | 'same' | 'newerInFile' | 'newerHere' | 'deletedHere'

export interface ImportItem {
  change: SyncChange
  kind: ImportKind
  /** The device's copy, as stored; undefined when it has none or deleted it. */
  local?: string
}

/** Which copy a conflict keeps: the file's, or the one here. */
export type Choice = 'file' | 'here'

export const isConflict = (kind: ImportKind) => kind !== 'new' && kind !== 'same'

/** What a conflict keeps unless the user chooses: the newer copy, as sync would. */
export const defaultChoice = (kind: ImportKind): Choice => (kind === 'newerInFile' ? 'file' : 'here')

/** Compares each aggregate in the file with the device's copy, for the user to see before importing. */
export async function planImport(store: LocalStore, parsed: ParsedBackup): Promise<ImportItem[]> {
  const items: ImportItem[] = []
  for (const change of parsed.changes) {
    const local = await store.get(keyOf(change.type, change.id))
    const kind: ImportKind =
      local === undefined
        ? 'new'
        : local.isDeleted || local.data === null
          ? 'deletedHere'
          : canonical(JSON.parse(local.data)) === canonical(JSON.parse(change.data!))
            ? 'same'
            : stampTime(change.modifiedAt) > stampTime(local.modifiedAt)
              ? 'newerInFile'
              : 'newerHere'
    items.push({ change, kind, local: local?.data ?? undefined })
  }
  return items
}

/**
 * What LocalRepository.restore is to store. New aggregates keep their stamps, so a change made
 * elsewhere after the backup still wins. A conflict resolved for the file gets a new stamp: the
 * user chose it, so it wins over the copy here and on the server.
 */
export function restoresOf(items: readonly ImportItem[], choices: ReadonlyMap<string, Choice>) {
  return items.flatMap(({ change, kind }) => {
    if (kind === 'new') return [{ change, overwrite: false }]
    if (!isConflict(kind)) return []
    const choice = choices.get(keyOf(change.type, change.id)) ?? defaultChoice(kind)
    return choice === 'file' ? [{ change, overwrite: true }] : []
  })
}

/** JSON with its keys sorted, so two copies compare equal whatever order their fields came in. */
function canonical(value: unknown): string {
  return JSON.stringify(value, (_, v: unknown) =>
    typeof v === 'object' && v !== null && !Array.isArray(v)
      ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)))
      : v,
  )
}
