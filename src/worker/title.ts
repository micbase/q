import { config } from '../config'

/** Generate a short ticket title from the description using Claude API, or fall back to truncation. */
export async function generateTitle(description: string): Promise<string> {
  if (config.anthropicApiKey) {
    try {
      return await generateTitleViaClaude(description)
    } catch (err) {
      console.warn('[title] Claude API title generation failed, falling back to truncation:', err)
    }
  }
  return truncateTitle(description)
}

async function generateTitleViaClaude(description: string): Promise<string> {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': config.anthropicApiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 64,
      messages: [{
        role: 'user',
        content: `Generate a short title (5-8 words) for this task. Output only the title, no punctuation, no quotes:\n\n${description.slice(0, 500)}`,
      }],
    }),
  })

  if (!res.ok) {
    throw new Error(`Anthropic API error: ${res.status}`)
  }

  const data = await res.json() as { content: Array<{ type: string; text: string }> }
  const text = data.content.find(b => b.type === 'text')?.text?.trim()
  if (!text) throw new Error('No text in response')
  return text.slice(0, 255)
}

function truncateTitle(description: string): string {
  const firstLine = description.split('\n')[0].trim()
  return firstLine.length > 60 ? firstLine.slice(0, 60).trimEnd() + '…' : firstLine
}
