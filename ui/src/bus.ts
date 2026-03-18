/** Tiny event emitter for cross-component signals */
import type { TicketStatus } from '../../shared/types'

type MessageListener = () => void
type StatusListener = (ticketId: string, status: TicketStatus) => void

const listeners = new Set<MessageListener>()
const drawerListeners = new Set<MessageListener>()
const statusListeners = new Set<StatusListener>()

export const bus = {
  onRefresh(fn: MessageListener) { listeners.add(fn); return () => listeners.delete(fn) },
  refresh() { listeners.forEach(fn => fn()) },
  onOpenDrawer(fn: MessageListener) { drawerListeners.add(fn); return () => drawerListeners.delete(fn) },
  openDrawer() { drawerListeners.forEach(fn => fn()) },
  onTicketStatus(fn: StatusListener) { statusListeners.add(fn); return () => statusListeners.delete(fn) },
  emitTicketStatus(ticketId: string, status: TicketStatus) { statusListeners.forEach(fn => fn(ticketId, status)) },
}
