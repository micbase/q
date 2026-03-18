import type { Ticket, ClaudeEvent } from '../../shared/types'

// ─── System prompt + initial prompt ──────────────────────────────────────────

export function buildInitialPrompt(ticket: Ticket): string {
  const system = `You are an autonomous software development agent working inside a Docker container.
You have full permission to read and modify files in the working directory.
Run in fully autonomous mode — do not ask for permission before taking actions.

You are already on git branch q/${ticket.id}. For this task:
- Commit frequently with descriptive messages
- Push the branch when the task is complete
- If something is truly blocking and you cannot make a reasonable decision, ask exactly ONE concise question and stop
- Do not ask multiple questions at once
- Do not ask for permission — just act`

  return `${system}\n\n${ticket.description}`
}

// ─── Question heuristic ───────────────────────────────────────────────────────

export function isQuestion(text: string): boolean {
  const t = text.trim()
  if (t.endsWith('?')) return true
  const phrases = [
    'could you clarify', 'which would you prefer', 'should i',
    'do you want', 'would you like', 'can you confirm', 'please let me know',
  ]
  const lower = t.toLowerCase()
  return phrases.some(p => lower.includes(p))
}

// ─── Dry run session ──────────────────────────────────────────────────────────

function shouldAskQuestion(ticket: Ticket): boolean {
  return ticket.priority <= 2
}

export async function* runDrySession(
  ticket: Ticket,
  isResume: boolean,
  log?: (line: string) => void,
): AsyncGenerator<ClaudeEvent> {
  const delay = (ms: number) => new Promise<void>(res => setTimeout(res, ms))

  log?.(`exec: claude -p --verbose --output-format stream-json --dangerously-skip-permissions`)
  log?.(`workDir: /workspace`)
  log?.(`prompt length: ${ticket.description.length} chars`)

  await delay(800)
  log?.('exec started, writing prompt to stdin')
  log?.('stdin closed')

  yield { type: 'thinking', role: 'assistant', content: `Analyzing the ticket: ${ticket.title}. Let me look at the codebase structure first.` }

  await delay(400)
  log?.('assistant text: [DRY RUN] Starting task')
  yield { type: 'text', role: 'assistant', content: `[DRY RUN] Starting task: ${ticket.title}` }

  await delay(600)
  log?.('tool_use: Read {"file_path": "src/"}')
  yield { type: 'tool_use', role: 'assistant', tool_name: 'Read', tool_use_id: 'dry_1', tool_input: '{"file_path": "src/"}', content: '{"file_path": "src/"}' }

  await delay(400)
  log?.('tool_result: src/ main.ts config.ts')
  yield { type: 'tool_result', role: 'user', tool_use_id: 'dry_1', tool_result_for_id: 'dry_1', tool_result_content: 'src/\n  main.ts\n  config.ts\n', content: 'src/\n  main.ts\n  config.ts\n' }

  await delay(700)
  log?.('assistant text: [DRY RUN] Analyzing codebase...')
  yield { type: 'text', role: 'assistant', content: '[DRY RUN] Analyzing codebase...' }

  await delay(500)
  log?.('tool_use: Bash {"command": "npm test"}')
  yield { type: 'tool_use', role: 'assistant', tool_name: 'Bash', tool_use_id: 'dry_2', tool_input: '{"command": "npm test"}', content: '{"command": "npm test"}' }

  await delay(1000)
  log?.('tool_result: All tests passed.')
  yield { type: 'tool_result', role: 'user', tool_use_id: 'dry_2', tool_result_for_id: 'dry_2', tool_result_content: 'All tests passed.', content: 'All tests passed.' }

  await delay(600)

  if (!isResume && shouldAskQuestion(ticket)) {
    log?.('result event: subtype=paused (question detected)')
    yield {
      type: 'text', role: 'assistant',
      content: '[DRY RUN] Should I create a new migration file or modify the existing one?',
    }
    yield { type: 'paused', role: 'assistant', content: '' }
  } else {
    log?.(`stdout ended after 6 events, 3.5s`)
    log?.('exit code: 0')
    yield {
      type: 'text', role: 'assistant',
      content: `[DRY RUN] Task complete. Branch q/${ticket.id} pushed.`,
    }
    yield { type: 'done', role: 'assistant', content: '' }
  }
}
