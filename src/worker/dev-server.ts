import { execInContainer, execInteractive } from './docker'
import { broker } from '../broker/broker'
import { config } from '../config'
import * as db from '../db/queries'
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
  logTag: string
  containerId: string
  command: string
  workDir: string
  devEnvs?: string
}

// In-memory map: ticketId → dev server state
const servers = new Map<string, DevServerEntry>()

async function setStatus(ticketId: string, status: DevServerStatus): Promise<void> {
  await db.updateTicketDevServerStatus(ticketId, status)
  broker.publish({ type: 'DevServerStatusChange', ticket_id: ticketId, dev_server_status: status })
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
    logTag,
    containerId,
    command,
    workDir,
    devEnvs,
  }
  servers.set(ticketId, entry)
  await setStatus(ticketId, 'starting')

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

  await setStatus(ticketId, 'running')

  stderr.on('data', (chunk: Buffer) => {
    console.error(`${t} ${chunk.toString().trimEnd()}`)
  })
  stdout.on('data', (chunk: Buffer) => {
    console.log(`${t} ${chunk.toString().trimEnd()}`)
  })

  // Detect process exit — deduplicate end/close with a flag, fire-and-forget DB write
  let exited = false
  const onExit = (eventStatus: DevServerStatus) => {
    if (exited) return
    exited = true
    if (servers.get(ticketId) === entry) servers.delete(ticketId)
    setStatus(ticketId, eventStatus).catch(err =>
      console.error(`${t} Failed to persist dev server status:`, err))
  }

  duplex.on('end', () => {
    console.log(`${t} Dev server exited`)
    onExit('stopped')
  })
  duplex.on('close', () => onExit('stopped'))
  duplex.on('error', (err: Error) => {
    console.error(`${t} Dev server stream error:`, err)
    onExit('error')
  })
}

export async function stopDevServer(ticketId: string): Promise<void> {
  const entry = servers.get(ticketId)
  if (!entry) return

  servers.delete(ticketId)
  console.log(`[dev ${entry.logTag}] Stopping dev server (pid ${entry.pid})`)

  if (entry.pid > 0) {
    try {
      // Kill the entire process group (negative PID) so background children
      // spawned with & are also terminated (e.g. "npm start & cd ui && npm run dev")
      await execInContainer(entry.containerId, ['kill', '-9', `-${entry.pid}`], entry.logTag, { User: 'root' })
    } catch {
      // Process may have already exited — that's fine
    }
  }

  await setStatus(ticketId, 'stopped')
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
export async function clearDevServer(ticketId: string): Promise<void> {
  const entry = servers.get(ticketId)
  if (!entry) return
  servers.delete(ticketId)
  await setStatus(ticketId, 'stopped')
}
