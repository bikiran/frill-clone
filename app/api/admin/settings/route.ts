import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// Server-side settings save/load using the service role key.
// This bypasses any client-side auth/RLS quirks and verifies
// every write by reading it back before responding.

function getDb() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  )
}

export async function GET(req: NextRequest) {
  try {
    const supabase = getDb()
    const companyId = req.nextUrl.searchParams.get('company_id')
    if (!companyId) return NextResponse.json({ error: 'company_id required' }, { status: 400 })

    const { data: rows, error } = await (supabase as any)
      .from('site_settings')
      .select('*')
      .eq('key', 'general')
      .eq('company_id', companyId)
      .order('updated_at', { ascending: false })
      .limit(1)

    if (error) {
      console.error('[SETTINGS API GET] Error:', error.message)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ settings: rows?.[0] || null })
  } catch (e: any) {
    console.error('[SETTINGS API GET] Exception:', e.message)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const supabase = getDb()
    const { company_id, value } = await req.json()
    if (!company_id) return NextResponse.json({ error: 'company_id required' }, { status: 400 })
    if (!value || typeof value !== 'object') return NextResponse.json({ error: 'value object required' }, { status: 400 })

    console.log('[SETTINGS API POST] Saving for company:', company_id)

    // 1. Try UPDATE first (most common case)
    const { data: updated, error: updateErr } = await (supabase as any)
      .from('site_settings')
      .update({ value, updated_at: new Date().toISOString() })
      .eq('key', 'general')
      .eq('company_id', company_id)
      .select()

    let saveMethod = 'update'
    if (updateErr) {
      console.error('[SETTINGS API POST] Update error:', updateErr.message)
    }

    // 2. If no row was updated, INSERT
    if (!updateErr && (!updated || updated.length === 0)) {
      saveMethod = 'insert'
      const { error: insertErr } = await (supabase as any)
        .from('site_settings')
        .insert({ key: 'general', company_id, value, updated_at: new Date().toISOString() })
      if (insertErr) {
        console.error('[SETTINGS API POST] Insert error:', insertErr.message)
        return NextResponse.json({ error: insertErr.message }, { status: 500 })
      }
    } else if (updateErr) {
      return NextResponse.json({ error: updateErr.message }, { status: 500 })
    }

    // 3. READ BACK to verify the save actually persisted
    const { data: verifyRows, error: verifyErr } = await (supabase as any)
      .from('site_settings')
      .select('*')
      .eq('key', 'general')
      .eq('company_id', company_id)
      .order('updated_at', { ascending: false })
      .limit(1)

    if (verifyErr || !verifyRows || verifyRows.length === 0) {
      console.error('[SETTINGS API POST] VERIFICATION FAILED:', verifyErr?.message || 'no row found after save')
      return NextResponse.json({ error: 'Save verification failed: ' + (verifyErr?.message || 'row not found after write') }, { status: 500 })
    }

    console.log('[SETTINGS API POST] ✅ Verified save via', saveMethod, '— row id:', verifyRows[0].id)
    return NextResponse.json({ ok: true, method: saveMethod, settings: verifyRows[0] })
  } catch (e: any) {
    console.error('[SETTINGS API POST] Exception:', e.message)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
