<template>
  <div class="flex flex-col h-full relative">

    <!-- ===== DESKTOP HEADER (md+) ===== -->
    <div class="hidden md:block shrink-0">
      <div class="px-5 pt-4 pb-3 border-b border-gray-100">
        <div class="flex items-center gap-3">
          <!-- Left: status chip + title + meta + running badge -->
          <div class="flex items-center gap-2 flex-1 min-w-0">
            <h1 class="font-semibold text-base truncate">{{ ticket?.title }}</h1>
            <StatusChip v-if="ticket" :status="ticketStatus" class="shrink-0" />
            <template v-if="ticket">
              <span class="text-gray-300 shrink-0">·</span>
              <PriorityPips :priority="ticket.priority" class="shrink-0" />
              <span class="text-gray-300 shrink-0">·</span>
              <span class="text-sm text-gray-400 shrink-0">{{ relativeTime(ticket.created_at) }}</span>
            </template>
          </div>

          <!-- Right: dev link + status + restart + overflow -->
          <div class="flex items-center gap-2 shrink-0">
            <!-- Dev server status indicator -->
            <div v-if="ticket" class="flex items-center gap-1.5">
              <span :class="[
                'inline-block w-2 h-2 rounded-full shrink-0',
                devServerStatus === 'running' ? 'bg-green-500' :
                devServerStatus === 'starting' ? 'bg-amber-400 animate-pulse' :
                devServerStatus === 'error' ? 'bg-red-500' :
                'bg-gray-300'
              ]"></span>
              <span class="text-xs text-gray-500">{{ devServerStatus }}</span>
            </div>

            <a
              v-if="devUrl"
              :href="devUrl"
              target="_blank"
              class="text-sm text-blue-600 hover:text-blue-800 font-medium flex items-center gap-0.5"
            >dev <span class="text-xs">↗</span></a>

            <button
              v-if="ticket"
              @click="restartDevServer"
              :disabled="devActionPending"
              title="Restart dev server"
              class="text-gray-500 hover:text-gray-800 p-1 rounded hover:bg-gray-100 transition-colors disabled:opacity-40 text-base leading-none"
            >↺</button>

            <!-- ··· overflow menu -->
            <div class="relative" ref="desktopMenuRef">
              <button
                @click="desktopMenuOpen = !desktopMenuOpen"
                class="text-gray-500 hover:text-gray-800 px-1.5 py-1 rounded hover:bg-gray-100 transition-colors font-bold tracking-widest text-sm leading-none"
              >···</button>
              <div
                v-if="desktopMenuOpen"
                class="absolute right-0 top-full mt-1 w-44 bg-white border border-gray-200 rounded-lg shadow-lg py-1 z-50"
              >
                <button
                  @click="openLogs(); desktopMenuOpen = false"
                  class="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                >View logs</button>
                <div class="border-t border-gray-100 my-1"></div>
                <button
                  v-if="isDevServerActive"
                  @click="stopDevServer(); desktopMenuOpen = false"
                  :disabled="devActionPending"
                  class="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50 disabled:opacity-40"
                >Stop server</button>
                <button
                  v-else
                  @click="startDevServer(); desktopMenuOpen = false"
                  :disabled="devActionPending"
                  class="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-40"
                >Start server</button>
                <button
                  v-if="ticketStatus === 'done'"
                  @click="archiveConfirmOpen = true; desktopMenuOpen = false"
                  class="w-full text-left px-4 py-2 text-sm text-purple-700 hover:bg-purple-50"
                >Archive ticket</button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- 2px animated progress bar (running) -->
      <div class="h-0.5 w-full overflow-hidden bg-transparent">
        <div
          v-if="isRunning"
          class="h-full bg-amber-400 animate-progress-bar"
        ></div>
      </div>
    </div>

    <!-- ===== MOBILE HEADER (< md) ===== -->
    <div class="md:hidden shrink-0">
      <div class="px-3 py-2.5 border-b border-gray-100 flex items-center gap-2">
        <!-- Hamburger -->
        <button
          @click="bus.openDrawer()"
          class="text-gray-500 hover:text-gray-800 p-1.5 rounded hover:bg-gray-100 transition-colors shrink-0"
          aria-label="Open ticket list"
        >
          <svg class="w-5 h-5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" d="M4 6h16M4 12h16M4 18h16"/>
          </svg>
        </button>

        <!-- Center: title + running badge -->
        <div class="flex items-center gap-1.5 flex-1 min-w-0">
          <span class="font-semibold text-base truncate">{{ ticket?.title ?? 'Loading...' }}</span>
          <StatusChip v-if="ticket" :status="ticketStatus" class="shrink-0" />
        </div>

        <!-- Right: status dot + ··· -->
        <div v-if="ticket" class="flex items-center gap-1 shrink-0">
          <span :class="[
            'inline-block w-2 h-2 rounded-full',
            devServerStatus === 'running' ? 'bg-green-500' :
            devServerStatus === 'starting' ? 'bg-amber-400 animate-pulse' :
            devServerStatus === 'error' ? 'bg-red-500' :
            'bg-gray-300'
          ]"></span>
        </div>
        <button
          @click="mobileSheetOpen = true"
          class="text-gray-500 hover:text-gray-800 px-1.5 py-1 rounded hover:bg-gray-100 transition-colors font-bold tracking-widest text-sm leading-none shrink-0"
          aria-label="Actions"
        >···</button>
      </div>

      <!-- 2px progress bar (mobile) -->
      <div class="h-0.5 w-full overflow-hidden bg-transparent">
        <div
          v-if="isRunning"
          class="h-full bg-amber-400 animate-progress-bar"
        ></div>
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
          <div class="bg-amber-50 border border-amber-200 rounded-2xl rounded-tl-sm px-4 py-2 max-w-full w-full text-base text-gray-800 markdown-body" v-html="renderMarkdown(g.msg!.content)"></div>
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
            <div v-if="expanded.has(g.idx)" class="px-3 py-2 text-sm text-purple-900 bg-purple-50/50 border-t border-purple-200 markdown-body" v-html="renderMarkdown(g.msg!.content)"></div>
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

            <!-- TodoWrite: checkbox list -->
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
            <template v-else-if="expanded.has(g.idx) && g.use?.tool_name && isExpandable(g.use.tool_name)">
              <div v-if="toolBody(g.use.tool_name, g.use.content)"
                class="px-3 py-2 font-mono text-xs text-blue-900 whitespace-pre-wrap max-h-64 overflow-y-auto bg-blue-50 border-t border-gray-300">{{ toolBody(g.use.tool_name, g.use.content) }}</div>
              <div v-if="g.result && isExpandable(g.use.tool_name)" :class="[
                'px-3 py-2 font-mono text-xs whitespace-pre-wrap max-h-96 overflow-y-auto border-t border-gray-300',
                g.result.is_error ? 'bg-red-50 text-red-800' : 'bg-gray-50 text-gray-700'
              ]">{{ g.result.content }}</div>
            </template>
          </div>
        </div>

        <!-- Read group -->
        <div v-else-if="g.kind === 'read_group'" class="flex justify-start">
          <div class="border border-gray-300 rounded-lg text-sm overflow-hidden max-w-full w-full">
            <div
              @click="g.reads!.length > 1 && toggleExpanded(g.idx)"
              :class="['flex items-center gap-2 px-3 py-1.5 w-full text-left bg-gray-100', g.reads!.length > 1 ? 'cursor-pointer hover:bg-gray-200' : '']"
            >
              <span v-if="g.reads!.length > 1" class="text-gray-400">{{ expanded.has(g.idx) ? '▼' : '▶' }}</span>
              <span class="font-semibold text-gray-700 truncate flex-1">
                {{ g.reads!.length === 1 ? toolTitle('Read', g.reads![0].use.content) : `Read ${g.reads!.length} files` }}
              </span>
            </div>
            <div v-if="g.reads!.length > 1 && expanded.has(g.idx)" class="border-t border-gray-200 divide-y divide-gray-100">
              <div v-for="r in g.reads" :key="r.idx" class="px-3 py-1.5 font-mono text-xs text-gray-600">
                {{ readFilePath(r.use.content) }}
              </div>
            </div>
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
    <div v-if="replyError" class="px-5 py-1 shrink-0">
      <p class="text-red-600 text-sm">{{ replyError }}</p>
    </div>

    <!-- Reply box -->
    <div class="border-t border-gray-200 px-4 py-3 flex gap-2 shrink-0">
      <textarea
        v-model="reply"
        :placeholder="ticketStatus === 'done' ? 'Follow up...' : 'Type your reply...'"
        :disabled="inputDisabled"
        @keydown.enter.meta.prevent="sendReply"
        @keydown.enter.ctrl.prevent="sendReply"
        rows="2"
        class="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-base focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:bg-gray-50 resize-none"
      ></textarea>
      <button
        @click="sendReply"
        :disabled="!reply.trim() || inputDisabled"
        class="bg-blue-600 text-white px-4 rounded-lg text-base font-medium hover:bg-blue-700 disabled:opacity-50 self-stretch"
      >Send</button>
    </div>

    <!-- ===== MOBILE BOTTOM SHEET ===== -->
    <Transition name="sheet">
      <div v-if="mobileSheetOpen" class="fixed inset-0 z-50 md:hidden flex flex-col justify-end">
        <!-- Backdrop -->
        <div class="absolute inset-0 bg-black/40" @click="mobileSheetOpen = false"></div>
        <!-- Sheet -->
        <div class="relative bg-white rounded-t-2xl pb-safe shadow-xl">
          <div class="w-10 h-1 bg-gray-300 rounded-full mx-auto mt-3 mb-2"></div>
          <div class="py-2">
            <button
              v-if="devUrl"
              @click="openDevPopup(); mobileSheetOpen = false"
              class="w-full flex items-center gap-3 px-5 py-3.5 text-base text-blue-600 hover:bg-gray-50"
            >Open dev server <span class="text-sm">↗</span></button>
            <button
              @click="restartDevServer(); mobileSheetOpen = false"
              :disabled="devActionPending"
              class="w-full flex items-center gap-3 px-5 py-3.5 text-base text-gray-800 hover:bg-gray-50 disabled:opacity-40"
            >Restart dev server</button>
            <button
              @click="openLogs(); mobileSheetOpen = false"
              class="w-full flex items-center gap-3 px-5 py-3.5 text-base text-gray-800 hover:bg-gray-50"
            >View logs</button>
            <div class="border-t border-gray-100 my-1 mx-5"></div>
            <button
              v-if="isDevServerActive"
              @click="stopDevServer(); mobileSheetOpen = false"
              :disabled="devActionPending"
              class="w-full flex items-center gap-3 px-5 py-3.5 text-base text-red-600 hover:bg-red-50 disabled:opacity-40"
            >Stop server</button>
            <button
              v-else
              @click="startDevServer(); mobileSheetOpen = false"
              :disabled="devActionPending"
              class="w-full flex items-center gap-3 px-5 py-3.5 text-base text-gray-800 hover:bg-gray-50 disabled:opacity-40"
            >Start server</button>
            <button
              v-if="ticketStatus === 'done'"
              @click="archiveConfirmOpen = true; mobileSheetOpen = false"
              class="w-full flex items-center gap-3 px-5 py-3.5 text-base text-purple-700 hover:bg-purple-50"
            >Archive ticket</button>
          </div>
          <!-- bottom safe area spacer -->
          <div class="h-4"></div>
        </div>
      </div>
    </Transition>

    <!-- Click-outside handler for desktop overflow menu -->
    <div
      v-if="desktopMenuOpen"
      class="fixed inset-0 z-40"
      @click="desktopMenuOpen = false"
    ></div>

    <!-- ===== LOGS DRAWER ===== -->
    <Transition name="logs">
      <div v-if="logsOpen" class="fixed inset-0 z-50 flex flex-col justify-end md:justify-center md:items-center">
        <!-- Backdrop -->
        <div class="absolute inset-0 bg-black/50" @click="closeLogs"></div>
        <!-- Panel -->
        <div class="relative bg-gray-950 text-gray-100 w-full md:w-5xl md:max-w-5xl md:rounded-xl md:max-h-[80vh] flex flex-col shadow-2xl max-h-[85vh]">
          <!-- Header -->
          <div class="flex items-center justify-between px-4 py-3 border-b border-gray-800 shrink-0">
            <div class="flex items-center gap-2">
              <span class="font-semibold text-sm">Logs</span>
              <span class="font-mono text-xs text-gray-500">{{ props.id }}</span>
              <span v-if="isDevServerActive" class="text-xs text-amber-400 animate-pulse">● live</span>
            </div>
            <div class="flex items-center gap-2">
              <button
                v-if="logLines.length > 0"
                @click="copyLogs"
                class="text-xs text-gray-400 hover:text-gray-200 border border-gray-700 rounded px-2 py-1 transition-colors"
              >{{ copyLabel }}</button>
              <button
                @click="closeLogs"
                class="text-gray-400 hover:text-gray-100 text-xl leading-none px-1"
              >×</button>
            </div>
          </div>
          <!-- Log lines -->
          <div ref="logsScrollEl" class="flex-1 min-h-0 overflow-y-auto px-4 py-3 font-mono text-xs leading-relaxed">
            <div v-if="logLines.length === 0" class="text-gray-500 text-center py-8">No logs yet.</div>
            <div v-for="(line, i) in logLines" :key="i" class="whitespace-pre-wrap break-all text-gray-300">{{ line }}</div>
          </div>
        </div>
      </div>
    </Transition>

    <!-- Archive confirmation modal -->
    <Transition name="fade-modal">
      <div v-if="archiveConfirmOpen" class="fixed inset-0 z-60 flex items-center justify-center p-4">
        <div class="absolute inset-0 bg-black/40" @click="archiveConfirmOpen = false"></div>
        <div class="relative bg-white rounded-xl shadow-xl w-full max-w-sm p-6">
          <h2 class="text-base font-semibold text-gray-900 mb-1">Archive ticket?</h2>
          <p class="text-sm text-gray-500 mb-5">Mark this ticket as archived — the change has been merged and the ticket is complete.</p>
          <div class="flex gap-3 justify-end">
            <button
              @click="archiveConfirmOpen = false"
              :disabled="archiving"
              class="px-4 py-2 rounded-lg text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 disabled:opacity-50"
            >Cancel</button>
            <button
              @click="archiveTicket"
              :disabled="archiving"
              class="px-4 py-2 rounded-lg text-sm font-medium text-white bg-purple-600 hover:bg-purple-700 disabled:opacity-50"
            >{{ archiving ? 'Archiving…' : 'Archive' }}</button>
          </div>
        </div>
      </div>
    </Transition>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted, nextTick, watchEffect } from 'vue'
import { useRouter } from 'vue-router'
import { api } from '../api'
import type { Ticket, MessageStreamEvent, MessageType, DevServerStatus } from '../../../shared/types'
import { bus } from '../bus'
import StatusChip from '../components/StatusChip.vue'
import PriorityPips from '../components/PriorityPips.vue'
import EditDiff from '../components/EditDiff.vue'
import { marked } from 'marked'
import DOMPurify from 'dompurify'

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

interface ReadEntry {
  use: DisplayMsg
  result?: DisplayMsg
  idx: number
}

interface GroupedMsg {
  kind: 'msg' | 'tool_pair' | 'read_group'
  msg?: DisplayMsg
  use?: DisplayMsg
  result?: DisplayMsg
  reads?: ReadEntry[]
  idx: number
}

const props = defineProps<{ id: string }>()
const router = useRouter()

const ticket = ref<Ticket | null>(null)
const messages = ref<DisplayMsg[]>([])
const ticketStatus = ref<Ticket['status']>('queued')
const error = ref('')
const reply = ref('')
const sending = ref(false)
const replyError = ref('')
const scrollEl = ref<HTMLElement | null>(null)
const expanded = ref<Set<number>>(new Set())
const autoScroll = ref(true)
const mobileSheetOpen = ref(false)
const desktopMenuOpen = ref(false)
const desktopMenuRef = ref<HTMLElement | null>(null)
const devActionPending = ref(false)
const logsOpen = ref(false)
const logLines = ref<string[]>([])
const copyLabel = ref('Copy')
const logsScrollEl = ref<HTMLElement | null>(null)
let logsPollHandle: ReturnType<typeof setInterval> | null = null
const archiveConfirmOpen = ref(false)
const archiving = ref(false)
let es: EventSource | null = null
let unsubStatus: (() => void) | undefined
let unsubDevServerStatus: (() => void) | undefined

const devServerStatus = ref<DevServerStatus>('stopped')

const isRunning = computed(() =>
  ticketStatus.value === 'running' || ticketStatus.value === 'queued'
)

const isDevServerActive = computed(() =>
  devServerStatus.value === 'running' || devServerStatus.value === 'starting'
)

const inputDisabled = computed(() => sending.value || isRunning.value)

const devUrl = computed(() => ticket.value?.dev_url ?? null)

const grouped = computed<GroupedMsg[]>(() => {
  const out: GroupedMsg[] = []
  const msgs = messages.value
  const resultsByUseId = new Map<string, DisplayMsg>()
  const matchedResults = new Set<number>()
  for (let i = 0; i < msgs.length; i++) {
    if (msgs[i].message_type === 'tool_result' && msgs[i].tool_result_for_id) {
      resultsByUseId.set(msgs[i].tool_result_for_id!, msgs[i])
      matchedResults.add(i)
    }
  }
  let lastTodoIdx = -1
  for (let i = msgs.length - 1; i >= 0; i--) {
    if (msgs[i].message_type === 'tool_use' && msgs[i].tool_name === 'TodoWrite') {
      lastTodoIdx = i
      break
    }
  }
  for (let i = 0; i < msgs.length; i++) {
    if (msgs[i].message_type === 'tool_use') {
      if (msgs[i].tool_name === 'TodoWrite' && i !== lastTodoIdx) {
        if (msgs[i].tool_use_id) matchedResults.add(
          msgs.findIndex(m => m.tool_result_for_id === msgs[i].tool_use_id)
        )
        continue
      }
      const result = msgs[i].tool_use_id ? resultsByUseId.get(msgs[i].tool_use_id!) : undefined
      if (msgs[i].tool_name === 'Read') {
        const last = out[out.length - 1]
        if (last?.kind === 'read_group') {
          last.reads!.push({ use: msgs[i], result, idx: i })
        } else {
          out.push({ kind: 'read_group', reads: [{ use: msgs[i], result, idx: i }], idx: i })
        }
      } else {
        out.push({ kind: 'tool_pair', use: msgs[i], result, idx: i })
      }
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
  } catch { /* not JSON */ }
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
  return name !== 'Read' && name !== 'TodoWrite' && name !== 'Glob' && name !== 'ToolSearch'
}

function readFilePath(content: string): string {
  try {
    const json = JSON.parse(content)
    return json.file_path ?? content
  } catch { return content }
}

function toggleExpanded(i: number) {
  if (expanded.value.has(i)) {
    expanded.value.delete(i)
  } else {
    expanded.value.add(i)
  }
}

function renderMarkdown(text: string): string {
  return DOMPurify.sanitize(marked.parse(text, { async: false }) as string)
}

function onScroll() {
  if (!scrollEl.value) return
  const el = scrollEl.value
  const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 8
  autoScroll.value = atBottom
}

function scrollToBottom() {
  nextTick(() => {
    if (scrollEl.value && autoScroll.value) {
      scrollEl.value.scrollTop = scrollEl.value.scrollHeight
    }
  })
}

async function fetchLogs() {
  try {
    const data = await api.getLogs(props.id)
    logLines.value = data.lines
    nextTick(() => {
      if (logsScrollEl.value) {
        logsScrollEl.value.scrollTop = logsScrollEl.value.scrollHeight
      }
    })
  } catch { /* ignore */ }
}

function openLogs() {
  logsOpen.value = true
  fetchLogs()
}

function closeLogs() {
  logsOpen.value = false
}

async function copyLogs() {
  try {
    await navigator.clipboard.writeText(logLines.value.join('\n'))
    copyLabel.value = 'Copied!'
    setTimeout(() => { copyLabel.value = 'Copy' }, 2000)
  } catch { /* ignore */ }
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

function openDevPopup() {
  if (!devUrl.value) return
  window.open(devUrl.value, '_blank', 'noopener,noreferrer,popup,width=1280,height=900')
}

async function restartDevServer() {
  if (devActionPending.value || !ticket.value) return
  devActionPending.value = true
  try {
    await api.restartDevServer(props.id)
  } catch { /* ignore */ } finally {
    devActionPending.value = false
  }
}

async function startDevServer() {
  if (devActionPending.value || !ticket.value) return
  devActionPending.value = true
  try {
    await api.startDevServer(props.id)
  } catch { /* ignore */ } finally {
    devActionPending.value = false
  }
}

async function stopDevServer() {
  if (devActionPending.value || !ticket.value) return
  devActionPending.value = true
  try {
    await api.stopDevServer(props.id)
  } catch { /* ignore */ } finally {
    devActionPending.value = false
  }
}

async function archiveTicket() {
  if (archiving.value) return
  archiving.value = true
  try {
    await api.archiveTicket(props.id)
    bus.refresh()
  } catch { /* ignore */ } finally {
    archiving.value = false
    archiveConfirmOpen.value = false
  }
}

function handleEvent(event: MessageStreamEvent) {
  const idx = messages.value.length
  messages.value.push({
    message_type: event.type,
    content: event.content,
    role: event.role,
    tool_name: event.tool_name,
    tool_use_id: event.tool_use_id,
    tool_input: event.tool_input,
    tool_result_content: event.tool_result_content,
    tool_result_for_id: event.tool_result_for_id,
    is_error: event.is_error,
    parent_tool_use_id: event.parent_tool_use_id,
  })
  if (event.type === 'thinking') {
    expanded.value.add(idx)
  }
  scrollToBottom()
}

function openStream(id: string) {
  es?.close()

  es = api.streamMessageEvents(id, handleEvent, () => {})

  es.onopen = () => {
    messages.value = []
    expanded.value = new Set()
  }
}

async function load(id: string) {
  es?.close()
  unsubStatus?.()
  unsubDevServerStatus?.()
  ticket.value = null
  messages.value = []
  ticketStatus.value = 'queued'
  devServerStatus.value = 'stopped'
  error.value = ''

  try {
    ticket.value = await api.getTicket(id)
    if (ticket.value) {
      ticketStatus.value = ticket.value.status
      devServerStatus.value = ticket.value.dev_server_status
    }
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Failed to load ticket'
    return
  }

  unsubStatus = bus.onTicketStatus((ticketId, status) => {
    if (ticketId === id) ticketStatus.value = status
  })

  unsubDevServerStatus = bus.onDevServerStatus((ticketId, status) => {
    if (ticketId === id) devServerStatus.value = status
  })

  openStream(id)
}

onMounted(() => {
  load(props.id)
  nextTick(() => scrollEl.value?.addEventListener('scroll', onScroll, { passive: true }))
})
watch(() => props.id, load)

// Poll logs every 2s while the drawer is open and the dev server is active
watchEffect((onCleanup) => {
  if (logsPollHandle) {
    clearInterval(logsPollHandle)
    logsPollHandle = null
  }
  if (logsOpen.value && isDevServerActive.value) {
    logsPollHandle = setInterval(fetchLogs, 2000)
  }
  onCleanup(() => {
    if (logsPollHandle) {
      clearInterval(logsPollHandle)
      logsPollHandle = null
    }
  })
})

onUnmounted(() => {
  es?.close()
  unsubStatus?.()
  unsubDevServerStatus?.()
  scrollEl.value?.removeEventListener('scroll', onScroll)
  if (logsPollHandle) clearInterval(logsPollHandle)
})
</script>

<style scoped>
@keyframes progress-bar {
  0%   { transform: translateX(-100%); }
  100% { transform: translateX(100%); }
}
.animate-progress-bar {
  animation: progress-bar 1.5s linear infinite;
  width: 60%;
}

/* Markdown rendering */
.markdown-body :deep(p) { margin: 0.4em 0; }
.markdown-body :deep(p:first-child) { margin-top: 0; }
.markdown-body :deep(p:last-child) { margin-bottom: 0; }
.markdown-body :deep(h1),
.markdown-body :deep(h2),
.markdown-body :deep(h3),
.markdown-body :deep(h4) {
  font-weight: 600;
  margin: 0.75em 0 0.3em;
  line-height: 1.3;
}
.markdown-body :deep(h1) { font-size: 1.2em; }
.markdown-body :deep(h2) { font-size: 1.1em; }
.markdown-body :deep(h3) { font-size: 1em; }
.markdown-body :deep(ul),
.markdown-body :deep(ol) {
  padding-left: 1.4em;
  margin: 0.4em 0;
}
.markdown-body :deep(li) { margin: 0.15em 0; }
.markdown-body :deep(code) {
  background: rgba(0,0,0,0.07);
  border-radius: 3px;
  padding: 0.15em 0.35em;
  font-family: ui-monospace, monospace;
  font-size: 0.875em;
}
.markdown-body :deep(pre) {
  background: rgba(0,0,0,0.07);
  border-radius: 6px;
  padding: 0.75em 1em;
  overflow-x: auto;
  margin: 0.5em 0;
}
.markdown-body :deep(pre code) {
  background: none;
  padding: 0;
  font-size: 0.8em;
}
.markdown-body :deep(blockquote) {
  border-left: 3px solid #d97706;
  padding-left: 0.75em;
  margin: 0.5em 0;
  color: #6b7280;
}
.markdown-body :deep(a) { color: #2563eb; text-decoration: underline; }
.markdown-body :deep(hr) { border-color: #d1d5db; margin: 0.75em 0; }
.markdown-body :deep(table) { border-collapse: collapse; width: 100%; margin: 0.5em 0; }
.markdown-body :deep(th),
.markdown-body :deep(td) { border: 1px solid #d1d5db; padding: 0.3em 0.6em; text-align: left; }
.markdown-body :deep(th) { background: rgba(0,0,0,0.05); font-weight: 600; }

.fade-modal-enter-active,
.fade-modal-leave-active {
  transition: opacity 0.15s ease;
}
.fade-modal-enter-from,
.fade-modal-leave-to {
  opacity: 0;
}

.sheet-enter-active,
.sheet-leave-active {
  transition: opacity 0.2s ease;
}
.sheet-enter-active .relative,
.sheet-leave-active .relative {
  transition: transform 0.25s ease;
}
.sheet-enter-from,
.sheet-leave-to {
  opacity: 0;
}
.sheet-enter-from .relative,
.sheet-leave-to .relative {
  transform: translateY(100%);
}

.logs-enter-active,
.logs-leave-active {
  transition: opacity 0.15s ease;
}
.logs-enter-from,
.logs-leave-to {
  opacity: 0;
}
</style>
