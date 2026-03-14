import type { FastifyInstance } from 'fastify'
import * as db from '../db/queries'
import { withTransaction } from '../db/connection'

interface CreateProjectBody {
  name: string
  github_repo?: string
  dev_command?: string
  dev_envs?: string
}

interface UpdateProjectBody {
  github_repo?: string | null
  dev_command?: string | null
  dev_envs?: string | null
}

interface ProjectParams {
  id: string
}

function isValidGithubRepo(value: unknown): boolean {
  return typeof value === 'string' && /^[a-zA-Z0-9._-]+\/[a-zA-Z0-9._-]+$/.test(value)
}

export async function projectRoutes(app: FastifyInstance) {
  // GET /api/projects
  app.get('/projects', async (_req, reply) => {
    const projects = await db.listProjects()
    return reply.send(projects)
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
    const { github_repo, dev_command, dev_envs } = req.body
    if (github_repo !== undefined && !isValidGithubRepo(github_repo)) {
      return reply.status(400).send({ error: 'github_repo must be in owner/repo format' })
    }
    const project = await db.insertProject(name.trim(), github_repo?.trim(), dev_command?.trim() || undefined, dev_envs?.trim() || undefined)
    return reply.status(201).send(project)
  })

  // GET /api/projects/:id
  app.get<{ Params: ProjectParams }>('/projects/:id', async (req, reply) => {
    const project = await db.getProject(req.params.id)
    if (!project) return reply.status(404).send({ error: 'Not found' })
    return reply.send(project)
  })

  // PATCH /api/projects/:id
  app.patch<{ Params: ProjectParams; Body: UpdateProjectBody }>('/projects/:id', async (req, reply) => {
    const project = await db.getProject(req.params.id)
    if (!project) return reply.status(404).send({ error: 'Not found' })
    const { github_repo, dev_command, dev_envs } = req.body ?? {}
    if (github_repo !== undefined && github_repo !== null && !isValidGithubRepo(github_repo)) {
      return reply.status(400).send({ error: 'github_repo must be in owner/repo format' })
    }
    if (github_repo !== undefined) {
      await db.updateProjectGithubRepo(req.params.id, github_repo)
    }
    if (dev_command !== undefined) {
      await db.updateProjectDevCommand(req.params.id, dev_command || null)
    }
    if (dev_envs !== undefined) {
      await db.updateProjectDevEnvs(req.params.id, dev_envs || null)
    }
    const updated = await db.getProject(req.params.id)
    return reply.send(updated!)
  })

  // DELETE /api/projects/:id
  app.delete<{ Params: ProjectParams }>('/projects/:id', async (req, reply) => {
    const project = await db.getProject(req.params.id)
    if (!project) return reply.status(404).send({ error: 'Not found' })
    const active = await db.countActiveTicketsForProject(project.id)
    if (active > 0) {
      return reply.status(409).send({ error: 'Cannot delete project with active tickets' })
    }
    try {
      await withTransaction(async (tx) => {
        await db.deleteProject(req.params.id, tx)
      })
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
