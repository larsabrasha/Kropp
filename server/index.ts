import { serve } from '@hono/node-server'
import { serveStatic } from '@hono/node-server/serve-static'
import { createApp } from './app'
import { connect } from './db'
import { migrate } from './migrate'

/**
 * The production server: the API under /api and the built app (dist/) for everything else.
 * It brings the database schema up to date before it starts listening.
 *
 * Environment:
 *   DATABASE_URL   postgres://user:password@host/db; without it PGHOST, PGPORT, PGDATABASE,
 *                  PGUSER and PGPASSWORD are used (see docker-compose.yaml)
 *   PORT           (8080)
 *   STATIC_DIR     (./dist)
 */
const port = Number(process.env.PORT ?? 8080)
const staticDir = process.env.STATIC_DIR ?? './dist'

const db = connect(process.env.DATABASE_URL || undefined)
await migrate(db, (message) => console.log(`[kropp] ${message}`))

const app = createApp(db, (message) => console.log(`[kropp] ${message}`))

// Files with a hash in the name never change; everything else (index.html, the service worker,
// the manifest) must be checked every time, or phones get stuck on an old version.
app.use('/*', async (c, next) => {
  await next()
  if (c.req.path.startsWith('/api/')) return
  const immutable = c.req.path.startsWith('/assets/') && c.res.status === 200
  c.header('Cache-Control', immutable ? 'public, max-age=31536000, immutable' : 'no-cache')
})
app.use('/*', serveStatic({ root: staticDir }))
// Every other path is a page of the app, which finds its way from the URL.
app.get('*', serveStatic({ path: `${staticDir}/index.html` }))

const server = serve({ fetch: app.fetch, port }, (info) => console.log(`[kropp] Listening on port ${info.port}`))

for (const signal of ['SIGINT', 'SIGTERM'] as const)
  process.on(signal, () => {
    server.close()
    void db.close().finally(() => process.exit(0))
  })
