import type { FastifyInstance } from 'fastify'
import * as db from '../db/queries'
import type { Project } from '../../shared/types'
import { getContainerStatus } from '../worker/provisioner'

function enrichProject(project: Project) {
  return { ...project, container_status: getContainerStatus(project.id) }
}

interface CreateProjectBody {
  name: string
}

interface ProjectParams {
  id: string
}

export async function projectRoutes(app: FastifyInstance) {
  // GET /api/projects
  app.get('/projects', async (_req, reply) => {
    const projects = await db.listProjects()
    return reply.send(projects.map(enrichProject))
  })

  // POST /api/projects
  app.post<{ Body: CreateProjectBody }>('/projects', async (req, reply) => {
    const { name } = req.body ?? {}
    if (!name) {
      return reply.status(400).send({ error: 'name is required' })
    }
    if (typeof name !== 'string' || name.trim().length === 0) {
      return reply.status(400).send({ error: 'name must be a non-empty string' })
    }
    // Validate name: alphanumeric, hyphens, underscores only (used as directory name)
    if (!/^[a-zA-Z0-9._-]+$/.test(name.trim())) {
      return reply.status(400).send({ error: 'name must contain only alphanumeric characters, hyphens, underscores, and dots' })
    }
    const project = await db.insertProject(name.trim())
    return reply.status(201).send(enrichProject(project))
  })

  // GET /api/projects/:id
  app.get<{ Params: ProjectParams }>('/projects/:id', async (req, reply) => {
    const project = await db.getProject(req.params.id)
    if (!project) return reply.status(404).send({ error: 'Not found' })
    return reply.send(enrichProject(project))
  })

  // DELETE /api/projects/:id
  app.delete<{ Params: ProjectParams }>('/projects/:id', async (req, reply) => {
    const project = await db.getProject(req.params.id)
    if (!project) return reply.status(404).send({ error: 'Not found' })
    const containerStatus = getContainerStatus(project.id)
    if (containerStatus === 'running' || containerStatus === 'starting') {
      return reply.status(409).send({ error: 'Cannot delete a project with a running container' })
    }
    try {
      await db.deleteProject(req.params.id)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      if (msg.includes('active tickets')) {
        return reply.status(409).send({ error: msg })
      }
      throw err
    }
    return reply.status(204).send()
  })
}
