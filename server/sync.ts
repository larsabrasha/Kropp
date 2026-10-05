import {
  stampTime,
  SyncLimits,
  type PullResponse,
  type PushResponse,
  type SyncChange,
  type SyncRecord,
} from '../src/sync/protocol'
import type { Db } from './db'

// Any fixed number; it only has to be the same for every push.
const PUSH_LOCK = 0x4b726f7070

interface Row {
  type: string
  id: string
  modifiedAt: Date
  isDeleted: boolean
  data: string | null
  serverSeq: number | string | bigint
}

const COLUMNS = `"Type" AS type, "Id"::text AS id, "ModifiedAt" AS "modifiedAt", "IsDeleted" AS "isDeleted",
  "Data"::text AS data, "ServerSeq" AS "serverSeq"`

const toRecord = (r: Row): SyncRecord => ({
  type: r.type,
  id: r.id,
  modifiedAt: r.modifiedAt.toISOString(),
  isDeleted: r.isDeleted,
  data: r.data,
  serverSeq: Number(r.serverSeq),
})

/** Whole milliseconds in UTC, which is all a stamp may hold (see src/sync/clock.ts). */
const truncate = (iso: string) => new Date(Math.floor(stampTime(iso))).toISOString()

/**
 * Stores a batch in one transaction. Newer modifiedAt wins; an equal or older one is rejected and
 * the server's copy returned, which also makes a repeated push of the same batch harmless.
 */
export async function push(db: Db, changes: readonly SyncChange[]): Promise<PushResponse & { accepted: number }> {
  return db.transaction(async (tx) => {
    // Pushes run one at a time, so sequence numbers are committed in the order they are taken.
    // Without that a pull could see seq 8 before a slower push commits seq 7, move its watermark
    // past 7 and never receive it.
    await tx.query('SELECT pg_advisory_xact_lock($1)', [PUSH_LOCK])

    const rejected = new Map<string, SyncRecord>()
    let accepted = 0
    // Oldest first, so when one batch carries the same aggregate twice the newest ends up stored.
    const ordered = [...changes].sort((a, b) => stampTime(a.modifiedAt) - stampTime(b.modifiedAt))
    for (const change of ordered) {
      const id = change.id.toLowerCase()
      const key = `${change.type}:${id}`
      const modifiedAt = truncate(change.modifiedAt)
      const [existing] = await tx.query<Row>(`SELECT ${COLUMNS} FROM "SyncDocuments" WHERE "Type" = $1 AND "Id" = $2`, [
        change.type,
        id,
      ])
      if (existing && stampTime(modifiedAt) <= existing.modifiedAt.getTime()) {
        rejected.set(key, toRecord(existing))
        continue
      }

      // $5 goes in as text: as a jsonb parameter, postgres.js would encode the string once more
      // and store a JSON string instead of the document.
      await tx.query(
        `INSERT INTO "SyncDocuments" ("Type", "Id", "ModifiedAt", "IsDeleted", "Data", "ServerSeq")
         VALUES ($1, $2, $3::timestamptz, $4, $5::text::jsonb, nextval('sync_seq'))
         ON CONFLICT ("Type", "Id") DO UPDATE SET
           "ModifiedAt" = EXCLUDED."ModifiedAt", "IsDeleted" = EXCLUDED."IsDeleted",
           "Data" = EXCLUDED."Data", "ServerSeq" = EXCLUDED."ServerSeq"`,
        [change.type, id, modifiedAt, change.isDeleted, change.data],
      )
      // A later change to the same aggregate in this batch may have been rejected earlier.
      rejected.delete(key)
      accepted++
    }
    return { rejected: [...rejected.values()], accepted }
  })
}

export async function pull(db: Db, since: number): Promise<PullResponse> {
  const page = await db.query<Row>(
    `SELECT ${COLUMNS} FROM "SyncDocuments" WHERE "ServerSeq" > $1 ORDER BY "ServerSeq" LIMIT $2`,
    [since, SyncLimits.maxChangesPerPull + 1],
  )
  const hasMore = page.length > SyncLimits.maxChangesPerPull
  const changes = page.slice(0, SyncLimits.maxChangesPerPull).map(toRecord)
  return { changes, serverSeq: changes.at(-1)?.serverSeq ?? since, hasMore }
}
