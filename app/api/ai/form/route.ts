import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireCompanyAccess } from '@/lib/company-access'
import { guardAiRequest } from '@/lib/rate-limit'
import { chatForm } from '@/lib/ai-form'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

// POST { formId, messages: [{ role, text }], current: { title, welcome_message,
// thank_you_message, questions } } → { reply, form | null }. Colvy AI chat in the
// form builder; team members of the form's company only.
export async function POST(req: NextRequest) {
  try {
    const db = admin()
    const b = await req.json().catch(() => ({}))
    const formId = String(b.formId || '')
    if (!formId) return NextResponse.json({ error: 'formId required' }, { status: 400 })
    const { data: form } = await db.from('forms').select('id, company_id').eq('id', formId).maybeSingle()
    if (!form) return NextResponse.json({ error: 'Form not found' }, { status: 404 })
    const companyId = String(form.company_id || '')
    if (!(await requireCompanyAccess(req, db, companyId)).ok) return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
    const guard = await guardAiRequest(req, companyId, 'ai_form')
    if (!guard.ok) return guard.response!

    const { data: co } = await db.from('companies').select('name, industry').eq('id', companyId).maybeSingle()
    const c = b.current || {}
    const r = await chatForm({
      business: { name: co?.name, industry: co?.industry },
      current: {
        title: String(c.title || 'Untitled Form'),
        welcome_message: String(c.welcome_message || ''),
        thank_you_message: String(c.thank_you_message || ''),
        questions: Array.isArray(c.questions) ? c.questions : [],
      },
      messages: Array.isArray(b.messages) ? b.messages : [],
    })
    if ('error' in r) return NextResponse.json({ error: r.error }, { status: 422 })
    return NextResponse.json({ reply: r.reply, form: r.form })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Failed' }, { status: 500 })
  }
}
