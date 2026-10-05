import postgres from 'postgres'

/**
 * The little the server needs from Postgres: a query with $1-style parameters, and a transaction.
 * In production it is a real Postgres (postgres.js, connect); in dev and in the tests it is PGlite,
 * Postgres compiled to WebAssembly (pglite.ts), so neither needs Docker.
 */
export interface Db {
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]>
  transaction<T>(work: (tx: Db) => Promise<T>): Promise<T>
  close(): Promise<void>
}

/**
 * A Db on a real Postgres: at url, or without one from the standard PGHOST, PGPORT, PGDATABASE,
 * PGUSER and PGPASSWORD variables, which need no escaping of the password.
 */
export function connect(url?: string): Db {
  // Notices like "relation already exists, skipping" from the idempotent migration are noise.
  const options = { onnotice: () => {} }
  const sql = url ? postgres(url, options) : postgres(options)
  type Sql = postgres.Sql | postgres.TransactionSql
  const wrap = (s: Sql): Db => ({
    query: async <T>(text: string, params: unknown[] = []) =>
      (await s.unsafe(text, params as postgres.ParameterOrJSON<never>[])) as unknown as T[],
    transaction: (work) => (s as postgres.Sql).begin((tx) => work(wrap(tx))) as never,
    close: () => sql.end(),
  })
  return wrap(sql)
}
