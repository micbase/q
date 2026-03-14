<template>
  <div class="flex flex-col h-full">
    <!-- Header -->
    <div class="px-5 pt-4 pb-3 border-b border-gray-100 shrink-0">
      <div class="flex items-center gap-2 mb-0.5">
        <h1 class="font-semibold text-lg flex-1 truncate">{{ ticket?.title }}</h1>
        <StatusChip v-if="ticket" :status="ticketStatus" />
      </div>
      <div v-if="ticket" class="text-sm text-gray-400 flex items-center gap-2">
        <span>{{ project?.name ?? '' }}</span>
        <span>·</span>
        <PriorityPips :priority="ticket.priority" />
        <span>·</span>
        <span>{{ relativeTime(ticket.created_at) }}</span>
      </div>
    </div>

    <!-- Messages -->
    <div
      ref="scrollEl"
      class="flex-1 overflow-y-auto flex flex-col gap-3 px-5 py-4"
    >
      <div v-if="error" class="text-red-600 text-base text-center py-8">{{ error }}</div>
      <div v-else-if="messages.length === 0" class="text-gray-400 text-base text-center py-8">
        No messages yet
      </div>

      <template v-for="(g, gi) in grouped" :key="gi">
        <!-- User message -->
        <div v-if="g.kind === 'msg' && g.msg!.message_type === 'text' && g.msg!.role === 'user'" class="flex justify-end">
          <div class="bg-blue-600 text-white rounded-2xl rounded-tr-sm px-4 py-2 max-w-xs text-base whitespace-pre-wrap">
            {{ g.msg!.content }}
          </div>
        </div>

        <!-- Assistant text -->
        <div v-else-if="g.kind === 'msg' && g.msg!.message_type === 'text'" class="flex justify-start">
          <div class="bg-amber-50 border border-amber-200 rounded-2xl rounded-tl-sm px-4 py-2 max-w-full w-full text-base whitespace-pre-wrap text-gray-800">
            {{ g.msg!.content }}
          </div>
        </div>

        <!-- Thinking -->
        <div v-else-if="g.kind === 'msg' && g.msg!.message_type === 'thinking'" class="flex justify-start">
          <div class="border border-purple-200 rounded-lg text-sm overflow-hidden max-w-full w-full">
            <div
              @click="toggleExpanded(g.idx)"
              class="flex items-center gap-2 px-3 py-1.5 w-full text-left bg-purple-50 cursor-pointer hover:bg-purple-100"
            >
              <span class="text-purple-400">{{ expanded.has(g.idx) ? '▼' : '▶' }}</span>
              <span class="font-semibold text-purple-700 flex-1">Thinking</span>
            </div>
            <div v-if="expanded.has(g.idx)" class="px-3 py-2 text-sm text-purple-900 whitespace-pre-wrap max-h-96 overflow-y-auto bg-purple-50/50 border-t border-purple-200">{{ g.msg!.content }}</div>
          </div>
        </div>

        <!-- Tool call + result pair -->
        <div v-else-if="g.kind === 'tool_pair'" class="flex justify-start">
          <div :class="[
            'border rounded-lg text-sm overflow-hidden max-w-full w-full',
            g.result?.is_error ? 'border-red-300' : 'border-gray-300'
          ]">
            <!-- Tool use header -->
            <div
              @click="g.use?.tool_name && isExpandable(g.use.tool_name) && toggleExpanded(g.idx)"
              :class="['flex items-center gap-2 px-3 py-1.5 w-full text-left bg-gray-100', g.use?.tool_name && isExpandable(g.use.tool_name) ? 'cursor-pointer hover:bg-gray-200' : '']"
            >
              <span v-if="g.use?.tool_name && isExpandable(g.use.tool_name)" class="text-gray-400">{{ expanded.has(g.idx) ? '▼' : '▶' }}</span>
              <span class="font-semibold text-gray-700 truncate flex-1" v-if="g.use?.tool_name">{{ toolTitle(g.use.tool_name, g.use.content) }}</span>
              <span v-if="g.result?.is_error" class="text-red-500 text-xs font-medium ml-auto shrink-0">error</span>
            </div>

            <!-- TodoWrite: checkbox list (always shown, not expandable) -->
            <template v-if="g.use?.tool_name === 'TodoWrite' && todoItems(g.use.content)">
              <div class="px-3 py-2 space-y-1 bg-white">
                <div v-for="todo in todoItems(g.use.content)" :key="todo.id" class="flex items-start gap-2 text-sm" :class="todo.status === 'in_progress' ? 'bg-amber-50 -mx-3 px-3 py-0.5 border-l-2 border-amber-400' : ''">
                  <span class="mt-0.5 shrink-0">{{ todo.status === 'completed' ? '☑' : '☐' }}</span>
                  <span :class="[todo.status === 'completed' ? 'text-gray-400 line-through' : 'text-gray-800', todo.status === 'in_progress' ? 'font-medium' : '']">{{ todo.content }}</span>
                </div>
              </div>
            </template>

            <!-- Expanded: Edit diff -->
            <template v-else-if="expanded.has(g.idx) && g.use?.tool_name === 'Edit' && editInput(g.use.content)">
              <EditDiff
                :old-string="editInput(g.use.content)!.old_string"
                :new-string="editInput(g.use.content)!.new_string"
                :file-path="editInput(g.use.content)!.file_path"
              />
              <div v-if="g.result?.is_error" class="px-3 py-2 font-mono text-xs whitespace-pre-wrap max-h-96 overflow-y-auto border-t border-gray-300 bg-red-50 text-red-800">{{ g.result.content }}</div>
            </template>

            <!-- Expanded: tool input (non-Edit) -->
            <template v-else-if="expanded.has(g.idx) && g.use?.tool_name">
              <div v-if="toolBody(g.use.tool_name, g.use.content)"
                class="px-3 py-2 font-mono text-xs text-blue-900 whitespace-pre-wrap max-h-64 overflow-y-auto bg-blue-50 border-t border-gray-300">{{ toolBody(g.use.tool_name, g.use.content) }}</div>

              <!-- Expanded: tool result -->
              <div v-if="g.result && isExpandable(g.use.tool_name)" :class="[
                'px-3 py-2 font-mono text-xs whitespace-pre-wrap max-h-96 overflow-y-auto border-t border-gray-300',
                g.result.is_error ? 'bg-red-50 text-red-800' : 'bg-gray-50 text-gray-700'
              ]">{{ g.result.content }}</div>
            </template>
          </div>
        </div>

        <!-- Paused marker -->
        <div v-else-if="g.kind === 'msg' && g.msg!.message_type === 'paused'" class="text-center">
          <span class="text-sm text-orange-400 bg-orange-50 px-3 py-1 rounded-full">Waiting for input</span>
        </div>

        <!-- Done -->
        <div v-else-if="g.kind === 'msg' && g.msg!.message_type === 'done'" class="text-center">
          <span class="text-sm text-gray-400 bg-gray-100 px-3 py-1 rounded-full">Task complete</span>
        </div>

        <!-- Error -->
        <div v-else-if="g.kind === 'msg' && g.msg!.message_type === 'error'" class="flex justify-start">
          <div class="bg-red-50 border border-red-200 rounded-lg px-4 py-2 max-w-full w-full text-base text-red-700 whitespace-pre-wrap">
            {{ g.msg!.content }}
          </div>
        </div>
      </template>

    </div>

    <!-- Reply error -->
    <div v-if="replyError" class="px-5 py-1">
      <p class="text-red-600 text-sm">{{ replyError }}</p>
    </div>

    <!-- Reply box (when paused or done) -->
    <div class="border-t border-gray-200 px-5 py-3 flex gap-2 shrink-0">
      <input
        v-model="reply"
        type="text"
        :placeholder="ticketStatus === 'done' ? 'Follow up...' : 'Type your reply...'"
        :disabled="inputDisabled"
        @keydown.enter="sendReply"
        class="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-base focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:bg-gray-50"
      />
      <button
        @click="sendReply"
        :disabled="!reply.trim() || inputDisabled"
        class="bg-blue-600 text-white px-4 py-2 rounded-lg text-base font-medium hover:bg-blue-700 disabled:opacity-50"
      >
        Send
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted, nextTick } from 'vue'
import { api } from '../api'
import type { Ticket, Project, StreamEvent, MessageType } from '../../../shared/types'
import { bus } from '../bus'
import StatusChip from '../components/StatusChip.vue'
import PriorityPips from '../components/PriorityPips.vue'
import EditDiff from '../components/EditDiff.vue'

interface DisplayMsg {
  message_type: MessageType
  content: string
  role?: string
  tool_name?: string
  tool_use_id?: string
  tool_input?: string
  tool_result_content?: string
  tool_result_for_id?: string
  is_error?: boolean
  parent_tool_use_id?: string
}

interface GroupedMsg {
  kind: 'msg' | 'tool_pair'
  msg?: DisplayMsg          // for kind === 'msg'
  use?: DisplayMsg          // for kind === 'tool_pair'
  result?: DisplayMsg       // for kind === 'tool_pair' (may arrive later)
  idx: number               // original index for expand tracking
}

const props = defineProps<{ id: string }>()

const ticket = ref<Ticket | null>(null)
const project = ref<Project | null>(null)
const messages = ref<DisplayMsg[]>([])
const ticketStatus = ref<Ticket['status']>('queued')
const error = ref('')
const reply = ref('')
const sending = ref(false)
const replyError = ref('')
const scrollEl = ref<HTMLElement | null>(null)
const expanded = ref<Set<number>>(new Set())
let es: EventSource | null = null

const inputDisabled = computed(() => sending.value || ticketStatus.value === 'running' || ticketStatus.value === 'queued')

const grouped = computed<GroupedMsg[]>(() => {
  const out: GroupedMsg[] = []
  const msgs = messages.value
  // Index tool_results by tool_result_for_id for matching
  const resultsByUseId = new Map<string, DisplayMsg>()
  const matchedResults = new Set<number>()
  for (let i = 0; i < msgs.length; i++) {
    if (msgs[i].message_type === 'tool_result' && msgs[i].tool_result_for_id) {
      resultsByUseId.set(msgs[i].tool_result_for_id!, msgs[i])
      matchedResults.add(i)
    }
  }
  // Find the last TodoWrite tool_use index so we can skip earlier ones
  let lastTodoIdx = -1
  for (let i = msgs.length - 1; i >= 0; i--) {
    if (msgs[i].message_type === 'tool_use' && msgs[i].tool_name === 'TodoWrite') {
      lastTodoIdx = i
      break
    }
  }
  for (let i = 0; i < msgs.length; i++) {
    if (msgs[i].message_type === 'tool_use') {
      // Skip non-last TodoWrite calls and their results
      if (msgs[i].tool_name === 'TodoWrite' && i !== lastTodoIdx) {
        if (msgs[i].tool_use_id) matchedResults.add(
          msgs.findIndex(m => m.tool_result_for_id === msgs[i].tool_use_id)
        )
        continue
      }
      const result = msgs[i].tool_use_id ? resultsByUseId.get(msgs[i].tool_use_id!) : undefined
      out.push({ kind: 'tool_pair', use: msgs[i], result, idx: i })
    } else if (msgs[i].message_type === 'tool_result') {
      if (!matchedResults.has(i)) {
        out.push({ kind: 'tool_pair', result: msgs[i], idx: i })
      }
    } else {
      out.push({ kind: 'msg', msg: msgs[i], idx: i })
    }
  }
  return out
})

function relativeTime(ms: number): string {
  const diff = Math.max(0, Date.now() - ms)
  const secs = Math.floor(diff / 1000)
  if (secs < 60) return `${secs}s`
  const mins = Math.floor(secs / 60)
  if (mins < 60) return `${mins}m`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h`
  return `${Math.floor(hrs / 24)}d`
}

function toolTitle(name: string, content: string): string {
  if (!content) return name
  try {
    const json = JSON.parse(content)
    if (name === 'TodoWrite' && Array.isArray(json.todos)) {
      const done = json.todos.filter((t: { status: string }) => t.status === 'completed').length
      return `Tasks (${done}/${json.todos.length})`
    }
    if (json.file_path) return `${name}: ${json.file_path}`
    if (json.description) return `${name}: ${json.description}`
    if (json.command) return `${name}: ${json.command}`
    if (json.pattern) return `${name}: ${json.pattern}`
  } catch { /* not JSON, ignore */ }
  return name
}

function toolBody(name: string, content: string): string {
  if (!content) return ''
  try {
    const json = JSON.parse(content)
    if (name === 'Bash') return json.command ?? content
    if (name === 'Read' || name === 'Write') return ''
  } catch { /* not JSON */ }
  return content
}

function editInput(content: string): { file_path: string; old_string: string; new_string: string } | null {
  if (!content) return null
  try {
    const json = JSON.parse(content)
    if (json.old_string != null && json.new_string != null && json.file_path) return json
  } catch { /* not JSON */ }
  return null
}

function todoItems(content: string): { id: string; content: string; status: string }[] | null {
  if (!content) return null
  try {
    const json = JSON.parse(content)
    if (Array.isArray(json.todos) && json.todos.length > 0) return json.todos
  } catch { /* not JSON */ }
  return null
}

function isExpandable(name: string): boolean {
  return name !== 'Read' && name !== 'TodoWrite'
}

function toggleExpanded(i: number) {
  if (expanded.value.has(i)) {
    expanded.value.delete(i)
  } else {
    expanded.value.add(i)
  }
}

function scrollToBottom() {
  nextTick(() => {
    if (scrollEl.value) {
      scrollEl.value.scrollTop = scrollEl.value.scrollHeight
    }
  })
}

async function sendReply() {
  if (!reply.value.trim() || sending.value) return
  sending.value = true
  replyError.value = ''
  try {
    await api.reply(props.id, reply.value.trim())
    reply.value = ''
  } catch (err) {
    replyError.value = err instanceof Error ? err.message : 'Failed to send reply'
  } finally {
    sending.value = false
  }
}

function handleEvent(event: StreamEvent) {
  if (event.type === 'NewMessage') {
    const idx = messages.value.length
    messages.value.push({
      message_type: event.message_type!,
      content: event.content ?? '',
      role: event.role,
      tool_name: event.tool_name,
      tool_use_id: event.tool_use_id,
      tool_input: event.tool_input,
      tool_result_content: event.tool_result_content,
      tool_result_for_id: event.tool_result_for_id,
      is_error: event.is_error,
      parent_tool_use_id: event.parent_tool_use_id,
    })
    if (event.message_type === 'thinking' || event.message_type === 'tool_use' || event.message_type === 'tool_result') {
      expanded.value.add(idx)
    }
    scrollToBottom()
  }

  if (event.type === 'TicketStatusChange' && event.ticket_status) {
    ticketStatus.value = event.ticket_status
    bus.refresh()
  }
}

function openStream(id: string) {
  es?.close()

  es = api.streamEvents(id, handleEvent, () => {
    // EventSource will auto-reconnect; on reconnect, server replays all messages
  })

  // On reconnect, clear messages so replay rebuilds them without duplicates
  es.onopen = () => {
    messages.value = []
    expanded.value = new Set()
  }
}

async function load(id: string) {
  es?.close()
  ticket.value = null
  project.value = null
  messages.value = []
  ticketStatus.value = 'queued'
  error.value = ''

  try {
    ticket.value = await api.getTicket(id)
    if (ticket.value) {
      ticketStatus.value = ticket.value.status
      project.value = await api.getProject(ticket.value.project_id).catch(() => null)
    }
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Failed to load ticket'
    return
  }

  openStream(id)
}

onMounted(() => load(props.id))
watch(() => props.id, load)
onUnmounted(() => es?.close())
</script>
