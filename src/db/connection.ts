import { Pool, PoolClient, QueryResult, QueryResultRow } from 'pg'
import { config } from '../config'

export interface DB {
  query<T extends QueryResultRow = any>(text: string, params?: unknown[]): Promise<QueryResult<T>>
}

let pool: Pool | null = null

export function getPool(): Pool {
  if (!pool) {
    pool = new Pool({
      host: config.db.host,
      port: config.db.port,
      database: config.db.database,
      user: config.db.user,
      password: config.db.password,
      max: 10,
    })
    pool.on('error', (err) => {
      console.error('[db] Unexpected pool error:', err.message)
    })
  }
  return pool
}

/** Default DB handle — uses the pool (auto-checkout per query). */
export const db: DB = { query: (...args) => getPool().query(...args) }

export async function withTransaction<T>(fn: (tx: DB) => Promise<T>): Promise<T> {
  const client = await getPool().connect()
  try {
    await client.query('BEGIN')
    const result = await fn(client)
    await client.query('COMMIT')
    return result
  } catch (err) {
    await client.query('ROLLBACK')
    throw err
  } finally {
    client.release()
  }
}

export async function testConnection(): Promise<void> {
  await getPool().query('SELECT 1')
  console.log('[db] Connection OK')
}
