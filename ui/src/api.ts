import type { Project, Ticket, Message, MessageStreamEvent, StatusStreamEvent, CreateTicketInput, Status } from '../../shared/types'

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

  createProject: (body: { name: string; github_repo: string; dev_command?: string; dev_envs?: string }): Promise<Project> =>
    request('/projects', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),

  updateProject: (id: string, body: { github_repo?: string | null; dev_command?: string | null; dev_envs?: string | null }): Promise<Project> =>
    request(`/projects/${id}`, {
      method: 'PATCH',
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

  archiveTicket: (id: string): Promise<void> =>
    request(`/tickets/${id}/archive`, { method: 'POST' }),

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

  // Containers
  listContainers: (): Promise<{ projects: Project[]; tickets: Ticket[] }> =>
    request('/containers'),

  startContainer: (id: string): Promise<void> =>
    request(`/tickets/${id}/container/start`, { method: 'POST' }),

  stopContainer: (id: string): Promise<void> =>
    request(`/tickets/${id}/container/stop`, { method: 'POST' }),

  restartContainer: (id: string): Promise<void> =>
    request(`/tickets/${id}/container/restart`, { method: 'POST' }),

  // Dev server
  startDevServer: (id: string): Promise<void> =>
    request(`/tickets/${id}/dev/start`, { method: 'POST' }),

  stopDevServer: (id: string): Promise<void> =>
    request(`/tickets/${id}/dev/stop`, { method: 'POST' }),

  restartDevServer: (id: string): Promise<void> =>
    request(`/tickets/${id}/dev/restart`, { method: 'POST' }),

  getLogs: (id: string): Promise<{ lines: string[] }> =>
    request(`/tickets/${id}/logs`),

  streamMessageEvents: (id: string, onEvent: (e: MessageStreamEvent) => void, onError?: () => void): EventSource => {
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

  streamStatusEvents: (onEvent: (e: StatusStreamEvent) => void, onOpen?: () => void): EventSource => {
    const es = new EventSource(`${BASE}/events`)
    es.onmessage = e => {
      try {
        onEvent(JSON.parse(e.data))
      } catch { /* ignore parse errors */ }
    }
    es.onopen = () => onOpen?.()
    return es
  },
}
