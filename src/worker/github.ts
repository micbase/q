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
export async function setupGitCredentials(containerId: string, token: string, logTag: string): Promise<void> {
  await execInContainer(containerId, [
    'sh', '-c',
    `git config --global credential.helper '!f() { echo "username=x-access-token"; echo "password=${token}"; }; f'`,
  ], logTag)
  console.log(`[git ${logTag}] Credentials configured`)
}

/** Clone a GitHub repo into /workspace if not already cloned (uses credentials already configured in container) */
export async function cloneRepoIfNeeded(containerId: string, repo: string, logTag: string): Promise<void> {
  const t = `[git ${logTag}]`
  const hasRepo = await execInContainer(containerId, ['test', '-d', '/workspace/.git'], logTag).then(() => true, () => false)
  if (hasRepo) {
    console.log(`${t} Repo already present in /workspace, skipping clone`)
    return
  }
  await execInContainer(containerId, [
    'git', 'clone', `https://github.com/${repo}.git`, '/workspace',
  ], logTag)
  console.log(`${t} Cloned ${repo} into /workspace`)
}

/** Configure git user.name and user.email in a running container */
export async function setupGitIdentity(containerId: string, logTag: string): Promise<void> {
  await execInContainer(containerId, ['git', 'config', '--global', 'user.name', config.githubCommitName], logTag)
  await execInContainer(containerId, ['git', 'config', '--global', 'user.email', config.githubCommitEmail], logTag)
  console.log(`[git ${logTag}] Identity configured`)
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
export async function ensureWorktree(containerId: string, ticketId: string, logTag: string): Promise<string> {
  const t = `[git ${logTag}]`
  const wt = worktreePath(ticketId)
  const branch = `q/${ticketId}`

  // If worktree already exists (paused ticket), just return the path
  const exists = await execInContainer(containerId, ['test', '-d', wt], logTag).then(() => true, () => false)
  if (exists) {
    console.log(`${t} Worktree already exists at ${wt}`)
    return wt
  }

  // Fetch latest from origin
  await execInContainer(containerId, ['git', '-C', '/workspace', 'fetch', 'origin'], logTag)

  // Check if the branch exists on remote (re-opened ticket)
  const remoteBranchExists = await execInContainer(containerId, [
    'git', '-C', '/workspace', 'rev-parse', '--verify', `refs/remotes/origin/${branch}`,
  ], logTag).then(() => true, () => false)

  // Ensure parent directory exists
  await execInContainer(containerId, ['mkdir', '-p', `${WORKTREE_BASE}/q`], logTag)

  if (remoteBranchExists) {
    // Re-opened: create worktree tracking the existing remote branch
    // First remove stale worktree reference if any
    await execInContainer(containerId, [
      'git', '-C', '/workspace', 'worktree', 'prune',
    ], logTag)
    await execInContainer(containerId, [
      'git', '-C', '/workspace', 'worktree', 'add', wt, branch,
    ], logTag).catch(async (err) => {
      console.warn(`${t} Worktree add failed, retrying with branch reset:`, err.message ?? err)
      // Branch may exist locally but worktree was removed — reset it
      await execInContainer(containerId, [
        'git', '-C', '/workspace', 'branch', '-D', branch,
      ], logTag)
      await execInContainer(containerId, [
        'git', '-C', '/workspace', 'worktree', 'add', wt, '-b', branch, `origin/${branch}`,
      ], logTag)
    })
    console.log(`${t} Recreated worktree for ${branch} from remote`)
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
  }

  return wt
}

/** Remove a ticket's worktree (called on done) */
export async function removeWorktree(containerId: string, ticketId: string, logTag: string): Promise<void> {
  const wt = worktreePath(ticketId)
  const exists = await execInContainer(containerId, ['test', '-d', wt], logTag).then(() => true, () => false)
  if (!exists) return

  await execInContainer(containerId, ['rm', '-rf', wt], logTag)
  await execInContainer(containerId, ['git', '-C', '/workspace', 'worktree', 'prune'], logTag)
  console.log(`[git ${logTag}] Removed worktree ${wt}`)
}

