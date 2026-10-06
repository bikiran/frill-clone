import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// Public REST API: GET / POST ideas for ONE board, chosen by its API key
// (Authorization: Bearer <companies.api_key>, from Admin → Settings → API).
// This used to list every company's ideas and insert ideas with no company.

const admin = () => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { autoRefreshToken: false, persistSession: false } })

async function companyFromKey(req: NextRequest, db: any): Promise<string | null> {
  const key = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '').trim()
  if (!key || key.length < 16) return null
  const { data } = await db.from('companies').select('id').eq('api_key', key).maybeSingle()
  return data?.id || null
}

export async function GET(req: NextRequest) {
  try {
    const db = admin()
    const companyId = await companyFromKey(req, db)
    if (!companyId) return NextResponse.json({ error: 'A valid API key is required (Authorization: Bearer …)' }, { status: 401 })
    const { searchParams } = new URL(req.url)
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '50') || 50))
    const offset = Math.max(0, parseInt(searchParams.get('offset') || '0') || 0)
    const { data, count, error } = await db
      .from('ideas')
      .select('*', { count: 'exact' })
      .eq('company_id', companyId)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1)
    if (error) throw error
    return NextResponse.json({ ideas: data, total: count })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const db = admin()
    const companyId = await companyFromKey(req, db)
    if (!companyId) return NextResponse.json({ error: 'A valid API key is required (Authorization: Bearer …)' }, { status: 401 })
    const { title, description } = await req.json().catch(() => ({}))
    if (!title || typeof title !== 'string') return NextResponse.json({ error: 'title is required' }, { status: 400 })
    const { data, error } = await db
      .from('ideas')
      .insert({ company_id: companyId, title: title.slice(0, 300), description: typeof description === 'string' ? description.slice(0, 10000) : null, status: 'new', created_by_name: 'API' })
      .select()
      .single()
    if (error) throw error
    return NextResponse.json({ idea: data }, { status: 201 })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
