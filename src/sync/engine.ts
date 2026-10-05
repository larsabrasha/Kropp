import { keyOf, type LocalStore } from './localStore'
import { SyncLimits, type PullResponse, type PushRequest, type PushResponse } from './protocol'

/** The server end of sync. Throws HttpError for an answer that is not OK, anything else when unreachable. */
export interface SyncApi {
  push(request: PushRequest): Promise<PushResponse>
  pull(since: number): Promise<PullResponse>
}

export class HttpError extends Error {
  constructor(readonly status: number) {
    super(`The server answered ${status}.`)
  }
}

/**
 * Idle; Syncing; Offline: the server could not be reached; Failed: the server answered with an
 * error. Local changes wait in the outbox in the last two.
 */
export type SyncState = 'Idle' | 'Syncing' | 'Offline' | 'Failed'

export interface SyncStatus {
  state: SyncState
  pendingCount: number
  lastSyncedAt?: Date
}

export const INITIAL_STATUS: SyncStatus = { state: 'Idle', pendingCount: 0 }

/**
 * Pushes the outbox, then pulls everything newer than the watermark. Only one round runs at a
 * time; a request that arrives during a round makes it run once more when it ends, so a change
 * saved mid-sync is never left waiting for the next trigger.
 */
export class SyncEngine {
  status: SyncStatus = INITIAL_STATUS
  private running: Promise<void> | null = null
  private rerun = false
  private statusListeners = new Set<(status: SyncStatus) => void>()
  private dataListeners = new Set<() => void>()

  constructor(
    private readonly store: LocalStore,
    private readonly api: SyncApi,
  ) {}

  onStatusChange(listener: (status: SyncStatus) => void): () => void {
    this.statusListeners.add(listener)
    return () => this.statusListeners.delete(listener)
  }

  /** Called after a sync stored data from the server, so views can reload. */
  onDataChange(listener: () => void): () => void {
    this.dataListeners.add(listener)
    return () => this.dataListeners.delete(listener)
  }

  sync(): Promise<void> {
    if (this.running) {
      this.rerun = true
      return this.running
    }
    this.running = this.run()
    return this.running
  }

  /** Recounts the outbox after a local save, without contacting the server. */
  async refreshPendingCount() {
    const pending = await this.store.getPending()
    this.setStatus({ ...this.status, pendingCount: pending.length })
  }

  /** Tells the engine the browser has no network, so it does not have to fail a request to find out. */
  async markOffline() {
    const pending = await this.store.getPending()
    this.setStatus({ ...this.status, state: 'Offline', pendingCount: pending.length })
  }

  private async run() {
    try {
      do {
        this.rerun = false
        await this.round()
      } while (this.rerun)
    } finally {
      this.running = null
    }
  }

  private async round() {
    this.setStatus({ ...this.status, state: 'Syncing' })
    let receivedData = false
    try {
      await this.push()
      receivedData = await this.pull()
      const pending = await this.store.getPending()
      this.setStatus({ state: 'Idle', pendingCount: pending.length, lastSyncedAt: new Date() })
    } catch (error) {
      // Nothing is lost here: the outbox is only cleared for changes the server confirmed,
      // and the watermark only moves past changes already stored. The next round retries.
      const unreachable = !(error instanceof HttpError)
      if (unreachable) console.info('Sync could not reach the server:', error)
      else console.warn('Sync failed:', error)
      const pending = await this.store.getPending()
      this.setStatus({ ...this.status, state: unreachable ? 'Offline' : 'Failed', pendingCount: pending.length })
    } finally {
      if (receivedData) this.dataChanged()
    }
  }

  private async push() {
    const pending = await this.store.getPending()
    for (let i = 0; i < pending.length; i += SyncLimits.maxChangesPerPush) {
      const batch = pending.slice(i, i + SyncLimits.maxChangesPerPush)
      const response = await this.api.push({
        changes: batch.map(({ type, id, modifiedAt, isDeleted, data }) => ({ type, id, modifiedAt, isDeleted, data })),
      })

      // Rejected changes lost to a newer copy on the server. Taking that copy settles them;
      // marking the rest synced clears them from the outbox.
      const rejected = new Set(response.rejected.map((r) => keyOf(r.type, r.id)))
      const version = (r: (typeof batch)[number]) => ({ key: r.key, modifiedAt: r.modifiedAt })
      if (rejected.size > 0) {
        await this.store.markSynced(batch.filter((r) => rejected.has(r.key)).map(version))
        await this.store.applyFromServer(response.rejected)
        this.dataChanged()
      }
      await this.store.markSynced(batch.filter((r) => !rejected.has(r.key)).map(version))
    }
  }

  private async pull(): Promise<boolean> {
    let receivedData = false
    let since = await this.store.getWatermark()
    for (;;) {
      const response = await this.api.pull(since)
      if (response.changes.length > 0) {
        await this.store.applyFromServer(response.changes)
        receivedData = true
      }
      // Stored after the changes, so a crash in between re-pulls them instead of skipping them.
      if (response.serverSeq !== since) await this.store.setWatermark(response.serverSeq)
      since = response.serverSeq
      if (!response.hasMore) return receivedData
    }
  }

  private setStatus(status: SyncStatus) {
    const s = this.status
    if (
      s.state === status.state &&
      s.pendingCount === status.pendingCount &&
      s.lastSyncedAt?.getTime() === status.lastSyncedAt?.getTime()
    )
      return
    this.status = status
    for (const listener of this.statusListeners) listener(status)
  }

  private dataChanged() {
    for (const listener of this.dataListeners) listener()
  }
}

/** The SyncApi over HTTP. A short timeout: at the gym a request that hangs is worse than one that fails. */
export function httpSyncApi(base = '', timeoutMs = 15_000): SyncApi {
  async function call<T>(path: string, init?: RequestInit): Promise<T> {
    const response = await fetch(`${base}${path}`, { ...init, signal: AbortSignal.timeout(timeoutMs) })
    if (!response.ok) throw new HttpError(response.status)
    return (await response.json()) as T
  }
  return {
    push: (request) =>
      call('/api/sync/push', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request),
      }),
    pull: (since) => call(`/api/sync/pull?since=${since}`),
  }
}
