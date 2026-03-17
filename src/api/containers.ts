import type { FastifyInstance } from 'fastify'
import * as db from '../db/queries'
import * as provisioner from '../worker/provisioner'
import { config } from '../config'

interface TicketParams {
  id: string
}

export async function containerRoutes(app: FastifyInstance) {
  // GET /api/containers — list non-failed, non-deleted tickets with projects
  app.get('/containers', async (_req, reply) => {
    const [tickets, projects] = await Promise.all([
      db.listTickets(),
      db.listProjects(),
    ])
    const filtered = tickets.filter(t => t.status !== 'failed' && t.status !== 'deleted')
    return reply.send({ projects, tickets: filtered })
  })

  // POST /api/tickets/:id/container/start
  app.post<{ Params: TicketParams }>('/tickets/:id/container/start', async (req, reply) => {
    if (config.dryRun) return reply.status(400).send({ error: 'Not available in dry run mode' })
    const ticket = await db.getTicket(req.params.id)
    if (!ticket) return reply.status(404).send({ error: 'Not found' })
    if (ticket.status === 'failed' || ticket.status === 'deleted') {
      return reply.status(400).send({ error: 'Cannot start container for failed/deleted ticket' })
    }
    const project = await db.getProject(ticket.project_id)
    if (!project) return reply.status(404).send({ error: 'Project not found' })
    await provisioner.ensureRunning(project, ticket.id)
    return reply.status(204).send()
  })

  // POST /api/tickets/:id/container/stop
  app.post<{ Params: TicketParams }>('/tickets/:id/container/stop', async (req, reply) => {
    if (config.dryRun) return reply.status(400).send({ error: 'Not available in dry run mode' })
    const ticket = await db.getTicket(req.params.id)
    if (!ticket) return reply.status(404).send({ error: 'Not found' })
    await provisioner.stopContainer(ticket.id)
    return reply.status(204).send()
  })

  // POST /api/tickets/:id/container/restart
  app.post<{ Params: TicketParams }>('/tickets/:id/container/restart', async (req, reply) => {
    if (config.dryRun) return reply.status(400).send({ error: 'Not available in dry run mode' })
    const ticket = await db.getTicket(req.params.id)
    if (!ticket) return reply.status(404).send({ error: 'Not found' })
    if (ticket.status === 'failed' || ticket.status === 'deleted') {
      return reply.status(400).send({ error: 'Cannot restart container for failed/deleted ticket' })
    }
    const project = await db.getProject(ticket.project_id)
    if (!project) return reply.status(404).send({ error: 'Project not found' })
    await provisioner.stopContainer(ticket.id)
    await provisioner.ensureRunning(project, ticket.id)
    return reply.status(204).send()
  })
}
