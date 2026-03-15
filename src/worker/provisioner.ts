import { config } from '../config'
import * as db from '../db/queries'
import type { Project, ContainerStatus } from '../../shared/types'
import { getDocker, execInContainer } from './docker'
import { broker } from '../broker/broker'
import { getInstallationToken, cloneRepoIfNeeded, setupGitCredentials, setupGitIdentity, pushWorktree, removeWorktree } from './github'
const LABEL_MANAGED = 'q.managed'

const TOKEN_MAX_AGE_MS = 55 * 60 * 1000 // refresh credentials before 1h expiry

interface ContainerEntry { id: string; logTag: string; credentialsAt?: number; ip?: string }

// In-memory map: ticketId → docker container id + credential age (not status — status lives in DB)
const containers = new Map<string, ContainerEntry>()
// Idle timers: ticketId → timer handle
const idleTimers = new Map<string, ReturnType<typeof setTimeout>>()

async function setContainerStatus(ticketId: string, status: ContainerStatus): Promise<void> {
  await db.updateTicketContainerStatus(ticketId, status)
  broker.publish({ type: 'ContainerStatusChange', ticket_id: ticketId, container_status: status })
}

async function refreshCredentials(entry: ContainerEntry, project: Project): Promise<void> {
  if (!project.github_repo || !config.githubAppId) return
  const age = Date.now() - (entry.credentialsAt ?? 0)
  if (age < TOKEN_MAX_AGE_MS) return
  const token = await getInstallationToken(project.github_repo)
  await setupGitCredentials(entry.id, token, entry.logTag)
  entry.credentialsAt = Date.now()
}

// ─── Container IP ─────────────────────────────────────────────────────────────

export async function getContainerIp(ticketId: string): Promise<string | null> {
  const entry = containers.get(ticketId)
  if (!entry) return null
  if (entry.ip) return entry.ip

  try {
    const info = await getDocker().getContainer(entry.id).inspect()
    const ip = info.NetworkSettings?.Networks?.bridge?.IPAddress
    if (!ip) return null
    entry.ip = ip
    return ip
  } catch {
    return null
  }
}

/** Get the log tag for a ticket's container */
export function getContainerTag(ticketId: string): string {
  return containers.get(ticketId)?.logTag ?? ticketId
}

// ─── Ensure running ───────────────────────────────────────────────────────────

export async function ensureRunning(project: Project, ticketId: string): Promise<string> {
  const existing = containers.get(ticketId)
  if (existing) {
    cancelIdleTimer(ticketId)
    await refreshCredentials(existing, project)
    return existing.id
  }

  console.log(`[provisioner] Starting container for ticket ${ticketId} (project ${project.name})`)
  await setContainerStatus(ticketId, 'starting')

  const container = await getDocker().createContainer({
    Image: config.projectImage,
    Labels: { [LABEL_MANAGED]: 'true' },
    HostConfig: {
      Binds: [
        `${config.projectsDir}/${project.name}:/workspace`,
        `${config.projectsDir}/.claude-sessions/${ticketId}:/home/claude/.claude`,
        `${config.projectsDir}/.claude-sessions/.credentials.json:/home/claude/.claude/.credentials.json`,
      ],
    },
  })

  await container.start()

  const info = await container.inspect()
  const id = info.Id
  const logTag = `${project.name} ${ticketId} ${id.slice(0, 12)}`

  // Bind-mounted dirs are owned by host UID — chown so claude user can write
  await execInContainer(id, ['chown', '-R', 'claude:claude', '/workspace', '/home/claude/.claude'], logTag)

  await setupGitIdentity(id, logTag)
  await execInContainer(id, ['git', 'config', '--global', '--add', 'safe.directory', '*'], logTag)

  const entry: ContainerEntry = { id, logTag }
  await refreshCredentials(entry, project)
  if (project.github_repo) {
    await cloneRepoIfNeeded(id, project.github_repo, logTag)
  }

  containers.set(ticketId, entry)
  await setContainerStatus(ticketId, 'running')

  console.log(`[provisioner] Container started for ticket ${ticketId} (${id.slice(0, 12)})`)

  return id
}

// ─── Idle shutdown ────────────────────────────────────────────────────────────

export function scheduleIdleStop(ticketId: string): void {
  cancelIdleTimer(ticketId)
  const timer = setTimeout(async () => {
    try {
      await stopTicketContainer(ticketId)
    } catch (err) {
      console.error(`[provisioner] Idle stop failed for ticket ${ticketId}:`, err)
    }
  }, config.containerIdleTimeoutMs)
  idleTimers.set(ticketId, timer)
}

function cancelIdleTimer(ticketId: string): void {
  const timer = idleTimers.get(ticketId)
  if (timer) {
    clearTimeout(timer)
    idleTimers.delete(ticketId)
  }
}

// ─── Stop ─────────────────────────────────────────────────────────────────────

async function stopTicketContainer(ticketId: string): Promise<void> {
  const entry = containers.get(ticketId)
  if (!entry) return

  const id = entry.id
  containers.delete(ticketId)
  cancelIdleTimer(ticketId)

  console.log(`[provisioner] Stopping container for ticket ${ticketId}`)
  try {
    await pushWorktree(id, ticketId, entry.logTag).catch(err =>
      console.warn(`[provisioner] Failed to push worktree for ${ticketId}:`, err))
    await removeWorktree(id, ticketId, entry.logTag).catch(err =>
      console.warn(`[provisioner] Failed to remove worktree for ${ticketId}:`, err))
    const container = getDocker().getContainer(id)
    await container.stop({ t: 5 })
    await container.remove()
  } catch (err) {
    console.warn(`[provisioner] Error stopping container:`, err)
  }
  await setContainerStatus(ticketId, 'stopped')
}

/** Stop all q-managed containers (found by label) and clear in-memory state */
export async function stopAll(): Promise<void> {
  if (config.dryRun) return
  const managed = await getDocker().listContainers({
    all: true,
    filters: { label: [LABEL_MANAGED] },
  })
  await Promise.allSettled(managed.map(async (info) => {
    try {
      const container = getDocker().getContainer(info.Id)
      if (info.State === 'running') await container.stop({ t: 5 })
      await container.remove()
    } catch (err) {
      console.warn(`[provisioner] Error stopping container ${info.Id.slice(0, 12)}:`, err)
    }
  }))
  containers.clear()
}
