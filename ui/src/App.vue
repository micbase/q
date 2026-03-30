<template>
  <div class="h-screen flex flex-col bg-white overflow-hidden">
    <!-- Desktop header (md+) -->
    <header class="hidden md:flex bg-white border-b border-gray-200 px-4 py-2.5 items-center gap-3 shrink-0">
      <RouterLink to="/" class="font-bold text-lg tracking-tight hover:text-gray-600 transition-colors">Q</RouterLink>
      <div class="flex-1" />

      <span v-if="status && status.paused_count > 0" class="text-sm text-orange-500 font-medium">
        {{ status.paused_count }} paused
      </span>
      <span v-if="status && status.queue_depth > 0" class="text-sm text-gray-400">
        {{ status.queue_depth }} queued
      </span>

      <RouterLink
        to="/containers"
        class="text-base px-3 py-1.5 rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-50 transition-colors font-medium"
      >Containers</RouterLink>

      <RouterLink
        to="/projects"
        class="text-base px-3 py-1.5 rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-50 transition-colors font-medium"
      >Projects</RouterLink>

      <RouterLink
        to="/new"
        class="bg-blue-600 text-white text-base px-3 py-1.5 rounded-lg hover:bg-blue-700 transition-colors font-medium"
      >+ New Ticket</RouterLink>
    </header>

    <!-- Dry run banner -->
    <div
      v-if="status?.dry_run"
      class="bg-orange-500 text-white text-center text-sm py-1 font-medium shrink-0"
    >
      DRY RUN MODE — Claude is not being called
    </div>

    <!-- Layout -->
    <div class="flex flex-1 min-h-0">
      <!-- Left: project tree — desktop only -->
      <aside class="hidden md:flex md:flex-col w-80 shrink-0 border-r border-gray-200 bg-gray-50">
        <ProjectTree />
      </aside>

      <!-- Right: main content -->
      <main class="flex-1 min-h-0 overflow-hidden flex flex-col mobile-main-content">
        <RouterView />
      </main>
    </div>

    <!-- New Ticket Modal -->
    <Transition name="modal">
      <div v-if="route.path === '/new'" class="fixed inset-0 z-50 flex items-center justify-center md:p-6" @click.self="closeNewTicket">
        <!-- Backdrop (desktop only — on mobile we go full screen) -->
        <div class="hidden md:block absolute inset-0 bg-black/50" @click="closeNewTicket"></div>
        <!-- Panel -->
        <div class="relative flex flex-col bg-white w-full h-full md:h-auto md:max-h-[90vh] md:rounded-2xl md:shadow-2xl md:max-w-[72rem] overflow-hidden">
          <!-- Modal header -->
          <div class="flex items-center justify-between px-5 py-4 border-b border-gray-200 shrink-0">
            <h1 class="text-xl font-semibold">New Ticket</h1>
            <button @click="closeNewTicket" class="text-gray-400 hover:text-gray-700 p-1 rounded-lg transition-colors" aria-label="Close">
              <svg class="w-5 h-5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"/>
              </svg>
            </button>
          </div>
          <!-- Modal body -->
          <div class="flex-1 overflow-y-auto">
            <NewTicketForm @created="onTicketCreated" />
          </div>
        </div>
      </div>
    </Transition>

    <!-- Mobile bottom nav -->
    <nav class="md:hidden fixed bottom-0 inset-x-0 bg-white border-t border-gray-200 z-30 flex items-stretch" style="height: calc(4rem + env(safe-area-inset-bottom)); padding-bottom: env(safe-area-inset-bottom);">
      <!-- Tickets -->
      <button
        @click="mobileDrawerOpen = true"
        class="flex-1 flex flex-col items-center justify-center gap-0.5 text-xs font-medium transition-colors"
        :class="isTicketsActive ? 'text-blue-600' : 'text-gray-500'"
      >
        <svg class="w-5 h-5" fill="none" stroke="currentColor" stroke-width="1.75" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"/>
        </svg>
        Tickets
      </button>

      <!-- Containers -->
      <RouterLink
        to="/containers"
        class="flex-1 flex flex-col items-center justify-center gap-0.5 text-xs font-medium transition-colors"
        :class="route.path === '/containers' ? 'text-blue-600' : 'text-gray-500'"
      >
        <svg class="w-5 h-5" fill="none" stroke="currentColor" stroke-width="1.75" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" d="M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2"/>
        </svg>
        Containers
      </RouterLink>

      <!-- FAB: New Ticket -->
      <div class="flex items-center justify-center px-2">
        <RouterLink
          to="/new"
          class="w-12 h-12 bg-blue-600 rounded-full flex items-center justify-center shadow-lg hover:bg-blue-700 transition-colors text-white text-2xl leading-none font-light"
          aria-label="New ticket"
        >+</RouterLink>
      </div>

      <!-- Projects -->
      <RouterLink
        to="/projects"
        class="flex-1 flex flex-col items-center justify-center gap-0.5 text-xs font-medium transition-colors"
        :class="route.path === '/projects' ? 'text-blue-600' : 'text-gray-500'"
      >
        <svg class="w-5 h-5" fill="none" stroke="currentColor" stroke-width="1.75" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"/>
        </svg>
        Projects
      </RouterLink>

      <!-- More -->
      <button
        @click="mobileMoreOpen = !mobileMoreOpen"
        class="flex-1 flex flex-col items-center justify-center gap-0.5 text-xs font-medium transition-colors text-gray-500"
      >
        <svg class="w-5 h-5" fill="none" stroke="currentColor" stroke-width="1.75" viewBox="0 0 24 24">
          <circle cx="5" cy="12" r="1.5" fill="currentColor" stroke="none"/>
          <circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none"/>
          <circle cx="19" cy="12" r="1.5" fill="currentColor" stroke="none"/>
        </svg>
        More
      </button>
    </nav>

    <!-- Mobile "More" popup menu -->
    <Transition name="fade">
      <div v-if="mobileMoreOpen" class="md:hidden fixed inset-0 z-40 flex items-end justify-end pb-20 pr-4" @click.self="mobileMoreOpen = false">
        <div class="bg-white rounded-xl shadow-xl border border-gray-200 py-2 min-w-40">
          <span class="block px-4 py-1 text-xs text-gray-400 font-medium uppercase tracking-wide">Queue</span>
          <div class="px-4 py-1.5 text-sm text-gray-700">{{ status?.queue_depth ?? 0 }} queued</div>
          <div class="px-4 py-1.5 text-sm text-gray-700">{{ status?.paused_count ?? 0 }} paused</div>
        </div>
      </div>
    </Transition>

    <!-- Mobile slide-in drawer (ticket list) -->
    <Transition name="drawer">
      <div v-if="mobileDrawerOpen" class="md:hidden fixed inset-0 z-50 flex">
        <!-- Backdrop -->
        <div class="absolute inset-0 bg-black/40" @click="mobileDrawerOpen = false"></div>
        <!-- Drawer panel -->
        <div class="relative w-80 max-w-[85vw] bg-gray-50 h-full shadow-xl flex flex-col">
          <!-- Drawer header -->
          <div class="flex items-center justify-between px-4 py-3 border-b border-gray-200 bg-white shrink-0">
            <span class="font-semibold text-gray-800">Tickets</span>
            <button
              @click="mobileDrawerOpen = false"
              class="text-gray-400 hover:text-gray-700 p-1 rounded"
              aria-label="Close"
            >
              <svg class="w-5 h-5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"/>
              </svg>
            </button>
          </div>
          <!-- ProjectTree inside drawer -->
          <div class="flex-1 min-h-0 overflow-hidden flex flex-col">
            <ProjectTree @close="mobileDrawerOpen = false" />
          </div>
        </div>
      </div>
    </Transition>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { api } from './api'
import type { Status } from '../../shared/types'
import { bus } from './bus'
import ProjectTree from './components/ProjectTree.vue'
import NewTicketForm from './components/NewTicketForm.vue'

const status = ref<Status | null>(null)
const route = useRoute()
const router = useRouter()
const mobileDrawerOpen = ref(false)
const mobileMoreOpen = ref(false)
let unsubBus: (() => void) | undefined
let unsubDrawer: (() => void) | undefined
let unsubTicketStatus: (() => void) | undefined

// --- Favicon management ---
const FAVICON_DEFAULT = '/favicon.svg'
const FAVICON_ALERT   = '/favicon-alert.svg'

function setFavicon(href: string) {
  const el = document.getElementById('favicon') as HTMLLinkElement | null
  if (el) el.href = href
}

function clearAlertFavicon() {
  setFavicon(FAVICON_DEFAULT)
}

// Switch to alert favicon only when the tab is not focused
function onTicketStatusChange(_ticketId: string, ticketStatus: string) {
  if ((ticketStatus === 'done' || ticketStatus === 'paused') && document.hidden) {
    setFavicon(FAVICON_ALERT)
  }
}

// Reset alert favicon when user returns to the tab
function onWindowFocus() {
  clearAlertFavicon()
}
// --- End favicon management ---

function closeNewTicket() {
  router.back()
}

function onTicketCreated(ticketId: string) {
  router.push(`/tickets/${ticketId}`)
}

async function loadStatus() {
  try {
    status.value = await api.getStatus()
  } catch { /* ignore */ }
}

onMounted(() => {
  loadStatus()
  unsubBus = bus.onRefresh(loadStatus)
  unsubDrawer = bus.onOpenDrawer(() => { mobileDrawerOpen.value = true })
  unsubTicketStatus = bus.onTicketStatus(onTicketStatusChange)
  window.addEventListener('focus', onWindowFocus)
})

onUnmounted(() => {
  unsubBus?.()
  unsubDrawer?.()
  unsubTicketStatus?.()
  window.removeEventListener('focus', onWindowFocus)
})
</script>

<style scoped>
/* Reserve space for the mobile nav + iOS home indicator */
.mobile-main-content {
  padding-bottom: calc(4rem + env(safe-area-inset-bottom));
}
@media (min-width: 768px) {
  .mobile-main-content {
    padding-bottom: 0;
  }
}

.fade-enter-active, .fade-leave-active { transition: opacity 0.15s ease; }
.fade-enter-from, .fade-leave-to { opacity: 0; }

.modal-enter-active { transition: opacity 0.15s ease; }
.modal-leave-active { transition: opacity 0.1s ease; }
.modal-enter-from, .modal-leave-to { opacity: 0; }
.modal-enter-active .relative, .modal-leave-active .relative { transition: transform 0.2s ease, opacity 0.15s ease; }
.modal-enter-from .relative { transform: scale(0.97); opacity: 0; }
.modal-leave-to .relative { transform: scale(0.97); opacity: 0; }

.drawer-enter-active { transition: opacity 0.2s ease; }
.drawer-leave-active { transition: opacity 0.2s ease; }
.drawer-enter-from, .drawer-leave-to { opacity: 0; }
.drawer-enter-active .relative, .drawer-leave-active .relative { transition: transform 0.25s ease; }
.drawer-enter-from .relative { transform: translateX(-100%); }
.drawer-leave-to .relative { transform: translateX(-100%); }
</style>
