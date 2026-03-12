import * as db from '../db/queries'
import { broker } from './broker'
import { db as defaultDB, type DB } from '../db/connection'
import type { MessageType, TicketStatus } from '../../shared/types'

type Role = 'user' | 'assistant' | 'system'

export async function emitMessage(
  ticketId: string,
  content: string,
  messageType: MessageType,
  role: Role,
  toolName?: string,
  toolUseId?: string,
  isError?: boolean,
  q: DB = defaultDB,
): Promise<void> {
  await db.insertMessage(ticketId, role, content, messageType, toolName, toolUseId, isError, q)
  broker.publish({
    type: 'NewMessage',
    ticket_id: ticketId,
    content,
    message_type: messageType,
    role,
    tool_name: toolName,
    tool_use_id: toolUseId,
    is_error: isError,
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
  broker.publish({ type: 'TicketStatusChange', ticket_id: ticketId, ticket_status: status })
}
