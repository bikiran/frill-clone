import type { NextRequest } from 'next/server'
import { unsubscribeGet, unsubscribePost } from '@/lib/email-unsubscribe-routes'

export const dynamic = 'force-dynamic'

// The unsubscribe link and the one-click List-Unsubscribe-Post target in a
// business's campaign email. Handlers: lib/email-unsubscribe-routes.ts.
export async function GET(req: NextRequest) { return unsubscribeGet(req) }
export async function POST(req: NextRequest) { return unsubscribePost(req) }
