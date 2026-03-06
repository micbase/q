<template>
  <span class="text-sm px-2 py-0.5 rounded-full font-medium" :class="chipClass">
    {{ label }}
  </span>
</template>

<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{ status: string }>()

const chipClass = computed(() => {
  switch (props.status) {
    case 'queued':   return 'bg-gray-100 text-gray-600'
    case 'running':  return 'bg-blue-100 text-blue-700'
    case 'paused':   return 'bg-orange-100 text-orange-700'
    case 'done':     return 'bg-green-100 text-green-700'
    case 'failed':   return 'bg-red-100 text-red-700'
    case 'deleted':   return 'bg-gray-200 text-gray-500'
    default:         return 'bg-gray-100 text-gray-600'
  }
})

const label = computed(() => {
  switch (props.status) {
    case 'queued':   return 'Queued'
    case 'running':  return '⚡ Running'
    case 'paused':   return '⚠️ Paused'
    case 'done':     return '✅ Done'
    case 'failed':   return '❌ Failed'
    case 'deleted':   return 'Deleted'
    default:         return props.status
  }
})
</script>
