import { afterEach, describe, expect, it, vi } from 'vitest'
import { followSync } from '../services'
import { FakeSyncApi } from '../test/fakeSyncApi'
import { SETTINGS_ID, type Exercise, type Workout } from '../training/model'
import { BackupError, createBackup, importedChanges, parseBackup, planImport, upgrade } from './backup'
import { SyncEngine } from './engine'
import { LocalRepository } from './localRepo'
import { MemoryStore } from './memoryStore'

// A backup holds what the device holds, and restoring it never wins over a later change.

const workout = (note: string): Workout => ({
  id: crypto.randomUUID(),
  date: '2026-09-21',
  note,
  status: 'Planned',
  exercises: [],
})

const exercise: Exercise = {
  id: crypto.randomUUID(),
  name: 'Knäböj',
  kind: 'Strength',
  isArchived: false,
  categories: ['Legs'],
  measuresTimeOnly: false,
}

const at = (iso: string) => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(iso))
}

afterEach(() => vi.useRealTimers())

/** A device with its own store and repository, syncing with server. */
function device(server = new FakeSyncApi()) {
  const store = new MemoryStore()
  const repository = new LocalRepository(store)
  const engine = new SyncEngine(store, server)
  followSync(repository, engine)
  return { store, repository, engine, server }
}

/** The backup's text, as the file holds it. */
const fileOf = async (store: MemoryStore) => JSON.stringify(await createBackup(store))

describe('a backup', () => {
  it('holds every aggregate, and restores on an empty device to the same', async () => {
    const from = device()
    const w = workout('Ben')
    await from.repository.save('workout', w.id, w)
    await from.repository.save('exercise', exercise.id, exercise)
    await from.repository.save('settings', SETTINGS_ID, { id: SETTINGS_ID, sessionsPerWeek: 4 })

    const parsed = parseBackup(await fileOf(from.store))
    expect(parsed.counts).toMatchObject({ workout: 1, exercise: 1, settings: 1, template: 0 })

    const to = device()
    expect(await to.repository.restore(parsed.changes)).toBe(3)
    expect(to.repository.peek('workout', w.id)).toEqual(w)
    expect(await to.repository.get('exercise', exercise.id)).toEqual(exercise)
    expect((await to.store.getPending()).length).toBe(3)
    // Under the stamps they had, not new ones.
    expect((await to.store.get(`workout:${w.id}`))?.modifiedAt).toBe(
      (await from.store.get(`workout:${w.id}`))?.modifiedAt,
    )
  })

  it('leaves out what was deleted', async () => {
    const { repository, store } = device()
    const w = workout('Ben')
    await repository.save('workout', w.id, w)
    await repository.delete('workout', w.id)

    expect((await createBackup(store)).records).toEqual([])
  })

  it('tells the listeners once per type, with memory already holding the restore', async () => {
    const from = device()
    const a = workout('A')
    const b = workout('B')
    await from.repository.save('workout', a.id, a)
    await from.repository.save('workout', b.id, b)

    const to = device()
    const seen: number[] = []
    to.repository.onChange(() => seen.push(to.repository.peekAll('workout').length))
    await to.repository.restore(parseBackup(await fileOf(from.store)).changes)

    expect(seen).toEqual([2])
  })
})

describe('restoring', () => {
  it('keeps a local change made after the backup', async () => {
    at('2026-09-21T10:00:00Z')
    const { repository, store } = device()
    const w = workout('Before')
    await repository.save('workout', w.id, w)
    const file = await fileOf(store)

    at('2026-09-22T10:00:00Z')
    await repository.save('workout', w.id, { ...w, note: 'After' })

    expect(await repository.restore(parseBackup(file).changes)).toBe(0)
    expect(repository.peek('workout', w.id)?.note).toBe('After')
  })

  it('brings back an older version over nothing newer, but never what was deleted after the backup', async () => {
    at('2026-09-21T10:00:00Z')
    const { repository, store } = device()
    const w = workout('Ben')
    await repository.save('workout', w.id, w)
    const file = await fileOf(store)

    at('2026-09-22T10:00:00Z')
    await repository.delete('workout', w.id)

    expect(await repository.restore(parseBackup(file).changes)).toBe(0)
    expect(repository.peek('workout', w.id)).toBeUndefined()
  })

  it('loses on the server to a change another device made after the backup', async () => {
    at('2026-09-21T10:00:00Z')
    const phone = device()
    const w = workout('Before')
    await phone.repository.save('workout', w.id, w)
    await phone.engine.sync()
    const file = await fileOf(phone.store)

    at('2026-09-22T10:00:00Z')
    await phone.repository.save('workout', w.id, { ...w, note: 'After' })
    await phone.engine.sync()

    // A new device that has not synced yet restores the old backup, then syncs.
    const fresh = device(phone.server)
    await fresh.repository.restore(parseBackup(file).changes)
    await fresh.engine.sync()
    await vi.waitFor(() => expect(fresh.repository.peek('workout', w.id)?.note).toBe('After'))
    expect(JSON.parse(phone.server.all[0]!.data!).note).toBe('After')
  })

  it('stamps a change from the future as now, so it cannot win over every later one', async () => {
    at('2026-09-21T10:00:00Z')
    const w = workout('Ben')
    const file = JSON.stringify({
      format: 'kropp',
      version: 1,
      exportedAt: '2026-09-21T10:00:00.000Z',
      records: [{ type: 'workout', id: w.id, modifiedAt: '2099-01-01T00:00:00.000Z', data: w }],
    })

    expect(parseBackup(file).changes[0]!.modifiedAt).toBe('2026-09-21T10:00:00.000Z')
  })
})

describe('reading a file', () => {
  const backup = (records: unknown[], version = 1) =>
    JSON.stringify({ format: 'kropp', version, exportedAt: '2026-09-21T10:00:00.000Z', records })
  const problemOf = (text: string) => {
    try {
      parseBackup(text)
      return null
    } catch (e) {
      return e instanceof BackupError ? e.problem : e
    }
  }

  it('refuses what is not a backup from this app', () => {
    expect(problemOf('not json')).toBe('NotABackup')
    expect(problemOf('[]')).toBe('NotABackup')
    expect(problemOf(JSON.stringify({ records: [] }))).toBe('NotABackup')
  })

  it('refuses a backup from a later version', () => {
    expect(problemOf(backup([], 2))).toBe('NewerVersion')
  })

  it('refuses the whole file for one record the server would refuse', () => {
    const good = workout('Ben')
    const record = (data: unknown, type = 'workout') => ({
      type,
      id: good.id,
      modifiedAt: '2026-09-21T10:00:00.000Z',
      data,
    })

    expect(problemOf(backup([record(good)]))).toBeNull()
    expect(problemOf(backup([record(good), record({ ...good, date: 'igår' })]))).toBe('Invalid')
    expect(problemOf(backup([record(good, 'measurement')]))).toBe('Invalid')
    expect(problemOf(backup([record(null)]))).toBe('Invalid')
    expect(problemOf(backup(['x']))).toBe('Invalid')
  })

  it('reads ids in any case, as the store keeps them in lower case', () => {
    const w = workout('Ben')
    const upper = { ...w, id: w.id.toUpperCase() }
    const file = backup([{ type: 'workout', id: upper.id, modifiedAt: '2026-09-21T10:00:00.000Z', data: upper }])

    expect(parseBackup(file).changes[0]!.id).toBe(w.id)
  })
})

describe('versions', () => {
  const file = (version: number, extra: object = {}) =>
    JSON.stringify({ format: 'kropp', version, exportedAt: '2026-09-21T10:00:00.000Z', records: [], ...extra })

  it("runs every step from the file's version up, in order", () => {
    const steps = [
      (f: Record<string, unknown>) => ({ ...f, seen: [...(f.seen as string[]), 'to 2'] }),
      (f: Record<string, unknown>) => ({ ...f, seen: [...(f.seen as string[]), 'to 3'] }),
    ]

    expect(upgrade({ version: 1, seen: [] }, 1, steps)).toEqual({ version: 3, seen: ['to 2', 'to 3'] })
    expect(upgrade({ version: 2, seen: [] }, 2, steps)).toEqual({ version: 3, seen: ['to 3'] })
    expect(upgrade({ version: 3, seen: [] }, 3, steps)).toEqual({ version: 3, seen: [] })
  })

  it('imports a file of an older version through the steps, and tells its version', () => {
    // A version 2 that renamed the records, read by an app that knows it.
    const w = workout('Ben')
    const old = file(1, { entries: [{ type: 'workout', id: w.id, modifiedAt: '2026-09-21T10:00:00.000Z', data: w }] })
    const rename = (f: Record<string, unknown>) => ({ ...f, records: f.entries })

    const parsed = parseBackup(old, [rename])
    expect(parsed.version).toBe(1)
    expect(parsed.changes.map((c) => c.id)).toEqual([w.id])
  })

  it('refuses a version that is not a whole number from 1', () => {
    for (const version of [0, -1, 1.5, '1', null])
      expect(() => parseBackup(JSON.stringify({ format: 'kropp', version, records: [] }))).toThrow(BackupError)
  })

  it('keeps the latest of an aggregate that is in the file twice', () => {
    const w = workout('Ben')
    const record = (note: string, modifiedAt: string) => ({
      type: 'workout',
      id: w.id,
      modifiedAt,
      data: { ...w, note },
    })
    const parsed = parseBackup(
      file(1, {
        records: [record('Later', '2026-09-21T11:00:00.000Z'), record('Earlier', '2026-09-21T10:00:00.000Z')],
      }),
    )

    expect(parsed.changes.map((c) => JSON.parse(c.data!).note)).toEqual(['Later'])
    expect(parsed.counts.workout).toBe(1)
  })
})

describe('a preview of an import', () => {
  it('tells new, same and each kind of conflict apart', async () => {
    at('2026-09-21T10:00:00Z')
    const from = device()
    const all = ['fresh', 'same', 'file', 'here', 'deleted'].map(workout)
    const [fresh, same, newerInFile, newerHere, deletedHere] = all as [Workout, Workout, Workout, Workout, Workout]
    for (const w of all) await from.repository.save('workout', w.id, w)

    at('2026-09-20T10:00:00Z')
    const to = device()
    await to.repository.save('workout', newerInFile.id, { ...newerInFile, note: 'older here' })
    at('2026-09-21T10:00:00Z')
    await to.repository.save('workout', same.id, same)
    at('2026-09-22T10:00:00Z')
    await to.repository.save('workout', newerHere.id, { ...newerHere, note: 'newer here' })
    await to.repository.save('workout', deletedHere.id, deletedHere)
    await to.repository.delete('workout', deletedHere.id)

    const items = await planImport(to.store, parseBackup(await fileOf(from.store)))
    const kindOf = (w: Workout) => items.find((i) => i.change.id === w.id)?.kind

    expect([fresh, same, newerInFile, newerHere, deletedHere].map((w) => kindOf(w))).toEqual([
      'new',
      'same',
      'newerInFile',
      'newerHere',
      'deletedHere',
    ])
  })

  it('imports what is new or newer in the file, and keeps what is newer or deleted here', async () => {
    at('2026-09-21T10:00:00Z')
    const from = device()
    const all = ['fresh', 'file', 'here', 'deleted'].map(workout)
    const [fresh, newerInFile, newerHere, deletedHere] = all as [Workout, Workout, Workout, Workout]
    for (const w of all) await from.repository.save('workout', w.id, w)
    const parsed = parseBackup(await fileOf(from.store))

    at('2026-09-20T10:00:00Z')
    const to = device()
    await to.repository.save('workout', newerInFile.id, { ...newerInFile, note: 'older here' })
    at('2026-09-22T10:00:00Z')
    await to.repository.save('workout', newerHere.id, { ...newerHere, note: 'newer here' })
    await to.repository.save('workout', deletedHere.id, deletedHere)
    await to.repository.delete('workout', deletedHere.id)

    const changes = importedChanges(await planImport(to.store, parsed))
    expect(changes.map((c) => c.id).sort()).toEqual([fresh.id, newerInFile.id].sort())
    expect(await to.repository.restore(changes)).toBe(2)
    expect(to.repository.peek('workout', newerInFile.id)?.note).toBe('file')
    expect(to.repository.peek('workout', newerHere.id)?.note).toBe('newer here')
    expect(to.repository.peek('workout', deletedHere.id)).toBeUndefined()
  })
})
