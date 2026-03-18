import type { FastifyInstance } from 'fastify'
import * as db from '../db/queries'
import { broker, GLOBAL_CHANNEL } from '../broker/broker'

interface TicketParams {
  id: string
}

export async function streamRoutes(app: FastifyInstance) {
  // GET /api/events — global stream for all ticket/container status changes
  app.get('/events', async (req, reply) => {
    const res = reply.raw

    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    })

    broker.subscribe(GLOBAL_CHANNEL, res)

    const keepalive = setInterval(() => {
      try {
        res.write(': keepalive\n\n')
      } catch {
        clearInterval(keepalive)
        broker.unsubscribe(GLOBAL_CHANNEL, res)
      }
    }, 15_000)

    await new Promise<void>(resolve => {
      req.socket.on('close', () => {
        clearInterval(keepalive)
        broker.unsubscribe(GLOBAL_CHANNEL, res)
        resolve()
      })
    })
  })

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

    // Replay existing messages — Message satisfies MessageStreamEvent structurally
    const messages = await db.getMessages(id)
    for (const msg of messages) {
      try {
        res.write(`data: ${JSON.stringify(msg)}\n\n`)
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
