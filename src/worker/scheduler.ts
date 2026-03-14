import { config } from '../config'
import * as db from '../db/queries'
import { withTransaction } from '../db/connection'
import type { ClaudeEvent } from '../../shared/types'
import { callClaude } from './claude-client'
import { runDrySession, buildInitialPrompt } from './session'
import { ensureWorktree, removeWorktree } from './github'
import * as provisioner from './provisioner'
import { runDevCommand } from './dev-command'
import * as notify from './notify'
import { emitMessage, emitTicketStatusChange } from '../broker/emit'
import ms from 'ms'

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function isQuotaError(err: unknown): boolean {
  const msg = String(err).toLowerCase()
  return msg.includes('rate_limit') || msg.includes('429') ||
    msg.includes('quota') || msg.includes('overloaded')
}

function parseResetDelay(err: unknown): number | null {
  const msg = String(err)
  const match = msg.match(/retry.after[:\s]+(\d+)/i)
  if (match) return parseInt(match[1], 10) * 1000
  return null
}

const runningTickets = new Set<string>()

export function getRunningTicketIds(): string[] {
  return Array.from(runningTickets)
}

class Scheduler {
  private intervalHandle: ReturnType<typeof setInterval> | null = null

  start(): void {
    console.log(`[scheduler] Starting, polling every ${config.pollIntervalMs}ms (max concurrent: ${config.maxConcurrentTickets})`)
    this.intervalHandle = setInterval(() => void this.tick(), config.pollIntervalMs)
    void this.tick()
  }

  stop(): void {
    if (this.intervalHandle) {
      clearInterval(this.intervalHandle)
      this.intervalHandle = null
    }
  }

  private async tick(): Promise<void> {
    while (runningTickets.size < config.maxConcurrentTickets) {
      const ticket = await db.nextQueuedTicket()
      if (!ticket) break

      console.log(`[scheduler] Picked ticket ${ticket.id} "${ticket.title}" (P${ticket.priority}) [${runningTickets.size + 1}/${config.maxConcurrentTickets}]`)
      runningTickets.add(ticket.id)
      await emitTicketStatusChange(ticket.id, 'running')

      // Fire-and-forget — don't await so we can fill remaining slots
      this.process(ticket.id).finally(() => {
        runningTickets.delete(ticket.id)
      })
    }
  }

  private async process(ticketId: string): Promise<void> {
    const ticket = await db.getTicket(ticketId)
    if (!ticket) return

    const sessionId = await db.getLastClaudeSessionId(ticket.id)
    const isResume = !!sessionId
    let prompt: string

    if (isResume) {
      const lastMsg = await db.getLastUserMessage(ticket.id)
      prompt = lastMsg ?? ''
      console.log(`[scheduler] Resuming ticket ${ticket.id} with session ${sessionId}`)
    } else {
      prompt = buildInitialPrompt(ticket)
      console.log(`[scheduler] Starting ticket ${ticket.id} "${ticket.title}"`)
    }

    let containerId: string | undefined
    let logTag: string | undefined

    try {
      let eventSource: AsyncGenerator<ClaudeEvent>

      if (config.dryRun) {
        eventSource = runDrySession(ticket, isResume)
      } else {
        const project = await db.getProject(ticket.project_id)
        if (!project) throw new Error(`Project ${ticket.project_id} not found`)
        containerId = await provisioner.ensureRunning(project, ticket.id)
        logTag = provisioner.getContainerTag(ticket.id)
        let workDir: string | undefined
        if (project.github_repo) {
          try {
            workDir = await ensureWorktree(containerId, ticket.id, logTag)
          } catch (err) {
            console.error(`[scheduler] Failed to create worktree for ${ticket.id}:`, err)
            throw err
          }
        }
        if (project.dev_command) {
          try {
            await runDevCommand(containerId, project.dev_command, workDir ?? '/workspace', logTag, project.dev_envs)
          } catch (err) {
            console.error(`[scheduler] Failed to start dev server for ${ticket.id}:`, err)
            throw err
          }
        }
        eventSource = callClaude(containerId, prompt, logTag, sessionId ?? undefined, workDir)
      }

      for await (const event of eventSource) {
        if (event.type === 'done') {
          await withTransaction(async (tx) => {
            await emitMessage(ticket.id, '', 'done', event.role, { claudeSessionId: event.claude_session_id }, tx)
            await emitTicketStatusChange(ticket.id, 'done', undefined, tx)
          })
          if (containerId) {
            await removeWorktree(containerId, ticket.id, logTag!).catch(err =>
              console.warn(`[scheduler] Failed to remove worktree for ${ticket.id}:`, err))
          }
          console.log(`[scheduler] Ticket ${ticket.id} completed`)
          await notify.send(`✅ Done: ${ticket.title}`)
          if (!config.dryRun) provisioner.scheduleIdleStop(ticket.id)
          break
        }

        if (event.type === 'paused') {
          await withTransaction(async (tx) => {
            await emitMessage(ticket.id, '', 'paused', event.role, { claudeSessionId: event.claude_session_id }, tx)
            await emitTicketStatusChange(ticket.id, 'paused', undefined, tx)
          })
          console.log(`[scheduler] Ticket ${ticket.id} paused (waiting for input)`)
          await notify.send(`💬 Input needed: ${ticket.title}`, event.content)
          if (!config.dryRun) provisioner.scheduleIdleStop(ticket.id)
          break
        }

        if (event.type === 'error') {
          await withTransaction(async (tx) => {
            await emitMessage(ticket.id, event.content, 'error', event.role, { claudeSessionId: event.claude_session_id }, tx)
            await emitTicketStatusChange(ticket.id, 'failed', event.content, tx)
          })
          console.error(`[scheduler] Ticket ${ticket.id} errored: ${event.content}`)
          await notify.send(`❌ Failed: ${ticket.title}`, event.content)
          if (!config.dryRun) provisioner.scheduleIdleStop(ticket.id)
          break
        }

        // Normal message events (text, thinking, tool_use, tool_result)
        await emitMessage(ticket.id, event.content, event.type, event.role, {
          toolName: event.tool_name,
          toolUseId: event.tool_use_id,
          toolInput: event.tool_input,
          toolResultContent: event.tool_result_content,
          toolResultForId: event.tool_result_for_id,
          isError: event.is_error,
          parentToolUseId: event.parent_tool_use_id,
        })
      }
    } catch (err) {
      if (isQuotaError(err)) {
        await emitTicketStatusChange(ticket.id, 'queued')
        const delay = parseResetDelay(err) ?? config.retryDelayMs
        await notify.send(`⏳ Quota exceeded`, `Retrying in ${ms(delay)}`)
        console.warn(`[scheduler] Quota error, sleeping ${delay}ms`)
        await sleep(delay)
      } else {
        const errMsg = err instanceof Error ? err.message : String(err)
        console.error(`[scheduler] Ticket ${ticket.id} failed:`, err)
        await withTransaction(async (tx) => {
          await emitMessage(ticket.id, errMsg, 'error', 'system', {}, tx)
          await emitTicketStatusChange(ticket.id, 'failed', errMsg, tx)
        })
        await notify.send(`❌ Failed: ${ticket.title}`, errMsg)
      }
      if (!config.dryRun) provisioner.scheduleIdleStop(ticket.id)
    }
  }
}

export const scheduler = new Scheduler()
