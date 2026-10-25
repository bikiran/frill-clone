import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireCompanyAccess } from '@/lib/company-access'
import { callLanguageSettings, CALL_LANGUAGES, summaryOptions } from '@/lib/call-languages'

export const dynamic = 'force-dynamic'

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

// Calls & SMS → "Call languages": which languages besides English are spoken
// on this business's calls, what language the call summary and action items
// are written in, and which transcript view opens first (lib/call-languages).
// Saved in companies.inbox_settings.call_languages, merged into the latest
// settings so other automatic-reply settings saved meanwhile are kept.

const engine = () => (process.env.GEMINI_API_KEY ? 'gemini' : process.env.DEEPGRAM_API_KEY ? 'deepgram' : process.env.OPENAI_API_KEY ? 'whisper' : null)

export async function GET(req: NextRequest) {
  const companyId = req.nextUrl.searchParams.get('companyId')
  if (!companyId) return NextResponse.json({ error: 'companyId required' }, { status: 400 })
  const db = admin()
  if (!(await requireCompanyAccess(req, db, companyId)).ok) return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
  const { data: co } = await db.from('companies').select('inbox_settings').eq('id', companyId).maybeSingle()
  return NextResponse.json({ ...callLanguageSettings(co?.inbox_settings), engine: engine() })
}

export async function PATCH(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const companyId = body?.companyId
  if (!companyId) return NextResponse.json({ error: 'companyId required' }, { status: 400 })
  const db = admin()
  if (!(await requireCompanyAccess(req, db, companyId)).ok) return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
  const known = new Set<string>(CALL_LANGUAGES.map(l => l.code))
  if (body.languages !== undefined && (!Array.isArray(body.languages) || body.languages.some((c: any) => !known.has(c)))) return NextResponse.json({ error: 'Choose languages from the list.' }, { status: 400 })
  if (body.summary !== undefined && !summaryOptions(Array.isArray(body.languages) ? body.languages : CALL_LANGUAGES.map(l => l.code)).some(s => s.value === body.summary)) return NextResponse.json({ error: 'Choose a summary language.' }, { status: 400 })
  if (body.view !== undefined && !['en', 'roman', 'original'].includes(body.view)) return NextResponse.json({ error: 'Choose a transcript view.' }, { status: 400 })

  const { data: co, error: readErr } = await db.from('companies').select('inbox_settings').eq('id', companyId).maybeSingle()
  if (readErr) return NextResponse.json({ error: readErr.message }, { status: 500 })
  const current = callLanguageSettings(co?.inbox_settings)
  // Normalised through the reader, so a summary in a language that was just
  // switched off falls back to English.
  const next = callLanguageSettings({ call_languages: {
    languages: body.languages ?? current.languages,
    summary: body.summary ?? current.summary,
    view: body.view ?? current.view,
  } })
  const merged = { ...(co?.inbox_settings && typeof co.inbox_settings === 'object' ? co.inbox_settings : {}), call_languages: next }
  const { error } = await db.from('companies').update({ inbox_settings: merged }).eq('id', companyId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ...next, engine: engine() })
}
