import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const SUPER_ADMIN = 'bishalstha76@gmail.com'

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

async function requireSuperAdmin(req: NextRequest, db: any): Promise<boolean> {
  try {
    const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '')
    if (!token) return false
    const { data } = await db.auth.getUser(token)
    return data?.user?.email === SUPER_ADMIN
  } catch { return false }
}

async function companyMap(db: any) {
  const { data } = await db.from('companies').select('id, name, slug')
  const map: Record<string, any> = {}
  ;(data || []).forEach((c: any) => map[c.id] = c)
  return map
}

// GET ?view=chat|moderation|billing
export async function GET(req: NextRequest) {
  try {
    const db = admin()
    if (!(await requireSuperAdmin(req, db))) return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
    const view = req.nextUrl.searchParams.get('view') || 'chat'
    const cos = await companyMap(db)

    if (view === 'chat') {
      const { data: convs } = await db.from('conversations').select('id, company_id, channel, status, subject, last_message, last_message_at, is_unread, assigned_name').order('last_message_at', { ascending: false }).limit(300)
      const counts: Record<string, number> = { open: 0, assigned: 0, resolved: 0, closed: 0 }
      ;(convs || []).forEach((c: any) => { counts[c.status] = (counts[c.status] || 0) + 1 })
      const rows = (convs || []).map((c: any) => ({ ...c, company: cos[c.company_id] || null }))
      return NextResponse.json({ conversations: rows, counts, total: rows.length })
    }

    if (view === 'moderation') {
      // Spam-flagged conversations + any flagged ideas (best-effort on columns).
      const { data: spam } = await db.from('conversations').select('id, company_id, channel, subject, last_message, last_message_at').eq('is_spam', true).order('last_message_at', { ascending: false }).limit(200)
      let flaggedIdeas: any[] = []
      try {
        const { data } = await db.from('ideas').select('id, company_id, title, status, created_at').eq('is_flagged', true).limit(200)
        flaggedIdeas = data || []
      } catch {}
      return NextResponse.json({
        spam: (spam || []).map((c: any) => ({ ...c, company: cos[c.company_id] || null })),
        flaggedIdeas: flaggedIdeas.map((i: any) => ({ ...i, company: cos[i.company_id] || null })),
      })
    }

    if (view === 'billing') {
      const { data: pays } = await db.from('chat_payments').select('*').order('created_at', { ascending: false }).limit(300)
      let paidCents = 0, pendingCents = 0
      ;(pays || []).forEach((p: any) => {
        if (p.status === 'paid') paidCents += p.amount_cents || 0
        else if (p.status === 'pending') pendingCents += p.amount_cents || 0
      })
      const rows = (pays || []).map((p: any) => ({
        id: p.id, amount: (p.amount_cents || 0) / 100, currency: (p.currency || 'aud').toUpperCase(),
        description: p.description, status: p.status, created_at: p.created_at,
        receipt_url: p.receipt_url, company: cos[p.company_id] || null,
      }))
      return NextResponse.json({ payments: rows, paid: paidCents / 100, pending: pendingCents / 100, total: rows.length })
    }

    return NextResponse.json({ error: 'Unknown view' }, { status: 400 })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

// PATCH: moderation actions (unflag spam, delete flagged idea).
export async function PATCH(req: NextRequest) {
  try {
    const db = admin()
    if (!(await requireSuperAdmin(req, db))) return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
    const { action, id } = await req.json()
    if (action === 'unspam') await db.from('conversations').update({ is_spam: false }).eq('id', id)
    else if (action === 'markspam') await db.from('conversations').update({ is_spam: true, status: 'closed' }).eq('id', id)
    else if (action === 'unflag_idea') { try { await db.from('ideas').update({ is_flagged: false }).eq('id', id) } catch {} }
    else return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
    return NextResponse.json({ ok: true })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
