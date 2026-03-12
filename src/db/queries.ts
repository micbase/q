import { nanoid } from 'nanoid'
import { db as defaultDB, type DB } from './connection'
import type { Project, Ticket, Message, MessageType, TicketStatus } from '../../shared/types'

function now(): number {
  return Date.now()
}

// ─── Projects ─────────────────────────────────────────────────────────────────

export async function listProjects(q: DB = defaultDB): Promise<Project[]> {
  const { rows } = await q.query(
    "SELECT * FROM projects WHERE status = 'active' ORDER BY name ASC"
  )
  return rows.map(mapProject)
}

export async function getProject(id: string, q: DB = defaultDB): Promise<Project | null> {
  const { rows } = await q.query(
    "SELECT * FROM projects WHERE id = $1 AND status = 'active'", [id]
  )
  return rows.length ? mapProject(rows[0]) : null
}

export async function getProjectByName(name: string, q: DB = defaultDB): Promise<Project | null> {
  const { rows } = await q.query(
    "SELECT * FROM projects WHERE name = $1 AND status = 'active'", [name]
  )
  return rows.length ? mapProject(rows[0]) : null
}

export async function insertProject(name: string, githubRepo?: string, q: DB = defaultDB): Promise<Project> {
  const id = nanoid()
  const ts = now()
  await q.query(
    'INSERT INTO projects (id, name, github_repo, created_at, updated_at) VALUES ($1, $2, $3, $4, $5)',
    [id, name, githubRepo ?? null, ts, ts]
  )
  return (await getProject(id, q))!
}

export async function updateProjectGithubRepo(id: string, githubRepo: string | null, q: DB = defaultDB): Promise<void> {
  await q.query(
    'UPDATE projects SET github_repo = $1, updated_at = $2 WHERE id = $3',
    [githubRepo, now(), id]
  )
}

export async function countActiveTicketsForProject(projectId: string, q: DB = defaultDB): Promise<number> {
  const { rows } = await q.query(
    "SELECT COUNT(*) as cnt FROM tickets WHERE project_id = $1 AND status IN ('queued','running','paused')",
    [projectId]
  )
  return Number(rows[0].cnt)
}

export async function archiveProject(id: string, q: DB = defaultDB): Promise<void> {
  const active = await countActiveTicketsForProject(id, q)
  if (active > 0) throw new Error('Cannot archive project with active tickets')
  const ts = now()
  await q.query("UPDATE projects SET status = 'archived', updated_at = $1 WHERE id = $2", [ts, id])
}

export async function deleteProject(id: string, q: DB = defaultDB): Promise<void> {
  const active = await countActiveTicketsForProject(id, q)
  if (active > 0) throw new Error('Cannot delete project with active tickets')
  const ts = now()
  await q.query("UPDATE projects SET status = 'deleted', updated_at = $1 WHERE id = $2", [ts, id])
}

export async function countQueuedTicketsForProject(projectId: string, q: DB = defaultDB): Promise<number> {
  const { rows } = await q.query(
    "SELECT COUNT(*) as cnt FROM tickets WHERE project_id = $1 AND status = 'queued'",
    [projectId]
  )
  return Number(rows[0].cnt)
}

// ─── Tickets ─────────────────────────────────────────────────────────────────

export async function listTickets(q: DB = defaultDB): Promise<Ticket[]> {
  const { rows } = await q.query(
    "SELECT * FROM tickets WHERE status != 'deleted' ORDER BY (status = 'paused') DESC, priority ASC, created_at ASC"
  )
  return rows.map(mapTicket)
}

export async function getTicket(id: string, q: DB = defaultDB): Promise<Ticket | null> {
  const { rows } = await q.query(
    'SELECT * FROM tickets WHERE id = $1', [id]
  )
  return rows.length ? mapTicket(rows[0]) : null
}

export async function insertTicket(
  project_id: string,
  title: string,
  description: string,
  priority: number,
  q: DB = defaultDB,
): Promise<Ticket> {
  const id = nanoid()
  const ts = now()
  await q.query(
    "INSERT INTO tickets (id, project_id, title, description, priority, status, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)",
    [id, project_id, title, description, priority, 'queued', ts, ts]
  )
  return (await getTicket(id, q))!
}

export async function updateTicket(
  id: string,
  fields: Partial<Pick<Ticket, 'title' | 'priority'>>,
  q: DB = defaultDB,
): Promise<void> {
  const sets: string[] = ['updated_at = $1']
  const vals: (string | number)[] = [now()]
  let idx = 2
  if (fields.title !== undefined) { sets.push(`title = $${idx}`); vals.push(fields.title); idx++ }
  if (fields.priority !== undefined) { sets.push(`priority = $${idx}`); vals.push(fields.priority); idx++ }
  vals.push(id)
  await q.query(`UPDATE tickets SET ${sets.join(', ')} WHERE id = $${idx}`, vals)
}

export async function updateTicketStatus(id: string, status: TicketStatus, q: DB = defaultDB): Promise<void> {
  const ts = now()
  const sets: string[] = ['status = $1', 'updated_at = $2']
  const vals: (string | number)[] = [status, ts]
  let idx = 3

  if (status === 'running') { sets.push(`started_at = $${idx}`); vals.push(ts); idx++ }
  if (status === 'done' || status === 'failed' || status === 'deleted') { sets.push(`completed_at = $${idx}`); vals.push(ts); idx++ }

  vals.push(id)
  await q.query(
    `UPDATE tickets SET ${sets.join(', ')} WHERE id = $${idx}`,
    vals
  )
}

export async function updateTicketSessionId(id: string, sessionId: string, q: DB = defaultDB): Promise<void> {
  await q.query(
    'UPDATE tickets SET session_id = $1, updated_at = $2 WHERE id = $3',
    [sessionId, now(), id]
  )
}

export async function updateTicketStatusFailed(id: string, error: string, q: DB = defaultDB): Promise<void> {
  const ts = now()
  await q.query(
    "UPDATE tickets SET status = 'failed', error = $1, updated_at = $2, completed_at = $3 WHERE id = $4",
    [error, ts, ts, id]
  )
}

export async function deleteTicket(id: string, q: DB = defaultDB): Promise<void> {
  const ts = now()
  await q.query(
    "UPDATE tickets SET status = 'deleted', updated_at = $1, completed_at = $2 WHERE id = $3",
    [ts, ts, id]
  )
}

export async function nextQueuedTicket(q: DB = defaultDB): Promise<Ticket | null> {
  const { rows } = await q.query(
    "SELECT * FROM tickets WHERE status = 'queued' ORDER BY priority ASC, created_at ASC LIMIT 1"
  )
  return rows.length ? mapTicket(rows[0]) : null
}

export async function countQueuedTickets(q: DB = defaultDB): Promise<number> {
  const { rows } = await q.query(
    "SELECT COUNT(*) as cnt FROM tickets WHERE status = 'queued'"
  )
  return Number(rows[0].cnt)
}

export async function countPausedTickets(q: DB = defaultDB): Promise<number> {
  const { rows } = await q.query(
    "SELECT COUNT(*) as cnt FROM tickets WHERE status = 'paused'"
  )
  return Number(rows[0].cnt)
}

// ─── Messages ────────────────────────────────────────────────────────────────

export async function getMessages(ticketId: string, q: DB = defaultDB): Promise<Message[]> {
  const { rows } = await q.query(
    'SELECT * FROM messages WHERE ticket_id = $1 ORDER BY created_at ASC',
    [ticketId]
  )
  return rows as Message[]
}

export async function insertMessage(
  ticketId: string,
  role: 'user' | 'assistant' | 'system',
  content: string,
  messageType: MessageType,
  toolName?: string,
  isError?: boolean,
  q: DB = defaultDB,
): Promise<Message> {
  const id = nanoid()
  const ts = now()
  await q.query(
    'INSERT INTO messages (id, ticket_id, role, content, event_type, tool_name, is_error, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)',
    [id, ticketId, role, content, messageType, toolName ?? null, isError ?? false, ts]
  )
  return { id, ticket_id: ticketId, role, content, event_type: messageType, tool_name: toolName, is_error: isError, created_at: ts }
}

export async function getLastUserMessage(ticketId: string, q: DB = defaultDB): Promise<string | null> {
  const { rows } = await q.query(
    "SELECT content FROM messages WHERE ticket_id = $1 AND role = 'user' ORDER BY created_at DESC LIMIT 1",
    [ticketId]
  )
  return rows.length ? rows[0].content : null
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function mapProject(row: any): Project {
  return {
    id: row.id,
    name: row.name,
    github_repo: row.github_repo ?? undefined,
    status: row.status,
    created_at: Number(row.created_at),
    updated_at: Number(row.updated_at),
  }
}

function mapTicket(row: Ticket): Ticket {
  return {
    ...row,
    priority: Number(row.priority),
    created_at: Number(row.created_at),
    updated_at: Number(row.updated_at),
    started_at: row.started_at ? Number(row.started_at) : undefined,
    completed_at: row.completed_at ? Number(row.completed_at) : undefined,
    error: row.error ?? undefined,
    session_id: row.session_id ?? undefined,
  }
}
