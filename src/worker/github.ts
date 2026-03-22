import crypto from 'crypto'
import { config } from '../config'
import { execInContainer } from './docker'

// ─── JWT ─────────────────────────────────────────────────────────────────────

function createAppJWT(): string {
  if (!config.githubAppId || !config.githubPrivateKey) {
    throw new Error('GITHUB_APP_ID and GITHUB_PRIVATE_KEY are required')
  }

  const privateKey = config.githubPrivateKey
  const now = Math.floor(Date.now() / 1000)

  const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url')
  const payload = Buffer.from(JSON.stringify({
    iat: now - 60,
    exp: now + 600, // 10 minutes max
    iss: config.githubAppId,
  })).toString('base64url')

  const signature = crypto.sign('sha256', Buffer.from(`${header}.${payload}`), privateKey)
  return `${header}.${payload}.${signature.toString('base64url')}`
}

// ─── Installation token ──────────────────────────────────────────────────────

/** Get a short-lived installation access token for a repo (owner/repo format) */
export async function getInstallationToken(repo: string): Promise<string> {
  const jwt = createAppJWT()

  // Look up installation ID for this repo
  const installRes = await fetch(`https://api.github.com/repos/${repo}/installation`, {
    headers: {
      Authorization: `Bearer ${jwt}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
    },
  })
  if (!installRes.ok) {
    const body = await installRes.text()
    throw new Error(`Failed to get installation for ${repo}: ${installRes.status} ${body}`)
  }
  const { id: installationId } = await installRes.json() as { id: number }

  // Create access token scoped to this installation
  const tokenRes = await fetch(`https://api.github.com/app/installations/${installationId}/access_tokens`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${jwt}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
    },
  })
  if (!tokenRes.ok) {
    const body = await tokenRes.text()
    throw new Error(`Failed to create installation token: ${tokenRes.status} ${body}`)
  }
  const { token } = await tokenRes.json() as { token: string }

  console.log(`[github] Generated installation token for ${repo}`)
  return token
}

// ─── Container credential setup ─────────────────────────────────────────────

/** Configure git credentials in a running container using a GitHub installation token */
export async function setupGitCredentials(containerId: string, token: string, logTag: string, log?: (line: string) => void): Promise<void> {
  await execInContainer(containerId, [
    'sh', '-c',
    `git config --global credential.helper '!f() { echo "username=x-access-token"; echo "password=${token}"; }; f'`,
  ], logTag)
  const msg = `[git ${logTag}] Credentials configured`
  console.log(msg)
  log?.('git credentials configured')
}

/** Clone a GitHub repo into /workspace if not already cloned (uses credentials already configured in container) */
export async function cloneRepoIfNeeded(containerId: string, repo: string, logTag: string, log?: (line: string) => void): Promise<void> {
  const t = `[git ${logTag}]`
  const hasRepo = await execInContainer(containerId, ['test', '-d', '/workspace/.git'], logTag).then(() => true, () => false)
  if (hasRepo) {
    console.log(`${t} Repo already present in /workspace, skipping clone`)
    log?.(`repo ${repo} already present, skipping clone`)
    return
  }
  await execInContainer(containerId, [
    'git', 'clone', `https://github.com/${repo}.git`, '/workspace',
  ], logTag)
  console.log(`${t} Cloned ${repo} into /workspace`)
  log?.(`cloned ${repo}`)
}

/** Configure git user.name and user.email in a running container */
export async function setupGitIdentity(containerId: string, logTag: string, log?: (line: string) => void): Promise<void> {
  await execInContainer(containerId, ['git', 'config', '--global', 'user.name', config.githubCommitName], logTag)
  await execInContainer(containerId, ['git', 'config', '--global', 'user.email', config.githubCommitEmail], logTag)
  console.log(`[git ${logTag}] Identity configured`)
  log?.('git identity configured')
}

// ─── Worktree management ─────────────────────────────────────────────────────

const WORKTREE_BASE = '/workspace/.worktrees'

/** Return the worktree path for a ticket */
export function worktreePath(ticketId: string): string {
  return `${WORKTREE_BASE}/q/${ticketId}`
}

/**
 * Ensure a worktree exists for this ticket, creating one if needed.
 * - New ticket: fetch latest, create worktree from origin default branch
 * - Re-opened ticket (branch exists on remote): fetch + recreate worktree from remote branch
 * - Paused ticket (worktree still exists): no-op
 */
export async function ensureWorktree(containerId: string, ticketId: string, logTag: string, log?: (line: string) => void): Promise<string> {
  const t = `[git ${logTag}]`
  const wt = worktreePath(ticketId)
  const branch = `q/${ticketId}`

  // If worktree already exists (paused ticket), just return the path
  const exists = await execInContainer(containerId, ['test', '-d', wt], logTag).then(() => true, () => false)
  if (exists) {
    console.log(`${t} Worktree already exists at ${wt}`)
    log?.(`worktree already exists at ${wt}`)
    return wt
  }

  // Fetch latest from origin
  log?.('fetching from origin...')
  await execInContainer(containerId, ['git', '-C', '/workspace', 'fetch', 'origin'], logTag)

  // Check if the branch exists on remote (re-opened ticket)
  const remoteBranchExists = await execInContainer(containerId, [
    'git', '-C', '/workspace', 'rev-parse', '--verify', `refs/remotes/origin/${branch}`,
  ], logTag).then(() => true, () => false)

  // Ensure parent directory exists
  await execInContainer(containerId, ['mkdir', '-p', `${WORKTREE_BASE}/q`], logTag)

  if (remoteBranchExists) {
    // Re-opened / container restart: create worktree tracking the existing remote branch.
    // Prune stale worktree metadata, then delete local branch if it exists (ignore error),
    // and create a fresh worktree from the remote branch.  This handles both the "paused
    // ticket where only the worktree dir is missing" and the "fresh container after restart"
    // cases without a fragile try/catch cascade.
    await execInContainer(containerId, [
      'git', '-C', '/workspace', 'worktree', 'prune',
    ], logTag)
    // Delete local branch if present so worktree add -b doesn't complain
    await execInContainer(containerId, [
      'git', '-C', '/workspace', 'branch', '-D', branch,
    ], logTag).catch(() => { /* branch may not exist locally — that's fine */ })
    await execInContainer(containerId, [
      'git', '-C', '/workspace', 'worktree', 'add', '-b', branch, wt, `origin/${branch}`,
    ], logTag)
    console.log(`${t} Recreated worktree for ${branch} from remote`)
    log?.(`recreated worktree for ${branch} from remote`)
  } else {
    // New ticket: determine default branch and create worktree from it
    const defaultBranch = await execInContainer(containerId, [
      'git', '-C', '/workspace', 'symbolic-ref', 'refs/remotes/origin/HEAD',
    ], logTag).then(
      ref => ref.trim().replace('refs/remotes/origin/', ''),
      () => 'master',
    )
    await execInContainer(containerId, [
      'git', '-C', '/workspace', 'worktree', 'add', '-b', branch, wt, `origin/${defaultBranch}`,
    ], logTag)
    console.log(`${t} Created worktree for ${branch} from ${defaultBranch}`)
    log?.(`created worktree for ${branch} from ${defaultBranch}`)
  }

  return wt
}

/** Commit any dirty state and push the ticket's worktree before container teardown */
export async function pushWorktree(containerId: string, ticketId: string, logTag: string, log?: (line: string) => void): Promise<void> {
  const wt = worktreePath(ticketId)
  const branch = `q/${ticketId}`
  const t = `[git ${logTag}]`

  const exists = await execInContainer(containerId, ['test', '-d', wt], logTag).then(() => true, () => false)
  if (!exists) return

  // Commit any uncommitted changes
  const status = await execInContainer(containerId, ['git', '-C', wt, 'status', '--porcelain'], logTag)
  if (status.trim().length > 0) {
    await execInContainer(containerId, ['git', '-C', wt, 'add', '-A'], logTag)
    await execInContainer(containerId, [
      'git', '-C', wt, 'commit', '-m', 'wip: auto-save before container stop',
    ], logTag)
    console.log(`${t} Auto-committed dirty worktree`)
    log?.('auto-committed dirty worktree')
  }

  // Check if there's anything to push
  const localHead = await execInContainer(containerId, [
    'git', '-C', wt, 'rev-parse', 'HEAD',
  ], logTag).catch(() => '')
  if (!localHead.trim()) return // no commits at all

  const remoteHead = await execInContainer(containerId, [
    'git', '-C', wt, 'rev-parse', `origin/${branch}`,
  ], logTag).catch(() => '')

  if (localHead.trim() === remoteHead.trim()) return // already up to date

  log?.(`pushing ${branch}...`)
  await execInContainer(containerId, [
    'git', '-C', wt, 'push', '-u', 'origin', branch,
  ], logTag)
  console.log(`${t} Pushed worktree branch ${branch}`)
  log?.(`pushed ${branch}`)
}

// ─── PR merge detection ──────────────────────────────────────────────────────

/**
 * Returns true if a PR for the ticket's branch (q/{ticketId}) has been merged
 * into the repo's default branch.  Returns false if no merged PR is found, or
 * if GitHub App credentials are not configured.
 */
export async function checkPRMerged(repo: string, ticketId: string): Promise<boolean> {
  let jwt: string
  try {
    jwt = createAppJWT()
  } catch {
    return false // GitHub App not configured
  }

  const branch = `q/${ticketId}`
  const [owner] = repo.split('/')
  const url = `https://api.github.com/repos/${repo}/pulls?state=closed&head=${owner}:${branch}&per_page=1`

  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${jwt}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
    },
  })
  if (!res.ok) return false

  const pulls = await res.json() as Array<{ merged_at: string | null }>
  return pulls.length > 0 && pulls[0].merged_at !== null
}

/** Remove a ticket's worktree */
export async function removeWorktree(containerId: string, ticketId: string, logTag: string, log?: (line: string) => void): Promise<void> {
  const wt = worktreePath(ticketId)
  const exists = await execInContainer(containerId, ['test', '-d', wt], logTag).then(() => true, () => false)
  if (!exists) return

  await execInContainer(containerId, ['rm', '-rf', wt], logTag)
  await execInContainer(containerId, ['git', '-C', '/workspace', 'worktree', 'prune'], logTag)
  console.log(`[git ${logTag}] Removed worktree ${wt}`)
  log?.(`removed worktree ${wt}`)
}
