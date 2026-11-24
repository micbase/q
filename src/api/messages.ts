import type { FastifyInstance } from 'fastify'
import * as db from '../db/queries'
import { withTransaction } from '../db/connection'
import { emitMessage, emitTicketStatusChange } from '../broker/emit'
import { normalizeEffort, normalizeModel } from './model'
import type { AttachmentMeta } from '../../shared/types'

interface TicketParams {
  id: string
}

interface ReplyAttachment {
  media_type: string
  data: string           // base64-encoded image bytes (no data: URL prefix)
  name?: string
}

interface ReplyBody {
  content?: string
  model?: string | null   // if present, switch the ticket's model before re-queueing
  effort?: string | null  // if present, switch the ticket's effort before re-queueing
  attachments?: ReplyAttachment[]
}

// Image types the Claude API accepts
export const ALLOWED_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp']
export const MAX_ATTACHMENTS = 10
// The API rejects images over 5 MB once base64-encoded, i.e. ~3.75 MB of raw bytes
export const MAX_ATTACHMENT_BYTES = Math.floor(5 * 1024 * 1024 * 3 / 4)

type ParsedAttachment = { mediaType: string; data: Buffer; name?: string }

/** Validate and decode reply attachments; returns an error string on invalid input */
export function parseAttachments(input: unknown): ParsedAttachment[] | string {
  if (input === undefined || input === null) return []
  if (!Array.isArray(input)) return 'attachments must be an array'
  if (input.length > MAX_ATTACHMENTS) return `at most ${MAX_ATTACHMENTS} attachments allowed`
  const out: ParsedAttachment[] = []
  for (const a of input) {
    if (!a || typeof a !== 'object') return 'invalid attachment'
    const { media_type, data, name } = a as Record<string, unknown>
    if (typeof media_type !== 'string' || !ALLOWED_IMAGE_TYPES.includes(media_type)) {
      return `unsupported attachment type: ${String(media_type)} (allowed: ${ALLOWED_IMAGE_TYPES.join(', ')})`
    }
    if (typeof data !== 'string' || !data || !/^[A-Za-z0-9+/]+={0,2}$/.test(data)) {
      return 'attachment data must be base64'
    }
    const buf = Buffer.from(data, 'base64')
    if (buf.length > MAX_ATTACHMENT_BYTES) {
      return `attachment too large (max ${(MAX_ATTACHMENT_BYTES / 1024 / 1024).toFixed(2)} MB)`
    }
    const cleanName = typeof name === 'string' && name.trim() ? name.trim().slice(0, 255) : undefined
    out.push({ mediaType: media_type, data: buf, name: cleanName })
  }
  return out
}

export async function messageRoutes(app: FastifyInstance) {
  // GET /api/tickets/:id/messages
  app.get<{ Params: TicketParams }>('/tickets/:id/messages', async (req, reply) => {
    const ticket = await db.getTicket(req.params.id)
    if (!ticket) return reply.status(404).send({ error: 'Not found' })
    const messages = await db.getMessages(req.params.id)
    return reply.send(messages)
  })

  // GET /api/attachments/:id — raw image bytes
  app.get<{ Params: TicketParams }>('/attachments/:id', async (req, reply) => {
    const att = await db.getAttachment(req.params.id)
    if (!att) return reply.status(404).send({ error: 'Not found' })
    return reply
      .header('Content-Type', att.media_type)
      .header('Cache-Control', 'private, max-age=31536000, immutable')
      .header('X-Content-Type-Options', 'nosniff')
      .send(att.data)
  })

  // POST /api/tickets/:id/reply
  app.post<{ Params: TicketParams; Body: ReplyBody }>('/tickets/:id/reply', {
    // Room for MAX_ATTACHMENTS base64 images plus the text
    bodyLimit: MAX_ATTACHMENTS * Math.ceil(MAX_ATTACHMENT_BYTES * 4 / 3) + 1024 * 1024,
  }, async (req, reply) => {
    const content = typeof req.body?.content === 'string' ? req.body.content.trim() : ''
    const attachments = parseAttachments(req.body?.attachments)
    if (typeof attachments === 'string') {
      return reply.status(400).send({ error: attachments })
    }
    if (!content && !attachments.length) {
      return reply.status(400).send({ error: 'content or attachments required' })
    }
    const hasModel = 'model' in req.body
    const model = hasModel ? normalizeModel(req.body.model) : undefined
    if (hasModel && model === undefined) {
      return reply.status(400).send({ error: 'invalid model' })
    }
    const hasEffort = 'effort' in req.body
    const effort = hasEffort ? normalizeEffort(req.body.effort) : undefined
    if (hasEffort && effort === undefined) {
      return reply.status(400).send({ error: 'invalid effort' })
    }

    await withTransaction(async (tx) => {
      const ticket = await db.getTicket(req.params.id, tx)
      if (!ticket) { reply.status(404).send({ error: 'Not found' }); return }
      if (ticket.status !== 'paused' && ticket.status !== 'done' && ticket.status !== 'failed') {
        reply.status(409).send({ error: 'Ticket is not paused, done, or failed' }); return
      }

      if (model !== undefined || effort !== undefined) await db.updateTicket(req.params.id, { model, effort }, tx)
      const metas: AttachmentMeta[] = []
      for (const a of attachments) {
        metas.push(await db.insertAttachment(req.params.id, a.mediaType, a.data, a.name, tx))
      }
      await emitMessage(req.params.id, content, 'text', 'user', { attachments: metas }, tx)
      await emitTicketStatusChange(req.params.id, 'queued', undefined, tx)
    })

    return reply.status(204).send()
  })
}
