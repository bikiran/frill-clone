import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { isMetaConfigured } from '@/lib/meta'

export const dynamic = 'force-dynamic'

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

// GET: the company's connected Meta channels + its outlets (for mapping).
export async function GET(req: NextRequest) {
  const companyId = new URL(req.url).searchParams.get('companyId')
  if (!companyId) return NextResponse.json({ error: 'companyId required' }, { status: 400 })
  const db = admin()

  const { data: channels } = await db.from('meta_channels')
    .select('id, platform, page_id, page_name, ig_username, location_id, is_active, last_error, token_expires_at')
    .eq('company_id', companyId).order('created_at', { ascending: true })

  const { data: locations } = await db.from('company_locations')
    .select('id, label, suburb').eq('company_id', companyId)

  return NextResponse.json({ configured: isMetaConfigured(), channels: channels || [], locations: locations || [] })
}

// POST: map a channel to a location, toggle it, or disconnect it.
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { action, id } = body
    if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })
    const db = admin()

    if (action === 'map_location') {
      await db.from('meta_channels').update({ location_id: body.location_id || null }).eq('id', id)
      return NextResponse.json({ ok: true })
    }
    if (action === 'toggle') {
      await db.from('meta_channels').update({ is_active: body.is_active !== false }).eq('id', id)
      return NextResponse.json({ ok: true })
    }
    if (action === 'disconnect') {
      await db.from('meta_channels').delete().eq('id', id)
      return NextResponse.json({ ok: true })
    }
    return NextResponse.json({ error: 'unknown action' }, { status: 400 })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
