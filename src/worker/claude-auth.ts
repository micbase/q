import { config } from '../config'
import type { ClaudeAuthStatus } from '../../shared/types'
import { getDocker, execInContainer, execInteractive, pullImage } from './docker'

// Claude CLI login driven from the UI instead of a manual shell session.
//
// `claude auth login` works without a TTY: it prints an OAuth URL, then reads the
// code shown after authorizing from stdin. We run it in a throwaway container built
// from the project image, then copy the resulting credentials file over the shared
// `${SESSIONS_DIR}/.credentials.json` that every ticket container bind-mounts.
// q never touches the host filesystem directly — all file access goes through the
// helper container, which mounts SESSIONS_DIR at /q-sessions.

const LABEL_MANAGED = 'q.managed'
const LABEL_AUTH = 'q.auth'
const SESSIONS_MOUNT = '/q-sessions'
const SHARED_CREDENTIALS = `${SESSIONS_MOUNT}/.credentials.json`
const LOGIN_TIMEOUT_MS = 10 * 60 * 1000
const URL_WAIT_MS = 30_000
const CODE_WAIT_MS = 60_000
const URL_RE = /https:\/\/\S+\/oauth\/authorize\?\S+/

interface LoginSession {
  containerId: string
  duplex: NodeJS.ReadWriteStream
  output: string
  ended: Promise<void>
  timer: ReturnType<typeof setTimeout>
}

let session: LoginSession | null = null

function logTag(containerId: string): string {
  return `auth ${containerId.slice(0, 12)}`
}

async function ensureImage(): Promise<void> {
  try {
    await getDocker().getImage(config.projectImage).inspect()
  } catch {
    await pullImage(config.projectImage)
  }
}

/** Start a helper container (project image, `sleep infinity`) with SESSIONS_DIR mounted */
async function startHelperContainer(): Promise<string> {
  await ensureImage()
  const { HostConfig: extraHostConfig, ...extraOpts } = config.dockerRunOptions
  const container = await getDocker().createContainer({
    Image: config.projectImage,
    Labels: { [LABEL_MANAGED]: 'true', [LABEL_AUTH]: 'true' },
    HostConfig: {
      Binds: [`${config.sessionsDir}:${SESSIONS_MOUNT}`],
      ...extraHostConfig,
    },
    ...extraOpts,
  })
  await container.start()
  return container.id
}

async function removeContainer(containerId: string): Promise<void> {
  try {
    await getDocker().getContainer(containerId).remove({ force: true })
  } catch (err) {
    console.warn(`[auth] Failed to remove helper container ${containerId.slice(0, 12)}:`, err)
  }
}

// ─── Status ───────────────────────────────────────────────────────────────────

/** Summarize a credentials file without exposing any tokens */
function parseCredentials(raw: string): Omit<ClaudeAuthStatus, 'login_in_progress'> {
  const empty = { configured: false, subscription_type: null, expires_at: null, refresh_token_expires_at: null, scopes: [] }
  if (!raw.trim()) return empty
  try {
    const oauth = JSON.parse(raw)?.claudeAiOauth
    if (!oauth?.refreshToken && !oauth?.accessToken) return empty
    return {
      configured: true,
      subscription_type: oauth.subscriptionType ?? null,
      expires_at: typeof oauth.expiresAt === 'number' ? new Date(oauth.expiresAt).toISOString() : null,
      refresh_token_expires_at: typeof oauth.refreshTokenExpiresAt === 'number' ? new Date(oauth.refreshTokenExpiresAt).toISOString() : null,
      scopes: Array.isArray(oauth.scopes) ? oauth.scopes : [],
    }
  } catch {
    return empty
  }
}

export async function getStatus(): Promise<ClaudeAuthStatus> {
  const containerId = await startHelperContainer()
  try {
    // Missing file (or a directory Docker auto-created for a missing bind source) → empty
    const raw = await execInContainer(containerId,
      ['sh', '-c', `if [ -f ${SHARED_CREDENTIALS} ]; then cat ${SHARED_CREDENTIALS}; fi`],
      logTag(containerId), { User: 'root' })
    return { ...parseCredentials(raw), login_in_progress: session !== null }
  } finally {
    await removeContainer(containerId)
  }
}

// ─── Login ────────────────────────────────────────────────────────────────────

/** Start `claude auth login` and return the OAuth URL the user must open */
export async function startLogin(): Promise<string> {
  await cancelLogin()

  const containerId = await startHelperContainer()
  try {
    const { duplex, stdout, stderr } = await execInteractive(containerId, ['claude', 'auth', 'login', '--claudeai'], {
      WorkingDir: `/home/${config.containerUser}`,
    })

    let output = ''
    const onData = (chunk: Buffer) => { output += chunk.toString() }
    stdout.on('data', onData)
    stderr.on('data', onData)
    const ended = new Promise<void>((resolve) => {
      let open = 2
      const done = () => { if (--open === 0) resolve() }
      stdout.on('end', done)
      stderr.on('end', done)
    })

    const s: LoginSession = {
      containerId,
      duplex,
      get output() { return output },
      ended,
      timer: setTimeout(() => {
        console.log('[auth] Login timed out')
        void cancelLogin()
      }, LOGIN_TIMEOUT_MS),
    }
    session = s

    const url = await new Promise<string>((resolve, reject) => {
      const check = () => {
        const match = output.match(URL_RE)
        if (match) { cleanup(); resolve(match[0]) }
      }
      const timer = setTimeout(() => { cleanup(); reject(new Error(`Timed out waiting for login URL. Output: ${output.trim()}`)) }, URL_WAIT_MS)
      const onEnd = () => { cleanup(); reject(new Error(`claude auth login exited before printing a URL. Output: ${output.trim()}`)) }
      const cleanup = () => { clearTimeout(timer); stdout.off('data', check); stderr.off('data', check) }
      stdout.on('data', check)
      stderr.on('data', check)
      void ended.then(onEnd)
      check()
    })

    console.log(`[auth] Login started in ${containerId.slice(0, 12)}`)
    return url
  } catch (err) {
    if (session?.containerId === containerId) await cancelLogin()
    else await removeContainer(containerId)
    throw err
  }
}

/** Feed the authorization code to the pending login, then install the credentials */
export async function submitCode(code: string): Promise<ClaudeAuthStatus> {
  const s = session
  if (!s) throw new Error('No login in progress — start a new login')

  const before = s.output.length
  s.duplex.write(code.trim() + '\n')
  s.duplex.end()

  try {
    const finished = await Promise.race([
      s.ended.then(() => true),
      new Promise<boolean>((resolve) => setTimeout(() => resolve(false), CODE_WAIT_MS)),
    ])
    const tail = s.output.slice(before).trim()
    if (!finished) throw new Error(`Timed out waiting for login to complete${tail ? `: ${tail}` : ''}`)

    // The CLI exits 0 even on an invalid code, so check for the credentials file instead.
    // `cat >` keeps the destination inode, so running containers' file bind mounts see the update.
    const user = config.containerUser
    const src = `/home/${user}/.claude/.credentials.json`
    try {
      await execInContainer(s.containerId, ['sh', '-c', [
        'set -e',
        `test -s ${src}`,
        `if [ -d ${SHARED_CREDENTIALS} ]; then rmdir ${SHARED_CREDENTIALS}; fi`,
        `cat ${src} > ${SHARED_CREDENTIALS}`,
        `chown ${user}:${user} ${SHARED_CREDENTIALS}`,
        `chmod 600 ${SHARED_CREDENTIALS}`,
      ].join('; ')], logTag(s.containerId), { User: 'root' })
    } catch {
      throw new Error(tail || 'Login failed — no credentials were created')
    }

    console.log('[auth] Login succeeded, credentials installed')
  } finally {
    await cancelLogin()
  }

  return getStatus()
}

/** Abort any pending login and remove its helper container */
export async function cancelLogin(): Promise<void> {
  const s = session
  if (!s) return
  session = null
  clearTimeout(s.timer)
  await removeContainer(s.containerId)
}

export function loginInProgress(): boolean {
  return session !== null
}
