import { config, validate, scrubEnv } from './config'
import { testConnection, getPool } from './db/connection'
import { buildServer } from './api/server'
import { scheduler } from './worker/scheduler'
import * as provisioner from './worker/provisioner'

async function main(): Promise<void> {
  console.log('Starting Q...')

  // Validate config (reads env vars)
  validate()

  // Wipe process.env — config already has everything; nothing should leak to child processes
  scrubEnv()

  // Test DB connection
  await testConnection()

  // Stop any orphaned containers from a previous crash
  await provisioner.stopAll()

  // Start HTTP server
  const app = await buildServer()
  await app.listen({ port: config.port, host: '0.0.0.0' })
  console.log(`Server listening on port ${config.port}`)

  // Start worker scheduler
  scheduler.start()

  console.log('Q is running')
  if (config.dryRun) {
    console.log('⚠️  DRY RUN MODE — Docker and Claude will not be used')
  }

  // Start dev proxy if configured
  let proxyServer: import('http').Server | undefined
  if (config.proxyDomain) {
    const { createProxyServer } = await import('./proxy/proxy')
    proxyServer = createProxyServer()
    await new Promise<void>((resolve) => proxyServer!.listen(config.proxyPort, '0.0.0.0', resolve))
    console.log(`Dev proxy listening on port ${config.proxyPort} (*.${config.proxyDomain})`)
  }

  // Graceful shutdown
  const shutdown = async () => {
    console.log('\nShutting down...')
    scheduler.stop()
    if (proxyServer) await new Promise<void>((resolve) => proxyServer!.close(() => resolve()))
    await provisioner.stopAll()
    await app.close()
    await getPool().end()
    process.exit(0)
  }
  process.on('SIGINT', () => void shutdown())
  process.on('SIGTERM', () => void shutdown())
}

main().catch(err => {
  console.error('Fatal error:', err)
  process.exit(1)
})
