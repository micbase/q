<template>
  <span class="flex gap-0.5 items-center" :title="`P${priority}: ${label}`">
    <span
      v-for="i in 5"
      :key="i"
      class="w-1.5 h-1.5 rounded-full"
      :class="i <= filled ? filledClass : 'bg-gray-300'"
    ></span>
  </span>
</template>

<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{ priority: number }>()

// P1=5 filled, P5=1 filled
const filled = computed(() => 6 - props.priority)

const filledClass = computed(() => {
  switch (props.priority) {
    case 1: return 'bg-red-500'
    case 2: return 'bg-orange-500'
    case 3: return 'bg-blue-500'
    case 4: return 'bg-gray-500'
    case 5: return 'bg-gray-400'
    default: return 'bg-gray-500'
  }
})

const label = computed(() => {
  switch (props.priority) {
    case 1: return 'Critical'
    case 2: return 'High'
    case 3: return 'Normal'
    case 4: return 'Low'
    case 5: return 'Whenever'
    default: return ''
  }
})
</script>
