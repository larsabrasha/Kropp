import type { Db } from './db'

/**
 * The schema, as numbered steps that run once each, in order. A step is never changed after it
 * has run anywhere; a change to the schema is a new step.
 *
 * Step 1 is the schema the .NET version's EF Core migration "Initial" created, written so that it
 * changes nothing on a database that already has it. That database keeps its __EFMigrationsHistory
 * table; nothing reads it any more.
 */
export const MIGRATIONS: readonly { name: string; sql: string }[] = [
  {
    name: '0001_initial',
    sql: `
      CREATE SEQUENCE IF NOT EXISTS sync_seq;
      CREATE TABLE IF NOT EXISTS "SyncDocuments" (
        "Type" character varying(50) NOT NULL,
        "Id" uuid NOT NULL,
        "ModifiedAt" timestamp with time zone NOT NULL,
        "IsDeleted" boolean NOT NULL,
        "Data" jsonb NULL,
        "ServerSeq" bigint NOT NULL,
        CONSTRAINT "PK_SyncDocuments" PRIMARY KEY ("Type", "Id")
      );
      CREATE UNIQUE INDEX IF NOT EXISTS "IX_SyncDocuments_ServerSeq" ON "SyncDocuments" ("ServerSeq");
    `,
  },
]

// Any fixed number, different from the push lock in sync.ts.
const MIGRATION_LOCK = 0x4b726f7071

/**
 * Brings the schema up to date. Safe to run from several processes at once: they take turns
 * under an advisory lock, and each step runs in the transaction that records it.
 */
export async function migrate(db: Db, log: (message: string) => void = () => {}): Promise<void> {
  await db.query(`CREATE TABLE IF NOT EXISTS kropp_migrations (
    name text PRIMARY KEY,
    applied_at timestamp with time zone NOT NULL DEFAULT now()
  )`)
  for (const step of MIGRATIONS) {
    await db.transaction(async (tx) => {
      await tx.query('SELECT pg_advisory_xact_lock($1)', [MIGRATION_LOCK])
      const done = await tx.query('SELECT 1 FROM kropp_migrations WHERE name = $1', [step.name])
      if (done.length > 0) return
      for (const statement of statements(step.sql)) await tx.query(statement)
      await tx.query('INSERT INTO kropp_migrations (name) VALUES ($1)', [step.name])
      log(`Applied migration ${step.name}`)
    })
  }
}

/** One statement per query: parameterised queries take one statement only. */
const statements = (sql: string) =>
  sql
    .split(';')
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
