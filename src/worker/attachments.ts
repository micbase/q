import fs from 'fs/promises'
import path from 'path'
import { customAlphabet } from 'nanoid'
import { config } from '../config'
import type { AttachmentMeta } from '../../shared/types'

// Image files live on disk at `${ATTACHMENTS_DIR}/<ticketId>/<file>`. Each ticket's directory is
// bind-mounted read-only into its container at CONTAINER_ATTACHMENTS_DIR so Claude can use the files
// (e.g. copy an image into the repo). The DB only keeps metadata in messages.attachments.

export const CONTAINER_ATTACHMENTS_DIR = '/attachments'

const EXT_BY_TYPE: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/gif': 'gif',
  'image/webp': 'webp',
}
const TYPE_BY_EXT = Object.fromEntries(Object.entries(EXT_BY_TYPE).map(([t, e]) => [e, t]))

export const ALLOWED_IMAGE_TYPES = Object.keys(EXT_BY_TYPE)

// Same alphabet as ticket IDs: safe in paths and URLs with no escaping
const generateId = customAlphabet('0123456789abcdefghijklmnopqrstuvwxyz', 21)
const TICKET_ID_RE = /^[a-z0-9]{21}$/
const FILE_RE = /^[a-z0-9]{21}\.(png|jpg|gif|webp)$/

let enabled = false
let disabledReason = 'attachments directory not initialised'

const MOUNT_HINT =
  'If q runs in Docker, bind-mount the host directory into q at the same path ' +
  '(e.g. -v /host/q/attachments:/host/q/attachments) and set ATTACHMENTS_DIR to it.'

/**
 * Mount point (from /proc/self/mountinfo) that contains `dir`, i.e. the longest matching prefix.
 * Returns null if it can't be determined (non-Linux, no /proc).
 */
async function mountPointOf(dir: string): Promise<string | null> {
  let info: string
  try {
    info = await fs.readFile('/proc/self/mountinfo', 'utf8')
  } catch {
    return null
  }
  let best: string | null = null
  for (const line of info.split('\n')) {
    const field = line.split(' ')[4]
    if (!field) continue
    const mp = field.replace(/\\([0-7]{3})/g, (_, o) => String.fromCharCode(parseInt(o, 8)))
    const inside = mp === '/' || dir === mp || dir.startsWith(mp + '/')
    if (inside && (!best || mp.length > best.length)) best = mp
  }
  return best
}

async function inDockerContainer(): Promise<boolean> {
  try {
    await fs.access('/.dockerenv')
    return true
  } catch {
    return false
  }
}

/**
 * Create the attachments dir and check it's usable. Uploads are disabled (not fatal) if:
 * - the dir can't be created or written, or
 * - q runs in a container and the dir is in the container's own filesystem rather than a bind mount.
 *   Ticket containers mount ATTACHMENTS_DIR from the *host*, so files written there would be
 *   invisible to Claude (and lost when q's container is recreated).
 */
export async function initAttachments(): Promise<void> {
  const dir = config.attachmentsDir
  enabled = false
  try {
    await fs.mkdir(dir, { recursive: true })
    await fs.access(dir, fs.constants.W_OK)
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code
    disabledReason = `attachments directory ${dir} is not writable by q${code ? ` (${code})` : ''}. ${MOUNT_HINT}`
    console.warn(`[attachments] ${disabledReason}`)
    return
  }
  if (await inDockerContainer()) {
    const real = await fs.realpath(dir)
    if ((await mountPointOf(real)) === '/') {
      disabledReason = `attachments directory ${dir} is inside q's container filesystem, not a host mount, ` +
        `so ticket containers would not see the files. ${MOUNT_HINT}`
      console.warn(`[attachments] ${disabledReason}`)
      return
    }
  }
  enabled = true
  console.log(`[attachments] Storing uploads in ${dir}`)
}

export function attachmentsEnabled(): boolean {
  return enabled
}

export function attachmentsDisabledReason(): string {
  return disabledReason
}

function ticketDir(ticketId: string): string {
  if (!TICKET_ID_RE.test(ticketId)) throw new Error(`invalid ticket id: ${ticketId}`)
  return path.join(config.attachmentsDir, ticketId)
}

/** Host path of a ticket's attachment dir (created if missing) — used as a container bind source */
export async function ensureTicketDir(ticketId: string): Promise<string> {
  const dir = ticketDir(ticketId)
  await fs.mkdir(dir, { recursive: true })
  return dir
}

/** Write an image to disk; the temp-file + rename means a partial write is never visible */
export async function saveAttachment(
  ticketId: string,
  mediaType: string,
  data: Buffer,
  name?: string,
): Promise<AttachmentMeta> {
  const ext = EXT_BY_TYPE[mediaType]
  if (!ext) throw new Error(`unsupported media type: ${mediaType}`)
  const dir = await ensureTicketDir(ticketId)
  const id = generateId()
  const file = `${id}.${ext}`
  const tmp = path.join(dir, `.${file}.tmp`)
  await fs.writeFile(tmp, data, { mode: 0o644 })
  await fs.rename(tmp, path.join(dir, file))
  return { id, file, media_type: mediaType, ...(name ? { name } : {}), size: data.length }
}

/** Best-effort removal, e.g. when the DB insert for a reply fails after files were written */
export async function deleteAttachments(ticketId: string, metas: AttachmentMeta[]): Promise<void> {
  const dir = ticketDir(ticketId)
  await Promise.all(metas.map(m =>
    FILE_RE.test(m.file) ? fs.rm(path.join(dir, m.file), { force: true }).catch(() => {}) : Promise.resolve()
  ))
}

/** Resolve a stored file; returns null if the name is malformed or the file is missing */
export async function readAttachment(ticketId: string, file: string): Promise<{ data: Buffer; mediaType: string } | null> {
  if (!TICKET_ID_RE.test(ticketId) || !FILE_RE.test(file)) return null
  try {
    const data = await fs.readFile(path.join(ticketDir(ticketId), file))
    return { data, mediaType: TYPE_BY_EXT[file.split('.')[1]] }
  } catch {
    return null
  }
}

/** Path of an attachment as seen from inside the ticket container */
export function containerPath(meta: AttachmentMeta): string {
  return `${CONTAINER_ATTACHMENTS_DIR}/${meta.file}`
}

/** Append a note listing where the attached images can be found inside the container */
export function withAttachmentPaths(prompt: string, metas: AttachmentMeta[]): string {
  const lines = metas.map(m => `- ${containerPath(m)}${m.name ? ` (uploaded as "${m.name}")` : ''}`)
  const note = `[Attached image${metas.length > 1 ? 's' : ''} (read-only, copy if you need to modify or commit):\n${lines.join('\n')}]`
  return prompt ? `${prompt}\n\n${note}` : note
}
