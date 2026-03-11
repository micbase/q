import type { FastifyInstance } from 'fastify'
import * as db from '../db/queries'
import { withTransaction } from '../db/connection'
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

    const ticket = await withTransaction(async (tx) => {
      const t = await db.insertTicket(project_id, title, description, priority, tx)
      await emitMessage(t.id, description, 'text', 'user', undefined, tx)
      await emitTicketStatusChange(t.id, 'queued', undefined, tx)
      return t
    })

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
    const { title } = req.body
    const priority = req.body.priority !== undefined ? Number(req.body.priority) : undefined
    if (priority !== undefined && (!Number.isInteger(priority) || priority < 1 || priority > 5)) {
      return reply.status(400).send({ error: 'priority must be an integer 1-5' })
    }

    const updated = await withTransaction(async (tx) => {
      const ticket = await db.getTicket(req.params.id, tx)
      if (!ticket) return null
      if (ticket.status !== 'queued') return { conflict: true }
      await db.updateTicket(req.params.id, { title, priority }, tx)
      return await db.getTicket(req.params.id, tx)
    })

    if (updated === null) return reply.status(404).send({ error: 'Not found' })
    if ('conflict' in updated) return reply.status(409).send({ error: 'Can only edit queued tickets' })
    return reply.send(updated)
  })

  // DELETE /api/tickets/:id — soft delete (sets status to cancelled)
  app.delete<{ Params: TicketParams }>('/tickets/:id', async (req, reply) => {
    await withTransaction(async (tx) => {
      const ticket = await db.getTicket(req.params.id, tx)
      if (!ticket) { reply.status(404).send({ error: 'Not found' }); return }
      if (ticket.status === 'running') {
        reply.status(409).send({ error: 'Cannot cancel a running ticket' }); return
      }
      if (ticket.status === 'deleted') {
        reply.status(409).send({ error: 'Ticket is already deleted' }); return
      }
      await db.deleteTicket(req.params.id, tx)
      reply.status(204).send()
    })
  })
}
