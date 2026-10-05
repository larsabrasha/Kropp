import { createHash } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createApp } from './app'
import type { Db } from './db'
import { migrate, MIGRATIONS } from './migrate'
import { pglite } from './pglite'

// What apps already installed on phones send and expect, and what databases already hold. When a
// test here fails, the change would break an app that is not yet updated or a database that has
// already migrated: change the code back, not the test. See src/contract.test.ts for the app's side.

describe('the migrations', () => {
  it('never change a step that has run', () => {
    // A new step is added at the end, with its hash here. Never edit an existing one.
    const hashes = MIGRATIONS.map((m) => [m.name, createHash('sha256').update(m.sql).digest('hex')])
    expect(hashes).toEqual([['0001_initial', 'ff6b46af2f2dfda073323d6b5bc1d0bbb988f84fa331ca437201ab8b598daa81']])
  })
})

describe('the sync API', () => {
  let db: Db
  let app: ReturnType<typeof createApp>

  beforeAll(async () => {
    db = await pglite()
    await migrate(db)
    app = createApp(db, () => {})
  })
  afterAll(() => db.close())

  const ID = '6f9619ff-8b86-d011-b42d-00c04fc964ff'
  const DATA = `{"id":"${ID}","date":"2026-09-22"}`

  const push = (body: unknown) =>
    app.request('/api/sync/push', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })

  it('keeps its addresses and the shape of every answer', async () => {
    const change = { type: 'workout', id: ID, modifiedAt: '2026-09-22T18:30:00.123Z', isDeleted: false, data: DATA }

    const accepted = await push({ changes: [change] })
    expect(accepted.status).toBe(200)
    expect(await accepted.json()).toEqual({ rejected: [] })

    const stale = await push({ changes: [{ ...change, modifiedAt: '2026-09-22T18:00:00.000Z' }] })
    const record = {
      type: 'workout',
      id: ID,
      modifiedAt: '2026-09-22T18:30:00.123Z',
      isDeleted: false,
      data: expect.any(String),
      serverSeq: 1,
    }
    expect(await stale.json()).toEqual({ rejected: [record] })

    const pulled = await app.request('/api/sync/pull?since=0')
    expect(pulled.status).toBe(200)
    const body = await pulled.json()
    expect(body).toEqual({ changes: [record], serverSeq: 1, hasMore: false })
    expect(JSON.parse(body.changes[0].data)).toEqual(JSON.parse(DATA))

    expect(await (await app.request('/api/sync/pull?since=1')).json()).toEqual({
      changes: [],
      serverSeq: 1,
      hasMore: false,
    })
  })
})
