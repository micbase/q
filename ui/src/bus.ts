/** Tiny event emitter for cross-component signals */
import type { TicketStatus, DevServerStatus } from '../../shared/types'

type MessageListener = () => void
type StatusListener = (ticketId: string, status: TicketStatus, prUrl?: string) => void
type DevServerStatusListener = (ticketId: string, status: DevServerStatus) => void

const listeners = new Set<MessageListener>()
const drawerListeners = new Set<MessageListener>()
const statusListeners = new Set<StatusListener>()
const devServerStatusListeners = new Set<DevServerStatusListener>()

export const bus = {
  onRefresh(fn: MessageListener) { listeners.add(fn); return () => listeners.delete(fn) },
  refresh() { listeners.forEach(fn => fn()) },
  onOpenDrawer(fn: MessageListener) { drawerListeners.add(fn); return () => drawerListeners.delete(fn) },
  openDrawer() { drawerListeners.forEach(fn => fn()) },
  onTicketStatus(fn: StatusListener) { statusListeners.add(fn); return () => statusListeners.delete(fn) },
  emitTicketStatus(ticketId: string, status: TicketStatus, prUrl?: string) { statusListeners.forEach(fn => fn(ticketId, status, prUrl)) },
  onDevServerStatus(fn: DevServerStatusListener) { devServerStatusListeners.add(fn); return () => devServerStatusListeners.delete(fn) },
  emitDevServerStatus(ticketId: string, status: DevServerStatus) { devServerStatusListeners.forEach(fn => fn(ticketId, status)) },
}
