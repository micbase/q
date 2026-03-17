<template>
  <div class="flex-1 overflow-y-auto px-5 py-4 max-w-3xl">
    <div class="flex items-center justify-between mb-5">
      <h1 class="text-xl font-semibold">Containers</h1>
      <button
        @click="load"
        class="text-sm text-gray-500 hover:text-gray-700 border border-gray-300 rounded-lg px-3 py-1.5 transition-colors"
      >Refresh</button>
    </div>

    <div v-if="loading && groups.length === 0" class="text-sm text-gray-400 py-8 text-center">Loading...</div>
    <div v-else-if="loadError" class="text-sm text-red-500 py-8 text-center">{{ loadError }}</div>
    <div v-else-if="groups.length === 0" class="text-sm text-gray-400 py-8 text-center">No tickets found.</div>

    <div v-else class="flex flex-col gap-4">
      <div v-for="group in groups" :key="group.projectId" class="border border-gray-200 rounded-xl overflow-hidden">
        <!-- Project header -->
        <div class="bg-gray-50 border-b border-gray-200 px-4 py-2.5 flex items-center gap-2">
          <span class="font-medium text-gray-800">{{ group.projectName }}</span>
          <span class="text-xs text-gray-400">{{ group.tickets.length }} ticket{{ group.tickets.length !== 1 ? 's' : '' }}</span>
          <span v-if="group.hasDevCommand" class="text-xs text-purple-500 font-medium ml-auto">dev server</span>
        </div>

        <!-- Ticket rows -->
        <div class="divide-y divide-gray-100">
          <div
            v-for="ticket in group.tickets"
            :key="ticket.id"
            class="px-4 py-3"
          >
            <!-- Top row: ticket info + status + container actions -->
            <div class="flex items-center gap-3">
              <!-- Ticket info -->
              <div class="flex-1 min-w-0">
                <RouterLink
                  :to="`/tickets/${ticket.id}`"
                  class="text-sm font-medium text-gray-900 hover:text-blue-600 truncate block"
                >{{ ticket.title }}</RouterLink>
                <span class="text-xs text-gray-400 font-mono">{{ ticket.id }}</span>
              </div>

              <!-- Ticket status -->
              <StatusChip :status="ticket.status" class="shrink-0" />

              <!-- Container status badge -->
              <span
                class="text-xs font-medium px-2 py-0.5 rounded-full shrink-0"
                :class="containerStatusClass(ticket.container_status)"
              >{{ ticket.container_status }}</span>

              <!-- Container action buttons -->
              <div class="flex items-center gap-1.5 shrink-0">
                <button
                  @click="doContainerAction('start', ticket.id)"
                  :disabled="!canStart(ticket) || !!pending[ticket.id]"
                  title="Start"
                  class="px-2.5 py-1 text-xs rounded-lg border font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                  :class="canStart(ticket) && !pending[ticket.id]
                    ? 'border-green-300 text-green-700 hover:bg-green-50'
                    : 'border-gray-200 text-gray-400'"
                >{{ pending[ticket.id] === 'start' ? '…' : 'Start' }}</button>

                <button
                  @click="doContainerAction('stop', ticket.id)"
                  :disabled="!canStop(ticket) || !!pending[ticket.id]"
                  title="Kill"
                  class="px-2.5 py-1 text-xs rounded-lg border font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                  :class="canStop(ticket) && !pending[ticket.id]
                    ? 'border-red-300 text-red-700 hover:bg-red-50'
                    : 'border-gray-200 text-gray-400'"
                >{{ pending[ticket.id] === 'stop' ? '…' : 'Kill' }}</button>

                <button
                  @click="doContainerAction('restart', ticket.id)"
                  :disabled="!canRestart(ticket) || !!pending[ticket.id]"
                  title="Restart (kill then start)"
                  class="px-2.5 py-1 text-xs rounded-lg border font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                  :class="canRestart(ticket) && !pending[ticket.id]
                    ? 'border-blue-300 text-blue-700 hover:bg-blue-50'
                    : 'border-gray-200 text-gray-400'"
                >{{ pending[ticket.id] === 'restart' ? '…' : 'Restart' }}</button>
              </div>

              <!-- Row error -->
              <span v-if="errors[ticket.id]" class="text-xs text-red-500 shrink-0 max-w-32 truncate" :title="errors[ticket.id]">
                {{ errors[ticket.id] }}
              </span>
            </div>

            <!-- Dev server row (only if project has dev command) -->
            <div v-if="group.hasDevCommand" class="flex items-center gap-3 mt-2 pl-0">
              <span class="text-xs text-gray-400 w-16 shrink-0">dev server</span>

              <!-- Dev server status badge -->
              <span
                class="text-xs font-medium px-2 py-0.5 rounded-full shrink-0"
                :class="devServerStatusClass(ticket.dev_server_status)"
              >{{ ticket.dev_server_status }}</span>

              <!-- Dev server action buttons -->
              <div class="flex items-center gap-1.5 shrink-0">
                <button
                  @click="doDevAction('start', ticket.id)"
                  :disabled="!canDevStart(ticket) || !!devPending[ticket.id]"
                  title="Start dev server"
                  class="px-2.5 py-1 text-xs rounded-lg border font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                  :class="canDevStart(ticket) && !devPending[ticket.id]
                    ? 'border-green-300 text-green-700 hover:bg-green-50'
                    : 'border-gray-200 text-gray-400'"
                >{{ devPending[ticket.id] === 'start' ? '…' : 'Start' }}</button>

                <button
                  @click="doDevAction('stop', ticket.id)"
                  :disabled="!canDevStop(ticket) || !!devPending[ticket.id]"
                  title="Stop dev server"
                  class="px-2.5 py-1 text-xs rounded-lg border font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                  :class="canDevStop(ticket) && !devPending[ticket.id]
                    ? 'border-red-300 text-red-700 hover:bg-red-50'
                    : 'border-gray-200 text-gray-400'"
                >{{ devPending[ticket.id] === 'stop' ? '…' : 'Stop' }}</button>

                <button
                  @click="doDevAction('restart', ticket.id)"
                  :disabled="!canDevRestart(ticket) || !!devPending[ticket.id]"
                  title="Restart dev server"
                  class="px-2.5 py-1 text-xs rounded-lg border font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                  :class="canDevRestart(ticket) && !devPending[ticket.id]
                    ? 'border-purple-300 text-purple-700 hover:bg-purple-50'
                    : 'border-gray-200 text-gray-400'"
                >{{ devPending[ticket.id] === 'restart' ? '…' : 'Restart' }}</button>
              </div>

              <span v-if="devErrors[ticket.id]" class="text-xs text-red-500 shrink-0 max-w-32 truncate" :title="devErrors[ticket.id]">
                {{ devErrors[ticket.id] }}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { api } from '../api'
import type { Ticket, Project, ContainerStatus, DevServerStatus } from '../../../shared/types'
import StatusChip from '../components/StatusChip.vue'

interface Group {
  projectId: string
  projectName: string
  hasDevCommand: boolean
  tickets: Ticket[]
}

const tickets = ref<Ticket[]>([])
const projects = ref<Project[]>([])
const loading = ref(true)
const loadError = ref('')
const pending = ref<Record<string, 'start' | 'stop' | 'restart'>>({})
const errors = ref<Record<string, string>>({})
const devPending = ref<Record<string, 'start' | 'stop' | 'restart'>>({})
const devErrors = ref<Record<string, string>>({})

let pollHandle: ReturnType<typeof setInterval> | null = null

const groups = computed((): Group[] => {
  const projectMap = new Map<string, Project>(projects.value.map(p => [p.id, p]))
  const byProject = new Map<string, Ticket[]>()

  for (const t of tickets.value) {
    if (!byProject.has(t.project_id)) byProject.set(t.project_id, [])
    byProject.get(t.project_id)!.push(t)
  }

  return [...byProject.entries()]
    .map(([projectId, ts]) => {
      const project = projectMap.get(projectId)
      return {
        projectId,
        projectName: project?.name ?? projectId,
        hasDevCommand: !!project?.dev_command,
        tickets: ts.sort((a, b) => b.created_at - a.created_at),
      }
    })
    .sort((a, b) => a.projectName.localeCompare(b.projectName))
})

function containerStatusClass(status: ContainerStatus): string {
  if (status === 'running') return 'bg-green-100 text-green-700'
  if (status === 'starting') return 'bg-yellow-100 text-yellow-700'
  return 'bg-gray-100 text-gray-500'
}

function devServerStatusClass(status: DevServerStatus): string {
  if (status === 'running') return 'bg-green-100 text-green-700'
  if (status === 'starting') return 'bg-yellow-100 text-yellow-700'
  if (status === 'error') return 'bg-red-100 text-red-600'
  return 'bg-gray-100 text-gray-500'
}

function canStart(ticket: Ticket): boolean {
  return ticket.container_status === 'stopped'
}

function canStop(ticket: Ticket): boolean {
  return ticket.container_status === 'running' || ticket.container_status === 'starting'
}

function canRestart(ticket: Ticket): boolean {
  return ticket.container_status === 'running'
}

function canDevStart(ticket: Ticket): boolean {
  return ticket.container_status === 'running' &&
    (!ticket.dev_server_status || ticket.dev_server_status === 'stopped' || ticket.dev_server_status === 'error')
}

function canDevStop(ticket: Ticket): boolean {
  return ticket.dev_server_status === 'running' || ticket.dev_server_status === 'starting'
}

function canDevRestart(ticket: Ticket): boolean {
  return ticket.container_status === 'running' &&
    (ticket.dev_server_status === 'running' || ticket.dev_server_status === 'error')
}

async function load() {
  try {
    const data = await api.listContainers()
    tickets.value = data.tickets
    projects.value = data.projects
    loadError.value = ''
  } catch (err) {
    loadError.value = err instanceof Error ? err.message : 'Failed to load'
  } finally {
    loading.value = false
  }
}

async function doContainerAction(action: 'start' | 'stop' | 'restart', id: string) {
  pending.value[id] = action
  delete errors.value[id]
  try {
    if (action === 'start') await api.startContainer(id)
    else if (action === 'stop') await api.stopContainer(id)
    else await api.restartContainer(id)
    await load()
  } catch (err) {
    errors.value[id] = err instanceof Error ? err.message : 'Failed'
  } finally {
    delete pending.value[id]
  }
}

async function doDevAction(action: 'start' | 'stop' | 'restart', id: string) {
  devPending.value[id] = action
  delete devErrors.value[id]
  try {
    if (action === 'start') await api.startDevServer(id)
    else if (action === 'stop') await api.stopDevServer(id)
    else await api.restartDevServer(id)
    await load()
  } catch (err) {
    devErrors.value[id] = err instanceof Error ? err.message : 'Failed'
  } finally {
    delete devPending.value[id]
  }
}

onMounted(() => {
  load()
  pollHandle = setInterval(load, 4000)
})

onUnmounted(() => {
  if (pollHandle) clearInterval(pollHandle)
})
</script>
