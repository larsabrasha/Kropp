import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import { currentLanguage } from './i18n/i18n'
import './index.css'
import { startPwa } from './pwa'
import { ServicesProvider } from './services'
import { SyncCoordinator } from './sync/coordinator'
import { httpSyncApi, SyncEngine } from './sync/engine'
import { IndexedDbStore } from './sync/indexedDbStore'
import { LocalRepository } from './sync/localRepo'

document.documentElement.lang = currentLanguage()

const store = new IndexedDbStore()
const repository = new LocalRepository(store)
const engine = new SyncEngine(store, httpSyncApi())
const coordinator = new SyncCoordinator(engine, repository)

// Without IndexedDB (a private window, storage blocked) the app still opens; saving then shows
// its own error instead of the whole app failing to start.
coordinator.start().catch((error) => console.error('Sync could not start:', error))
startPwa()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ServicesProvider services={{ repository, engine, coordinator }}>
      <App />
    </ServicesProvider>
  </StrictMode>,
)
