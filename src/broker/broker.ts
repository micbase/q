import type { ServerResponse } from 'http'
import type { StreamEvent } from '../../shared/types'

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
    const clients = this.clients.get(event.ticket_id)
    if (!clients) return
    const data = `data: ${JSON.stringify(event)}\n\n`
    for (const res of clients) {
      try {
        res.write(data)
      } catch {
        clients.delete(res)
      }
    }
  }

  clientCount(ticketId: string): number {
    return this.clients.get(ticketId)?.size ?? 0
  }
}

export const broker = new SSEBroker()
