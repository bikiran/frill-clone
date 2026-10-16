import type { NextRequest } from 'next/server'
import { handleFormTrack } from '@/lib/forms-public-server'

// POST /api/forms/track { formId, event: 'view'|'start'|'abandon', questionId? }
// Counts public-form views, starts and drop-offs into form_stats (migration
// COLVY_V376_FORM_STATS.sql). Always answers 204, including before V376 runs.
// See lib/forms-public-server.ts.
export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  return handleFormTrack(req)
}
