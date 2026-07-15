import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

const norm = (p?: string | null) => (p || '').replace(/\D/g, '').slice(-8)
const lower = (e?: string | null) => (e || '').trim().toLowerCase()

// POST /api/contacts/backfill-identity  { companyId }
//
// One-off: group every existing contact that shares an email or phone under a
// single identity_group_id, so the "also reachable on" panel and merged
// timeline work for people who existed BEFORE identity linking shipped. New
// contacts link automatically; this catches the history. Safe to re-run.
export async function POST(req: NextRequest) {
  try {
    const { companyId } = await req.json()
    if (!companyId) return NextResponse.json({ error: 'companyId required' }, { status: 400 })
    const db = admin()

    const { data: contacts } = await db.from('contacts')
      .select('id, email, phone, identity_group_id, source, channels_seen')
      .eq('company_id', companyId)
    if (!contacts) return NextResponse.json({ ok: true, linked: 0 })

    // Union-find over contacts joined by shared email or phone.
    const parent: Record<string, string> = {}
    const find = (x: string): string => { while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x] } return x }
    const union = (a: string, b: string) => { parent[find(a)] = find(b) }
    for (const c of contacts) parent[c.id] = c.id

    const byEmail: Record<string, string> = {}
    const byPhone: Record<string, string> = {}
    for (const c of contacts) {
      const e = lower(c.email)
      const p = norm(c.phone)
      if (e) { if (byEmail[e]) union(c.id, byEmail[e]); else byEmail[e] = c.id }
      if (p) { if (byPhone[p]) union(c.id, byPhone[p]); else byPhone[p] = c.id }
    }

    // Collect groups with more than one member.
    const groups: Record<string, string[]> = {}
    for (const c of contacts) {
      const root = find(c.id)
      ;(groups[root] ||= []).push(c.id)
    }

    let linkedGroups = 0
    let linkedContacts = 0
    for (const members of Object.values(groups)) {
      if (members.length < 2) continue
      // Reuse any existing group id among the members, else mint one.
      const existing = members
        .map(id => contacts.find(c => c.id === id)?.identity_group_id)
        .find(Boolean)
      const groupId = existing || crypto.randomUUID()
      await db.from('contacts').update({ identity_group_id: groupId }).in('id', members)
      linkedGroups++
      linkedContacts += members.length
    }

    // Backfill channels_seen from each contact's source, so the panel has
    // something to show even before their next message.
    for (const c of contacts) {
      const seen: string[] = Array.isArray(c.channels_seen) ? c.channels_seen : []
      if (c.source && !seen.includes(c.source)) {
        await db.from('contacts').update({ channels_seen: [...seen, c.source] }).eq('id', c.id)
      }
    }

    return NextResponse.json({ ok: true, linkedGroups, linkedContacts, total: contacts.length })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
