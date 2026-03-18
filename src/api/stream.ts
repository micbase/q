import type { FastifyInstance } from 'fastify'
import * as db from '../db/queries'
import { broker, GLOBAL_CHANNEL } from '../broker/broker'
import type { StreamEvent } from '../../shared/types'

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

    // Replay existing messages as NewMessage events
    const messages = await db.getMessages(id)
    for (const msg of messages) {
      const event: StreamEvent = {
        type: 'NewMessage',
        ticket_id: id,
        content: msg.content,
        message_type: msg.type,
        tool_name: msg.tool_name,
        tool_use_id: msg.tool_use_id,
        tool_input: msg.tool_input,
        tool_result_content: msg.tool_result_content,
        tool_result_for_id: msg.tool_result_for_id,
        is_error: msg.is_error,
        parent_tool_use_id: msg.parent_tool_use_id,
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
