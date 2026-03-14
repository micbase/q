export type TicketStatus = 'queued' | 'running' | 'paused' | 'done' | 'failed' | 'deleted'
export type ProjectStatus = 'active' | 'archived' | 'deleted'
export type ContainerStatus = 'stopped' | 'starting' | 'running'

// Message classification stored in DB
export type MessageType = 'text' | 'thinking' | 'tool_use' | 'tool_result' | 'done' | 'paused' | 'error'

// Shared tool-related fields across ClaudeEvent, StreamEvent, and Message
export interface ToolFields {
  tool_name?: string          // set for tool_use events
  tool_use_id?: string        // set for tool_use and tool_result events
  tool_input?: string         // set for tool_use events (JSON stringified input)
  tool_result_content?: string // set for tool_result events (raw result text)
  tool_result_for_id?: string // set for tool_result events (which tool_use this is a result for)
  is_error?: boolean          // set for tool_result events
  parent_tool_use_id?: string // set when tool was invoked inside another tool (e.g. Agent subagent)
}

// Internal event yielded by claude-client / dry-run session
export interface ClaudeEvent extends ToolFields {
  type: MessageType
  role: 'user' | 'assistant' | 'system'
  content: string
  claude_session_id?: string
}

// SSE event sent to frontend
export type StreamEventType = 'TicketStatusChange' | 'ContainerStatusChange' | 'NewMessage'

export interface StreamEvent extends Partial<Omit<ClaudeEvent, 'type'>> {
  type: StreamEventType
  ticket_id: string
  message_type?: MessageType
  ticket_status?: TicketStatus
  container_status?: ContainerStatus
}
export interface Project {
  id: string
  name: string
  github_repo?: string
  dev_command?: string
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
  container_status: ContainerStatus
  error?: string
  created_at: number      // unix ms
  updated_at: number
  started_at?: number
  completed_at?: number
  dev_url?: string
}

export interface Message extends ClaudeEvent {
  id: string
  ticket_id: string
  created_at: number
}

export interface Status {
  running_ticket_ids: string[]
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
