export type TicketStatus = 'queued' | 'running' | 'paused' | 'done' | 'failed' | 'deleted'
export type ProjectStatus = 'active' | 'archived' | 'deleted'
export type ContainerStatus = 'stopped' | 'starting' | 'running'

// Message classification stored in DB
export type MessageType = 'text' | 'tool_use' | 'tool_result' | 'done' | 'paused' | 'error'

// Internal event yielded by claude-client / dry-run session
export interface ClaudeEvent {
  type: MessageType
  content: string
  tool_name?: string   // set for tool_use events
  session_id?: string
}

// SSE event sent to frontend
export type StreamEventType = 'TicketStatusChange' | 'ContainerStatusChange' | 'NewMessage'

export interface StreamEvent {
  type: StreamEventType
  ticket_id: string
  content?: string
  message_type?: MessageType
  tool_name?: string   // set for tool_use events
  role?: 'user' | 'assistant' | 'system'
  ticket_status?: TicketStatus
  container_status?: ContainerStatus
  session_id?: string
}
export interface Project {
  id: string
  name: string
  github_repo?: string
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
  session_id?: string
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
  event_type: MessageType
  tool_name?: string
  created_at: number
}

export interface Status {
  running_ticket: string | null
  queue_depth: number
  paused_count: number
  dry_run: boolean
}

export interface CreateTicketInput {
  project_id: string
  title: string
  description: string
  priority: number
}
