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
  dryRun: optionalBool('DRY_RUN', false),
  githubAppId: optional('GITHUB_APP_ID', ''),
  githubPrivateKey: optional('GITHUB_PRIVATE_KEY', '').replace(/\\n/g, '\n'),
}

// Wipe process.env so secrets can never leak to child processes.
// config already captured everything we need at import time.
export function scrubEnv(): void {
  for (const key of Object.keys(process.env)) {
    delete process.env[key]
  }
}

export function validate(): void {

  console.log(`Config loaded:`)
  console.log(`  DB: ${config.db.user}@${config.db.host}:${config.db.port}/${config.db.database}`)
  console.log(`  Port: ${config.port}`)
  console.log(`  Poll interval: ${config.pollIntervalMs}ms`)
  console.log(`  Container idle timeout: ${config.containerIdleTimeoutMs}ms`)
  console.log(`  Projects dir: ${config.projectsDir}`)
  console.log(`  Project image: ${config.projectImage}`)
  console.log(`  Dry run: ${config.dryRun}`)
  if (config.ntfyUrl) console.log(`  ntfy: ${config.ntfyUrl}`)
  if (config.githubAppId) console.log(`  GitHub App: ${config.githubAppId}`)
}
