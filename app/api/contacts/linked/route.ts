import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { linkedContacts } from '@/lib/identity'

export const dynamic = 'force-dynamic'

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

// Every channel/identity linked to this contact — for the profile's
// "also reachable on" panel and a merged cross-channel timeline.
export async function GET(req: NextRequest) {
  const contactId = new URL(req.url).searchParams.get('contactId')
  if (!contactId) return NextResponse.json({ error: 'contactId required' }, { status: 400 })

  const db = admin()
  const linked = await linkedContacts(db, contactId)

  // Collapse to a simple channel list with the identifier for each.
  const channels: any[] = []
  for (const c of linked) {
    for (const ch of (Array.isArray(c.channels_seen) ? c.channels_seen : [])) {
      channels.push({
        channel: ch,
        contactId: c.id,
        label: ch === 'sms' ? c.phone
          : ch === 'email' ? c.email
          : (ch === 'instagram' || ch === 'facebook') ? c.name
          : c.name || c.email || c.phone,
      })
    }
  }

  return NextResponse.json({ linked, channels })
}
