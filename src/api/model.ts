// Normalize a user-supplied model for `claude --model`:
// null/undefined/'' → null (CLI default), invalid → undefined, otherwise the trimmed alias or model ID
export function normalizeModel(input: unknown): string | null | undefined {
  if (input === null || input === undefined) return null
  if (typeof input !== 'string') return undefined
  const m = input.trim()
  if (!m) return null
  return /^[A-Za-z0-9._:[\]-]{1,100}$/.test(m) ? m : undefined
}
