import Fastify from 'fastify'
import fastifyStatic from '@fastify/static'
import path from 'path'
import { ticketRoutes } from './tickets'
import { messageRoutes } from './messages'
import { streamRoutes } from './stream'
import { projectRoutes } from './projects'
import { statusRoutes } from './status'

export async function buildServer() {
  const app = Fastify({ logger: { level: 'warn' } })

  // Serve built Vue UI
  const uiPath = path.join(__dirname, '..', '..', 'ui', 'dist')
  await app.register(fastifyStatic, {
    root: uiPath,
    prefix: '/',
    index: 'index.html',
  })

  // API routes
  await app.register(ticketRoutes, { prefix: '/api' })
  await app.register(messageRoutes, { prefix: '/api' })
  await app.register(streamRoutes, { prefix: '/api' })
  await app.register(projectRoutes, { prefix: '/api' })
  await app.register(statusRoutes, { prefix: '/api' })

  // SPA fallback: serve index.html for non-API, non-static routes
  app.setNotFoundHandler(async (request, reply) => {
    if (request.url.startsWith('/api/')) {
      return reply.status(404).send({ error: 'Not found' })
    }
    return reply.sendFile('index.html')
  })

  return app
}
