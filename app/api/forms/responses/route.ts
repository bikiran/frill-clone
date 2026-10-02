import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

// Delete form responses. Runs with the service role because form_responses has
// no DELETE policy for the browser client — a client-side delete silently
// removes 0 rows (RLS), so deletions "came back" on reload. Scoped to the
// form's own company so a delete can only touch that form's responses.
//
// POST { action: 'delete', formId, companyId, ids: string[] } → { deleted }
export async function POST(req: NextRequest) {
  try {
    const { action, formId, companyId, ids } = await req.json()
    if (action !== 'delete') return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
    if (!formId || !companyId || !Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json({ error: 'formId, companyId and ids are required' }, { status: 400 })
    }
    const db = admin()

    // Verify the form belongs to the company before touching its responses.
    const { data: form } = await db.from('forms').select('id, company_id').eq('id', formId).maybeSingle()
    if (!form || form.company_id !== companyId) return NextResponse.json({ error: 'Not allowed' }, { status: 403 })

    const { data, error } = await db.from('form_responses').delete()
      .eq('form_id', formId).in('id', ids).select('id')
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true, deleted: (data || []).length })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
