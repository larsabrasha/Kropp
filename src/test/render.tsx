import { cleanup, render } from '@testing-library/react'
import { afterEach, beforeEach, vi } from 'vitest'
import { App } from '../App'
import { setLanguage } from '../i18n/i18n'
import { ServicesProvider } from '../services'
import { SyncEngine } from '../sync/engine'
import { LocalRepository } from '../sync/localRepo'
import { MemoryStore } from '../sync/memoryStore'
import { FakeSyncApi } from './fakeSyncApi'

// For component tests (with `// @vitest-environment happy-dom` at the top of the file): the app in
// Swedish, with its local store in memory, on 23 September 2026, as the .NET tests had it.

export const TODAY = '2026-09-23'
export const NOW = new Date('2026-09-23T10:00:00Z')

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

beforeEach(() => {
  setLanguage('sv')
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(NOW)
})

export interface TestApp {
  store: MemoryStore
  repository: LocalRepository
  engine: SyncEngine
  api: FakeSyncApi
  /** Renders the whole app at path, as if the user had opened that URL. */
  renderAt(path: string): ReturnType<typeof render>
}

/** A fresh local store and app. Seed it through repository before renderAt. */
export function createTestApp(): TestApp {
  const store = new MemoryStore()
  const repository = new LocalRepository(store)
  const api = new FakeSyncApi()
  const engine = new SyncEngine(store, api)
  return {
    store,
    repository,
    engine,
    api,
    renderAt(path) {
      window.history.replaceState(null, '', path)
      return render(
        <ServicesProvider services={{ repository, engine }}>
          <App />
        </ServicesProvider>,
      )
    },
  }
}
