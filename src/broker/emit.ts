import * as db from '../db/queries'
import { broker } from './broker'
import type { MessageType, TicketStatus } from '../../shared/types'

type Role = 'user' | 'assistant' | 'system'

export async function emitMessage(
  ticketId: string,
  content: string,
  messageType: MessageType,
  role: Role,
): Promise<void> {
  await db.insertMessage(ticketId, role, content, messageType)
  broker.publish({ type: 'NewMessage', ticket_id: ticketId, content, message_type: messageType, role })
}

export async function emitTicketStatusChange(
  ticketId: string,
  status: TicketStatus,
  error?: string,
): Promise<void> {
  if (status === 'failed' && error) {
    await db.updateTicketStatusFailed(ticketId, error)
  } else {
    await db.updateTicketStatus(ticketId, status)
  }
  broker.publish({ type: 'TicketStatusChange', ticket_id: ticketId, ticket_status: status })
}
