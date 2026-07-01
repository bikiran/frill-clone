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
    const { formId, questions, title, description, theme } = await req.json()

    if (!formId) return NextResponse.json({ error: 'formId required' }, { status: 400 })

    // Get current version count
    const { count } = await (supabase as any)
      .from('form_versions')
      .select('*', { count: 'exact', head: true })
      .eq('form_id', formId)

    const nextVersion = (count || 0) + 1

    // Create version snapshot
    const { data, error } = await (supabase as any).from('form_versions').insert({
      form_id: formId,
      version_number: nextVersion,
      questions,
      title,
      description,
      theme,
      created_at: new Date().toISOString(),
    })

    if (error) throw error

    return NextResponse.json({ version_number: nextVersion, success: true })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

export async function GET(req: NextRequest) {
  try {
    const supabase = getDb()
    const { searchParams } = new URL(req.url)
    const formId = searchParams.get('formId')

    if (!formId) return NextResponse.json({ error: 'formId required' }, { status: 400 })

    const { data, error } = await (supabase as any)
      .from('form_versions')
      .select('*')
      .eq('form_id', formId)
      .order('version_number', { ascending: false })

    if (error) throw error

    return NextResponse.json({ versions: data || [] })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
