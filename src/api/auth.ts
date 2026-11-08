import type { FastifyInstance } from 'fastify'
import * as claudeAuth from '../worker/claude-auth'
import { config } from '../config'

export async function authRoutes(app: FastifyInstance) {
  // GET /api/auth/status — summary of the shared Claude credentials (never returns tokens)
  app.get('/auth/status', async (_req, reply) => {
    if (config.dryRun) return reply.status(400).send({ error: 'Not available in dry run mode' })
    return reply.send(await claudeAuth.getStatus())
  })

  // POST /api/auth/login — start `claude auth login`, returns the OAuth URL to open
  app.post('/auth/login', async (_req, reply) => {
    if (config.dryRun) return reply.status(400).send({ error: 'Not available in dry run mode' })
    try {
      const url = await claudeAuth.startLogin()
      return reply.send({ url })
    } catch (err) {
      return reply.status(500).send({ error: (err as Error).message })
    }
  })

  // POST /api/auth/login/code — submit the code shown after authorizing
  app.post<{ Body: { code?: string } }>('/auth/login/code', async (req, reply) => {
    if (config.dryRun) return reply.status(400).send({ error: 'Not available in dry run mode' })
    const code = req.body?.code?.trim()
    if (!code) return reply.status(400).send({ error: 'code is required' })
    if (!claudeAuth.loginInProgress()) return reply.status(409).send({ error: 'No login in progress — start a new login' })
    try {
      return reply.send(await claudeAuth.submitCode(code))
    } catch (err) {
      return reply.status(400).send({ error: (err as Error).message })
    }
  })

  // DELETE /api/auth/login — cancel a pending login
  app.delete('/auth/login', async (_req, reply) => {
    await claudeAuth.cancelLogin()
    return reply.status(204).send()
  })
}
