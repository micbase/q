/**
 * MergeWatcher — polls GitHub for done tickets whose branch has been merged,
 * then transitions them to 'archived'.
 *
 * Runs every MERGE_POLL_INTERVAL_MS (default 60 s).  Only active when the
 * GitHub App is configured (GITHUB_APP_ID + GITHUB_PRIVATE_KEY).
 */

import * as db from '../db/queries'
import { checkPRMerged } from './github'
import { emitTicketStatusChange } from '../broker/emit'

const MERGE_POLL_INTERVAL_MS = 60_000

class MergeWatcher {
  private handle: ReturnType<typeof setInterval> | null = null

  start(): void {
    console.log('[merge-watcher] Starting, polling every 60s for merged PRs')
    this.handle = setInterval(() => void this.tick(), MERGE_POLL_INTERVAL_MS)
    // Run immediately on startup too
    void this.tick()
  }

  stop(): void {
    if (this.handle) {
      clearInterval(this.handle)
      this.handle = null
    }
  }

  private async tick(): Promise<void> {
    let candidates: Array<{ ticket_id: string; github_repo: string }>
    try {
      candidates = await db.listDoneTicketsWithRepo()
    } catch (err) {
      console.error('[merge-watcher] DB error:', err)
      return
    }

    if (candidates.length === 0) return

    for (const { ticket_id, github_repo } of candidates) {
      try {
        const merged = await checkPRMerged(github_repo, ticket_id)
        if (merged) {
          console.log(`[merge-watcher] Ticket ${ticket_id} PR merged — archiving`)
          await db.archiveTicket(ticket_id)
          await emitTicketStatusChange(ticket_id, 'archived')
        }
      } catch (err) {
        console.error(`[merge-watcher] Error checking ticket ${ticket_id}:`, err)
      }
    }
  }
}

export const mergeWatcher = new MergeWatcher()
