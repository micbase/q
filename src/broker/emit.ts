import * as db from '../db/queries'
import type { InsertMessageOpts } from '../db/queries'
import { broker } from './broker'
import { db as defaultDB, type DB } from '../db/connection'
import type { MessageType, TicketStatus } from '../../shared/types'

type Role = 'user' | 'assistant' | 'system'

export async function emitMessage(
  ticketId: string,
  content: string,
  messageType: MessageType,
  role: Role,
  opts: InsertMessageOpts = {},
  q: DB = defaultDB,
): Promise<void> {
  await db.insertMessage(ticketId, role, content, messageType, opts, q)
  broker.publishMessage({
    type: 'NewMessage',
    ticket_id: ticketId,
    content,
    message_type: messageType,
    role,
    tool_name: opts.toolName,
    tool_use_id: opts.toolUseId,
    tool_input: opts.toolInput,
    tool_result_content: opts.toolResultContent,
    tool_result_for_id: opts.toolResultForId,
    is_error: opts.isError,
    parent_tool_use_id: opts.parentToolUseId,
  })
}

export async function emitTicketStatusChange(
  ticketId: string,
  status: TicketStatus,
  error?: string,
  q: DB = defaultDB,
): Promise<void> {
  if (status === 'failed' && error) {
    await db.updateTicketStatusFailed(ticketId, error, q)
  } else {
    await db.updateTicketStatus(ticketId, status, q)
  }
  broker.publishStatus({ type: 'TicketStatusChange', ticket_id: ticketId, ticket_status: status })
}
