import { config } from '../config'
import * as db from '../db/queries'
import { withTransaction } from '../db/connection'
import type { ClaudeEvent } from '../../shared/types'
import { callClaude } from './claude-client'
import { runDrySession, buildInitialPrompt } from './session'
import { ensureWorktree, removeWorktree } from './github'
import * as provisioner from './provisioner'
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

let currentTicketId: string | null = null

export function getCurrentTicketId(): string | null {
  return currentTicketId
}

class Scheduler {
  private running = false
  private intervalHandle: ReturnType<typeof setInterval> | null = null

  start(): void {
    console.log(`Scheduler starting, polling every ${config.pollIntervalMs}ms`)
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
    if (this.running) return
    this.running = true

    try {
      const ticket = await db.nextQueuedTicket()
      if (!ticket) { this.running = false; return }

      console.log(`[scheduler] Picked ticket ${ticket.id} "${ticket.title}" (P${ticket.priority})`)
      currentTicketId = ticket.id
      await this.process(ticket.id)
    } finally {
      this.running = false
      currentTicketId = null
    }
  }

  private async process(ticketId: string): Promise<void> {
    const ticket = await db.getTicket(ticketId)
    if (!ticket) return

    await emitTicketStatusChange(ticket.id, 'running')

    const isResume = !!ticket.session_id
    let prompt: string

    if (isResume) {
      const lastMsg = await db.getLastUserMessage(ticket.id)
      prompt = lastMsg ?? ''
      console.log(`[scheduler] Resuming ticket ${ticket.id} with session ${ticket.session_id}`)
    } else {
      prompt = buildInitialPrompt(ticket)
      console.log(`[scheduler] Starting ticket ${ticket.id} "${ticket.title}"`)
    }

    let containerId: string | undefined

    try {
      let eventSource: AsyncGenerator<ClaudeEvent>

      if (config.dryRun) {
        eventSource = runDrySession(ticket, isResume)
      } else {
        const project = await db.getProject(ticket.project_id)
        if (!project) throw new Error(`Project ${ticket.project_id} not found`)
        containerId = await provisioner.ensureRunning(project)
        const workDir = project.github_repo
          ? await ensureWorktree(containerId, ticket.id)
          : undefined
        eventSource = callClaude(containerId, prompt, ticket.session_id ?? undefined, workDir)
      }

      for await (const event of eventSource) {
        if (event.type === 'done') {
          await withTransaction(async (tx) => {
            await emitMessage(ticket.id, '', 'done', 'assistant', undefined, undefined, undefined, tx)
            if (event.session_id) await db.updateTicketSessionId(ticket.id, event.session_id, tx)
            await emitTicketStatusChange(ticket.id, 'done', undefined, tx)
          })
          if (containerId) {
            await removeWorktree(containerId, ticket.id).catch(err =>
              console.warn(`[scheduler] Failed to remove worktree for ${ticket.id}:`, err))
          }
          console.log(`[scheduler] Ticket ${ticket.id} completed`)
          await notify.send(`✅ Done: ${ticket.title}`)
          if (!config.dryRun) provisioner.scheduleIdleStop(ticket.project_id)
          break
        }

        if (event.type === 'paused') {
          await withTransaction(async (tx) => {
            await emitMessage(ticket.id, '', 'paused', 'assistant', undefined, undefined, undefined, tx)
            if (event.session_id) await db.updateTicketSessionId(ticket.id, event.session_id, tx)
            await emitTicketStatusChange(ticket.id, 'paused', undefined, tx)
          })
          console.log(`[scheduler] Ticket ${ticket.id} paused (waiting for input)`)
          await notify.send(`💬 Input needed: ${ticket.title}`, event.content)
          if (!config.dryRun) provisioner.scheduleIdleStop(ticket.project_id)
          break
        }

        if (event.type === 'error') {
          await withTransaction(async (tx) => {
            await emitMessage(ticket.id, event.content, 'error', 'assistant', undefined, undefined, undefined, tx)
            if (event.session_id) await db.updateTicketSessionId(ticket.id, event.session_id, tx)
            await emitTicketStatusChange(ticket.id, 'failed', event.content, tx)
          })
          console.error(`[scheduler] Ticket ${ticket.id} errored: ${event.content}`)
          await notify.send(`❌ Failed: ${ticket.title}`, event.content)
          if (!config.dryRun) provisioner.scheduleIdleStop(ticket.project_id)
          break
        }

        // Normal message events (text, tool_use, tool_result)
        await emitMessage(ticket.id, event.content, event.type, 'assistant', event.tool_name, event.tool_use_id, event.is_error)
      }
    } catch (err) {
      if (isQuotaError(err)) {
        await emitTicketStatusChange(ticket.id, 'queued')
        const delay = parseResetDelay(err) ?? config.retryDelayMs
        await notify.send(`⏳ Quota exceeded`, `Retrying in ${ms(delay)}`)
        console.warn(`Quota error, sleeping ${delay}ms`)
        await sleep(delay)
      } else {
        const errMsg = err instanceof Error ? err.message : String(err)
        console.error(`Ticket ${ticket.id} failed:`, err)
        await withTransaction(async (tx) => {
          await emitMessage(ticket.id, errMsg, 'error', 'system', undefined, undefined, undefined, tx)
          await emitTicketStatusChange(ticket.id, 'failed', errMsg, tx)
        })
        await notify.send(`❌ Failed: ${ticket.title}`, errMsg)
      }
      if (!config.dryRun) provisioner.scheduleIdleStop(ticket.project_id)
    }
  }
}

export const scheduler = new Scheduler()
