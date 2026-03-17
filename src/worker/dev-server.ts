import { execInContainer, execInteractive } from './docker'
import { broker } from '../broker/broker'
import { config } from '../config'
import type { DevServerStatus } from '../../shared/types'

function parseEnvs(devEnvs?: string): string[] {
  if (!devEnvs) return []
  return devEnvs
    .split('\n')
    .map(line => line.trim())
    .filter(line => line && !line.startsWith('#'))
}

interface DevServerEntry {
  pid: number
  status: DevServerStatus
  logTag: string
  containerId: string
  command: string
  workDir: string
  devEnvs?: string
}

// In-memory map: ticketId → dev server state
const servers = new Map<string, DevServerEntry>()

function broadcastStatus(ticketId: string, status: DevServerStatus): void {
  broker.publish({ type: 'DevServerStatusChange', ticket_id: ticketId, dev_server_status: status })
}

function setEntryStatus(ticketId: string, status: DevServerStatus): void {
  const entry = servers.get(ticketId)
  if (entry) entry.status = status
  broadcastStatus(ticketId, status)
}

export function getDevServerStatus(ticketId: string): DevServerStatus {
  return servers.get(ticketId)?.status ?? 'stopped'
}

export async function startDevServer(
  containerId: string,
  ticketId: string,
  command: string,
  workDir: string,
  logTag: string,
  devEnvs?: string,
): Promise<void> {
  // Stop any existing dev server for this ticket first
  await stopDevServer(ticketId)

  const entry: DevServerEntry = {
    pid: 0,
    status: 'starting',
    logTag,
    containerId,
    command,
    workDir,
    devEnvs,
  }
  servers.set(ticketId, entry)
  broadcastStatus(ticketId, 'starting')

  const t = `[dev ${logTag}]`
  console.log(`${t} Running in ${workDir}: ${command}`)

  const env = parseEnvs(devEnvs)
  const { exec, duplex, stdout, stderr } = await execInteractive(containerId, ['sh', '-c', command], {
    Env: env.length > 0 ? env : undefined,
    WorkingDir: workDir,
    User: config.containerUser,
  })

  // Get the PID of the launched process so we can kill it later
  try {
    const info = await exec.inspect()
    entry.pid = info.Pid ?? 0
  } catch (err) {
    console.warn(`${t} Could not inspect exec PID:`, err)
  }

  entry.status = 'running'
  broadcastStatus(ticketId, 'running')

  stderr.on('data', (chunk: Buffer) => {
    console.error(`${t} ${chunk.toString().trimEnd()}`)
  })
  stdout.on('data', (chunk: Buffer) => {
    console.log(`${t} ${chunk.toString().trimEnd()}`)
  })

  // Detect process exit
  duplex.on('end', () => {
    const current = servers.get(ticketId)
    if (current && current.pid === entry.pid) {
      console.log(`${t} Dev server exited`)
      current.status = 'stopped'
      broadcastStatus(ticketId, 'stopped')
      servers.delete(ticketId)
    }
  })
  duplex.on('close', () => {
    const current = servers.get(ticketId)
    if (current && current.pid === entry.pid) {
      current.status = 'stopped'
      broadcastStatus(ticketId, 'stopped')
      servers.delete(ticketId)
    }
  })
  duplex.on('error', (err: Error) => {
    console.error(`${t} Dev server stream error:`, err)
    const current = servers.get(ticketId)
    if (current && current.pid === entry.pid) {
      current.status = 'error'
      broadcastStatus(ticketId, 'error')
      servers.delete(ticketId)
    }
  })
}

export async function stopDevServer(ticketId: string): Promise<void> {
  const entry = servers.get(ticketId)
  if (!entry) return

  servers.delete(ticketId)
  console.log(`[dev ${entry.logTag}] Stopping dev server (pid ${entry.pid})`)

  if (entry.pid > 0) {
    try {
      // Kill the process group to catch child processes spawned by the shell
      await execInContainer(entry.containerId, ['kill', '-9', String(entry.pid)], entry.logTag, { User: 'root' })
    } catch {
      // Process may have already exited — that's fine
    }
  }

  broadcastStatus(ticketId, 'stopped')
}

/** Restart the dev server for a ticket (stop then start with same params) */
export async function restartDevServer(ticketId: string): Promise<void> {
  const entry = servers.get(ticketId)
  if (!entry) throw new Error('No dev server running for this ticket')
  const { containerId, command, workDir, logTag, devEnvs } = entry
  await stopDevServer(ticketId)
  await startDevServer(containerId, ticketId, command, workDir, logTag, devEnvs)
}

/** Clear state when a container is stopped (no kill needed, container is gone) */
export function clearDevServer(ticketId: string): void {
  const entry = servers.get(ticketId)
  if (!entry) return
  servers.delete(ticketId)
  broadcastStatus(ticketId, 'stopped')
}
