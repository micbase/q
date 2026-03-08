import type { FastifyInstance } from 'fastify'
import * as db from '../db/queries'
import { emitMessage, emitTicketStatusChange } from '../broker/emit'

interface CreateTicketBody {
  project_id: string
  title: string
  description: string
  priority?: number
}

interface UpdateTicketBody {
  title?: string
  priority?: number
}

interface TicketParams {
  id: string
}

export async function ticketRoutes(app: FastifyInstance) {
  // GET /api/tickets
  app.get('/tickets', async (_req, reply) => {
    const tickets = await db.listTickets()
    return reply.send(tickets)
  })

  // POST /api/tickets
  app.post<{ Body: CreateTicketBody }>('/tickets', async (req, reply) => {
    const { project_id, title, description } = req.body
    const priority = Number(req.body.priority ?? 3)
    if (!project_id || !title || !description) {
      return reply.status(400).send({ error: 'project_id, title, description are required' })
    }
    if (!Number.isInteger(priority) || priority < 1 || priority > 5) {
      return reply.status(400).send({ error: 'priority must be an integer 1-5' })
    }
    const project = await db.getProject(project_id)
    if (!project) {
      return reply.status(404).send({ error: 'Project not found' })
    }
    const ticket = await db.insertTicket(project_id, title, description, priority)

    // Insert the description as the first message so it shows in chat immediately
    await emitMessage(ticket.id, description, 'text', 'user')
    await emitTicketStatusChange(ticket.id, 'queued')

    return reply.status(201).send(ticket)
  })

  // GET /api/tickets/:id
  app.get<{ Params: TicketParams }>('/tickets/:id', async (req, reply) => {
    const ticket = await db.getTicket(req.params.id)
    if (!ticket) return reply.status(404).send({ error: 'Not found' })
    return reply.send(ticket)
  })

  // PATCH /api/tickets/:id
  app.patch<{ Params: TicketParams; Body: UpdateTicketBody }>('/tickets/:id', async (req, reply) => {
    const ticket = await db.getTicket(req.params.id)
    if (!ticket) return reply.status(404).send({ error: 'Not found' })
    if (ticket.status !== 'queued') {
      return reply.status(409).send({ error: 'Can only edit queued tickets' })
    }
    const { title } = req.body
    const priority = req.body.priority !== undefined ? Number(req.body.priority) : undefined
    if (priority !== undefined && (!Number.isInteger(priority) || priority < 1 || priority > 5)) {
      return reply.status(400).send({ error: 'priority must be an integer 1-5' })
    }
    await db.updateTicket(req.params.id, { title, priority })
    const updated = await db.getTicket(req.params.id)
    return reply.send(updated)
  })

  // DELETE /api/tickets/:id — soft delete (sets status to cancelled)
  app.delete<{ Params: TicketParams }>('/tickets/:id', async (req, reply) => {
    const ticket = await db.getTicket(req.params.id)
    if (!ticket) return reply.status(404).send({ error: 'Not found' })
    if (ticket.status === 'running') {
      return reply.status(409).send({ error: 'Cannot cancel a running ticket' })
    }
    if (ticket.status === 'deleted') {
      return reply.status(409).send({ error: 'Ticket is already deleted' })
    }
    await db.deleteTicket(req.params.id)
    return reply.status(204).send()
  })
}
