// Normalize a user-supplied model for `claude --model`:
// null/undefined/'' → null (CLI default), invalid → undefined, otherwise the trimmed alias or model ID
export function normalizeModel(input: unknown): string | null | undefined {
  if (input === null || input === undefined) return null
  if (typeof input !== 'string') return undefined
  const m = input.trim()
  if (!m) return null
  return /^[A-Za-z0-9._:[\]-]{1,100}$/.test(m) ? m : undefined
}

export const EFFORT_LEVELS = ['low', 'medium', 'high', 'xhigh', 'max'] as const

// Normalize a user-supplied effort for `claude --effort`:
// null/undefined/'' → null (CLI default), unknown level → undefined, otherwise the level
export function normalizeEffort(input: unknown): string | null | undefined {
  if (input === null || input === undefined || input === '') return null
  return typeof input === 'string' && (EFFORT_LEVELS as readonly string[]).includes(input) ? input : undefined
}
