import type { FastifyInstance } from 'fastify'
import * as db from '../db/queries'
import { withTransaction } from '../db/connection'
import { emitMessage, emitTicketStatusChange } from '../broker/emit'
import { normalizeModel } from './model'

interface TicketParams {
  id: string
}

interface ReplyBody {
  content: string
  model?: string | null  // if present, switch the ticket's model before re-queueing
}

export async function messageRoutes(app: FastifyInstance) {
  // GET /api/tickets/:id/messages
  app.get<{ Params: TicketParams }>('/tickets/:id/messages', async (req, reply) => {
    const ticket = await db.getTicket(req.params.id)
    if (!ticket) return reply.status(404).send({ error: 'Not found' })
    const messages = await db.getMessages(req.params.id)
    return reply.send(messages)
  })

  // POST /api/tickets/:id/reply
  app.post<{ Params: TicketParams; Body: ReplyBody }>('/tickets/:id/reply', async (req, reply) => {
    const { content } = req.body
    if (!content?.trim()) {
      return reply.status(400).send({ error: 'content is required' })
    }
    const hasModel = 'model' in req.body
    const model = hasModel ? normalizeModel(req.body.model) : undefined
    if (hasModel && model === undefined) {
      return reply.status(400).send({ error: 'invalid model' })
    }

    await withTransaction(async (tx) => {
      const ticket = await db.getTicket(req.params.id, tx)
      if (!ticket) { reply.status(404).send({ error: 'Not found' }); return }
      if (ticket.status !== 'paused' && ticket.status !== 'done' && ticket.status !== 'failed') {
        reply.status(409).send({ error: 'Ticket is not paused, done, or failed' }); return
      }

      if (model !== undefined) await db.updateTicket(req.params.id, { model }, tx)
      await emitMessage(req.params.id, content, 'text', 'user', {}, tx)
      await emitTicketStatusChange(req.params.id, 'queued', undefined, tx)
    })

    return reply.status(204).send()
  })
}
