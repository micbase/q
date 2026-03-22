<template>
  <span class="text-sm px-2 py-0.5 rounded-full font-medium inline-flex items-center gap-1" :class="chipClass">
    <template v-if="isActive">
      <span class="dot" style="animation-delay:0ms"></span>
      <span class="dot" style="animation-delay:200ms"></span>
      <span class="dot" style="animation-delay:400ms"></span>
      {{ label }}
    </template>
    <template v-else>{{ label }}</template>
  </span>
</template>

<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{ status: string }>()

const isActive = computed(() => props.status === 'running' || props.status === 'queued')

const chipClass = computed(() => {
  switch (props.status) {
    case 'queued':   return 'bg-gray-100 text-gray-600'
    case 'running':  return 'bg-blue-100 text-blue-700'
    case 'paused':   return 'bg-orange-100 text-orange-700'
    case 'done':     return 'bg-green-100 text-green-700'
    case 'failed':   return 'bg-red-100 text-red-700'
    case 'archived': return 'bg-purple-100 text-purple-700'
    case 'deleted':  return 'bg-gray-200 text-gray-500'
    default:         return 'bg-gray-100 text-gray-600'
  }
})

const label = computed(() => {
  switch (props.status) {
    case 'queued':   return 'Queued'
    case 'running':  return 'Running'
    case 'paused':   return 'Paused'
    case 'done':     return 'Done'
    case 'failed':   return 'Failed'
    case 'archived': return 'Archived'
    case 'deleted':  return 'Deleted'
    default:         return props.status
  }
})
</script>

<style scoped>
@keyframes dot-flash {
  0%, 100% { opacity: 0.25; }
  50%       { opacity: 1; }
}
.dot {
  width: 0.25rem;
  height: 0.25rem;
  border-radius: 9999px;
  background: currentColor;
  animation: dot-flash 1.2s ease-in-out infinite;
}
</style>
