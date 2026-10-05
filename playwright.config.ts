import { defineConfig, devices } from '@playwright/test'

// Not 4173 (a `vite preview` of your own), 5173 or 5288 (.claude/launch.json).
const port = 4317

/**
 * End-to-end tests against the production build: the service worker exists only there. Run with
 * `npm run e2e`; vitest never picks these up (vite.config.ts).
 */
export default defineConfig({
  testDir: 'e2e',
  forbidOnly: !!process.env.CI,
  reporter: 'list',
  use: { baseURL: `http://localhost:${port}`, trace: 'retain-on-failure' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    // vite build, not npm run build: the type check is a step of its own and need not pass first.
    command: `npx vite build && npx vite preview --port ${port} --strictPort`,
    url: `http://localhost:${port}`,
    // Never another server on the port: one started by hand syncs with the dev database, and the
    // test would push its workout there.
    reuseExistingServer: false,
    timeout: 180_000,
    // An empty database in memory, not ./data/pglite or a Postgres in DATABASE_URL (devPlugin.ts).
    env: { KROPP_PGLITE_DIR: 'memory://', DATABASE_URL: '' },
  },
})
