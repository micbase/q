<template>
  <div class="flex-1 overflow-y-auto px-5 py-4 max-w-2xl">
    <div class="flex items-center justify-between mb-5">
      <h1 class="text-xl font-semibold">Projects</h1>
      <button
        v-if="!showCreate"
        @click="showCreate = true"
        class="bg-blue-600 text-white text-base px-3 py-1.5 rounded-lg hover:bg-blue-700 transition-colors font-medium"
      >
        + New Project
      </button>
    </div>

    <!-- Create new project form -->
    <div v-if="showCreate" class="border border-blue-200 rounded-xl p-4 mb-5 bg-blue-50">
      <h2 class="text-base font-semibold text-blue-800 mb-3">New Project</h2>
      <form @submit.prevent="submitCreate" class="flex flex-col gap-3">
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1">Name <span class="text-red-500">*</span></label>
          <input
            v-model="createForm.name"
            type="text"
            required
            placeholder="my-project"
            class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
          />
          <p class="text-xs text-gray-400 mt-0.5">Alphanumeric, hyphens, underscores, dots only. Used as directory name.</p>
        </div>
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1">GitHub Repo <span class="text-red-500">*</span></label>
          <input
            v-model="createForm.github_repo"
            type="text"
            required
            placeholder="owner/repo"
            class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
          />
        </div>
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1">Dev Command</label>
          <input
            v-model="createForm.dev_command"
            type="text"
            placeholder="npm run dev"
            class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
          />
        </div>
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1">Dev Env Variables</label>
          <textarea
            v-model="createForm.dev_envs"
            rows="3"
            placeholder="PORT=3000&#10;NODE_ENV=development"
            class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white resize-y font-mono"
          />
        </div>
        <p v-if="createError" class="text-red-600 text-sm">{{ createError }}</p>
        <div class="flex gap-2 justify-end">
          <button
            type="button"
            @click="cancelCreate"
            class="px-3 py-2 text-sm rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-50 transition-colors"
          >
            Cancel
          </button>
          <button
            type="submit"
            :disabled="creating || !createForm.name || !createForm.github_repo"
            class="px-3 py-2 text-sm rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 transition-colors font-medium"
          >
            {{ creating ? 'Creating...' : 'Create Project' }}
          </button>
        </div>
      </form>
    </div>

    <!-- Loading / error states -->
    <div v-if="loading && projects.length === 0" class="text-sm text-gray-400 py-8 text-center">Loading...</div>
    <div v-else-if="loadError" class="text-sm text-red-500 py-8 text-center">{{ loadError }}</div>
    <div v-else-if="projects.length === 0 && !showCreate" class="text-sm text-gray-400 py-8 text-center">
      No projects yet. Create one above.
    </div>

    <!-- Project list -->
    <div class="flex flex-col gap-3">
      <div
        v-for="project in projects"
        :key="project.id"
        class="border border-gray-200 rounded-xl bg-white overflow-hidden"
      >
        <!-- Project header row -->
        <div class="flex items-center gap-3 px-4 py-3">
          <div class="flex-1 min-w-0">
            <div class="font-medium text-gray-900 truncate">{{ project.name }}</div>
            <div class="text-xs text-gray-400 truncate">{{ project.github_repo || 'No repo' }}</div>
          </div>
          <span
            :class="project.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'"
            class="text-xs font-medium px-2 py-0.5 rounded-full shrink-0"
          >{{ project.status }}</span>
          <button
            v-if="editingId !== project.id"
            @click="startEdit(project)"
            class="text-sm text-blue-600 hover:underline shrink-0"
          >Edit</button>
          <button
            v-if="editingId !== project.id"
            @click="confirmDelete(project)"
            class="text-sm text-red-500 hover:underline shrink-0"
          >Delete</button>
          <button
            v-if="editingId === project.id"
            @click="cancelEdit"
            class="text-sm text-gray-500 hover:underline shrink-0"
          >Cancel</button>
        </div>

        <!-- Edit form (inline) -->
        <div v-if="editingId === project.id" class="border-t border-gray-100 px-4 py-3 bg-gray-50">
          <form @submit.prevent="submitEdit(project.id)" class="flex flex-col gap-3">
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">GitHub Repo</label>
              <input
                v-model="editForm.github_repo"
                type="text"
                placeholder="owner/repo"
                class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
              />
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Dev Command</label>
              <input
                v-model="editForm.dev_command"
                type="text"
                placeholder="npm run dev"
                class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
              />
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Dev Env Variables</label>
              <textarea
                v-model="editForm.dev_envs"
                rows="3"
                placeholder="PORT=3000&#10;NODE_ENV=development"
                class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white resize-y font-mono"
              />
            </div>
            <p v-if="editErrors[project.id]" class="text-red-600 text-sm">{{ editErrors[project.id] }}</p>
            <div class="flex justify-end">
              <button
                type="submit"
                :disabled="saving === project.id"
                class="px-3 py-2 text-sm rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 transition-colors font-medium"
              >
                {{ saving === project.id ? 'Saving...' : 'Save Changes' }}
              </button>
            </div>
          </form>
        </div>

        <!-- Read-only detail row (when not editing) -->
        <div v-else-if="project.dev_command || project.dev_envs || project.db_credential" class="border-t border-gray-100 px-4 py-2 bg-gray-50 flex flex-col gap-1">
          <div v-if="project.dev_command" class="text-xs text-gray-500">
            <span class="font-medium">Dev:</span> <code class="font-mono">{{ project.dev_command }}</code>
          </div>
          <div v-if="project.dev_envs" class="text-xs text-gray-500">
            <span class="font-medium">Env:</span> <code class="font-mono whitespace-pre">{{ project.dev_envs }}</code>
          </div>
          <div v-if="project.db_credential" class="text-xs text-gray-500 flex flex-wrap items-center gap-x-3 gap-y-0.5">
            <span class="font-medium text-gray-700">DB:</span>
            <span><code class="font-mono">{{ project.db_credential.user }}@{{ project.db_credential.host }}:{{ project.db_credential.port }}/{{ project.db_credential.database }}</code></span>
            <span>
              pw:
              <code class="font-mono">{{ revealedPasswords.has(project.id) ? project.db_credential.password : '••••••••••' }}</code>
              <button
                @click="togglePassword(project.id)"
                class="ml-1 text-blue-500 hover:underline"
              >{{ revealedPasswords.has(project.id) ? 'hide' : 'show' }}</button>
            </span>
          </div>
        </div>
      </div>
    </div>

    <!-- Delete confirmation modal -->
    <div
      v-if="deleteTarget"
      class="fixed inset-0 bg-black/40 flex items-center justify-center z-50"
      @click.self="deleteTarget = null"
    >
      <div class="bg-white rounded-xl shadow-xl p-5 max-w-sm w-full mx-4">
        <h3 class="font-semibold text-gray-900 mb-2">Delete project?</h3>
        <p class="text-sm text-gray-600 mb-4">
          This will permanently delete <strong>{{ deleteTarget.name }}</strong> and all its tickets. This cannot be undone.
        </p>
        <p v-if="deleteError" class="text-red-600 text-sm mb-3">{{ deleteError }}</p>
        <div class="flex gap-2 justify-end">
          <button
            @click="deleteTarget = null; deleteError = ''"
            class="px-3 py-2 text-sm rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-50 transition-colors"
          >Cancel</button>
          <button
            @click="doDelete"
            :disabled="deleting"
            class="px-3 py-2 text-sm rounded-lg bg-red-600 text-white hover:bg-red-700 disabled:opacity-50 transition-colors font-medium"
          >{{ deleting ? 'Deleting...' : 'Delete' }}</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { api } from '../api'
import type { Project } from '../../../shared/types'
import { bus } from '../bus'

const projects = ref<Project[]>([])
const loading = ref(true)
const loadError = ref('')

// Create form
const showCreate = ref(false)
const createForm = ref({ name: '', github_repo: '', dev_command: '', dev_envs: '' })
const creating = ref(false)
const createError = ref('')

// Edit state
const editingId = ref<string | null>(null)
const editForm = ref({ github_repo: '', dev_command: '', dev_envs: '' })
const editErrors = ref<Record<string, string>>({})
const saving = ref<string | null>(null)

// Delete state
const deleteTarget = ref<Project | null>(null)
const deleting = ref(false)
const deleteError = ref('')

// Password reveal state
const revealedPasswords = ref<Set<string>>(new Set())
function togglePassword(projectId: string) {
  const s = new Set(revealedPasswords.value)
  if (s.has(projectId)) s.delete(projectId)
  else s.add(projectId)
  revealedPasswords.value = s
}

async function load() {
  try {
    projects.value = await api.listProjects()
    loadError.value = ''
  } catch (err) {
    loadError.value = err instanceof Error ? err.message : 'Failed to load projects'
  } finally {
    loading.value = false
  }
}

function cancelCreate() {
  showCreate.value = false
  createForm.value = { name: '', github_repo: '', dev_command: '', dev_envs: '' }
  createError.value = ''
}

async function submitCreate() {
  createError.value = ''
  creating.value = true
  try {
    await api.createProject({
      name: createForm.value.name.trim(),
      github_repo: createForm.value.github_repo.trim(),
      dev_command: createForm.value.dev_command.trim() || undefined,
      dev_envs: createForm.value.dev_envs.trim() || undefined,
    })
    createForm.value = { name: '', github_repo: '', dev_command: '', dev_envs: '' }
    showCreate.value = false
    await load()
    bus.refresh()
  } catch (err) {
    createError.value = err instanceof Error ? err.message : 'Failed to create project'
  } finally {
    creating.value = false
  }
}

function startEdit(project: Project) {
  editingId.value = project.id
  editForm.value = {
    github_repo: project.github_repo ?? '',
    dev_command: project.dev_command ?? '',
    dev_envs: project.dev_envs ?? '',
  }
  delete editErrors.value[project.id]
}

function cancelEdit() {
  editingId.value = null
}

async function submitEdit(id: string) {
  saving.value = id
  delete editErrors.value[id]
  try {
    await api.updateProject(id, {
      github_repo: editForm.value.github_repo.trim() || null,
      dev_command: editForm.value.dev_command.trim() || null,
      dev_envs: editForm.value.dev_envs.trim() || null,
    })
    editingId.value = null
    await load()
    bus.refresh()
  } catch (err) {
    editErrors.value[id] = err instanceof Error ? err.message : 'Failed to save'
  } finally {
    saving.value = null
  }
}

function confirmDelete(project: Project) {
  deleteTarget.value = project
  deleteError.value = ''
}

async function doDelete() {
  if (!deleteTarget.value) return
  deleting.value = true
  deleteError.value = ''
  try {
    await api.deleteProject(deleteTarget.value.id)
    deleteTarget.value = null
    await load()
    bus.refresh()
  } catch (err) {
    deleteError.value = err instanceof Error ? err.message : 'Failed to delete project'
  } finally {
    deleting.value = false
  }
}

onMounted(load)
</script>
