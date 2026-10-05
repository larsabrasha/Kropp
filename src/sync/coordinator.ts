import { purge } from '../training/trash'
import type { SyncEngine } from './engine'
import type { LocalRepository } from './localRepo'

export const SAVE_DEBOUNCE_MS = 3_000
export const INTERVAL_MS = 60_000

/**
 * Decides when to sync: at start, when the network returns, when the app becomes visible,
 * a few seconds after a local save, and every minute while open. iOS offers no background sync,
 * so a closed app catches up the next time it is opened.
 */
export class SyncCoordinator {
  private debounce: ReturnType<typeof setTimeout> | undefined
  private stops: (() => void)[] = []

  constructor(
    private readonly engine: SyncEngine,
    private readonly repository: LocalRepository,
  ) {}

  async start() {
    const online = () => void this.syncNow()
    const offline = () => void this.engine.markOffline()
    const visible = () => {
      if (document.visibilityState === 'visible') void this.syncNow()
    }
    window.addEventListener('online', online)
    window.addEventListener('offline', offline)
    document.addEventListener('visibilitychange', visible)
    this.stops.push(() => {
      window.removeEventListener('online', online)
      window.removeEventListener('offline', offline)
      document.removeEventListener('visibilitychange', visible)
    })
    void requestPersistentStorage()

    this.stops.push(this.repository.onChange(() => this.onLocalChange()))
    await this.purgeTrash()
    await this.engine.refreshPendingCount()

    const interval = setInterval(() => void this.syncNow(), INTERVAL_MS)
    this.stops.push(() => clearInterval(interval))

    // Not awaited: on a weak signal the first round can take until the HTTP timeout, and the
    // app must open at once from local data.
    void this.syncNow()
  }

  stop() {
    clearTimeout(this.debounce)
    for (const stop of this.stops.splice(0)) stop()
  }

  async syncNow() {
    try {
      if (!navigator.onLine) {
        await this.engine.markOffline()
        return
      }
      await this.engine.sync()
    } catch (error) {
      console.warn('Could not start a sync:', error)
    }
  }

  /** Before the first sync, so what is deleted for good goes out with it. */
  private async purgeTrash() {
    try {
      await purge(this.repository)
    } catch (error) {
      console.warn('Could not empty the trash:', error)
    }
  }

  private onLocalChange() {
    void this.engine.refreshPendingCount()
    clearTimeout(this.debounce)
    this.debounce = setTimeout(() => void this.syncNow(), SAVE_DEBOUNCE_MS)
  }
}

/**
 * Asks the browser not to evict the IndexedDB data under storage pressure. Safari may still
 * decline; the server copy is the backup either way.
 */
async function requestPersistentStorage(): Promise<boolean> {
  try {
    return (await navigator.storage?.persist?.()) ?? false
  } catch {
    return false
  }
}
