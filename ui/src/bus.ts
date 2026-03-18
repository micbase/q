/** Tiny event emitter for cross-component signals */
type Listener = () => void
const listeners = new Set<Listener>()
const drawerListeners = new Set<Listener>()

export const bus = {
  onRefresh(fn: Listener) { listeners.add(fn); return () => listeners.delete(fn) },
  refresh() { listeners.forEach(fn => fn()) },
  onOpenDrawer(fn: Listener) { drawerListeners.add(fn); return () => drawerListeners.delete(fn) },
  openDrawer() { drawerListeners.forEach(fn => fn()) },
}
