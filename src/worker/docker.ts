import Docker from 'dockerode'
import { PassThrough } from 'stream'
import { config } from '../config'

let docker: Docker | null = null

export function getDocker(): Docker {
  if (!docker) docker = new Docker({ socketPath: '/var/run/docker.sock' })
  return docker
}

// ─── Exec helpers ────────────────────────────────────────────────────────────

/** Pull a Docker image, waiting for the pull to complete. */
export async function pullImage(image: string): Promise<void> {
  console.log(`[docker] Pulling image ${image}`)
  const docker = getDocker()
  const stream = await docker.pull(image)
  await new Promise<void>((resolve, reject) => {
    docker.modem.followProgress(stream, (err: Error | null) => {
      if (err) reject(err)
      else resolve()
    })
  })
  console.log(`[docker] Image pulled: ${image}`)
}

export interface ExecOptions {
  WorkingDir?: string
  Env?: string[]
  User?: string
}

/** Run a command in a container, wait for completion, return stdout as string. Throws on non-zero exit. */
export async function execInContainer(containerId: string, cmd: string[], logTag: string, opts?: ExecOptions): Promise<string> {
  console.log(`[exec ${logTag}] ${cmd.join(' ')}`)
  const exec = await getDocker().getContainer(containerId).exec({
    Cmd: cmd,
    AttachStdout: true,
    AttachStderr: true,
    User: config.containerUser,
    ...opts,
  })
  const stream = await exec.start({})

  const stdout = new PassThrough()
  const stderr = new PassThrough()
  getDocker().modem.demuxStream(stream, stdout, stderr)
  stream.on('end', () => { stdout.end(); stderr.end() })

  const stdoutChunks: Buffer[] = []
  const stderrChunks: Buffer[] = []
  await Promise.all([
    new Promise<void>((resolve, reject) => {
      stdout.on('data', (chunk: Buffer) => stdoutChunks.push(chunk))
      stdout.on('end', resolve)
      stdout.on('error', reject)
    }),
    new Promise<void>((resolve, reject) => {
      stderr.on('data', (chunk: Buffer) => stderrChunks.push(chunk))
      stderr.on('end', resolve)
      stderr.on('error', reject)
    }),
  ])

  const { ExitCode } = await exec.inspect()
  if (ExitCode !== 0) {
    const errOutput = Buffer.concat(stderrChunks).toString().trim()
    throw new Error(`exec failed (exit ${ExitCode}): ${cmd.join(' ')}${errOutput ? `\n${errOutput}` : ''}`)
  }
  return Buffer.concat(stdoutChunks).toString()
}

export interface InteractiveExec {
  exec: Docker.Exec
  duplex: NodeJS.ReadWriteStream
  stdout: PassThrough
  stderr: PassThrough
}

/** Create an interactive exec with hijacked stdin/stdout for streaming */
export async function execInteractive(containerId: string, cmd: string[], opts?: ExecOptions): Promise<InteractiveExec> {
  const exec = await getDocker().getContainer(containerId).exec({
    Cmd: cmd,
    AttachStdin: true,
    AttachStdout: true,
    AttachStderr: true,
    User: config.containerUser,
    ...opts,
  })
  const duplex = await exec.start({ hijack: true, stdin: true })

  const stdout = new PassThrough()
  const stderr = new PassThrough()
  getDocker().modem.demuxStream(duplex, stdout, stderr)

  duplex.on('end', () => {
    if (!stdout.destroyed) stdout.end()
    if (!stderr.destroyed) stderr.end()
  })
  duplex.on('close', () => {
    if (!stdout.destroyed) stdout.end()
    if (!stderr.destroyed) stderr.end()
  })

  return { exec, duplex, stdout, stderr }
}
