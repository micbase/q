import type { FastifyInstance } from 'fastify'
import * as db from '../db/queries'
import { emitMessage, emitTicketStatusChange } from '../broker/emit'

interface TicketParams {
  id: string
}

interface ReplyBody {
  content: string
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
    const ticket = await db.getTicket(req.params.id)
    if (!ticket) return reply.status(404).send({ error: 'Not found' })
    if (ticket.status !== 'paused' && ticket.status !== 'done') {
      return reply.status(409).send({ error: 'Ticket is not paused or done' })
    }

    const { content } = req.body
    if (!content?.trim()) {
      return reply.status(400).send({ error: 'content is required' })
    }

    await emitMessage(req.params.id, content, 'text', 'user')
    await emitTicketStatusChange(req.params.id, 'queued')

    return reply.status(204).send()
  })
}
