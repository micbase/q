import { isQuestion } from './session'
import type { ClaudeEvent, MessageType } from '../../shared/types'
import { execInteractive } from './docker'

// ─── CLI event types (stream-json output) ─────────────────────────────────────

interface CLIContentBlock {
  type: string
  text?: string
  name?: string
  content?: string
  input?: unknown
  [key: string]: unknown
}

interface CLIMessageEvent {
  type: 'assistant' | 'user'
  message: {
    role: string
    content: CLIContentBlock[] | string
  }
}

interface CLIResultEvent {
  type: 'result'
  subtype: 'success' | 'error_max_turns' | string
  result: string
  session_id?: string
}

type CLIEvent = CLIMessageEvent | CLIResultEvent | { type: string; [key: string]: unknown }

// ─── Main export ──────────────────────────────────────────────────────────────

export async function* callClaude(
  containerId: string,
  prompt: string,
  logTag: string,
  sessionId?: string,
  workDir?: string,
): AsyncGenerator<ClaudeEvent> {
  const cmd = ['claude', '-p', '--verbose', '--output-format', 'stream-json', '--dangerously-skip-permissions']
  if (sessionId) {
    cmd.push('--resume', sessionId)
  }

  const t = `[claude ${logTag}]`
  console.log(`${t} exec: ${cmd.join(' ')}`)
  console.log(`${t} workDir: ${workDir ?? '/workspace'}`)
  console.log(`${t} prompt length: ${prompt.length} chars`)

  const { exec, duplex, stdout, stderr } = await execInteractive(containerId, cmd, {
    WorkingDir: workDir ?? '/workspace',
  })

  console.log(`${t} exec started, writing prompt to stdin`)

  // Write prompt to stdin, then close stdin
  duplex.write(prompt)
  duplex.end()
  console.log(`${t} stdin closed`)

  // Collect stderr for error reporting
  const stderrChunks: Buffer[] = []
  stderr.on('data', (chunk: Buffer) => {
    console.log(`${t} stderr: ${chunk.toString().trim()}`)
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
    console.log(`${t} watchdog: ${eventCount} events, silent ${silentSec}s, total ${totalSec}s`)
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
          console.log(`${t} unparseable line: ${trimmed.slice(0, 200)}`)
          continue
        }

        eventCount++
        if (event.type === 'result') {
          const e = event as CLIResultEvent
          console.log(`${t} result event: subtype=${e.subtype}, session_id=${e.session_id}`)
        }

        yield* mapCLIEvent(event)
      }
    }

    console.log(`${t} stdout ended after ${eventCount} events, ${((Date.now() - startTime) / 1000).toFixed(1)}s`)

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
        console.log(`${t} unparseable trailing buffer: ${buffer.trim().slice(0, 200)}`)
      }
    }

    // Check exit code
    console.log(`${t} inspecting exec exit code...`)
    const inspectResult = await exec.inspect()
    console.log(`${t} exit code: ${inspectResult.ExitCode}`)
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
  if (event.type === 'assistant' || event.type === 'user') {
    const e = event as CLIMessageEvent
    const role = event.type as 'assistant' | 'user'
    const blocks = Array.isArray(e.message.content) ? e.message.content : []
    for (const block of blocks) {
      if (block.type === 'thinking' && (block as any).thinking) {
        yield { type: 'thinking', role, content: (block as any).thinking }
      } else if (block.type === 'text' && block.text) {
        yield { type: 'text', role, content: block.text }
      } else if (block.type === 'tool_use') {
        const inputStr = block.input ? JSON.stringify(block.input, null, 2) : ''
        yield {
          type: 'tool_use',
          role,
          content: inputStr,
          tool_name: block.name ?? 'unknown',
          tool_use_id: block.id as string,
          tool_input: inputStr,
          parent_tool_use_id: block.parent_tool_use_id as string | undefined,
        }
      } else if (block.type === 'tool_result') {
        const content = typeof block.content === 'string'
          ? block.content
          : Array.isArray(block.content)
            ? (block.content as CLIContentBlock[])
                .map(b => b.text ?? JSON.stringify(b))
                .join('\n')
            : JSON.stringify(block.content ?? '')
        if (content) {
          yield {
            type: 'tool_result',
            role,
            content,
            tool_use_id: block.tool_use_id as string,
            tool_result_content: content,
            tool_result_for_id: block.tool_use_id as string,
            is_error: block.is_error === true || undefined,
            parent_tool_use_id: block.parent_tool_use_id as string | undefined,
          }
        }
      }
    }
  } else if (event.type === 'result') {
    const e = event as CLIResultEvent
    if (e.subtype === 'success') {
      const type: MessageType = isQuestion(e.result) ? 'paused' : 'done'
      yield { type, role: 'assistant', content: e.result, claude_session_id: e.session_id }
    } else {
      yield { type: 'error', role: 'assistant', content: `Session ended: ${e.subtype}`, claude_session_id: e.session_id }
    }
  } else if (event.type !== 'system') {
    console.log(`[claude] unhandled event type: ${event.type} ${JSON.stringify(event).slice(0, 300)}`)
  }
}
