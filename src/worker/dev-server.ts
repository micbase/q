import { execInContainer, execInteractive } from './docker'
import { broker } from '../broker/broker'
import { config } from '../config'
import * as db from '../db/queries'
import type { DevServerStatus } from '../../shared/types'
import { appendLog } from '../logs/log-buffer'

function parseEnvs(devEnvs?: string): string[] {
  if (!devEnvs) return []
  return devEnvs
    .split('\n')
    .map(line => line.trim())
    .filter(line => line && !line.startsWith('#'))
}

// In-memory map: ticketId → container-namespace pid (used to detect stale exit events)
const pids = new Map<string, number>()
// In-memory map: ticketId → pid file path inside the container
const pidFiles = new Map<string, string>()

async function setStatus(ticketId: string, status: DevServerStatus): Promise<void> {
  await db.updateTicketDevServerStatus(ticketId, status)
  broker.publishStatus({ type: 'DevServerStatusChange', ticket_id: ticketId, dev_server_status: status })
}

export async function startDevServer(
  containerId: string,
  ticketId: string,
  command: string,
  workDir: string,
  logTag: string,
  devEnvs?: string,
): Promise<void> {
  await stopDevServer(ticketId, containerId, logTag)

  await setStatus(ticketId, 'starting')

  const t = `[dev ${logTag}]`
  console.log(`${t} Running in ${workDir}: ${command}`)

  // Write the shell's own container-namespace PID to a temp file before exec-ing the
  // real command. This gives us the correct in-container PID to use when killing later
  // (exec.inspect().Pid is the *host*-namespace PID which doesn't exist inside the container).
  const pidFile = `/tmp/.q-devpid-${ticketId}`
  const wrappedCmd = ['sh', '-c', `printf '%s' "$$" > "${pidFile}" && exec sh -c "$@"`, 'sh', command]

  const env = parseEnvs(devEnvs)
  const { duplex, stdout, stderr } = await execInteractive(containerId, wrappedCmd, {
    Env: env.length > 0 ? env : undefined,
    WorkingDir: workDir,
    User: config.containerUser,
  })

  // Read the container PID back from the file we just wrote.
  // Retry a few times with short delays to handle the scheduling race between
  // Docker starting the exec and the shell writing the pid file.
  let pid = 0
  for (let attempt = 0; attempt < 5; attempt++) {
    if (attempt > 0) await new Promise(r => setTimeout(r, 100))
    try {
      const pidStr = await execInContainer(containerId, ['cat', pidFile], logTag, { User: 'root' })
      pid = parseInt(pidStr.trim(), 10) || 0
      if (pid > 0) break
    } catch { /* file not written yet — retry */ }
  }
  if (!pid) console.warn(`${t} Could not read container PID from ${pidFile}`)

  pids.set(ticketId, pid)
  pidFiles.set(ticketId, pidFile)
  await setStatus(ticketId, 'running')

  stderr.on('data', (chunk: Buffer) => {
    const line = chunk.toString().trimEnd()
    console.error(`${t} ${line}`)
    for (const l of line.split('\n')) appendLog(ticketId, l)
  })
  stdout.on('data', (chunk: Buffer) => {
    const line = chunk.toString().trimEnd()
    console.log(`${t} ${line}`)
    for (const l of line.split('\n')) appendLog(ticketId, l)
  })

  // Only update status on exit if this pid is still the current one (guards against
  // a stale closure firing after a new server has already started for the same ticket)
  let exited = false
  const onExit = (status: DevServerStatus) => {
    if (exited) return
    exited = true
    if (pids.get(ticketId) === pid) {
      pids.delete(ticketId)
      pidFiles.delete(ticketId)
      setStatus(ticketId, status).catch(err =>
        console.error(`${t} Failed to persist dev server status:`, err))
    }
  }

  duplex.on('end', () => { console.log(`${t} Dev server exited`); onExit('stopped') })
  duplex.on('close', () => onExit('stopped'))
  duplex.on('error', (err: Error) => { console.error(`${t} Dev server stream error:`, err); onExit('error') })
}

export async function stopDevServer(ticketId: string, containerId: string, logTag: string): Promise<void> {
  const pid = pids.get(ticketId) ?? 0
  const pidFile = pidFiles.get(ticketId)
  pids.delete(ticketId)
  pidFiles.delete(ticketId)

  if (pid > 0) {
    console.log(`[dev ${logTag}] Stopping dev server (container pid ${pid})`)
    try {
      // Kill by actual PGID (read from /proc) so all children die regardless of
      // whether Docker exec set the process as a new process group leader.
      // Fall back to a direct kill if the group kill fails.
      await execInContainer(containerId, ['sh', '-c',
        `pgid=$(awk '{print $5}' /proc/${pid}/stat 2>/dev/null); ` +
        `[ -n "$pgid" ] && [ "$pgid" -gt 1 ] 2>/dev/null && kill -9 -$pgid 2>/dev/null; ` +
        `kill -9 ${pid} 2>/dev/null; true`
      ], logTag, { User: 'root' })
    } catch {
      // Process may have already exited — that's fine
    }
  }

  if (pidFile) {
    try {
      await execInContainer(containerId, ['rm', '-f', pidFile], logTag, { User: 'root' })
    } catch {
      // Best-effort cleanup
    }
  }

  await setStatus(ticketId, 'stopped')
}
