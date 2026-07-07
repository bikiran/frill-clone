import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

function getDb() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !key) throw new Error('Supabase env vars missing')
  return createClient(url, key)
}

export async function POST(req: NextRequest) {
  try {
    const supabase = getDb()
    const { slug, event, tab } = await req.json()
    if (!slug) return NextResponse.json({ error: 'slug required' }, { status: 400 })

    const { data: company } = await (supabase as any)
      .from('companies').select('id').eq('slug', slug).maybeSingle()

    if (!company) {
      return NextResponse.json({ ok: true }, {
        headers: { 'Access-Control-Allow-Origin': '*' }
      })
    }

    // Store analytics in a simple way - create a widget_analytics table
    const now = new Date().toISOString()
    await (supabase as any).from('widget_analytics').insert({
      company_id: company.id,
      event,
      tab,
      created_at: now,
      user_agent: req.headers.get('user-agent'),
      ip: req.headers.get('x-forwarded-for') || 'unknown',
    }).catch(() => {}) // Silently fail if table doesn't exist

    return NextResponse.json({ ok: true }, {
      headers: { 'Access-Control-Allow-Origin': '*' }
    })
  } catch (e: any) {
    // Silently fail for analytics
    return NextResponse.json({ ok: true }, {
      headers: { 'Access-Control-Allow-Origin': '*' }
    })
  }
}

export async function OPTIONS() {
  return new NextResponse(null, {
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    }
  })
}
