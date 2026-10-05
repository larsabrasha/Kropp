import { PGlite, type Transaction } from '@electric-sql/pglite'
import type { Db } from './db'

/**
 * A Db on PGlite, for dev and tests: in memory, or in a folder when dataDir is given. PGlite is
 * a dev dependency, so production code never imports this file.
 */
export async function pglite(dataDir?: string): Promise<Db> {
  const pg = await PGlite.create(dataDir)
  const wrap = (s: PGlite | Transaction): Db => ({
    query: async <T>(sql: string, params: unknown[] = []) => (await s.query<T>(sql, params)).rows,
    transaction: (work) => ('transaction' in s ? s.transaction((tx) => work(wrap(tx))) : work(wrap(s))),
    close: () => pg.close(),
  })
  return wrap(pg)
}
