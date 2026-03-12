import { config } from '../config'
import * as db from '../db/queries'
import type { Project, ContainerStatus } from '../../shared/types'
import { getDocker } from './docker'
import { getInstallationToken, cloneRepoIfNeeded, setupGitCredentials } from './github'
const LABEL_MANAGED = 'q.managed'

const TOKEN_MAX_AGE_MS = 55 * 60 * 1000 // refresh credentials before 1h expiry

interface ContainerEntry { id?: string; status: ContainerStatus; credentialsAt?: number }

// In-memory map: projectId → container state
const containers = new Map<string, ContainerEntry>()
// Idle timers: projectId → timer handle
const idleTimers = new Map<string, ReturnType<typeof setTimeout>>()

async function refreshCredentials(entry: ContainerEntry, project: Project): Promise<void> {
  if (!entry.id || !project.github_repo || !config.githubAppId) return
  const age = Date.now() - (entry.credentialsAt ?? 0)
  if (age < TOKEN_MAX_AGE_MS) return
  const token = await getInstallationToken(project.github_repo)
  await setupGitCredentials(entry.id, token)
  entry.credentialsAt = Date.now()
}

export function getContainerStatus(projectId: string): ContainerStatus {
  return containers.get(projectId)?.status ?? 'stopped'
}

// ─── Ensure running ───────────────────────────────────────────────────────────

export async function ensureRunning(project: Project): Promise<string> {
  const existing = containers.get(project.id)
  if (existing?.id) {
    cancelIdleTimer(project.id)
    await refreshCredentials(existing, project)
    return existing.id
  }

  console.log(`[provisioner] Starting container for project ${project.name}`)
  containers.set(project.id, { status: 'starting' })

  const container = await getDocker().createContainer({
    Image: config.projectImage,
    Labels: { [LABEL_MANAGED]: 'true' },
    HostConfig: {
      Binds: [
        `${config.projectsDir}/${project.name}:/workspace`,
        `${config.projectsDir}/.claude-sessions/${project.name}:/home/claude/.claude`,
      ],
    },
  })

  await container.start()

  const info = await container.inspect()
  const id = info.Id
  const entry: ContainerEntry = { id, status: 'running' }
  await refreshCredentials(entry, project)
  if (project.github_repo) {
    await cloneRepoIfNeeded(id, project.github_repo)
  }

  containers.set(project.id, entry)

  console.log(`[provisioner] Container started for project ${project.name} (${id.slice(0, 12)})`)

  return id
}

// ─── Idle shutdown ────────────────────────────────────────────────────────────

export function scheduleIdleStop(projectId: string): void {
  cancelIdleTimer(projectId)
  const timer = setTimeout(async () => {
    try {
      const queued = await db.countQueuedTicketsForProject(projectId)
      if (queued === 0) {
        await stopProject(projectId)
      }
    } catch (err) {
      console.error(`[provisioner] Idle stop failed for project ${projectId}:`, err)
    }
  }, config.containerIdleTimeoutMs)
  idleTimers.set(projectId, timer)
}

function cancelIdleTimer(projectId: string): void {
  const timer = idleTimers.get(projectId)
  if (timer) {
    clearTimeout(timer)
    idleTimers.delete(projectId)
  }
}

// ─── Stop ─────────────────────────────────────────────────────────────────────

async function stopProject(projectId: string): Promise<void> {
  const entry = containers.get(projectId)
  if (!entry?.id) return

  const id = entry.id
  containers.delete(projectId)
  cancelIdleTimer(projectId)

  console.log(`[provisioner] Stopping container for project ${projectId}`)
  try {
    const container = getDocker().getContainer(id)
    await container.stop({ t: 5 })
    await container.remove()
  } catch (err) {
    console.warn(`[provisioner] Error stopping container:`, err)
  }
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
