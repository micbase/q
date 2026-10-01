/** Model choices for `claude --model`. '' = CLI default; aliases resolve to the latest model in each family. */
export const MODEL_OPTIONS = [
  { value: '', label: 'Default model' },
  { value: 'opus', label: 'Opus' },
  { value: 'sonnet', label: 'Sonnet' },
  { value: 'haiku', label: 'Haiku' },
]
