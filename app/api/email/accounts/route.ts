import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { syncGmailChannel } from '@/lib/gmail'

export const dynamic = 'force-dynamic'

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

// GET: all email accounts for a company, with their rules.
export async function GET(req: NextRequest) {
  try {
    const companyId = req.nextUrl.searchParams.get('companyId')
    if (!companyId) return NextResponse.json({ error: 'companyId required' }, { status: 400 })
    const db = admin()

    const { data: accounts } = await db.from('email_channels')
      .select('*').eq('company_id', companyId).order('created_at', { ascending: true })

    const ids = (accounts || []).map(a => a.id)
    let rules: any[] = []
    if (ids.length) {
      const { data } = await db.from('email_rules').select('*').in('email_channel_id', ids)
      rules = data || []
    }

    const { data: signatures } = await db.from('email_signatures')
      .select('*').eq('company_id', companyId).order('created_at', { ascending: true })

    const { data: locations } = await db.from('company_locations')
      .select('id, label, suburb').eq('company_id', companyId)

    // Never leak tokens to the browser.
    const safe = (accounts || []).map(a => ({
      ...a, access_token: undefined, refresh_token: undefined,
      connected: a.provider === 'gmail' ? !!a.refresh_token : true,
    }))

    return NextResponse.json({
      accounts: safe,
      rules,
      signatures: signatures || [],
      locations: locations || [],
    })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

// POST: actions — save_webhook | update_account | delete_account | sync |
//                 add_rule | delete_rule | toggle_rule | save_signature | delete_signature
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { companyId, action } = body
    if (!companyId || !action) return NextResponse.json({ error: 'companyId and action required' }, { status: 400 })
    const db = admin()

    // ── Webhook (domain) mailbox ─────────────────────────────────────────────
    if (action === 'save_webhook') {
      const { id, inbound_address, from_address, from_name, location_id, is_active, sync_all } = body
      if (!inbound_address) return NextResponse.json({ error: 'Inbound address required' }, { status: 400 })
      const row: any = {
        company_id: companyId,
        provider: 'webhook',
        inbound_address: String(inbound_address).trim().toLowerCase(),
        from_address: (from_address || '').trim().toLowerCase() || null,
        from_name: from_name || null,
        location_id: location_id || null,
        is_active: is_active !== false,
        sync_all: sync_all !== false,
      }
      if (id) await db.from('email_channels').update(row).eq('id', id)
      else {
        const { error } = await db.from('email_channels').insert(row)
        if (error) return NextResponse.json({ error: error.message }, { status: 400 })
      }
      return NextResponse.json({ ok: true })
    }

    if (action === 'update_account') {
      const { id, from_name, location_id, is_active, sync_all, sync_interval_minutes, filter_settings } = body
      if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })
      const patch: any = {}
      if (from_name !== undefined) patch.from_name = from_name
      if (location_id !== undefined) patch.location_id = location_id || null
      if (is_active !== undefined) patch.is_active = is_active
      if (sync_all !== undefined) patch.sync_all = sync_all
      if (sync_interval_minutes !== undefined) patch.sync_interval_minutes = Number(sync_interval_minutes)
      if (filter_settings !== undefined) patch.filter_settings = filter_settings
      await db.from('email_channels').update(patch).eq('id', id)
      return NextResponse.json({ ok: true })
    }

    if (action === 'delete_account') {
      const { id } = body
      if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })
      await db.from('email_rules').delete().eq('email_channel_id', id)
      await db.from('email_channels').delete().eq('id', id)
      return NextResponse.json({ ok: true })
    }

    // ── Gmail sync ───────────────────────────────────────────────────────────
    if (action === 'sync') {
      const { id } = body
      if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })
      const result = await syncGmailChannel(id)
      if (result.error) return NextResponse.json({ error: result.error }, { status: 400 })
      return NextResponse.json({ ok: true, imported: result.imported })
    }

    // ── Rules ────────────────────────────────────────────────────────────────
    if (action === 'add_rule') {
      const { email_channel_id, rule_type, pattern } = body
      if (!email_channel_id || !rule_type || !pattern) {
        return NextResponse.json({ error: 'Channel, type and pattern are required' }, { status: 400 })
      }
      const clean = String(pattern).trim().toLowerCase().replace(/^@/, '')
      const { error } = await db.from('email_rules').insert({
        company_id: companyId, email_channel_id, rule_type, pattern: clean, is_enabled: true,
      })
      if (error) {
        const dupe = /duplicate|unique/i.test(error.message)
        return NextResponse.json({ error: dupe ? 'That rule already exists.' : error.message }, { status: 400 })
      }
      return NextResponse.json({ ok: true })
    }

    if (action === 'toggle_rule') {
      const { id, is_enabled } = body
      await db.from('email_rules').update({ is_enabled }).eq('id', id)
      return NextResponse.json({ ok: true })
    }

    if (action === 'delete_rule') {
      const { id } = body
      await db.from('email_rules').delete().eq('id', id)
      return NextResponse.json({ ok: true })
    }

    // ── Signatures ───────────────────────────────────────────────────────────
    if (action === 'save_signature') {
      const { id, name, sigBody, email_channel_id, is_default } = body
      if (!name || !sigBody) return NextResponse.json({ error: 'Name and body are required' }, { status: 400 })
      const row: any = {
        company_id: companyId, name, body: sigBody,
        email_channel_id: email_channel_id || null,
        is_default: !!is_default,
      }
      if (id) await db.from('email_signatures').update(row).eq('id', id)
      else await db.from('email_signatures').insert(row)
      return NextResponse.json({ ok: true })
    }

    if (action === 'delete_signature') {
      const { id } = body
      await db.from('email_signatures').delete().eq('id', id)
      return NextResponse.json({ ok: true })
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
