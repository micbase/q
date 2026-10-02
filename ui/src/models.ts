/** Model choices for `claude --model`. Aliases resolve to the latest model in each family; pinned IDs stay fixed. */
export const MODEL_ALIASES = [
  { value: 'fable', label: 'Fable (latest)' },
  { value: 'opus', label: 'Opus (latest)' },
  { value: 'sonnet', label: 'Sonnet (latest)' },
  { value: 'haiku', label: 'Haiku (latest)' },
]

export const MODEL_VERSIONS = [
  { value: 'claude-fable-5-1', label: 'Fable 5.1' },
  { value: 'claude-opus-5-5', label: 'Opus 5.5' },
  { value: 'claude-sonnet-5-5', label: 'Sonnet 5.5' },
  { value: 'claude-haiku-4-5-20251001', label: 'Haiku 4.5' },
]

/** '' = CLI default (and the default model's default effort) */
export function isKnownModel(value: string): boolean {
  return value === '' || [...MODEL_ALIASES, ...MODEL_VERSIONS].some(m => m.value === value)
}

/** Effort choices for `claude --effort`. '' = CLI default. */
export const EFFORT_OPTIONS = [
  { value: '', label: 'Default effort' },
  { value: 'low', label: 'Low effort' },
  { value: 'medium', label: 'Medium effort' },
  { value: 'high', label: 'High effort' },
  { value: 'xhigh', label: 'Extra-high effort' },
  { value: 'max', label: 'Max effort' },
]
