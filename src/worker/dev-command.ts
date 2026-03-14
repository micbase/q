import { getDocker } from './docker'

function parseEnvs(devEnvs?: string): string[] {
  if (!devEnvs) return []
  return devEnvs
    .split('\n')
    .map(line => line.trim())
    .filter(line => line && !line.startsWith('#'))
}

export async function runDevCommand(containerId: string, command: string, workDir: string, devEnvs?: string): Promise<void> {
  console.log(`[dev-command] Running in ${workDir}: ${command}`)
  const env = parseEnvs(devEnvs)
  const exec = await getDocker().getContainer(containerId).exec({
    Cmd: ['sh', '-c', command],
    Env: env.length > 0 ? env : undefined,
    WorkingDir: workDir,
    AttachStdout: false,
    AttachStderr: false,
  })
  await exec.start({ Detach: true } as any)
}
