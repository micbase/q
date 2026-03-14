import { getDocker } from './docker'

export async function runDevCommand(containerId: string, command: string, workDir: string): Promise<void> {
  console.log(`[dev-command] Running in ${workDir}: ${command}`)
  const exec = await getDocker().getContainer(containerId).exec({
    Cmd: ['sh', '-c', command],
    WorkingDir: workDir,
    AttachStdout: false,
    AttachStderr: false,
  })
  await exec.start({ Detach: true } as any)
}
