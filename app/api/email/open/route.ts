import { NextRequest, NextResponse } from 'next/server'
import { emailAdminDb } from '@/lib/email-db'
import { readRecipientRef } from '@/lib/email-tokens'

export const dynamic = 'force-dynamic'

// The 1x1 open pixel in campaign email. Records an 'opened' event for the
// recipient the signed ref names (lib/email-tokens), then returns a
// transparent GIF. The picture always comes back, whatever happens to the
// record. Opens are approximate (Apple Mail Privacy Protection loads every
// picture), so reports lead with clicks (lib/email-campaign-report.ts).

const GIF = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64')
const MAX_OPENS_PER_RECIPIENT = 20

function gif() {
  return new NextResponse(GIF, { headers: { 'Content-Type': 'image/gif', 'Cache-Control': 'no-store, no-cache, must-revalidate, private', 'Content-Length': String(GIF.length) } })
}

export async function GET(req: NextRequest) {
  const id = readRecipientRef(req.nextUrl.searchParams.get('r'))
  if (!id) return gif()
  try {
    const db = emailAdminDb()
    const { data: rec } = await db.from('email_campaign_recipients').select('id, campaign_id, company_id, contact_id, email, opened_at').eq('id', id).maybeSingle()
    if (rec) {
      const { count } = await db.from('email_events').select('id', { count: 'exact', head: true }).eq('recipient_id', rec.id).eq('type', 'opened')
      if ((count || 0) < MAX_OPENS_PER_RECIPIENT) {
        const now = new Date().toISOString()
        await db.from('email_events').insert({ company_id: rec.company_id, campaign_id: rec.campaign_id, recipient_id: rec.id, contact_id: rec.contact_id, email: rec.email, type: 'opened', detail: { via: 'pixel' }, occurred_at: now })
        if (!rec.opened_at) await db.from('email_campaign_recipients').update({ opened_at: now }).eq('id', rec.id)
      }
    }
  } catch { /* the pixel still loads */ }
  return gif()
}
