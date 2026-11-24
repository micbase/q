// Prepare pasted/uploaded images for sending to Claude.
// Must stay in sync with the server limits in src/api/messages.ts.

export const ALLOWED_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp']
export const MAX_ATTACHMENTS = 10
// Server cap is ~3.75 MB decoded; aim a bit lower so re-encoded photos always fit
const TARGET_BYTES = 3.5 * 1024 * 1024
// Claude downsamples anything larger than this on its long edge anyway
const MAX_DIMENSION = 2000

export interface PendingImage {
  media_type: string
  data: string        // base64, no data: URL prefix
  name?: string
  previewUrl: string  // object URL for the thumbnail; revoke when discarded
  size: number
}

function readAsBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const url = reader.result as string
      resolve(url.slice(url.indexOf(',') + 1))
    }
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(blob)
  })
}

function loadImage(blob: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob)
    const img = new Image()
    img.onload = () => { URL.revokeObjectURL(url); resolve(img) }
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Could not decode image')) }
    img.src = url
  })
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality?: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(b => (b ? resolve(b) : reject(new Error('Could not encode image'))), type, quality)
  })
}

/** Downscale/re-encode as JPEG until the image fits the size limit */
async function shrink(file: Blob): Promise<Blob> {
  const img = await loadImage(file)
  let scale = Math.min(1, MAX_DIMENSION / Math.max(img.naturalWidth, img.naturalHeight))
  for (let attempt = 0; attempt < 6; attempt++) {
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(img.naturalWidth * scale))
    canvas.height = Math.max(1, Math.round(img.naturalHeight * scale))
    const ctx = canvas.getContext('2d')!
    ctx.fillStyle = '#fff' // JPEG has no alpha; flatten transparency onto white
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
    const blob = await canvasToBlob(canvas, 'image/jpeg', 0.85)
    if (blob.size <= TARGET_BYTES) return blob
    scale *= 0.75
  }
  throw new Error('Image is too large')
}

/**
 * Turn a pasted/selected file into something the reply endpoint accepts. Images that are too
 * big (bytes or pixels), or in a format Claude can't read (e.g. HEIC), are re-encoded as JPEG.
 */
export async function prepareImage(file: File): Promise<PendingImage> {
  if (!file.type.startsWith('image/')) throw new Error(`${file.name || 'File'} is not an image`)

  let blob: Blob = file
  let needsShrink = !ALLOWED_IMAGE_TYPES.includes(file.type) || file.size > TARGET_BYTES
  if (!needsShrink && file.type !== 'image/gif') {
    // Large-pixel images waste tokens; Claude would downsample them anyway
    const img = await loadImage(file)
    needsShrink = Math.max(img.naturalWidth, img.naturalHeight) > MAX_DIMENSION
  }
  if (needsShrink) blob = await shrink(file)

  return {
    media_type: blob.type,
    data: await readAsBase64(blob),
    name: file.name || undefined,
    previewUrl: URL.createObjectURL(blob),
    size: blob.size,
  }
}

/** Pull image files out of a paste/drop DataTransfer */
export function imageFilesFrom(dt: DataTransfer | null): File[] {
  if (!dt) return []
  const files: File[] = []
  for (const item of Array.from(dt.items ?? [])) {
    if (item.kind === 'file' && item.type.startsWith('image/')) {
      const f = item.getAsFile()
      if (f) files.push(f)
    }
  }
  if (!files.length) {
    for (const f of Array.from(dt.files ?? [])) if (f.type.startsWith('image/')) files.push(f)
  }
  return files
}
