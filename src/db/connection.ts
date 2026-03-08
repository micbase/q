import { Pool } from 'pg'
import { config } from '../config'

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
  }
  return pool
}

export async function testConnection(): Promise<void> {
  await getPool().query('SELECT 1')
  console.log('Database connection OK')
}
