const MAX_LINES = 1000

// In-memory circular buffer: ticketId → log lines (no tag prefix, clean messages)
const buffers = new Map<string, string[]>()

export function appendLog(ticketId: string, line: string): void {
  let lines = buffers.get(ticketId)
  if (!lines) {
    lines = []
    buffers.set(ticketId, lines)
  }
  lines.push(line)
  if (lines.length > MAX_LINES) {
    lines.splice(0, lines.length - MAX_LINES)
  }
}

export function getLogs(ticketId: string): string[] {
  return buffers.get(ticketId) ?? []
}

export function clearLogs(ticketId: string): void {
  buffers.delete(ticketId)
}
