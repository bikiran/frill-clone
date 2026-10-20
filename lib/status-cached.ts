// The public status, computed at most about once a minute per server cache
// (unstable_cache, the data cache for projects without Cache Components) and
// shared by the /status page and GET /api/status. Incident changes in the
// platform admin expire it at once (expirePublicStatus).

import { revalidateTag, unstable_cache } from 'next/cache'
import { computeStatus, statusDb } from '@/lib/status-server'
import { toPublicStatus, type PublicStatus } from '@/lib/status-health'

export const PUBLIC_STATUS_TAG = 'public-status'
export const PUBLIC_STATUS_TTL_S = 60

async function fresh(): Promise<PublicStatus> {
  return toPublicStatus(await computeStatus(statusDb()))
}

const cached = unstable_cache(fresh, ['colvy-public-status-v1'], { revalidate: PUBLIC_STATUS_TTL_S, tags: [PUBLIC_STATUS_TAG] })

export async function getPublicStatus(): Promise<PublicStatus> {
  try {
    return await cached()
  } catch {
    // No data cache available (or it failed): compute directly rather than
    // show nothing. Still only coarse, public fields.
    return fresh()
  }
}

/** After an incident is created or changed: the next visitor sees it. */
export function expirePublicStatus(): void {
  try { revalidateTag(PUBLIC_STATUS_TAG, { expire: 0 }) } catch { /* outside a request: the 60s TTL catches up */ }
}
