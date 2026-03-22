export type TicketStatus = 'queued' | 'running' | 'paused' | 'done' | 'failed' | 'deleted' | 'archived'
export type ProjectStatus = 'active' | 'archived' | 'deleted'
export type ContainerStatus = 'stopped' | 'starting' | 'running'
export type DevServerStatus = 'stopped' | 'starting' | 'running' | 'error'

// Message classification stored in DB
export type MessageType = 'text' | 'thinking' | 'tool_use' | 'tool_result' | 'done' | 'paused' | 'error'

// Shared tool-related fields across ClaudeEvent, MessageStreamEvent, and Message
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

// SSE events sent to frontend — two distinct kinds routed to different channels

// Per-ticket channel: a ClaudeEvent annotated with its ticket
export interface MessageStreamEvent extends ClaudeEvent {
  ticket_id: string
}

// Global channel: lightweight status-change events
export type StatusStreamEvent =
  | { type: 'TicketStatusChange';    ticket_id: string; ticket_status: TicketStatus }
  | { type: 'ContainerStatusChange'; ticket_id: string; container_status: ContainerStatus }
  | { type: 'DevServerStatusChange'; ticket_id: string; dev_server_status: DevServerStatus }


export interface DbCredential {
  host: string
  port: number
  database: string
  user: string
  password: string
}

export interface Project {
  id: string
  name: string
  github_repo?: string
  dev_command?: string
  dev_envs?: string
  db_credential?: DbCredential
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
  dev_server_status: DevServerStatus
  error?: string
  created_at: number      // unix ms
  updated_at: number
  started_at?: number
  completed_at?: number
  dev_url?: string
  pr_url?: string
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
