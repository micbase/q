import { config } from '../config'

export async function send(title: string, body?: string): Promise<void> {
  if (!config.ntfyUrl) return
  try {
    await fetch(config.ntfyUrl, {
      method: 'POST',
      headers: {
        'Title': title,
        'Content-Type': 'text/plain',
      },
      body: body ?? '',
    })
  } catch (err) {
    console.error('ntfy notification failed:', err)
  }
}
