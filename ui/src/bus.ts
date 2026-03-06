/** Tiny event emitter for cross-component refresh signals */
type Listener = () => void
const listeners = new Set<Listener>()

export const bus = {
  onRefresh(fn: Listener) { listeners.add(fn); return () => listeners.delete(fn) },
  refresh() { listeners.forEach(fn => fn()) },
}
