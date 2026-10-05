import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import { currentLanguage } from './i18n/i18n'
import './index.css'
import { startPwa } from './pwa'
import { followSync, ServicesProvider } from './services'
import { SyncCoordinator } from './sync/coordinator'
import { httpSyncApi, SyncEngine } from './sync/engine'
import { IndexedDbStore } from './sync/indexedDbStore'
import { LocalRepository } from './sync/localRepo'

document.documentElement.lang = currentLanguage()

const store = new IndexedDbStore()
const repository = new LocalRepository(store)
const engine = new SyncEngine(store, httpSyncApi())
const coordinator = new SyncCoordinator(engine, repository)

followSync(repository, engine)
startPwa()

// Every aggregate into memory before the first render, so no page ever renders without its data
// (LocalRepository); the spinner in index.html shows meanwhile. Without IndexedDB (a private
// window, storage blocked) the app still opens, and the pages show that they could not read.
await repository.load().catch((error: unknown) => console.error('Could not read the local data:', error))
coordinator.start().catch((error) => console.error('Sync could not start:', error))

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ServicesProvider services={{ repository, engine, coordinator }}>
      <App />
    </ServicesProvider>
  </StrictMode>,
)
