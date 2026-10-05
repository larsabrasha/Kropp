import { getRequestListener } from '@hono/node-server'
import type { Connect, Plugin } from 'vite'
import { createApp } from './app'
import { connect, type Db } from './db'
import { migrate } from './migrate'

/**
 * Runs the API inside Vite's dev server, so `npm run dev` is all it takes and the app and the API
 * share a port. The database is PGlite in ./data/pglite (gitignored; never commit it), or a real
 * Postgres when DATABASE_URL is set. Also in `vite preview`, so the production build can be tried
 * with sync.
 */
export function kroppApi(): Plugin {
  let db: Promise<Db> | null = null
  const open = async () => {
    const url = process.env.DATABASE_URL
    const opened = url ? connect(url) : await (await import('./pglite')).pglite('./data/pglite')
    await migrate(opened, (message) => console.log(`[kropp] ${message}`))
    return opened
  }
  const mount = (middlewares: Connect.Server) => {
    db ??= open()
    const listener = db.then((d) => getRequestListener(createApp(d).fetch))
    middlewares.use((req, res, next) => {
      if (req.url?.startsWith('/api/')) void listener.then((l) => l(req, res))
      else next()
    })
  }
  return {
    name: 'kropp-api',
    configureServer(server) {
      // Vitest starts a Vite server too; it must not open the dev database.
      if (process.env.VITEST) return
      mount(server.middlewares)
    },
    configurePreviewServer(server) {
      mount(server.middlewares)
    },
  }
}
