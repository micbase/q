import { PassThrough } from 'stream'
import { config } from '../config'
import { isQuestion } from './session'
import type { StreamEvent, EventType } from '../models/types'
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
  ticketId: string,
  containerId: string,
  prompt: string,
  sessionId?: string,
): AsyncGenerator<StreamEvent> {
  const cmd = ['claude', '-p', '--output-format', 'stream-json', '--dangerously-skip-permissions']
  if (sessionId) {
    cmd.push('--resume', sessionId)
  }

  const exec = await getDocker().getContainer(containerId).exec({
    Cmd: cmd,
    Env: [`ANTHROPIC_API_KEY=${config.anthropicApiKey}`],
    AttachStdin: true,
    AttachStdout: true,
    AttachStderr: true,
  })

  const duplex = await exec.start({ hijack: true, stdin: true })

  // Write prompt to stdin, then close stdin
  duplex.write(prompt)
  duplex.end()

  // Demux dockerode raw stream into separate stdout/stderr
  const stdout = new PassThrough()
  const stderr = new PassThrough()
  getDocker().modem.demuxStream(duplex, stdout, stderr)

  // Collect stderr for error reporting
  const stderrChunks: Buffer[] = []
  stderr.on('data', (chunk: Buffer) => stderrChunks.push(chunk))

  let buffer = ''

  try {
    for await (const chunk of stdout) {
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
          continue
        }

        yield* mapCLIEvent(event, ticketId)
      }
    }

    // Flush remaining buffer
    if (buffer.trim()) {
      try {
        const event: CLIEvent = JSON.parse(buffer.trim())
        yield* mapCLIEvent(event, ticketId)
      } catch {
        // ignore
      }
    }

    // Check exit code
    const inspectResult = await exec.inspect()
    if (inspectResult.ExitCode !== 0 && inspectResult.ExitCode !== null) {
      const stderrText = Buffer.concat(stderrChunks).toString().trim()
      throw new Error(`claude CLI exited with code ${inspectResult.ExitCode}: ${stderrText || '(no stderr)'}`)
    }
  } finally {
    stdout.destroy()
    stderr.destroy()
  }
}

// ─── Event mapping ────────────────────────────────────────────────────────────

function* mapCLIEvent(event: CLIEvent, ticketId: string): Generator<StreamEvent> {
  if (event.type === 'assistant') {
    const e = event as CLIAssistantEvent
    for (const block of e.message.content) {
      if (block.type === 'text' && block.text) {
        yield { type: 'text', content: block.text, ticket_id: ticketId }
      } else if (block.type === 'tool_use') {
        yield { type: 'tool_use', content: `[${block.name}]`, ticket_id: ticketId }
      }
    }
  } else if (event.type === 'result') {
    const e = event as CLIResultEvent
    if (e.subtype === 'success') {
      const type: EventType = isQuestion(e.result) ? 'paused' : 'done'
      yield { type, content: e.result, ticket_id: ticketId, session_id: e.session_id }
    } else {
      yield { type: 'error', content: `Session ended: ${e.subtype}`, ticket_id: ticketId, session_id: e.session_id }
    }
  }
  // 'system' and other event types are informational only — skip
}
