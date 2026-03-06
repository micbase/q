<template>
  <div class="flex flex-col h-full">
    <!-- Header -->
    <div class="px-5 pt-4 pb-3 border-b border-gray-100 shrink-0">
      <div class="flex items-center gap-2 mb-0.5">
        <h1 class="font-semibold text-lg flex-1 truncate">{{ ticket?.title }}</h1>
        <StatusChip v-if="ticket" :status="ticket.status" />
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
      <div v-else-if="messages.length === 0 && !loading" class="text-gray-400 text-base text-center py-8">
        No messages yet
      </div>

      <template v-for="(msg, i) in messages" :key="i">
        <!-- User message -->
        <div v-if="msg.type === 'text' && isUserMsg(msg)" class="flex justify-end">
          <div class="bg-blue-600 text-white rounded-2xl rounded-tr-sm px-4 py-2 max-w-xs text-base whitespace-pre-wrap">
            {{ msg.content }}
          </div>
        </div>

        <!-- Assistant text -->
        <div v-else-if="msg.type === 'text'" class="flex justify-start">
          <div class="bg-white border border-gray-200 rounded-2xl rounded-tl-sm px-4 py-2 max-w-sm text-base whitespace-pre-wrap">
            {{ msg.content }}
          </div>
        </div>

        <!-- Tool use/result chips -->
        <div v-else-if="msg.type === 'tool_use' || msg.type === 'tool_result'" class="flex justify-start">
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
        <div v-else-if="msg.type === 'paused'" class="flex justify-start">
          <div class="bg-orange-50 border border-orange-200 rounded-2xl rounded-tl-sm px-4 py-2 max-w-sm text-base whitespace-pre-wrap text-orange-800">
            {{ msg.content }}
          </div>
        </div>

        <!-- Done -->
        <div v-else-if="msg.type === 'done'" class="text-center">
          <span class="text-sm text-gray-400 bg-gray-100 px-3 py-1 rounded-full">✅ Task complete</span>
        </div>

        <!-- Error -->
        <div v-else-if="msg.type === 'error'" class="flex justify-start">
          <div class="bg-red-50 border border-red-200 rounded-lg px-4 py-2 max-w-sm text-base text-red-700 whitespace-pre-wrap">
            ❌ {{ msg.content }}
          </div>
        </div>
      </template>

      <!-- Typing indicator -->
      <div v-if="ticket?.status === 'running'" class="flex justify-start">
        <div class="bg-white border border-gray-200 rounded-2xl rounded-tl-sm px-4 py-3">
          <div class="flex gap-1">
            <span class="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style="animation-delay: 0ms"></span>
            <span class="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style="animation-delay: 150ms"></span>
            <span class="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style="animation-delay: 300ms"></span>
          </div>
        </div>
      </div>
    </div>

    <!-- Reply error -->
    <div v-if="replyError" class="px-5 py-1">
      <p class="text-red-600 text-sm">{{ replyError }}</p>
    </div>

    <!-- Reply box (when paused or done) -->
    <div v-if="ticket?.status === 'paused' || ticket?.status === 'done'" class="border-t border-gray-200 px-5 py-3 flex gap-2 shrink-0">
      <input
        v-model="reply"
        type="text"
        :placeholder="ticket?.status === 'done' ? 'Follow up...' : 'Type your reply...'"
        @keydown.enter="sendReply"
        class="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-base focus:outline-none focus:ring-2 focus:ring-blue-500"
      />
      <button
        @click="sendReply"
        :disabled="!reply.trim() || sending"
        class="bg-blue-600 text-white px-4 py-2 rounded-lg text-base font-medium hover:bg-blue-700 disabled:opacity-50"
      >
        Send
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, onMounted, onUnmounted, nextTick } from 'vue'
import { api, type Ticket, type Project, type StreamEvent } from '../api'
import { bus } from '../bus'
import StatusChip from '../components/StatusChip.vue'
import PriorityPips from '../components/PriorityPips.vue'

interface DisplayMsg {
  type: StreamEvent['type']
  content: string
  role?: string
}

const props = defineProps<{ id: string }>()

const ticket = ref<Ticket | null>(null)
const project = ref<Project | null>(null)
const messages = ref<DisplayMsg[]>([])
const loading = ref(true)
const error = ref('')
const reply = ref('')
const sending = ref(false)
const replyError = ref('')
const scrollEl = ref<HTMLElement | null>(null)
const expanded = ref<Set<number>>(new Set())
let es: EventSource | null = null
let pollHandle: ReturnType<typeof setInterval> | null = null
let loadGeneration = 0 // guard against stale async results

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

function isUserMsg(msg: DisplayMsg): boolean {
  return msg.role === 'user'
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
  const content = reply.value.trim()
  try {
    // Show user message optimistically and keep it visible
    messages.value.push({ type: 'text', content, role: 'user' })
    reply.value = ''
    scrollToBottom()

    await api.reply(props.id, content)
    if (ticket.value) ticket.value.status = 'queued'
    bus.refresh()

    // Start polling — poll will reopen stream when ticket moves to running
    startPoll(props.id)
  } catch (err) {
    // Remove optimistic message on failure
    const idx = messages.value.findLastIndex(m => m.role === 'user' && m.content === content)
    if (idx !== -1) messages.value.splice(idx, 1)
    replyError.value = err instanceof Error ? err.message : 'Failed to send reply'
  } finally {
    sending.value = false
  }
}

function stopPoll() {
  if (pollHandle) { clearInterval(pollHandle); pollHandle = null }
}

function startPoll(id: string) {
  stopPoll()
  pollHandle = setInterval(async () => {
    const fresh = await api.getTicket(id).catch(() => null)
    if (!fresh || !ticket.value) return
    const prev = ticket.value.status
    ticket.value = fresh
    if (prev !== fresh.status) {
      bus.refresh()
      if (fresh.status === 'running') {
        // Fetch messages from DB (atomic, no flash), then open stream for live events
        await refreshMessages(id)
        es?.close()
        openStream()
      } else if (fresh.status === 'done' || fresh.status === 'paused' || fresh.status === 'failed') {
        await refreshMessages(id)
        es?.close()
        stopPoll()
      }
    }
  }, 3000)
}

/** Fetch messages from REST and swap in atomically — no flash */
async function refreshMessages(id: string) {
  const dbMsgs = await api.getMessages(id).catch(() => null)
  if (!dbMsgs) return
  messages.value = dbMsgs.map(m => ({
    type: m.event_type as StreamEvent['type'],
    content: m.content,
    role: m.role,
  }))
  scrollToBottom()
}

function openStream() {
  // Track how many messages we already have so we can skip the replay portion
  const skipCount = messages.value.length
  let received = 0
  const gen = loadGeneration

  es = api.streamEvents(props.id, (event) => {
    // Discard events from a stale generation
    if (gen !== loadGeneration) { es?.close(); return }

    received++
    // Skip replayed messages we already have from refreshMessages/load
    if (received <= skipCount) return

    if (event.type === 'done') {
      messages.value.push({ type: 'done', content: '' })
      if (ticket.value) ticket.value.status = 'done'
      bus.refresh()
      es?.close()
      stopPoll()
    } else if (event.type === 'paused') {
      messages.value.push({ type: 'paused', content: event.content })
      if (ticket.value) ticket.value.status = 'paused'
      bus.refresh()
      es?.close()
      stopPoll()
    } else if (event.type === 'error') {
      messages.value.push({ type: event.type, content: event.content, role: event.role })
      if (ticket.value) ticket.value.status = 'failed'
      bus.refresh()
      es?.close()
      stopPoll()
    } else {
      messages.value.push({ type: event.type, content: event.content, role: event.role })
    }
    scrollToBottom()
  }, () => {
    // On EventSource error/reconnect, close and let poll reopen with fresh skip count
    es?.close()
  })
}

async function load(id: string) {
  es?.close()
  stopPoll()
  const gen = ++loadGeneration
  ticket.value = null
  project.value = null
  messages.value = []
  loading.value = true
  error.value = ''

  try {
    ticket.value = await api.getTicket(id)
    if (ticket.value) {
      project.value = await api.getProject(ticket.value.project_id).catch(() => null)
    }
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Failed to load ticket'
    return
  } finally {
    loading.value = false
  }

  // Guard: if another load() was called while we awaited, abort
  if (gen !== loadGeneration) return

  await refreshMessages(id)
  if (gen !== loadGeneration) return

  // Only open stream for active tickets
  if (ticket.value && (ticket.value.status === 'queued' || ticket.value.status === 'running')) {
    openStream()
    startPoll(id)
  }
}

onMounted(() => load(props.id))
watch(() => props.id, load)
onUnmounted(() => { es?.close(); stopPoll() })
</script>
