import type { ServerResponse } from 'http'
import type { StreamEvent } from '../../shared/types'

// Special key for global subscribers (receive all status-change events)
export const GLOBAL_CHANNEL = '$global'

class SSEBroker {
  private clients = new Map<string, Set<ServerResponse>>()

  subscribe(ticketId: string, res: ServerResponse): void {
    if (!this.clients.has(ticketId)) this.clients.set(ticketId, new Set())
    this.clients.get(ticketId)!.add(res)
  }

  unsubscribe(ticketId: string, res: ServerResponse): void {
    this.clients.get(ticketId)?.delete(res)
    if (this.clients.get(ticketId)?.size === 0) {
      this.clients.delete(ticketId)
    }
  }

  publish(event: StreamEvent): void {
    const data = `data: ${JSON.stringify(event)}\n\n`

    const isStatusChange = event.type === 'TicketStatusChange'
      || event.type === 'ContainerStatusChange'
      || event.type === 'DevServerStatusChange'

    if (isStatusChange) {
      // Status events → global channel only
      const globalClients = this.clients.get(GLOBAL_CHANNEL)
      if (globalClients) {
        for (const res of globalClients) {
          try {
            res.write(data)
          } catch {
            globalClients.delete(res)
          }
        }
      }
    } else {
      // Message events → per-ticket channel only
      const clients = this.clients.get(event.ticket_id)
      if (clients) {
        for (const res of clients) {
          try {
            res.write(data)
          } catch {
            clients.delete(res)
          }
        }
      }
    }
  }

  clientCount(ticketId: string): number {
    return this.clients.get(ticketId)?.size ?? 0
  }
}

export const broker = new SSEBroker()
