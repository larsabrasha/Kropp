import type { SyncRecord } from './protocol'
import {
  fromServer,
  isConfirmedBy,
  keepsLocal,
  keyOf,
  type LocalRecord,
  type LocalStore,
  type PushedVersion,
} from './localStore'

/** LocalStore in memory, for tests. Follows the same rules as the IndexedDB store. */
export class MemoryStore implements LocalStore {
  private records = new Map<string, LocalRecord>()
  private watermark = 0

  async get(key: string) {
    const r = this.records.get(key)
    return r && { ...r }
  }

  async getAll(type: string) {
    return [...this.records.values()].filter((r) => r.type === type).map((r) => ({ ...r }))
  }

  async getPending() {
    return [...this.records.values()].filter((r) => r.pending).map((r) => ({ ...r }))
  }

  async put(record: LocalRecord) {
    this.records.set(record.key, { ...record })
  }

  async markSynced(pushed: readonly PushedVersion[]) {
    for (const p of pushed) {
      const local = this.records.get(p.key)
      if (local && isConfirmedBy(local, p)) this.records.set(p.key, { ...local, pending: false })
    }
  }

  async applyFromServer(incoming: readonly SyncRecord[]) {
    for (const r of incoming) {
      const key = keyOf(r.type, r.id)
      if (keepsLocal(this.records.get(key), r)) continue
      this.records.set(key, fromServer(r))
    }
  }

  async getWatermark() {
    return this.watermark
  }

  async setWatermark(serverSeq: number) {
    this.watermark = serverSeq
  }
}
