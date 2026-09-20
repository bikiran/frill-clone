import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { linkedContacts } from '@/lib/identity'

export const dynamic = 'force-dynamic'

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

// Normalize the many channel spellings into a small canonical set.
function norm(ch?: string | null): string | null {
  const c = String(ch || '').toLowerCase()
  if (!c) return null
  if (c === 'messenger') return 'facebook'
  if (c === 'widget' || c === 'live_chat') return 'chat'
  if (['instagram', 'facebook', 'whatsapp', 'sms', 'email', 'chat'].includes(c)) return c
  return c
}

// GET /api/contacts/channels?contactId=…
// The distinct channels this customer is reachable on, resolved across every
// linked identity (identity_group_id): their conversations, the channels_seen
// tally, and any confirmed customer_identities. Used to show "Also on …" chips.
export async function GET(req: NextRequest) {
  const contactId = new URL(req.url).searchParams.get('contactId')
  if (!contactId) return NextResponse.json({ channels: [] })

  const db = admin()
  try {
    const linked = await linkedContacts(db, contactId)
    const list = linked.length ? linked : [{ id: contactId, channels_seen: [] as any }]
    const ids = list.map((c: any) => c.id)

    const channels = new Set<string>()
    for (const c of list) for (const ch of (Array.isArray((c as any).channels_seen) ? (c as any).channels_seen : [])) { const n = norm(ch); if (n) channels.add(n) }

    const { data: convs } = await db.from('conversations').select('channel').in('contact_id', ids)
    for (const c of (convs || [])) { const n = norm(c.channel); if (n) channels.add(n) }

    const { data: idents } = await db.from('customer_identities').select('kind').eq('status', 'confirmed').in('contact_id', ids)
    for (const i of (idents || [])) {
      const k = String(i.kind || '').toLowerCase()
      if (['instagram', 'facebook', 'whatsapp'].includes(k)) channels.add(k)
      else if (k === 'phone') channels.add('sms')
      else if (k === 'email') channels.add('email')
    }
    // Contact-level phone/email imply those channels are reachable.
    for (const c of list) { if ((c as any).phone) channels.add('sms'); if ((c as any).email) channels.add('email') }

    return NextResponse.json({ channels: [...channels] })
  } catch {
    return NextResponse.json({ channels: [] })
  }
}
