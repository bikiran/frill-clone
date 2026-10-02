import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { linkedContacts } from '@/lib/identity'

export const dynamic = 'force-dynamic'

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

const norm = (ch?: string | null) => {
  const c = String(ch || '').toLowerCase()
  if (c === 'messenger') return 'facebook'
  if (c === 'widget' || c === 'live_chat') return 'chat'
  return c
}
const COMMERCE = new Set(['woocommerce', 'pos', 'shopify', 'prexty'])

// Every channel/identity linked to this contact — for the profile's
// "also reachable on" panel and a merged cross-channel timeline.
//
// Each channel row that corresponds to a real conversation carries its
// `conversationId`, so the UI can open that channel's thread directly.
export async function GET(req: NextRequest) {
  const contactId = new URL(req.url).searchParams.get('contactId')
  if (!contactId) return NextResponse.json({ error: 'contactId required' }, { status: 400 })

  const db = admin()
  const linked = await linkedContacts(db, contactId)
  const byId = new Map(linked.map((c: any) => [c.id, c]))
  const ids = linked.map((c: any) => c.id)

  const channels: any[] = []
  const seen = new Set<string>()

  // Real conversations (openable) — newest first, one row per channel+contact.
  if (ids.length) {
    const { data: convs } = await db.from('conversations')
      .select('id, channel, contact_id, last_message_at')
      .in('contact_id', ids)
      .order('last_message_at', { ascending: false })
    for (const cv of (convs || [])) {
      const key = norm(cv.channel) + ':' + cv.contact_id
      if (seen.has(key)) continue
      seen.add(key)
      const c: any = byId.get(cv.contact_id) || {}
      channels.push({
        channel: cv.channel, conversationId: cv.id, contactId: cv.contact_id,
        label: c.name || c.email || c.phone || null, lastAt: cv.last_message_at,
      })
    }
  }

  // Commerce presence (no conversation) — from channels_seen, shown for context.
  for (const c of linked as any[]) {
    for (const ch of (Array.isArray(c.channels_seen) ? c.channels_seen : [])) {
      if (!COMMERCE.has(String(ch).toLowerCase())) continue
      const key = String(ch).toLowerCase() + ':' + c.id
      if (seen.has(key)) continue
      seen.add(key)
      channels.push({ channel: ch, contactId: c.id, label: c.name || c.email || c.phone || null })
    }
  }

  return NextResponse.json({ linked, channels })
}
