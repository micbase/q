import type { FastifyInstance } from 'fastify'
import * as db from '../db/queries'
import { broker } from '../broker/broker'
import type { StreamEvent } from '../../shared/types'

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

    // Replay existing messages as NewMessage events
    const messages = await db.getMessages(id)
    for (const msg of messages) {
      const event: StreamEvent = {
        type: 'NewMessage',
        ticket_id: id,
        content: msg.content,
        message_type: msg.event_type,
        role: msg.role,
      }
      try {
        res.write(`data: ${JSON.stringify(event)}\n\n`)
      } catch {
        return // client disconnected during replay
      }
    }

    // Send current ticket status
    const currentTicket = await db.getTicket(id)
    if (currentTicket) {
      const statusEvent: StreamEvent = {
        type: 'TicketStatusChange',
        ticket_id: id,
        ticket_status: currentTicket.status,
      }
      try {
        res.write(`data: ${JSON.stringify(statusEvent)}\n\n`)
      } catch {
        return // client disconnected during replay
      }
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

    // Don't return — keep connection open
    await new Promise<void>(resolve => {
      req.socket.on('close', () => {
        clearInterval(keepalive)
        broker.unsubscribe(id, res)
        resolve()
      })
    })
  })
}
