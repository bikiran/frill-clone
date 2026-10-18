import type { NextRequest } from 'next/server'
import { unsubscribeGet, unsubscribePost } from '@/lib/email-unsubscribe-routes'

export const dynamic = 'force-dynamic'

// The unsubscribe link in announcement emails sent before campaign email
// existed. Same rules and page as every marketing email now
// (lib/email-unsubscribe-routes.ts, lib/email-preferences.ts): GET shows a
// page with a button (a mail scanner opening the link changes nothing), POST
// (the button, or a mail app's one-click List-Unsubscribe-Post) turns
// marketing email off straight away, and the page links to the full
// preferences, including "unsubscribe from everything". Old 'ann-unsub'
// tokens are still accepted (lib/email-tokens.ts).
export async function GET(req: NextRequest) { return unsubscribeGet(req) }
export async function POST(req: NextRequest) { return unsubscribePost(req) }
