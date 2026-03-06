export type TicketStatus = 'queued' | 'running' | 'paused' | 'done' | 'failed' | 'deleted'
export type ProjectStatus = 'active' | 'archived' | 'deleted'
export type ContainerStatus = 'stopped' | 'starting' | 'running'

export type EventType = 'text' | 'tool_use' | 'tool_result' | 'done' | 'paused' | 'error'

export interface Project {
  id: string
  name: string
  status: ProjectStatus
  created_at: number
  updated_at: number
}

export interface Ticket {
  id: string
  project_id: string
  title: string
  description: string
  priority: number        // 1-5
  status: TicketStatus
  error?: string
  created_at: number      // unix ms
  updated_at: number
  started_at?: number
  completed_at?: number
}

export interface Message {
  id: string
  ticket_id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  event_type: EventType
  created_at: number
}

export interface ConversationMsg {
  role: 'user' | 'assistant'
  content: string
}

export interface StreamEvent {
  type: EventType
  content: string
  ticket_id: string
  role?: 'user' | 'assistant' | 'system'
}

export interface Status {
  running_ticket: string | null
  queue_depth: number
  paused_count: number
  dry_run: boolean
}
