<template>
  <div class="flex-1 overflow-y-auto px-5 py-4">
    <h1 class="text-xl font-semibold mb-5">Claude Auth</h1>

    <div class="max-w-2xl flex flex-col gap-5">
      <!-- Current credentials -->
      <div class="border border-gray-200 rounded-xl overflow-hidden">
        <div class="bg-gray-50 border-b border-gray-200 px-4 py-2.5 flex items-center gap-2">
          <span class="font-medium text-gray-800">Credentials</span>
          <div class="flex-1" />
          <button
            @click="loadStatus"
            :disabled="loading"
            class="text-xs px-2.5 py-1 rounded-lg border border-gray-300 text-gray-600 hover:bg-white transition-colors font-medium disabled:opacity-40"
          >{{ loading ? '…' : 'Refresh' }}</button>
        </div>
        <div class="px-4 py-3 text-sm">
          <div v-if="loading && !status" class="text-gray-400">Loading...</div>
          <div v-else-if="statusError" class="text-red-500">{{ statusError }}</div>
          <div v-else-if="status && !status.configured" class="flex items-center gap-2">
            <span class="text-xs font-medium px-2 py-0.5 rounded-full bg-red-100 text-red-700">not logged in</span>
            <span class="text-gray-500">Tickets can't run until you log in.</span>
          </div>
          <div v-else-if="status" class="flex flex-col gap-1.5">
            <div class="flex items-center gap-2">
              <span class="text-xs font-medium px-2 py-0.5 rounded-full bg-green-100 text-green-700">logged in</span>
              <span v-if="status.subscription_type" class="text-gray-700">Claude {{ status.subscription_type }}</span>
            </div>
            <div v-if="status.refresh_token_expires_at" class="text-xs text-gray-500">
              Login valid until {{ formatDate(status.refresh_token_expires_at) }}
              <span v-if="isPast(status.refresh_token_expires_at)" class="text-red-600 font-medium">(expired — log in again)</span>
            </div>
            <div v-if="status.expires_at" class="text-xs text-gray-400">
              Access token {{ isPast(status.expires_at) ? 'expired' : 'expires' }} {{ formatDate(status.expires_at) }} (refreshed automatically)
            </div>
          </div>
        </div>
      </div>

      <!-- Login flow -->
      <div class="border border-gray-200 rounded-xl overflow-hidden">
        <div class="bg-gray-50 border-b border-gray-200 px-4 py-2.5">
          <span class="font-medium text-gray-800">{{ status?.configured ? 'Log in again' : 'Log in' }}</span>
        </div>
        <div class="px-4 py-3 text-sm flex flex-col gap-3">
          <template v-if="!loginUrl">
            <p class="text-gray-600">
              Runs <code class="font-mono text-xs bg-gray-100 px-1 rounded">claude auth login</code> in a temporary container
              and saves the result as the shared credentials used by every ticket container.
            </p>
            <div>
              <button
                @click="startLogin"
                :disabled="starting"
                class="bg-blue-600 text-white text-sm px-3 py-1.5 rounded-lg hover:bg-blue-700 transition-colors font-medium disabled:opacity-50"
              >{{ starting ? 'Starting…' : 'Start login' }}</button>
            </div>
          </template>

          <template v-else>
            <div>
              <p class="text-gray-700 mb-1.5"><span class="font-medium">1.</span> Open this link and authorize:</p>
              <a
                :href="loginUrl"
                target="_blank"
                rel="noopener noreferrer"
                class="inline-block bg-blue-600 text-white text-sm px-3 py-1.5 rounded-lg hover:bg-blue-700 transition-colors font-medium"
              >Open Claude login ↗</a>
            </div>
            <form @submit.prevent="submitCode">
              <p class="text-gray-700 mb-1.5"><span class="font-medium">2.</span> Paste the code shown after authorizing:</p>
              <div class="flex gap-2">
                <input
                  v-model="code"
                  type="text"
                  required
                  autocomplete="off"
                  spellcheck="false"
                  placeholder="Authentication code"
                  class="flex-1 min-w-0 border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <button
                  type="submit"
                  :disabled="submitting || !code.trim()"
                  class="bg-blue-600 text-white text-sm px-3 py-1.5 rounded-lg hover:bg-blue-700 transition-colors font-medium disabled:opacity-50"
                >{{ submitting ? 'Verifying…' : 'Submit' }}</button>
                <button
                  type="button"
                  @click="cancelLogin"
                  :disabled="submitting"
                  class="text-sm px-3 py-1.5 rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-50 transition-colors font-medium disabled:opacity-50"
                >Cancel</button>
              </div>
            </form>
          </template>

          <p v-if="loginError" class="text-red-600 text-sm whitespace-pre-wrap break-words">{{ loginError }}</p>
          <p v-if="loginSuccess" class="text-green-700 text-sm">Logged in. New and running ticket containers will use these credentials.</p>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { api } from '../api'
import type { ClaudeAuthStatus } from '../../../shared/types'

const status = ref<ClaudeAuthStatus | null>(null)
const loading = ref(false)
const statusError = ref('')

const loginUrl = ref('')
const code = ref('')
const starting = ref(false)
const submitting = ref(false)
const loginError = ref('')
const loginSuccess = ref(false)

/** request() throws "<status>: <body>"; pull out the JSON `error` field when present */
function errorMessage(err: unknown): string {
  const msg = (err as Error).message ?? String(err)
  const body = msg.replace(/^\d+:\s*/, '')
  try {
    return JSON.parse(body).error ?? msg
  } catch {
    return msg
  }
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString()
}

function isPast(iso: string): boolean {
  return new Date(iso).getTime() < Date.now()
}

async function loadStatus() {
  loading.value = true
  statusError.value = ''
  try {
    status.value = await api.getAuthStatus()
  } catch (err) {
    statusError.value = errorMessage(err)
  } finally {
    loading.value = false
  }
}

async function startLogin() {
  starting.value = true
  loginError.value = ''
  loginSuccess.value = false
  try {
    const { url } = await api.startLogin()
    loginUrl.value = url
    code.value = ''
  } catch (err) {
    loginError.value = errorMessage(err)
  } finally {
    starting.value = false
  }
}

async function submitCode() {
  submitting.value = true
  loginError.value = ''
  try {
    status.value = await api.submitLoginCode(code.value.trim())
    loginSuccess.value = true
  } catch (err) {
    loginError.value = `${errorMessage(err)}\nStart a new login to try again.`
  } finally {
    // The CLI process exits after one code attempt either way
    loginUrl.value = ''
    code.value = ''
    submitting.value = false
  }
}

async function cancelLogin() {
  loginUrl.value = ''
  code.value = ''
  loginError.value = ''
  try {
    await api.cancelLogin()
  } catch { /* ignore */ }
}

onMounted(loadStatus)
</script>
