<template>
  <form @submit.prevent="submit" class="flex flex-col gap-4 px-5 py-4">
    <!-- Title -->
    <div>
      <label class="block text-base font-medium text-gray-700 mb-1">Title</label>
      <input
        v-model="form.title"
        type="text"
        required
        placeholder="Fix auth bug in JWT refresh"
        class="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
      />
    </div>

    <!-- Project -->
    <div>
      <div class="flex items-center justify-between mb-1">
        <label class="block text-base font-medium text-gray-700">Project</label>
        <RouterLink
          to="/projects"
          class="text-sm text-blue-600 hover:underline"
        >Manage projects</RouterLink>
      </div>

      <select
        v-model="form.project_id"
        required
        class="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
      >
        <option value="" disabled>Select a project...</option>
        <option v-for="p in projects" :key="p.id" :value="p.id">
          {{ p.name }}
        </option>
      </select>
      <p v-if="projects.length === 0" class="text-base text-gray-400 mt-1">
        No projects yet —
        <RouterLink to="/projects" class="text-blue-600 hover:underline">create one</RouterLink>.
      </p>
    </div>

    <!-- Priority -->
    <div>
      <label class="block text-base font-medium text-gray-700 mb-2">Priority</label>
      <div class="flex gap-2">
        <button
          v-for="p in priorities"
          :key="p.value"
          type="button"
          @click="form.priority = p.value"
          class="flex-1 py-2 px-1 rounded-lg border text-sm font-medium transition-colors"
          :class="form.priority === p.value
            ? 'bg-blue-600 text-white border-blue-600'
            : 'bg-white text-gray-600 border-gray-300 hover:border-gray-400'"
        >
          <div>P{{ p.value }}</div>
          <div class="font-normal opacity-75">{{ p.label }}</div>
        </button>
      </div>
    </div>

    <!-- Description -->
    <div>
      <label class="block text-base font-medium text-gray-700 mb-1">Description</label>
      <textarea
        v-model="form.description"
        required
        rows="8"
        placeholder="Describe the task in detail. Include relevant file paths, error messages, expected behavior..."
        class="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-y"
        @keydown="(e: KeyboardEvent) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) submit() }"
      />
    </div>

    <!-- Error -->
    <div v-if="error" class="text-red-600 text-base">{{ error }}</div>

    <!-- Submit -->
    <button
      type="submit"
      :disabled="submitting"
      class="w-full bg-blue-600 text-white py-3 rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
    >
      {{ submitting ? 'Creating...' : 'Create Ticket' }}
    </button>
  </form>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { api } from '../api'
import type { Project } from '../../../shared/types'

const emit = defineEmits<{ created: [ticketId: string] }>()

const projects = ref<Project[]>([])

const form = ref({
  title: '',
  description: '',
  project_id: '',
  priority: 3,
})

const priorities = [
  { value: 1, label: 'Critical' },
  { value: 2, label: 'High' },
  { value: 3, label: 'Normal' },
  { value: 4, label: 'Low' },
  { value: 5, label: 'Whenever' },
]

const submitting = ref(false)
const error = ref('')

async function submit() {
  submitting.value = true
  error.value = ''
  try {
    const ticket = await api.createTicket(form.value)
    emit('created', ticket.id)
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Failed to create ticket'
  } finally {
    submitting.value = false
  }
}

onMounted(async () => {
  try {
    projects.value = await api.listProjects()
    if (projects.value.length > 0) {
      form.value.project_id = projects.value[0].id
    }
  } catch { /* ignore */ }
})
</script>
