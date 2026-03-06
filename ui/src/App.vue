<template>
  <div class="h-screen flex flex-col bg-white">
    <!-- Header -->
    <header class="bg-white border-b border-gray-200 px-4 py-2.5 flex items-center gap-3 shrink-0">
      <span class="font-bold text-lg tracking-tight">Q</span>
      <span
        v-if="status?.running_ticket"
        class="text-yellow-500 animate-pulse"
        title="Processing"
      >⚡</span>

      <div class="flex-1" />

      <span v-if="status && status.paused_count > 0" class="text-sm text-orange-500 font-medium">
        {{ status.paused_count }} paused
      </span>
      <span v-if="status && status.queue_depth > 0" class="text-sm text-gray-400">
        {{ status.queue_depth }} queued
      </span>

      <RouterLink
        to="/new"
        class="bg-blue-600 text-white text-base px-3 py-1.5 rounded-lg hover:bg-blue-700 transition-colors font-medium"
      >
        + New Ticket
      </RouterLink>
    </header>

    <!-- Dry run banner -->
    <div
      v-if="status?.dry_run"
      class="bg-orange-500 text-white text-center text-sm py-1 font-medium shrink-0"
    >
      DRY RUN MODE — Claude is not being called
    </div>

    <!-- Two-panel layout -->
    <div class="flex flex-1 min-h-0">
      <!-- Left: project tree -->
      <aside class="w-72 shrink-0 border-r border-gray-200 overflow-y-auto bg-gray-50">
        <ProjectTree />
      </aside>

      <!-- Right: main content -->
      <main class="flex-1 min-h-0 overflow-hidden flex flex-col">
        <RouterView />
      </main>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { api, type Status } from './api'
import ProjectTree from './components/ProjectTree.vue'

const status = ref<Status | null>(null)
let interval: ReturnType<typeof setInterval>

async function loadStatus() {
  try {
    status.value = await api.getStatus()
  } catch { /* ignore */ }
}

onMounted(() => {
  loadStatus()
  interval = setInterval(loadStatus, 5000)
})

onUnmounted(() => clearInterval(interval))
</script>
