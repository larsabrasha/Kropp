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

// The app's local copy of every aggregate, in IndexedDB. The database, its stores and the record
// shape are the ones the .NET version created (kropp-db.js), so an installed app keeps its data
// and its outbox across the update. Change them only with an upgrade step for existing databases.
const DB_NAME = 'kropp'
const DB_VERSION = 1
const RECORDS = 'records'
const META = 'meta'
const WATERMARK = 'watermark'

function request<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

export class IndexedDbStore implements LocalStore {
  private db: Promise<IDBDatabase> | null = null

  constructor(private readonly name = DB_NAME) {}

  private open(): Promise<IDBDatabase> {
    if (this.db) return this.db
    this.db = new Promise((resolve, reject) => {
      const req = indexedDB.open(this.name, DB_VERSION)
      req.onupgradeneeded = () => {
        const db = req.result
        const records = db.createObjectStore(RECORDS, { keyPath: 'key' })
        records.createIndex('type', 'type')
        db.createObjectStore(META, { keyPath: 'name' })
      }
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => {
        this.db = null
        reject(req.error)
      }
    })
    return this.db
  }

  /**
   * Runs work inside one transaction and resolves when it has committed, so a caller never sees
   * success for a write the browser then rolled back. work must only await IndexedDB requests of
   * this transaction, or the transaction commits early.
   */
  private async transaction<T>(
    stores: string[],
    mode: IDBTransactionMode,
    work: (tx: IDBTransaction) => Promise<T>,
  ): Promise<T> {
    const db = await this.open()
    return new Promise<T>((resolve, reject) => {
      const tx = db.transaction(stores, mode)
      let result: T
      tx.oncomplete = () => resolve(result)
      tx.onerror = () => reject(tx.error)
      tx.onabort = () => reject(tx.error)
      work(tx).then(
        (r) => {
          result = r
        },
        (e) => {
          tx.abort()
          reject(e)
        },
      )
    })
  }

  async get(key: string) {
    const r = await this.transaction([RECORDS], 'readonly', (tx) =>
      request<LocalRecord | undefined>(tx.objectStore(RECORDS).get(key)),
    )
    return r ?? undefined
  }

  getAll(type: string) {
    return this.transaction([RECORDS], 'readonly', (tx) =>
      request<LocalRecord[]>(tx.objectStore(RECORDS).index('type').getAll(type)),
    )
  }

  async getPending() {
    // Booleans cannot be indexed in IndexedDB; the data set is small enough to scan.
    const all = await this.transaction([RECORDS], 'readonly', (tx) =>
      request<LocalRecord[]>(tx.objectStore(RECORDS).getAll()),
    )
    return all.filter((r) => r.pending)
  }

  async put(record: LocalRecord) {
    await this.transaction([RECORDS], 'readwrite', (tx) => request(tx.objectStore(RECORDS).put(record)))
  }

  async markSynced(pushed: readonly PushedVersion[]) {
    if (pushed.length === 0) return
    await this.transaction([RECORDS], 'readwrite', async (tx) => {
      const store = tx.objectStore(RECORDS)
      for (const p of pushed) {
        const local = await request<LocalRecord | undefined>(store.get(p.key))
        if (local && isConfirmedBy(local, p)) await request(store.put({ ...local, pending: false }))
      }
    })
  }

  async applyFromServer(records: readonly SyncRecord[]) {
    if (records.length === 0) return
    await this.transaction([RECORDS], 'readwrite', async (tx) => {
      const store = tx.objectStore(RECORDS)
      for (const r of records) {
        const local = await request<LocalRecord | undefined>(store.get(keyOf(r.type, r.id)))
        if (keepsLocal(local, r)) continue
        await request(store.put(fromServer(r)))
      }
    })
  }

  async getWatermark() {
    const meta = await this.transaction([META], 'readonly', (tx) =>
      request<{ name: string; value: number } | undefined>(tx.objectStore(META).get(WATERMARK)),
    )
    return meta?.value ?? 0
  }

  async setWatermark(serverSeq: number) {
    await this.transaction([META], 'readwrite', (tx) =>
      request(tx.objectStore(META).put({ name: WATERMARK, value: serverSeq })),
    )
  }
}
