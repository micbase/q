/**
 * Merge detection — checks whether a ticket's branch PR has been merged and
 * archives the ticket if so.
 *
 * Called at two points:
 *   1. On q startup — scans all done tickets with a github_repo
 *   2. After a container idle-stops — checks that specific ticket
 */

import * as db from '../db/queries'
import { checkPRMerged } from './github'
import { emitTicketStatusChange } from '../broker/emit'

/** Check one ticket and archive it if its PR has been merged. */
export async function checkAndArchiveIfMerged(ticketId: string, githubRepo: string): Promise<void> {
  try {
    const merged = await checkPRMerged(githubRepo, ticketId)
    if (merged) {
      console.log(`[merge-watcher] Ticket ${ticketId} PR merged — archiving`)
      await db.archiveTicket(ticketId)
      await emitTicketStatusChange(ticketId, 'archived')
    }
  } catch (err) {
    console.error(`[merge-watcher] Error checking ticket ${ticketId}:`, err)
  }
}

/** On startup: check all done tickets that have a github_repo configured. */
export async function checkAllOnStartup(): Promise<void> {
  let candidates: Array<{ ticket_id: string; github_repo: string }>
  try {
    candidates = await db.listDoneTicketsWithRepo()
  } catch (err) {
    console.error('[merge-watcher] DB error during startup scan:', err)
    return
  }

  if (candidates.length === 0) return
  console.log(`[merge-watcher] Startup scan: checking ${candidates.length} done ticket(s)`)
  await Promise.allSettled(
    candidates.map(({ ticket_id, github_repo }) => checkAndArchiveIfMerged(ticket_id, github_repo))
  )
}
