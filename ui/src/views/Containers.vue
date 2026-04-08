<template>
  <div class="flex-1 overflow-y-auto px-5 py-4">
    <h1 class="text-xl font-semibold mb-5">Containers</h1>

    <div v-if="loading && groups.length === 0" class="text-sm text-gray-400 py-8 text-center">Loading...</div>
    <div v-else-if="loadError" class="text-sm text-red-500 py-8 text-center">{{ loadError }}</div>
    <div v-else-if="groups.length === 0" class="text-sm text-gray-400 py-8 text-center">No tickets found.</div>

    <div v-else class="flex flex-col gap-4">
      <div v-for="group in groups" :key="group.projectId" class="border border-gray-200 rounded-xl overflow-hidden">
        <!-- Project header -->
        <div class="bg-gray-50 border-b border-gray-200 px-4 py-2.5 flex items-center gap-2">
          <span class="font-medium text-gray-800">{{ group.projectName }}</span>
          <span class="text-xs text-gray-400">{{ group.tickets.length }} ticket{{ group.tickets.length !== 1 ? 's' : '' }}</span>
        </div>

        <!-- Ticket rows -->
        <div class="divide-y divide-gray-100">
          <div
            v-for="ticket in group.tickets"
            :key="ticket.id"
            class="px-4 py-3"
          >
            <div class="flex items-start gap-4">
              <!-- Ticket title + status (left) -->
              <div class="flex-1 min-w-0 flex items-center gap-2 pt-0.5">
                <RouterLink
                  :to="`/tickets/${ticket.id}`"
                  class="text-sm font-medium text-gray-900 hover:text-blue-600 truncate"
                >{{ ticket.title }}</RouterLink>
                <StatusChip :status="ticket.status" class="shrink-0" />
              </div>

              <!-- Right side: container + dev server rows stacked, columns aligned -->
              <div class="flex flex-col gap-1.5 shrink-0">
                <!-- Container row -->
                <div class="flex items-center gap-2">
                  <span class="text-xs font-medium text-gray-500 w-20 shrink-0">Container</span>
                  <span
                    class="text-xs font-medium px-2 py-0.5 rounded-full w-16 text-center shrink-0"
                    :class="containerStatusClass(ticket.container_status)"
                  >{{ ticket.container_status }}</span>
                  <div class="flex items-center gap-1.5">
                    <button
                      @click="doContainerAction('start', ticket.id)"
                      :disabled="!canStart(ticket) || !!pending[ticket.id]"
                      title="Start"
                      class="px-2.5 py-1 text-xs rounded-lg border font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed w-16 text-center"
                      :class="canStart(ticket) && !pending[ticket.id]
                        ? 'border-green-300 text-green-700 hover:bg-green-50'
                        : 'border-gray-200 text-gray-400'"
                    >{{ pending[ticket.id] === 'start' ? '…' : 'Start' }}</button>
                    <button
                      @click="doContainerAction('stop', ticket.id)"
                      :disabled="!canStop(ticket) || !!pending[ticket.id]"
                      title="Kill"
                      class="px-2.5 py-1 text-xs rounded-lg border font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed w-16 text-center"
                      :class="canStop(ticket) && !pending[ticket.id]
                        ? 'border-red-300 text-red-700 hover:bg-red-50'
                        : 'border-gray-200 text-gray-400'"
                    >{{ pending[ticket.id] === 'stop' ? '…' : 'Kill' }}</button>
                    <button
                      @click="doContainerAction('restart', ticket.id)"
                      :disabled="!canRestart(ticket) || !!pending[ticket.id]"
                      title="Restart (kill then start)"
                      class="px-2.5 py-1 text-xs rounded-lg border font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed w-16 text-center"
                      :class="canRestart(ticket) && !pending[ticket.id]
                        ? 'border-blue-300 text-blue-700 hover:bg-blue-50'
                        : 'border-gray-200 text-gray-400'"
                    >{{ pending[ticket.id] === 'restart' ? '…' : 'Restart' }}</button>
                  </div>
                  <span v-if="errors[ticket.id]" class="text-xs text-red-500 max-w-32 truncate" :title="errors[ticket.id]">
                    {{ errors[ticket.id] }}
                  </span>
                </div>

                <!-- Dev server row (only if project has dev command) -->
                <div v-if="group.hasDevCommand" class="flex items-center gap-2">
                  <span class="text-xs font-medium text-purple-600 w-20 shrink-0">Dev Server</span>
                  <span
                    class="text-xs font-medium px-2 py-0.5 rounded-full w-16 text-center shrink-0"
                    :class="devServerStatusClass(ticket.dev_server_status)"
                  >{{ ticket.dev_server_status }}</span>
                  <div class="flex items-center gap-1.5">
                    <button
                      @click="doDevAction('start', ticket.id)"
                      :disabled="!canDevStart(ticket) || !!devPending[ticket.id]"
                      title="Start dev server"
                      class="px-2.5 py-1 text-xs rounded-lg border font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed w-16 text-center"
                      :class="canDevStart(ticket) && !devPending[ticket.id]
                        ? 'border-green-300 text-green-700 hover:bg-green-50'
                        : 'border-gray-200 text-gray-400'"
                    >{{ devPending[ticket.id] === 'start' ? '…' : 'Start' }}</button>
                    <button
                      @click="doDevAction('stop', ticket.id)"
                      :disabled="!canDevStop(ticket) || !!devPending[ticket.id]"
                      title="Stop dev server"
                      class="px-2.5 py-1 text-xs rounded-lg border font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed w-16 text-center"
                      :class="canDevStop(ticket) && !devPending[ticket.id]
                        ? 'border-red-300 text-red-700 hover:bg-red-50'
                        : 'border-gray-200 text-gray-400'"
                    >{{ devPending[ticket.id] === 'stop' ? '…' : 'Stop' }}</button>
                    <button
                      @click="doDevAction('restart', ticket.id)"
                      :disabled="!canDevRestart(ticket) || !!devPending[ticket.id]"
                      title="Restart dev server"
                      class="px-2.5 py-1 text-xs rounded-lg border font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed w-16 text-center"
                      :class="canDevRestart(ticket) && !devPending[ticket.id]
                        ? 'border-purple-300 text-purple-700 hover:bg-purple-50'
                        : 'border-gray-200 text-gray-400'"
                    >{{ devPending[ticket.id] === 'restart' ? '…' : 'Restart' }}</button>
                  </div>
                  <span v-if="devErrors[ticket.id]" class="text-xs text-red-500 max-w-32 truncate" :title="devErrors[ticket.id]">
                    {{ devErrors[ticket.id] }}
                  </span>
                </div>
              </div>
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
      const activeTickets = ts.filter(t => t.status !== 'archived' && t.status !== 'deleted')
      return {
        projectId,
        projectName: project?.name ?? projectId,
        hasDevCommand: !!project?.dev_command,
        tickets: activeTickets.sort((a, b) => b.created_at - a.created_at),
      }
    })
    .filter(g => g.tickets.length > 0)
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
  if (status === 'waiting') return 'bg-blue-100 text-blue-600'
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
  return ticket.dev_server_status === 'running' || ticket.dev_server_status === 'starting' || ticket.dev_server_status === 'waiting'
}

function canDevRestart(ticket: Ticket): boolean {
  return ticket.container_status === 'running' &&
    (ticket.dev_server_status === 'running' || ticket.dev_server_status === 'error')
}

async function load() {
  try {
    const data = await api.listContainers()
    tickets.value = data.tickets.map(t => ({
      ...t,
      container_status: (pending.value[t.id] === 'start' || pending.value[t.id] === 'restart')
        ? 'starting' as ContainerStatus : t.container_status,
      dev_server_status: (devPending.value[t.id] === 'start' || devPending.value[t.id] === 'restart')
        ? 'waiting' as DevServerStatus : t.dev_server_status,
    }))
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
  if (action === 'start' || action === 'restart') {
    const t = tickets.value.find(t => t.id === id)
    if (t) t.container_status = 'starting'
  }
  try {
    if (action === 'start') await api.startContainer(id)
    else if (action === 'stop') await api.stopContainer(id)
    else await api.restartContainer(id)
    await load()
  } catch (err) {
    errors.value[id] = err instanceof Error ? err.message : 'Failed'
    await load()
  } finally {
    delete pending.value[id]
  }
}

async function doDevAction(action: 'start' | 'stop' | 'restart', id: string) {
  devPending.value[id] = action
  delete devErrors.value[id]
  if (action === 'start' || action === 'restart') {
    const t = tickets.value.find(t => t.id === id)
    if (t) t.dev_server_status = 'waiting'
  }
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
