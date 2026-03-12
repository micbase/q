import crypto from 'crypto'
import { config } from '../config'
import { getDocker } from './docker'

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
export async function setupGitCredentials(containerId: string, token: string): Promise<void> {
  await execInContainer(containerId, [
    'sh', '-c',
    `git config --global credential.helper '!f() { echo "username=x-access-token"; echo "password=${token}"; }; f'`,
  ])
  console.log(`[github] Git credentials configured in container ${containerId.slice(0, 12)}`)
}

/** Clone a GitHub repo into /workspace if not already cloned (uses credentials already configured in container) */
export async function cloneRepoIfNeeded(containerId: string, repo: string): Promise<void> {
  const hasRepo = await execInContainer(containerId, ['test', '-d', '/workspace/.git']).then(() => true, () => false)
  if (hasRepo) {
    console.log(`[github] Repo already present in /workspace, skipping clone`)
    return
  }
  await execInContainer(containerId, [
    'git', 'clone', `https://github.com/${repo}.git`, '/workspace',
  ])
  console.log(`[github] Cloned ${repo} into /workspace in container ${containerId.slice(0, 12)}`)
}

/** Configure git user.name and user.email in a running container */
export async function setupGitIdentity(containerId: string): Promise<void> {
  await execInContainer(containerId, ['git', 'config', '--global', 'user.name', config.githubCommitName])
  await execInContainer(containerId, ['git', 'config', '--global', 'user.email', config.githubCommitEmail])
  console.log(`[github] Git identity configured in container ${containerId.slice(0, 12)}`)
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function execInContainer(containerId: string, cmd: string[]): Promise<void> {
  const exec = await getDocker().getContainer(containerId).exec({
    Cmd: cmd,
    AttachStdout: true,
    AttachStderr: true,
  })
  const stream = await exec.start({})
  await new Promise<void>((resolve, reject) => {
    stream.on('end', resolve)
    stream.on('error', reject)
    stream.resume()
  })

  const { ExitCode } = await exec.inspect()
  if (ExitCode !== 0) {
    throw new Error(`exec failed (exit ${ExitCode}): ${cmd.join(' ')}`)
  }
}
