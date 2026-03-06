import type { FastifyInstance } from 'fastify'
import * as db from '../db/queries'
import { broker } from '../broker/broker'
import type { StreamEvent } from '../models/types'

interface TicketParams {
  id: string
}

export async function streamRoutes(app: FastifyInstance) {
  // GET /api/tickets/:id/stream
  app.get<{ Params: TicketParams }>('/tickets/:id/stream', async (req, reply) => {
    const ticket = await db.getTicket(req.params.id)
    if (!ticket) return reply.status(404).send({ error: 'Not found' })

    const { id } = req.params
    const res = reply.raw

    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    })

    // Replay existing messages
    const messages = await db.getMessages(id)
    for (const msg of messages) {
      const event: StreamEvent = { type: msg.event_type, content: msg.content, ticket_id: id, role: msg.role }
      res.write(`data: ${JSON.stringify(event)}\n\n`)
    }

    // Subscribe to live events
    broker.subscribe(id, res)

    // Keepalive every 15s
    const keepalive = setInterval(() => {
      try {
        res.write(': keepalive\n\n')
      } catch {
        clearInterval(keepalive)
        broker.unsubscribe(id, res)
      }
    }, 15_000)

    req.socket.on('close', () => {
      clearInterval(keepalive)
      broker.unsubscribe(id, res)
    })

    // Don't return — keep connection open
    await new Promise<void>(resolve => {
      req.socket.on('close', resolve)
    })
  })
}
