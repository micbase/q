import { execInteractive } from './docker'

function parseEnvs(devEnvs?: string): string[] {
  if (!devEnvs) return []
  return devEnvs
    .split('\n')
    .map(line => line.trim())
    .filter(line => line && !line.startsWith('#'))
}

export async function runDevCommand(containerId: string, command: string, workDir: string, devEnvs?: string): Promise<void> {
  const tag = `[dev-command ${containerId.slice(0, 12)}]`
  console.log(`${tag} Running in ${workDir}: ${command}`)
  const env = parseEnvs(devEnvs)
  const { stdout, stderr } = await execInteractive(containerId, ['sh', '-c', command], {
    Env: env.length > 0 ? env : undefined,
    WorkingDir: workDir,
  })

  // Log stderr lines asynchronously (don't block)
  stderr.on('data', (chunk: Buffer) => {
    console.error(`${tag} ${chunk.toString().trimEnd()}`)
  })
  stdout.on('data', (chunk: Buffer) => {
    console.log(`${tag} ${chunk.toString().trimEnd()}`)
  })
}
