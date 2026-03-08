import { config } from '../config'
import * as db from '../db/queries'
import { broker } from '../broker/broker'
import { callClaude } from './claude-client'
import { runDrySession, buildInitialPrompt } from './session'
import * as provisioner from './provisioner'
import * as notify from './notify'
import type { EventType } from '../models/types'
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

function roleFromEventType(type: EventType): 'user' | 'assistant' | 'system' {
  switch (type) {
    case 'tool_use':
    case 'tool_result':
    case 'text':
    case 'done':
    case 'paused':
    case 'error':
      return 'assistant'
    default:
      return 'assistant'
  }
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

    await db.updateTicketStatus(ticket.id, 'running')

    const isResume = !!ticket.session_id
    let prompt: string

    if (isResume) {
      // On resume, send the last user reply as the prompt
      const lastMsg = await db.getLastUserMessage(ticket.id)
      prompt = lastMsg ?? ''
      console.log(`[scheduler] Resuming ticket ${ticket.id} with session ${ticket.session_id}`)
    } else {
      // First run: build initial prompt and persist to messages
      prompt = buildInitialPrompt(ticket)
      await db.insertMessage(ticket.id, 'user', prompt, 'text')
      console.log(`[scheduler] Starting ticket ${ticket.id} "${ticket.title}"`)
    }

    try {
      const eventSource = config.dryRun
        ? runDrySession(ticket, isResume)
        : await (async () => {
            const project = await db.getProject(ticket.project_id)
            if (!project) throw new Error(`Project ${ticket.project_id} not found`)
            const containerId = await provisioner.ensureRunning(project)
            return callClaude(ticket.id, containerId, prompt, ticket.session_id ?? undefined)
          })()

      for await (const event of eventSource) {
        // Persist to DB
        await db.insertMessage(ticket.id, roleFromEventType(event.type), event.content, event.type)

        // Broadcast to SSE clients
        broker.publish(event)

        if (event.type === 'done') {
          console.log(`[scheduler] Ticket ${ticket.id} completed`)
          if (event.session_id) await db.updateTicketSessionId(ticket.id, event.session_id)
          await db.updateTicketStatus(ticket.id, 'done')
          await notify.send(`✅ Done: ${ticket.title}`)
          if (!config.dryRun) provisioner.scheduleIdleStop(ticket.project_id)
          break
        }

        if (event.type === 'paused') {
          console.log(`[scheduler] Ticket ${ticket.id} paused (waiting for input)`)
          if (event.session_id) await db.updateTicketSessionId(ticket.id, event.session_id)
          await db.updateTicketStatus(ticket.id, 'paused')
          await notify.send(`💬 Input needed: ${ticket.title}`, event.content)
          if (!config.dryRun) provisioner.scheduleIdleStop(ticket.project_id)
          break
        }

        if (event.type === 'error') {
          console.error(`[scheduler] Ticket ${ticket.id} errored: ${event.content}`)
          if (event.session_id) await db.updateTicketSessionId(ticket.id, event.session_id)
          await db.updateTicketStatusFailed(ticket.id, event.content)
          await notify.send(`❌ Failed: ${ticket.title}`, event.content)
          if (!config.dryRun) provisioner.scheduleIdleStop(ticket.project_id)
          break
        }
      }
    } catch (err) {
      if (isQuotaError(err)) {
        await db.updateTicketStatus(ticket.id, 'queued')
        const delay = parseResetDelay(err) ?? config.retryDelayMs
        await notify.send(`⏳ Quota exceeded`, `Retrying in ${ms(delay)}`)
        console.warn(`Quota error, sleeping ${delay}ms`)
        await sleep(delay)
      } else {
        const errMsg = err instanceof Error ? err.message : String(err)
        console.error(`Ticket ${ticket.id} failed:`, err)
        await db.updateTicketStatusFailed(ticket.id, errMsg)
        await db.insertMessage(ticket.id, 'system', errMsg, 'error')
        broker.publish({ type: 'error', content: errMsg, ticket_id: ticket.id })
        await notify.send(`❌ Failed: ${ticket.title}`, errMsg)
        if (!config.dryRun) provisioner.scheduleIdleStop(ticket.project_id)
      }
    }
  }
}

export const scheduler = new Scheduler()
