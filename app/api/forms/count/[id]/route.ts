import type { NextRequest } from 'next/server'
import { handleFormCount } from '@/lib/forms-public-server'

// GET /api/forms/count/<formId> → { count } for the public welcome screen's
// "N people have filled this out". Service role, published forms only, count
// only (never response data). The id is in the path so a CDN that ignores query
// strings still caches per form. See lib/forms-public-server.ts.
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return handleFormCount(req, id)
}
