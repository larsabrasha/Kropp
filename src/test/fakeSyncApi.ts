import { HttpError, type SyncApi } from '../sync/engine'
import { keyOf } from '../sync/localStore'
import {
  SyncLimits,
  stampTime,
  type PullResponse,
  type PushRequest,
  type PushResponse,
  type SyncChange,
  type SyncRecord,
} from '../sync/protocol'

/**
 * A server in memory with the same rules as the real one: newer modifiedAt wins, an equal or
 * older one is rejected with the server's copy, and every accepted write gets the next number.
 */
export class FakeSyncApi implements SyncApi {
  private documents = new Map<string, SyncRecord>()
  private seq = 0

  pageSize: number = SyncLimits.maxChangesPerPull
  failWith: Error | null = null
  duringPush: (() => Promise<void>) | null = null
  pushes: PushRequest[] = []
  pulls: number[] = []

  get all(): SyncRecord[] {
    return [...this.documents.values()]
  }

  async push(request: PushRequest): Promise<PushResponse> {
    if (this.failWith) throw this.failWith
    this.pushes.push(request)
    if (this.duringPush) await this.duringPush()

    const rejected: SyncRecord[] = []
    for (const change of [...request.changes].sort((a, b) => stampTime(a.modifiedAt) - stampTime(b.modifiedAt))) {
      const key = keyOf(change.type, change.id)
      const existing = this.documents.get(key)
      if (existing && stampTime(change.modifiedAt) <= stampTime(existing.modifiedAt)) {
        rejected.push(existing)
        continue
      }
      this.documents.set(key, { ...change, serverSeq: ++this.seq })
    }
    return { rejected }
  }

  async pull(since: number): Promise<PullResponse> {
    if (this.failWith) throw this.failWith
    this.pulls.push(since)
    const page = this.all
      .filter((d) => d.serverSeq > since)
      .sort((a, b) => a.serverSeq - b.serverSeq)
      .slice(0, this.pageSize + 1)
    const changes = page.slice(0, this.pageSize)
    return { changes, serverSeq: changes.at(-1)?.serverSeq ?? since, hasMore: page.length > this.pageSize }
  }

  /** Stores a change as if another device had pushed it. */
  seedFromOtherDevice(change: SyncChange): SyncRecord {
    const record = { ...change, serverSeq: ++this.seq }
    this.documents.set(keyOf(change.type, change.id), record)
    return record
  }

  static unreachable = () => new TypeError('Failed to fetch')
  static serverError = () => new HttpError(500)
}
