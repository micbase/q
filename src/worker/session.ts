import type { Ticket, ClaudeEvent } from '../../shared/types'

// ─── System prompt + initial prompt ──────────────────────────────────────────

export function buildInitialPrompt(ticket: Ticket): string {
  const system = `You are an autonomous software development agent working inside a Docker container.
You have full permission to read and modify files in the working directory.
Run in fully autonomous mode — do not ask for permission before taking actions.

For this task:
- Create and work in a git branch named: q/${ticket.id}
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
): AsyncGenerator<ClaudeEvent> {
  const delay = (ms: number) => new Promise<void>(res => setTimeout(res, ms))

  await delay(800)
  yield { type: 'text', content: `[DRY RUN] Starting task: ${ticket.title}` }

  await delay(600)
  yield { type: 'tool_use', tool_name: 'Read', content: '{"file_path": "src/"}' }

  await delay(400)
  yield { type: 'tool_result', content: 'src/\n  main.ts\n  config.ts\n' }

  await delay(700)
  yield { type: 'text', content: '[DRY RUN] Analyzing codebase...' }

  await delay(500)
  yield { type: 'tool_use', tool_name: 'Bash', content: '{"command": "npm test"}' }

  await delay(1000)
  yield { type: 'tool_result', content: 'All tests passed.' }

  await delay(600)

  if (!isResume && shouldAskQuestion(ticket)) {
    yield {
      type: 'text',
      content: '[DRY RUN] Should I create a new migration file or modify the existing one?',
    }
    yield { type: 'paused', content: '' }
  } else {
    yield {
      type: 'text',
      content: `[DRY RUN] Task complete. Branch q/${ticket.id} pushed.`,
    }
    yield { type: 'done', content: '' }
  }
}
