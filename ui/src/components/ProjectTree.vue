<template>
  <div class="flex flex-col h-full">
    <!-- Filter pills -->
    <div class="px-3 pt-2 pb-2 flex gap-1.5 flex-wrap border-b border-gray-100 shrink-0">
      <button
        v-for="f in filters"
        :key="f.value"
        @click="activeFilter = f.value"
        class="px-2.5 py-0.5 rounded-full text-xs font-medium transition-colors"
        :class="activeFilter === f.value
          ? 'bg-gray-800 text-white'
          : 'bg-gray-100 text-gray-600 hover:bg-gray-200'"
      >{{ f.label }}</button>
    </div>

    <!-- List -->
    <div class="flex-1 overflow-y-auto py-2">
      <div v-if="loading && projectGroups.length === 0" class="text-sm text-gray-400 px-4 py-6 text-center">Loading...</div>
      <div v-else-if="loadError" class="text-sm text-red-500 px-4 py-6 text-center">{{ loadError }}</div>
      <div v-else-if="filteredGroups.length === 0" class="text-sm text-gray-400 px-4 py-6 text-center">No tickets</div>

      <div v-for="group in filteredGroups" :key="group.id">
        <!-- Project header -->
        <button
          @click="toggleProject(group.id)"
          class="w-full flex items-center gap-2 px-3 py-1.5 text-left hover:bg-gray-100 transition-colors"
        >
          <span class="text-gray-400 text-xs w-3 shrink-0">{{ collapsed.has(group.id) ? '▶' : '▼' }}</span>
          <span class="font-semibold text-xs tracking-wider text-gray-500 truncate flex-1 uppercase">{{ group.name }}</span>
          <span class="text-xs bg-gray-200 text-gray-600 px-1.5 py-0.5 rounded-full shrink-0 font-medium leading-none">{{ group.filteredTickets.length }}</span>
        </button>

        <!-- Tickets -->
        <div v-if="!collapsed.has(group.id)">
          <RouterLink
            v-for="ticket in group.filteredTickets"
            :key="ticket.id"
            :to="`/tickets/${ticket.id}`"
            @click="emit('close')"
            class="flex items-center gap-2 pl-7 pr-3 py-1.5 text-sm hover:bg-gray-100 transition-colors border-l-2 mx-1 rounded-r"
            :class="isActive(ticket.id)
              ? 'bg-blue-50 border-l-blue-500'
              : 'border-l-transparent'"
          >
            <!-- Status dot -->
            <span class="shrink-0 w-2 h-2 rounded-full" :class="dotClass(ticket.status)"></span>
            <!-- Title -->
            <span class="truncate flex-1 text-sm" :class="titleClass(ticket.status, isActive(ticket.id))">{{ ticket.title }}</span>
          </RouterLink>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { useRoute } from 'vue-router'
import { api } from '../api'
import type { Ticket, Project, TicketStatus } from '../../../shared/types'
import { bus } from '../bus'

const emit = defineEmits<{ close: [] }>()

type FilterValue = 'all' | 'running' | 'paused' | 'failed' | 'done'

const filters: { label: string; value: FilterValue }[] = [
  { label: 'All', value: 'all' },
  { label: 'Running', value: 'running' },
  { label: 'Paused', value: 'paused' },
  { label: 'Failed', value: 'failed' },
  { label: 'Done', value: 'done' },
]

interface ProjectGroup {
  id: string
  name: string
  tickets: Ticket[]
  filteredTickets: Ticket[]
}

const route = useRoute()
const tickets = ref<Ticket[]>([])
const projects = ref<Project[]>([])
const loading = ref(true)
const loadError = ref('')
const collapsed = ref<Set<string>>(new Set())
const activeFilter = ref<FilterValue>('all')

function isActive(ticketId: string): boolean {
  return route.params.id === ticketId
}

function dotClass(status: TicketStatus): string {
  switch (status) {
    case 'running':  return 'bg-amber-400'
    case 'done':     return 'bg-green-500'
    case 'failed':   return 'bg-red-500'
    case 'paused':   return 'bg-orange-500'
    case 'queued':   return 'bg-gray-400'
    default:         return 'bg-gray-300'
  }
}

function titleClass(status: TicketStatus, active: boolean): string {
  if (active) return 'text-blue-700'
  if (status === 'failed') return 'text-red-600'
  if (status === 'paused') return 'text-orange-600'
  return 'text-gray-600'
}

const projectGroups = computed((): ProjectGroup[] => {
  const ticketsByProject = new Map<string, Ticket[]>()

  for (const p of projects.value) {
    ticketsByProject.set(p.id, [])
  }

  for (const t of tickets.value) {
    if (!ticketsByProject.has(t.project_id)) ticketsByProject.set(t.project_id, [])
    ticketsByProject.get(t.project_id)!.push(t)
  }

  const projectMap = new Map<string, Project>(projects.value.map(p => [p.id, p]))

  return [...ticketsByProject.entries()]
    .map(([projectId, ts]) => ({
      id: projectId,
      name: projectMap.get(projectId)?.name ?? projectId,
      tickets: ts.sort((a, b) => b.created_at - a.created_at),
      filteredTickets: ts.sort((a, b) => b.created_at - a.created_at),
    }))
    .sort((a, b) => a.name.localeCompare(b.name))
})

const filteredGroups = computed((): ProjectGroup[] => {
  return projectGroups.value
    .map(group => ({
      ...group,
      filteredTickets: activeFilter.value === 'all'
        ? group.tickets
        : group.tickets.filter(t => t.status === activeFilter.value),
    }))
    .filter(group => group.filteredTickets.length > 0)
})

function toggleProject(id: string) {
  if (collapsed.value.has(id)) {
    collapsed.value.delete(id)
  } else {
    collapsed.value.add(id)
  }
}

async function load() {
  try {
    const [t, p] = await Promise.all([api.listTickets(), api.listProjects()])
    tickets.value = t
    projects.value = p
    loadError.value = ''
  } catch (err) {
    loadError.value = err instanceof Error ? err.message : 'Failed to load'
  } finally {
    loading.value = false
  }
}

watch(() => route.fullPath, load)

let unsubBus: (() => void) | undefined

onMounted(() => {
  load()
  unsubBus = bus.onRefresh(load)
})

onUnmounted(() => { unsubBus?.() })
</script>
