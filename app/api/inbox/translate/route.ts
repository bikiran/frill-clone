import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireCompanyAccess } from '@/lib/company-access'
import { detectAndTranslate, translateReply } from '@/lib/translate'
import { languageName, hasRomanForm } from '@/lib/call-languages'

export const dynamic = 'force-dynamic'

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

// The inbox's Translate buttons.
//   POST { companyId, messageId }
//     → a message in English for the team (saved on the message, so everyone
//       sees it): { lang, translated } (translated null when it's English).
//   POST { companyId, text, to, roman? }
//     → a reply the team typed, in the customer's language `to` (ISO code):
//       { translated, language }.
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const companyId = body?.companyId
  const db = admin()
  if (!companyId || !(await requireCompanyAccess(req, db, companyId)).ok) return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
  if (!process.env.ANTHROPIC_API_KEY) return NextResponse.json({ error: 'Translation isn’t set up yet.' }, { status: 503 })

  if (body.messageId) {
    const { data: msg } = await db.from('messages').select('id, content, conversation_id').eq('id', body.messageId).maybeSingle()
    if (!msg) return NextResponse.json({ error: 'Message not found' }, { status: 404 })
    const { data: conv } = await db.from('conversations').select('company_id').eq('id', msg.conversation_id).maybeSingle()
    if (conv?.company_id !== companyId) return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
    if (!String(msg.content || '').trim()) return NextResponse.json({ lang: null, translated: null })
    const { lang, translated } = await detectAndTranslate(msg.content)
    await db.from('messages').update({ content_lang: lang || 'unknown', ...(translated ? { translated_content: translated } : {}) }).eq('id', msg.id)
    return NextResponse.json({ lang, translated, language: lang ? languageName(lang) : null })
  }

  const text = String(body.text || '').trim()
  const to = String(body.to || '').toLowerCase().slice(0, 12)
  if (!text) return NextResponse.json({ error: 'Type a reply first.' }, { status: 400 })
  if (!to || to.startsWith('en')) return NextResponse.json({ error: 'Choose a language to translate to.' }, { status: 400 })
  if (text.length > 4000) return NextResponse.json({ error: 'That’s too long to translate in one go.' }, { status: 400 })
  const { data: co } = await db.from('companies').select('name').eq('id', companyId).maybeSingle()
  const language = languageName(to)
  const translated = await translateReply(text, language, { roman: !!body.roman && hasRomanForm(to), business: co?.name || null, companyId })
  if (!translated) return NextResponse.json({ error: 'Couldn’t translate that just now. Try again.' }, { status: 502 })
  return NextResponse.json({ translated, language })
}
