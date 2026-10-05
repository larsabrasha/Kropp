import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { HttpError, SyncEngine, type SyncApi } from '../src/sync/engine'
import { LocalRepository } from '../src/sync/localRepo'
import { MemoryStore } from '../src/sync/memoryStore'
import type { PullResponse, PushResponse, SyncChange } from '../src/sync/protocol'
import { readTrashedWorkout, readWorkout, toJson, type Workout } from '../src/training/model'
import { createApp } from './app'
import { connect, type Db } from './db'
import { migrate } from './migrate'
import { pglite } from './pglite'

// Runs against PGlite, and also against a real Postgres when DATABASE_URL is set (as in CI).
// That database is emptied: never point it at one that holds data.
const targets: [string, () => Promise<Db>][] = [['PGlite', () => pglite()]]
if (process.env.DATABASE_URL) targets.push(['Postgres', async () => connect(process.env.DATABASE_URL)])

const T0 = new Date('2026-09-23T08:00:00Z')
const at = (ms: number) => new Date(T0.getTime() + ms).toISOString()
const MINUTE = 60_000

const newWorkout = (note: string): Workout => ({
  id: crypto.randomUUID(),
  date: '2026-09-21',
  note,
  status: 'Planned',
  exercises: [],
})

const change = (workout: Workout, modifiedAt: string): SyncChange => ({
  type: 'workout',
  id: workout.id,
  modifiedAt,
  isDeleted: false,
  data: toJson(workout),
})

describe.each(targets)('the API on %s', (_, open) => {
  let db: Db
  let app: ReturnType<typeof createApp>

  beforeAll(async () => {
    db = await open()
    await migrate(db)
    app = createApp(db, () => {})
  })
  afterAll(() => db.close())
  beforeEach(async () => {
    await db.query('TRUNCATE "SyncDocuments"')
    await db.query('ALTER SEQUENCE sync_seq RESTART')
  })

  const post = (changes: unknown) =>
    app.request('/api/sync/push', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ changes }),
    })

  async function pushOk(...changes: SyncChange[]): Promise<PushResponse> {
    const response = await post(changes)
    expect(response.status).toBe(200)
    return response.json()
  }

  const pullFrom = async (since: number): Promise<PullResponse> =>
    (await app.request(`/api/sync/pull?since=${since}`)).json()

  /** A SyncApi that calls the app in-process, for the sync engine. */
  const api: SyncApi = {
    async push(request) {
      const response = await post(request.changes)
      if (!response.ok) throw new HttpError(response.status)
      return response.json()
    },
    async pull(since) {
      const response = await app.request(`/api/sync/pull?since=${since}`)
      if (!response.ok) throw new HttpError(response.status)
      return response.json()
    },
  }

  it('returns a pushed change on pull, with a sequence number', async () => {
    const workout = newWorkout('Ben')
    expect((await pushOk(change(workout, at(0)))).rejected).toEqual([])

    const pulled = await pullFrom(0)

    expect(pulled.changes).toHaveLength(1)
    const record = pulled.changes[0]!
    expect(record.id).toBe(workout.id)
    expect(Date.parse(record.modifiedAt)).toBe(T0.getTime())
    expect(record.serverSeq).toBe(1)
    expect(pulled.serverSeq).toBe(1)
    expect(pulled.hasMore).toBe(false)
    expect(readWorkout(JSON.parse(record.data!)).note).toBe('Ben')
  })

  it('leaves no workout data on the server after trashing and deleting for good', async () => {
    const workout = newWorkout('Ben')
    await pushOk(change(workout, at(0)))
    const trashed = { id: workout.id, deletedAt: at(MINUTE), workout }

    const result = await pushOk(
      { type: 'trashedWorkout', id: workout.id, modifiedAt: at(MINUTE), isDeleted: false, data: toJson(trashed) },
      { type: 'workout', id: workout.id, modifiedAt: at(MINUTE), isDeleted: true, data: null },
    )
    expect(result.rejected).toEqual([])
    const inTrash = (await pullFrom(0)).changes.find((c) => c.type === 'trashedWorkout')!
    expect(readTrashedWorkout(JSON.parse(inTrash.data!)).workout.note).toBe('Ben')

    await pushOk({
      type: 'trashedWorkout',
      id: workout.id,
      modifiedAt: at(31 * 1440 * MINUTE),
      isDeleted: true,
      data: null,
    })

    expect((await pullFrom(0)).changes.every((c) => c.isDeleted && c.data === null)).toBe(true)
  })

  it('changes nothing when the same batch is pushed twice', async () => {
    const c = change(newWorkout('Ben'), at(0))
    await pushOk(c)

    const again = await pushOk(c)

    expect(again.rejected.map((r) => r.serverSeq)).toEqual([1])
    expect((await pullFrom(0)).changes).toHaveLength(1)
    expect((await pullFrom(1)).changes).toEqual([])
  })

  it('lets a newer change win and refuses an older one', async () => {
    const workout = newWorkout('v1')
    await pushOk(change(workout, at(0)))
    await pushOk(change({ ...workout, note: 'v2' }, at(MINUTE)))

    const stale = await pushOk(change({ ...workout, note: 'old' }, at(30_000)))

    expect(stale.rejected).toHaveLength(1)
    expect(stale.rejected[0]!.serverSeq).toBe(2)
    expect(readWorkout(JSON.parse(stale.rejected[0]!.data!)).note).toBe('v2')
  })

  it('refuses the whole batch when one change is invalid', async () => {
    const good = change(newWorkout('ok'), at(0))
    const bad = { type: 'workout', id: crypto.randomUUID(), modifiedAt: at(0), isDeleted: false, data: '{"nope":' }

    const response = await post([good, bad])

    expect(response.status).toBe(400)
    expect(await response.text()).toContain('changes[1]')
    expect((await pullFrom(0)).changes).toEqual([])
  })

  it('replaces the document with a tombstone', async () => {
    const workout = newWorkout('Ben')
    await pushOk(change(workout, at(0)))

    await pushOk({ type: 'workout', id: workout.id, modifiedAt: at(MINUTE), isDeleted: true, data: null })

    const [record] = (await pullFrom(0)).changes
    expect(record!.isDeleted).toBe(true)
    expect(record!.data).toBeNull()
    expect(record!.serverSeq).toBe(2)
  })

  it('brings two devices to the same data', async () => {
    const phoneStore = new MemoryStore()
    const laptopStore = new MemoryStore()
    const phone = new LocalRepository(phoneStore)
    const laptop = new LocalRepository(laptopStore)
    const phoneSync = new SyncEngine(phoneStore, api)
    const laptopSync = new SyncEngine(laptopStore, api)

    const fromPhone = newWorkout('från telefonen')
    const fromLaptop = newWorkout('från datorn')
    await phone.save('workout', fromPhone.id, fromPhone)
    await laptop.save('workout', fromLaptop.id, fromLaptop)

    await phoneSync.sync()
    await laptopSync.sync()
    await phoneSync.sync()

    const notes = async (r: LocalRepository) => (await r.getAll('workout')).map((w) => w.note).sort()
    expect(await notes(phone)).toEqual(['från datorn', 'från telefonen'])
    expect(await notes(laptop)).toEqual(['från datorn', 'från telefonen'])
    expect(phoneSync.status.state).toBe('Idle')
    expect(phoneSync.status.pendingCount).toBe(0)
    expect(laptopSync.status.pendingCount).toBe(0)

    await laptop.delete('workout', fromPhone.id)
    await laptopSync.sync()
    await phoneSync.sync()

    expect(await notes(phone)).toEqual(['från datorn'])
  })

  it('refuses a negative watermark', async () => {
    expect((await app.request('/api/sync/pull?since=-1')).status).toBe(400)
  })

  it('answers 404 for an unknown API path', async () => {
    expect((await app.request('/api/nope')).status).toBe(404)
  })

  it('keeps stamps written by the .NET version, with an offset, as the same instant', async () => {
    const workout = newWorkout('Ben')
    await pushOk(change(workout, '2026-09-23T10:00:00.123+02:00'))

    const stale = await pushOk(change({ ...workout, note: 'same' }, '2026-09-23T08:00:00.123Z'))

    expect(stale.rejected).toHaveLength(1)
    expect(stale.rejected[0]!.modifiedAt).toBe('2026-09-23T08:00:00.123Z')
  })
})

describe('the migration', () => {
  it('changes nothing on a database the .NET version created', async () => {
    const db = await pglite()
    // What EF Core's migration "Initial" ran, as its script printed it.
    await db.query(`CREATE TABLE "__EFMigrationsHistory" (
      "MigrationId" character varying(150) NOT NULL,
      "ProductVersion" character varying(32) NOT NULL,
      CONSTRAINT "PK___EFMigrationsHistory" PRIMARY KEY ("MigrationId"))`)
    await db.query('CREATE SEQUENCE sync_seq START WITH 1 INCREMENT BY 1 NO MINVALUE NO MAXVALUE NO CYCLE')
    await db.query(`CREATE TABLE "SyncDocuments" (
      "Type" character varying(50) NOT NULL,
      "Id" uuid NOT NULL,
      "ModifiedAt" timestamp with time zone NOT NULL,
      "IsDeleted" boolean NOT NULL,
      "Data" jsonb,
      "ServerSeq" bigint NOT NULL,
      CONSTRAINT "PK_SyncDocuments" PRIMARY KEY ("Type", "Id"))`)
    await db.query('CREATE UNIQUE INDEX "IX_SyncDocuments_ServerSeq" ON "SyncDocuments" ("ServerSeq")')
    await db.query(`INSERT INTO "SyncDocuments" VALUES ('workout', '6f9619ff-8b86-d011-b42d-00c04fc964ff',
      '2026-09-22T18:30:00.123+00', false, '{"id":"6f9619ff-8b86-d011-b42d-00c04fc964ff","date":"2026-09-22"}', nextval('sync_seq'))`)

    await migrate(db)
    await migrate(db)

    const app = createApp(db, () => {})
    const pulled: PullResponse = await (await app.request('/api/sync/pull?since=0')).json()
    expect(pulled.changes.map((c) => [c.id, c.modifiedAt, c.serverSeq])).toEqual([
      ['6f9619ff-8b86-d011-b42d-00c04fc964ff', '2026-09-22T18:30:00.123Z', 1],
    ])
    const pushed: PushResponse = await (
      await app.request('/api/sync/push', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ changes: [change(newWorkout('ny'), at(0))] }),
      })
    ).json()
    expect(pushed.rejected).toEqual([])
    expect((await db.query<{ n: string }>('SELECT max("ServerSeq")::text AS n FROM "SyncDocuments"'))[0]!.n).toBe('2')
    await db.close()
  })
})
