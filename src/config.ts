function required(name: string): string {
  const val = process.env[name]
  if (!val) throw new Error(`Missing required env var: ${name}`)
  return val
}

function optional(name: string, defaultValue: string): string {
  return process.env[name] ?? defaultValue
}

function optionalInt(name: string, defaultValue: number): number {
  const val = process.env[name]
  if (!val) return defaultValue
  const parsed = parseInt(val, 10)
  if (isNaN(parsed)) throw new Error(`Env var ${name} must be an integer`)
  return parsed
}

function optionalBool(name: string, defaultValue: boolean): boolean {
  const val = process.env[name]
  if (!val) return defaultValue
  return val.toLowerCase() === 'true'
}

export const config = {
  db: {
    host: required('DB_HOST'),
    port: optionalInt('DB_PORT', 5432),
    database: required('DB_NAME'),
    user: required('DB_USER'),
    password: optional('DB_PASSWORD', ''),
  },

  ntfyUrl: optional('NTFY_URL', ''),
  port: optionalInt('API_PORT', 3200),
  pollIntervalMs: optionalInt('POLL_INTERVAL_MS', 5000),
  retryDelayMs: optionalInt('RETRY_DELAY_MS', 60000),
  containerIdleTimeoutMs: optionalInt('CONTAINER_IDLE_TIMEOUT_MS', 600_000),
  projectsDir: required('PROJECTS_DIR'),
  projectImage: optional('PROJECT_IMAGE', 'q-project'),
  maxConcurrentTickets: optionalInt('MAX_CONCURRENT_TICKETS', 2),
  dryRun: optionalBool('DRY_RUN', false),
  githubAppId: optional('GITHUB_APP_ID', ''),
  githubPrivateKey: optional('GITHUB_PRIVATE_KEY', '').replace(/\\n/g, '\n'),
  githubCommitName: optional('GITHUB_COMMIT_NAME', 'q'),
  githubCommitEmail: optional('GITHUB_COMMIT_EMAIL', 'q@noreply'),
  proxyPort: optionalInt('PROXY_PORT', 3201),
  proxyDomain: optional('PROXY_DOMAIN', ''),
  devServerPort: optionalInt('DEV_SERVER_PORT', 5173),
  dockerRunOptions: JSON.parse(optional('DOCKER_RUN_OPTIONS', '{}')),
  containerUser: optional('CONTAINER_USER', 'dev'),

  // Dev postgres — separate from q's own DB; used to auto-provision per-project DBs.
  // If DEV_DB_HOST is not set, DB provisioning is skipped.
  devDb: {
    host: optional('DEV_DB_HOST', ''),
    port: optionalInt('DEV_DB_PORT', 5432),
    user: optional('DEV_DB_USER', 'postgres'),
    password: optional('DEV_DB_PASSWORD', ''),
  },
}

// Wipe process.env so secrets can never leak to child processes.
// config already captured everything we need at import time.
export function scrubEnv(): void {
  for (const key of Object.keys(process.env)) {
    delete process.env[key]
  }
}

export function validate(): void {

  console.log(`[config] Loaded:`)
  console.log(`[config]   DB: ${config.db.user}@${config.db.host}:${config.db.port}/${config.db.database}`)
  console.log(`[config]   Port: ${config.port}`)
  console.log(`[config]   Poll interval: ${config.pollIntervalMs}ms`)
  console.log(`[config]   Container idle timeout: ${config.containerIdleTimeoutMs}ms`)
  console.log(`[config]   Projects dir: ${config.projectsDir}`)
  console.log(`[config]   Project image: ${config.projectImage}`)
  console.log(`[config]   Container user: ${config.containerUser}`)
  console.log(`[config]   Dry run: ${config.dryRun}`)
  if (config.ntfyUrl) console.log(`[config]   ntfy: ${config.ntfyUrl}`)
  if (config.githubAppId) console.log(`[config]   GitHub App: ${config.githubAppId}`)
  if (config.proxyDomain) console.log(`[config]   Proxy: *.${config.proxyDomain} on port ${config.proxyPort} → :${config.devServerPort}`)
  if (Object.keys(config.dockerRunOptions).length) console.log(`[config]   Docker run options: ${JSON.stringify(config.dockerRunOptions)}`)
  if (config.devDb.host) console.log(`[config]   Dev DB: ${config.devDb.user}@${config.devDb.host}:${config.devDb.port}`)
}
