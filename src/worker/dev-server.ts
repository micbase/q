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

async function setStatus(ticketId: string, status: DevServerStatus, pid = 0): Promise<void> {
  await db.updateTicketDevServerStatus(ticketId, status, pid)
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
  await stopDevServer(ticketId, containerId, logTag)

  await setStatus(ticketId, 'starting')

  const t = `[dev ${logTag}]`
  console.log(`${t} Running in ${workDir}: ${command}`)

  const env = parseEnvs(devEnvs)
  const { exec, duplex, stdout, stderr } = await execInteractive(containerId, ['sh', '-c', command], {
    Env: env.length > 0 ? env : undefined,
    WorkingDir: workDir,
    User: config.containerUser,
  })

  let pid = 0
  try {
    const info = await exec.inspect()
    pid = info.Pid ?? 0
  } catch (err) {
    console.warn(`${t} Could not inspect exec PID:`, err)
  }

  await setStatus(ticketId, 'running', pid)

  stderr.on('data', (chunk: Buffer) => {
    console.error(`${t} ${chunk.toString().trimEnd()}`)
  })
  stdout.on('data', (chunk: Buffer) => {
    console.log(`${t} ${chunk.toString().trimEnd()}`)
  })

  // Conditional exit handler: only updates DB if our pid is still current,
  // preventing a stale closure from clobbering a newly started server's status.
  let exited = false
  const onExit = (eventStatus: DevServerStatus) => {
    if (exited) return
    exited = true
    db.updateTicketDevServerStatusIfPid(ticketId, eventStatus, pid)
      .then(updated => {
        if (updated) broker.publish({ type: 'DevServerStatusChange', ticket_id: ticketId, dev_server_status: eventStatus })
      })
      .catch(err => console.error(`${t} Failed to persist dev server status:`, err))
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

export async function stopDevServer(ticketId: string, containerId: string, logTag: string): Promise<void> {
  const ticket = await db.getTicket(ticketId)
  const pid = ticket?.dev_server_pid ?? 0

  if (pid > 0) {
    console.log(`[dev ${logTag}] Stopping dev server (pid ${pid})`)
    try {
      // Kill the entire process group so background children spawned with & are also terminated
      await execInContainer(containerId, ['kill', '-9', `-${pid}`], logTag, { User: 'root' })
    } catch {
      // Process may have already exited — that's fine
    }
  }

  await setStatus(ticketId, 'stopped')
}

/** Clear dev server state when a container is stopped — no kill needed, container is going down */
export async function clearDevServer(ticketId: string): Promise<void> {
  await setStatus(ticketId, 'stopped')
}
