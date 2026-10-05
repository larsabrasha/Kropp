import { Hono } from 'hono'
import { SyncLimits } from '../src/sync/protocol'
import { isSyncChange, validateChange } from '../src/training/validate'
import type { Db } from './db'
import { pull, push } from './sync'

const problem = (detail: string) => ({ title: 'Bad Request', status: 400, detail })

/**
 * The API: sync only. The server keeps no other state and has no sign-in; see the README for how
 * it is kept off the internet.
 */
export function createApp(db: Db, log: (message: string) => void = console.log) {
  const app = new Hono()

  app.get('/api/health', async (c) => {
    await db.query('SELECT 1')
    return c.text('Healthy')
  })

  app.post('/api/sync/push', async (c) => {
    const body = await c.req.json().catch(() => undefined)
    const changes: unknown = body?.changes
    if (changes === undefined || changes === null) return c.json({ rejected: [] })
    if (!Array.isArray(changes)) return c.json(problem('changes must be a list.'), 400)
    if (changes.length === 0) return c.json({ rejected: [] })
    if (changes.length > SyncLimits.maxChangesPerPush)
      return c.json(problem(`At most ${SyncLimits.maxChangesPerPush} changes per push.`), 400)

    // The whole batch is refused if one change is invalid: storing the rest would clear
    // them from the client's outbox and leave the invalid one retried forever in silence.
    const errors: Record<string, string[]> = {}
    changes.forEach((change, index) => {
      const error = isSyncChange(change) ? validateChange({ ...change, data: change.data ?? null }) : 'Not a change.'
      if (error !== null) errors[`changes[${index}]`] = [error]
    })
    if (Object.keys(errors).length > 0)
      return c.json({ title: 'One or more validation errors occurred.', status: 400, errors }, 400)

    const result = await push(
      db,
      changes.map((change) => ({ ...change, data: change.data ?? null })),
    )
    log(`Sync push: ${result.accepted} accepted, ${result.rejected.length} rejected`)
    return c.json({ rejected: result.rejected })
  })

  app.get('/api/sync/pull', async (c) => {
    const raw = c.req.query('since')
    const since = raw === undefined || raw === '' ? 0 : Number(raw)
    if (!Number.isSafeInteger(since)) return c.json(problem('since must be a whole number.'), 400)
    if (since < 0) return c.json(problem('since must not be negative.'), 400)
    return c.json(await pull(db, since))
  })

  // Unknown /api paths answer 404 instead of the app shell, so a mistyped call fails loudly.
  app.all('/api/*', (c) => c.notFound())

  app.onError((error, c) => {
    // Never a stack trace in the answer; the log has it.
    console.error(error)
    return c.json({ title: 'Internal Server Error', status: 500 }, 500)
  })

  return app
}
