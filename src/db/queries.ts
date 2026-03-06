import { nanoid } from 'nanoid'
import { getPool } from './connection'
import type { Project, Ticket, Message, ConversationMsg, EventType, TicketStatus } from '../models/types'

function now(): number {
  return Date.now()
}

// ─── Projects ─────────────────────────────────────────────────────────────────

export async function listProjects(): Promise<Project[]> {
  const [rows] = await getPool().execute(
    'SELECT * FROM projects WHERE status = "active" ORDER BY name ASC'
  )
  return (rows as Project[]).map(mapProject)
}

export async function getProject(id: string): Promise<Project | null> {
  const [rows] = await getPool().execute(
    'SELECT * FROM projects WHERE id = ? AND status = "active"', [id]
  )
  const arr = rows as Project[]
  return arr.length ? mapProject(arr[0]) : null
}

export async function getProjectByName(name: string): Promise<Project | null> {
  const [rows] = await getPool().execute(
    'SELECT * FROM projects WHERE name = ? AND status = "active"', [name]
  )
  const arr = rows as Project[]
  return arr.length ? mapProject(arr[0]) : null
}

export async function insertProject(name: string): Promise<Project> {
  const id = nanoid()
  const ts = now()
  await getPool().execute(
    'INSERT INTO projects (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)',
    [id, name, ts, ts]
  )
  return (await getProject(id))!
}

export async function countActiveTicketsForProject(projectId: string): Promise<number> {
  const [rows] = await getPool().execute(
    'SELECT COUNT(*) as cnt FROM tickets WHERE project_id = ? AND status IN ("queued","running","paused")',
    [projectId]
  )
  return Number((rows as { cnt: number }[])[0].cnt)
}

export async function archiveProject(id: string): Promise<void> {
  const active = await countActiveTicketsForProject(id)
  if (active > 0) throw new Error('Cannot archive project with active tickets')
  const ts = now()
  await getPool().execute('UPDATE projects SET status = "archived", updated_at = ? WHERE id = ?', [ts, id])
}

export async function deleteProject(id: string): Promise<void> {
  const active = await countActiveTicketsForProject(id)
  if (active > 0) throw new Error('Cannot delete project with active tickets')
  const ts = now()
  await getPool().execute('UPDATE projects SET status = "deleted", updated_at = ? WHERE id = ?', [ts, id])
}

export async function countQueuedTicketsForProject(projectId: string): Promise<number> {
  const [rows] = await getPool().execute(
    'SELECT COUNT(*) as cnt FROM tickets WHERE project_id = ? AND status = "queued"',
    [projectId]
  )
  return Number((rows as { cnt: number }[])[0].cnt)
}

// ─── Tickets ─────────────────────────────────────────────────────────────────

export async function listTickets(): Promise<Ticket[]> {
  const [rows] = await getPool().execute(
    'SELECT * FROM tickets WHERE status != "deleted" ORDER BY status = "paused" DESC, priority ASC, created_at ASC'
  )
  return (rows as Ticket[]).map(mapTicket)
}

export async function getTicket(id: string): Promise<Ticket | null> {
  const [rows] = await getPool().execute(
    'SELECT * FROM tickets WHERE id = ?', [id]
  )
  const arr = rows as Ticket[]
  return arr.length ? mapTicket(arr[0]) : null
}

export async function insertTicket(
  project_id: string,
  title: string,
  description: string,
  priority: number,
): Promise<Ticket> {
  const id = nanoid()
  const ts = now()
  await getPool().execute(
    'INSERT INTO tickets (id, project_id, title, description, priority, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    [id, project_id, title, description, priority, 'queued', ts, ts]
  )
  return (await getTicket(id))!
}

export async function updateTicket(
  id: string,
  fields: Partial<Pick<Ticket, 'title' | 'priority'>>
): Promise<void> {
  const sets: string[] = ['updated_at = ?']
  const vals: (string | number)[] = [now()]
  if (fields.title !== undefined) { sets.push('title = ?'); vals.push(fields.title) }
  if (fields.priority !== undefined) { sets.push('priority = ?'); vals.push(fields.priority) }
  vals.push(id)
  await getPool().execute(`UPDATE tickets SET ${sets.join(', ')} WHERE id = ?`, vals)
}

export async function updateTicketStatus(id: string, status: TicketStatus): Promise<void> {
  const ts = now()
  const extra: string[] = []
  const vals: (string | number)[] = [status, ts]

  if (status === 'running') { extra.push(', started_at = ?'); vals.push(ts) }
  if (status === 'done' || status === 'failed' || status === 'deleted') { extra.push(', completed_at = ?'); vals.push(ts) }

  vals.push(id)
  await getPool().execute(
    `UPDATE tickets SET status = ?, updated_at = ?${extra.join('')} WHERE id = ?`,
    vals
  )
}

export async function updateTicketStatusFailed(id: string, error: string): Promise<void> {
  const ts = now()
  await getPool().execute(
    'UPDATE tickets SET status = "failed", error = ?, updated_at = ?, completed_at = ? WHERE id = ?',
    [error, ts, ts, id]
  )
}

export async function deleteTicket(id: string): Promise<void> {
  const ts = now()
  await getPool().execute(
    'UPDATE tickets SET status = "deleted", updated_at = ?, completed_at = ? WHERE id = ?',
    [ts, ts, id]
  )
}

export async function nextQueuedTicket(): Promise<Ticket | null> {
  const [rows] = await getPool().execute(
    'SELECT * FROM tickets WHERE status = "queued" ORDER BY priority ASC, created_at ASC LIMIT 1'
  )
  const arr = rows as Ticket[]
  return arr.length ? mapTicket(arr[0]) : null
}

export async function countQueuedTickets(): Promise<number> {
  const [rows] = await getPool().execute(
    'SELECT COUNT(*) as cnt FROM tickets WHERE status = "queued"'
  )
  return Number((rows as { cnt: number }[])[0].cnt)
}

export async function countPausedTickets(): Promise<number> {
  const [rows] = await getPool().execute(
    'SELECT COUNT(*) as cnt FROM tickets WHERE status = "paused"'
  )
  return Number((rows as { cnt: number }[])[0].cnt)
}

// ─── Messages ────────────────────────────────────────────────────────────────

export async function getMessages(ticketId: string): Promise<Message[]> {
  const [rows] = await getPool().execute(
    'SELECT * FROM messages WHERE ticket_id = ? ORDER BY created_at ASC',
    [ticketId]
  )
  return rows as Message[]
}

export async function insertMessage(
  ticketId: string,
  role: 'user' | 'assistant' | 'system',
  content: string,
  eventType: EventType,
): Promise<Message> {
  const id = nanoid()
  const ts = now()
  await getPool().execute(
    'INSERT INTO messages (id, ticket_id, role, content, event_type, created_at) VALUES (?, ?, ?, ?, ?, ?)',
    [id, ticketId, role, content, eventType, ts]
  )
  return { id, ticket_id: ticketId, role, content, event_type: eventType, created_at: ts }
}

// ─── Conversation (derived from messages) ────────────────────────────────────

export async function getConversation(ticketId: string): Promise<ConversationMsg[]> {
  const rows = await getMessages(ticketId)
  const conversation: ConversationMsg[] = []
  let assistantBuffer: string[] = []

  function flushAssistant() {
    if (assistantBuffer.length) {
      conversation.push({ role: 'assistant', content: assistantBuffer.join('\n') })
      assistantBuffer = []
    }
  }

  for (const msg of rows) {
    if (msg.role === 'user') {
      flushAssistant()
      conversation.push({ role: 'user', content: msg.content })
    } else if (msg.role === 'assistant') {
      if (msg.event_type === 'text') {
        assistantBuffer.push(msg.content)
      } else if (msg.event_type === 'paused' || msg.event_type === 'done') {
        flushAssistant()
      }
      // skip tool_use, tool_result, error
    }
  }

  flushAssistant()
  return conversation
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function mapProject(row: any): Project {
  return {
    id: row.id,
    name: row.name,
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
  }
}
