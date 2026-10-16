import { requireCompanyAccess } from '@/lib/company-access'
import { NextRequest, NextResponse } from 'next/server'
import { formsDb, isUuid } from '@/lib/forms-server'

export const dynamic = 'force-dynamic'

// Version snapshots of a form, for its workspace's staff. Service role: V375
// leaves form_versions readable by members only and writable by the server
// only, and a draft form is invisible to the anon key.
const getDb = formsDb

export async function POST(req: NextRequest) {
  try {
    const supabase = getDb()
    const { formId, questions, title, description, theme } = await req.json()

    if (!isUuid(formId)) return NextResponse.json({ error: 'formId required' }, { status: 400 })
    // Members of the form's workspace only.
    {
      const { data: f } = await (supabase as any).from('forms').select('company_id').eq('id', formId).maybeSingle()
      if (!f || !(await requireCompanyAccess(req, supabase, f.company_id)).ok) return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
    }

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

    if (!isUuid(formId)) return NextResponse.json({ error: 'formId required' }, { status: 400 })
    // Members of the form's workspace only.
    {
      const { data: f } = await (supabase as any).from('forms').select('company_id').eq('id', formId).maybeSingle()
      if (!f || !(await requireCompanyAccess(req, supabase, f.company_id)).ok) return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
    }

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
