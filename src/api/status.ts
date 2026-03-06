import type { FastifyInstance } from 'fastify'
import { config } from '../config'
import * as db from '../db/queries'
import { getCurrentTicketId } from '../worker/scheduler'

export async function statusRoutes(app: FastifyInstance) {
  // GET /api/status
  app.get('/status', async (_req, reply) => {
    const [queue_depth, paused_count] = await Promise.all([
      db.countQueuedTickets(),
      db.countPausedTickets(),
    ])
    return reply.send({
      running_ticket: getCurrentTicketId(),
      queue_depth,
      paused_count,
      dry_run: config.dryRun,
    })
  })
}
