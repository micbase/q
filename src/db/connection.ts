import mysql from 'mysql2/promise'
import { config } from '../config'

let pool: mysql.Pool | null = null

export function getPool(): mysql.Pool {
  if (!pool) {
    pool = mysql.createPool({
      host: config.db.host,
      port: config.db.port,
      database: config.db.database,
      user: config.db.user,
      password: config.db.password,
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0,
      timezone: '+00:00',
    })
  }
  return pool
}

export async function testConnection(): Promise<void> {
  const conn = await getPool().getConnection()
  await conn.ping()
  conn.release()
  console.log('Database connection OK')
}
