import type { Project, Ticket, Message, StreamEvent, CreateTicketInput, Status } from '../../shared/types'

const BASE = '/api'

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(BASE + url, init)
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`${res.status}: ${text}`)
  }
  if (res.status === 204) return undefined as T
  return res.json()
}

export const api = {
  // Projects
  listProjects: (): Promise<Project[]> =>
    request('/projects'),

  getProject: (id: string): Promise<Project> =>
    request(`/projects/${id}`),

  createProject: (body: { name: string; github_repo: string; dev_command?: string }): Promise<Project> =>
    request('/projects', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),

  deleteProject: (id: string): Promise<void> =>
    request(`/projects/${id}`, { method: 'DELETE' }),

  // Tickets
  listTickets: (): Promise<Ticket[]> =>
    request('/tickets'),

  getTicket: (id: string): Promise<Ticket> =>
    request(`/tickets/${id}`),

  createTicket: (body: CreateTicketInput): Promise<Ticket> =>
    request('/tickets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),

  updateTicket: (id: string, body: { title?: string; priority?: number }): Promise<Ticket> =>
    request(`/tickets/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),

  deleteTicket: (id: string): Promise<void> =>
    request(`/tickets/${id}`, { method: 'DELETE' }),

  getMessages: (id: string): Promise<Message[]> =>
    request(`/tickets/${id}/messages`),

  reply: (id: string, content: string): Promise<void> =>
    request(`/tickets/${id}/reply`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content }),
    }),

  getStatus: (): Promise<Status> =>
    request('/status'),

  streamEvents: (id: string, onEvent: (e: StreamEvent) => void, onError?: () => void): EventSource => {
    const es = new EventSource(`${BASE}/tickets/${id}/stream`)
    es.onmessage = e => {
      try {
        onEvent(JSON.parse(e.data))
      } catch { /* ignore parse errors */ }
    }
    es.onerror = () => {
      onError?.()
    }
    return es
  },
}
