import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

const SUPER_ADMIN = 'bishalstha76@gmail.com'

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

async function callerEmail(req: NextRequest, db: any): Promise<string | null> {
  try {
    const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '')
    if (!token) return null
    const { data } = await db.auth.getUser(token)
    return data?.user?.email || null
  } catch { return null }
}

// POST { action: 'start' | 'end', ... } — start requires super admin.
export async function POST(req: NextRequest) {
  try {
    const db = admin()
    const body = await req.json()
    const action = body.action || 'start'

    if (action === 'start') {
      const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '')
      const { data: u } = await db.auth.getUser(token)
      if (u?.user?.email !== SUPER_ADMIN) {
        return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
      }
      const { companyId, slug, name, reason, mode, minutes } = body
      if (!slug || !reason || !String(reason).trim()) {
        return NextResponse.json({ error: 'A reason is required to enter a workspace.' }, { status: 400 })
      }
      const mins = Math.min(Math.max(Number(minutes) || 60, 5), 240)   // 5min–4h
      const expires = new Date(Date.now() + mins * 60000).toISOString()
      const { data, error } = await db.from('impersonation_sessions').insert({
        admin_id: u.user.id, admin_email: u.user.email,
        company_id: companyId || null, company_slug: slug, company_name: name || slug,
        reason: String(reason).trim(), mode: mode === 'read_only' ? 'read_only' : 'full',
        expires_at: expires,
      }).select('id, expires_at').maybeSingle()
      if (error) {
        if (/does not exist|schema cache/i.test(error.message)) {
          return NextResponse.json({ error: 'Impersonation needs a DB update — run COLVY_V215_IMPERSONATION.sql.' }, { status: 501 })
        }
        return NextResponse.json({ error: error.message }, { status: 500 })
      }
      return NextResponse.json({ ok: true, id: data?.id, expiresAt: data?.expires_at })
    }

    if (action === 'end') {
      // The impersonating admin ends their own session. Verified by matching the
      // caller's email against the session's admin_email.
      const email = await callerEmail(req, db)
      const { id } = body
      if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })
      const { data: sess } = await db.from('impersonation_sessions').select('admin_email, ended_at').eq('id', id).maybeSingle()
      if (sess && !sess.ended_at && (email === sess.admin_email || email === SUPER_ADMIN)) {
        await db.from('impersonation_sessions').update({ ended_at: new Date().toISOString() }).eq('id', id)
      }
      return NextResponse.json({ ok: true })
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

// GET ?id= — read a session so the target workspace can render the banner and
// check expiry. Returns only non-sensitive fields.
export async function GET(req: NextRequest) {
  try {
    const id = req.nextUrl.searchParams.get('id')
    if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })
    const db = admin()
    const { data } = await db.from('impersonation_sessions')
      .select('id, admin_email, company_slug, company_name, mode, started_at, expires_at, ended_at')
      .eq('id', id).maybeSingle()
    if (!data) return NextResponse.json({ active: false })
    const expired = data.expires_at ? new Date(data.expires_at).getTime() < Date.now() : false
    const active = !data.ended_at && !expired
    return NextResponse.json({ active, session: data, expired })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
