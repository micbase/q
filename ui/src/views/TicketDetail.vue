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

      <template v-for="(msg, i) in messages" :key="i">
        <!-- User message -->
        <div v-if="msg.message_type === 'text' && msg.role === 'user'" class="flex justify-end">
          <div class="bg-blue-600 text-white rounded-2xl rounded-tr-sm px-4 py-2 max-w-xs text-base whitespace-pre-wrap">
            {{ msg.content }}
          </div>
        </div>

        <!-- Assistant text -->
        <div v-else-if="msg.message_type === 'text'" class="flex justify-start">
          <div class="bg-white border border-gray-200 rounded-2xl rounded-tl-sm px-4 py-2 max-w-sm text-base whitespace-pre-wrap">
            {{ msg.content }}
          </div>
        </div>

        <!-- Tool use/result chips -->
        <div v-else-if="msg.message_type === 'tool_use' || msg.message_type === 'tool_result'" class="flex justify-start">
          <div
            class="bg-gray-100 rounded-lg text-sm text-gray-600 overflow-hidden"
          >
            <button
              @click="toggleExpanded(i)"
              class="flex items-center gap-2 px-3 py-1.5 w-full text-left hover:bg-gray-200"
            >
              <span>{{ expanded.has(i) ? '▼' : '▶' }}</span>
              <span class="font-mono">{{ msg.content.split('\n')[0] }}</span>
            </button>
            <div v-if="expanded.has(i)" class="px-3 pb-2 font-mono whitespace-pre-wrap max-h-48 overflow-y-auto">
              {{ msg.content }}
            </div>
          </div>
        </div>

        <!-- Paused message -->
        <div v-else-if="msg.message_type === 'paused'" class="flex justify-start">
          <div class="bg-orange-50 border border-orange-200 rounded-2xl rounded-tl-sm px-4 py-2 max-w-sm text-base whitespace-pre-wrap text-orange-800">
            {{ msg.content }}
          </div>
        </div>

        <!-- Done -->
        <div v-else-if="msg.message_type === 'done'" class="text-center">
          <span class="text-sm text-gray-400 bg-gray-100 px-3 py-1 rounded-full">Task complete</span>
        </div>

        <!-- Error -->
        <div v-else-if="msg.message_type === 'error'" class="flex justify-start">
          <div class="bg-red-50 border border-red-200 rounded-lg px-4 py-2 max-w-sm text-base text-red-700 whitespace-pre-wrap">
            {{ msg.content }}
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

interface DisplayMsg {
  message_type: MessageType
  content: string
  role?: string
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
    messages.value.push({
      message_type: event.message_type!,
      content: event.content ?? '',
      role: event.role,
    })
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
