<template>
  <div class="flex-1 overflow-y-auto px-5 py-4 max-w-xl">
    <h1 class="text-xl font-semibold mb-4">New Ticket</h1>

    <form @submit.prevent="submit" class="flex flex-col gap-4">
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
          <button
            type="button"
            @click="showNewProject = !showNewProject"
            class="text-sm text-blue-600 hover:underline"
          >{{ showNewProject ? 'Cancel' : '+ New project' }}</button>
        </div>

        <div v-if="showNewProject" class="flex flex-col gap-2 mb-2">
          <input
            v-model="newProject.name"
            type="text"
            placeholder="my-project"
            class="w-full border border-gray-300 rounded-lg px-3 py-2 text-base focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <button
            type="button"
            :disabled="creatingProject || !newProject.name"
            @click="createProject"
            class="self-end bg-blue-600 text-white px-3 py-2 rounded-lg text-base hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >{{ creatingProject ? '...' : 'Create' }}</button>
        </div>
        <p v-if="newProjectError" class="text-red-600 text-sm mb-2">{{ newProjectError }}</p>

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
        <p v-if="projects.length === 0 && !showNewProject" class="text-base text-gray-400 mt-1">
          No projects yet — create one above.
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
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { api } from '../api'
import type { Project } from '../../../shared/types'

const router = useRouter()

const projects = ref<Project[]>([])
const showNewProject = ref(false)
const newProject = ref({ name: '' })
const newProjectError = ref('')
const creatingProject = ref(false)

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

async function createProject() {
  newProjectError.value = ''
  creatingProject.value = true
  try {
    const project = await api.createProject({
      name: newProject.value.name.trim(),
    })
    projects.value = await api.listProjects()
    form.value.project_id = project.id
    showNewProject.value = false
    newProject.value = { name: '' }
  } catch (err) {
    newProjectError.value = err instanceof Error ? err.message : 'Failed to create project'
  } finally {
    creatingProject.value = false
  }
}

async function submit() {
  submitting.value = true
  error.value = ''
  try {
    const ticket = await api.createTicket(form.value)
    router.push(`/tickets/${ticket.id}`)
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
