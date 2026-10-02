<template>
  <div class="flex flex-col gap-1">
    <select
      :value="customMode ? CUSTOM : modelValue"
      :disabled="disabled"
      :class="selectClass"
      @change="onSelect(($event.target as HTMLSelectElement).value)"
    >
      <option value="">Default model</option>
      <optgroup label="Latest">
        <option v-for="m in MODEL_ALIASES" :key="m.value" :value="m.value">{{ m.label }}</option>
      </optgroup>
      <optgroup label="Pinned version">
        <option v-for="m in MODEL_VERSIONS" :key="m.value" :value="m.value">{{ m.label }}</option>
      </optgroup>
      <option :value="CUSTOM">Custom model ID…</option>
    </select>
    <input
      v-if="customMode"
      ref="customInput"
      :value="modelValue"
      :disabled="disabled"
      :class="selectClass"
      type="text"
      spellcheck="false"
      placeholder="e.g. claude-opus-4-1"
      @input="update(($event.target as HTMLInputElement).value.trim())"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, watch, nextTick } from 'vue'
import { MODEL_ALIASES, MODEL_VERSIONS, isKnownModel } from '../models'

const props = defineProps<{ modelValue: string; disabled?: boolean; selectClass?: string }>()
const emit = defineEmits<{ 'update:modelValue': [value: string] }>()

const CUSTOM = '__custom__'
const customMode = ref(!isKnownModel(props.modelValue))
const customInput = ref<HTMLInputElement>()
let lastEmitted: string | undefined

// Follow external changes (e.g. switching tickets); our own emits must not flip the mode while typing
watch(() => props.modelValue, v => {
  if (v !== lastEmitted) customMode.value = !isKnownModel(v)
  lastEmitted = undefined
})

function update(value: string) {
  lastEmitted = value
  emit('update:modelValue', value)
}

function onSelect(value: string) {
  if (value === CUSTOM) {
    customMode.value = true
    update('')
    nextTick(() => customInput.value?.focus())
  } else {
    customMode.value = false
    update(value)
  }
}
</script>
