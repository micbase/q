import { PassThrough } from 'stream'

import { isQuestion } from './session'
import type { ClaudeEvent, MessageType } from '../../shared/types'
import { getDocker } from './docker'

// ─── CLI event types (stream-json output) ─────────────────────────────────────

interface CLIAssistantEvent {
  type: 'assistant'
  message: {
    content: Array<
      | { type: 'text'; text: string }
      | { type: 'tool_use'; name: string; [key: string]: unknown }
    >
  }
}

interface CLIResultEvent {
  type: 'result'
  subtype: 'success' | 'error_max_turns' | string
  result: string
  session_id?: string
}

type CLIEvent = CLIAssistantEvent | CLIResultEvent | { type: string }

// ─── Main export ──────────────────────────────────────────────────────────────

export async function* callClaude(
  containerId: string,
  prompt: string,
  sessionId?: string,
): AsyncGenerator<ClaudeEvent> {
  const cmd = ['claude', '-p', '--verbose', '--output-format', 'stream-json', '--dangerously-skip-permissions']
  if (sessionId) {
    cmd.push('--resume', sessionId)
  }

  const tag = `[claude-client ${containerId.slice(0, 8)}]`
  console.log(`${tag} exec: ${cmd.join(' ')}`)
  console.log(`${tag} prompt length: ${prompt.length} chars`)

  const exec = await getDocker().getContainer(containerId).exec({
    Cmd: cmd,

    AttachStdin: true,
    AttachStdout: true,
    AttachStderr: true,
  })

  console.log(`${tag} exec created, starting...`)
  const duplex = await exec.start({ hijack: true, stdin: true })
  console.log(`${tag} exec started, writing prompt to stdin`)

  // Write prompt to stdin, then close stdin
  duplex.write(prompt)
  duplex.end()
  console.log(`${tag} stdin closed`)

  // Demux dockerode raw stream into separate stdout/stderr
  const stdout = new PassThrough()
  const stderr = new PassThrough()
  getDocker().modem.demuxStream(duplex, stdout, stderr)

  // When the raw stream ends, make sure stdout/stderr end too
  // (demuxStream doesn't always propagate end for error exits)
  duplex.on('end', () => {
    console.log(`${tag} duplex ended`)
    if (!stdout.destroyed) stdout.end()
    if (!stderr.destroyed) stderr.end()
  })
  duplex.on('close', () => {
    console.log(`${tag} duplex closed`)
    if (!stdout.destroyed) stdout.end()
    if (!stderr.destroyed) stderr.end()
  })

  // Collect stderr for error reporting
  const stderrChunks: Buffer[] = []
  stderr.on('data', (chunk: Buffer) => {
    console.log(`${tag} stderr: ${chunk.toString().trim()}`)
    stderrChunks.push(chunk)
  })

  let buffer = ''
  let eventCount = 0
  let lastEventTime = Date.now()
  const startTime = Date.now()

  // Watchdog: log if no data received for 30s
  const watchdog = setInterval(() => {
    const silentSec = ((Date.now() - lastEventTime) / 1000).toFixed(0)
    const totalSec = ((Date.now() - startTime) / 1000).toFixed(0)
    console.log(`${tag} watchdog: ${eventCount} events, silent ${silentSec}s, total ${totalSec}s`)
  }, 30_000)

  try {
    for await (const chunk of stdout) {
      lastEventTime = Date.now()
      buffer += chunk.toString()
      const lines = buffer.split('\n')
      buffer = lines.pop()!

      for (const line of lines) {
        const trimmed = line.trim()
        if (!trimmed) continue

        let event: CLIEvent
        try {
          event = JSON.parse(trimmed)
        } catch {
          console.log(`${tag} unparseable line: ${trimmed.slice(0, 200)}`)
          continue
        }

        eventCount++
        if (event.type === 'result') {
          const e = event as CLIResultEvent
          console.log(`${tag} result event: subtype=${e.subtype}, session_id=${e.session_id}`)
        }

        yield* mapCLIEvent(event)
      }
    }

    console.log(`${tag} stdout ended after ${eventCount} events, ${((Date.now() - startTime) / 1000).toFixed(1)}s`)

    // If CLI produced no events, it likely failed on startup
    if (eventCount === 0) {
      const stderrText = Buffer.concat(stderrChunks).toString().trim()
      throw new Error(`claude CLI produced no output: ${stderrText || '(no stderr)'}`)
    }

    // Flush remaining buffer
    if (buffer.trim()) {
      try {
        const event: CLIEvent = JSON.parse(buffer.trim())
        yield* mapCLIEvent(event)
      } catch {
        console.log(`${tag} unparseable trailing buffer: ${buffer.trim().slice(0, 200)}`)
      }
    }

    // Check exit code
    console.log(`${tag} inspecting exec exit code...`)
    const inspectResult = await exec.inspect()
    console.log(`${tag} exit code: ${inspectResult.ExitCode}`)
    if (inspectResult.ExitCode !== 0 && inspectResult.ExitCode !== null) {
      const stderrText = Buffer.concat(stderrChunks).toString().trim()
      throw new Error(`claude CLI exited with code ${inspectResult.ExitCode}: ${stderrText || '(no stderr)'}`)
    }
  } finally {
    clearInterval(watchdog)
    stdout.destroy()
    stderr.destroy()
  }
}

// ─── Event mapping ────────────────────────────────────────────────────────────

function* mapCLIEvent(event: CLIEvent): Generator<ClaudeEvent> {
  if (event.type === 'assistant') {
    const e = event as CLIAssistantEvent
    for (const block of e.message.content) {
      if (block.type === 'text' && block.text) {
        yield { type: 'text', content: block.text }
      } else if (block.type === 'tool_use') {
        yield { type: 'tool_use', content: `[${block.name}]` }
      }
    }
  } else if (event.type === 'result') {
    const e = event as CLIResultEvent
    if (e.subtype === 'success') {
      const type: MessageType = isQuestion(e.result) ? 'paused' : 'done'
      yield { type, content: e.result, session_id: e.session_id }
    } else {
      yield { type: 'error', content: `Session ended: ${e.subtype}`, session_id: e.session_id }
    }
  }
  // 'system' and other event types are informational only — skip
}
