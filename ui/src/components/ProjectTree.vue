<template>
  <div class="py-2">
    <div v-if="loading && projectGroups.length === 0" class="text-sm text-gray-400 px-4 py-6 text-center">Loading...</div>
    <div v-else-if="projectGroups.length === 0" class="text-sm text-gray-400 px-4 py-6 text-center">No projects yet</div>

    <div v-for="group in projectGroups" :key="group.id">
      <!-- Project header -->
      <button
        @click="toggleProject(group.id)"
        class="w-full flex items-center gap-1.5 px-3 py-1.5 text-left hover:bg-gray-100 transition-colors group"
      >
        <span class="text-gray-400 text-sm w-3 shrink-0">{{ collapsed.has(group.id) ? '▶' : '▼' }}</span>
        <span class="font-medium text-base text-gray-700 truncate flex-1">{{ group.name }}</span>
        <span class="text-sm text-gray-400 shrink-0">{{ group.tickets.length }}</span>
      </button>

      <!-- Tickets -->
      <div v-if="!collapsed.has(group.id)">
        <RouterLink
          v-for="ticket in group.tickets"
          :key="ticket.id"
          :to="`/tickets/${ticket.id}`"
          class="flex items-center gap-2 pl-7 pr-3 py-1.5 text-base hover:bg-gray-100 transition-colors border-l-2 mx-1 rounded-r"
          :class="route.params.id === ticket.id
            ? 'bg-blue-50 border-l-blue-500 text-blue-700'
            : 'border-l-transparent text-gray-600'"
        >
          <span class="truncate flex-1 text-sm">{{ ticket.title }}</span>
          <StatusChip :status="ticket.status" class="shrink-0" />
        </RouterLink>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { useRoute } from 'vue-router'
import { api } from '../api'
import type { Ticket, Project } from '../../../shared/types'
import { bus } from '../bus'
import StatusChip from './StatusChip.vue'

interface ProjectGroup {
  id: string
  name: string
  tickets: Ticket[]
}

const route = useRoute()
const tickets = ref<Ticket[]>([])
const projects = ref<Project[]>([])
const loading = ref(true)
const collapsed = ref<Set<string>>(new Set())

const projectGroups = computed((): ProjectGroup[] => {
  const ticketsByProject = new Map<string, Ticket[]>()

  // Initialize all projects (even those with zero tickets)
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
    }))
    .sort((a, b) => a.name.localeCompare(b.name))
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
  } catch { /* ignore */ } finally {
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
