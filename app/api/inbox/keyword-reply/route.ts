import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

// Answer common questions automatically. When a customer's message matches a
// configured keyword rule ("opening hours", "where are you located"), Colvy
// posts the saved answer straight into the chat.
//
// Deliberately conservative: it only fires on a real keyword match, only once
// per rule per conversation, and never guesses. If nothing matches, it stays
// quiet and a human answers.
export async function POST(req: NextRequest) {
  try {
    const { conversationId, text, companyId } = await req.json()
    if (!conversationId || !text) return NextResponse.json({ ok: true, matched: false })

    const db = admin()

    // Resolve the company from the conversation if not supplied.
    let cid = companyId
    let conv: any = null
    {
      const { data } = await db.from('conversations').select('id, company_id').eq('id', conversationId).maybeSingle()
      conv = data
      cid = cid || conv?.company_id
    }
    if (!cid) return NextResponse.json({ ok: true, matched: false })

    const { data: rules } = await db.from('keyword_replies')
      .select('*').eq('company_id', cid).eq('is_active', true)
    if (!rules?.length) return NextResponse.json({ ok: true, matched: false })

    const message = String(text).toLowerCase()

    // Find the rule with the longest matching keyword — the most specific wins,
    // so "what time do you close" beats a generic "time".
    let best: any = null
    let bestLen = 0
    for (const r of rules) {
      for (const kw of (r.keywords || [])) {
        const k = String(kw).toLowerCase().trim()
        if (!k) continue
        if (message.includes(k) && k.length > bestLen) { best = r; bestLen = k.length }
      }
    }
    if (!best) return NextResponse.json({ ok: true, matched: false })

    // Don't repeat ourselves within a conversation.
    if (best.once_per_conversation !== false) {
      const { data: hit } = await db.from('keyword_reply_hits')
        .select('id').eq('conversation_id', conversationId).eq('keyword_reply_id', best.id).maybeSingle()
      if (hit) return NextResponse.json({ ok: true, matched: false, reason: 'already answered' })
    }

    const { data: company } = await db.from('companies').select('name').eq('id', cid).maybeSingle()

    await db.from('messages').insert({
      conversation_id: conversationId,
      company_id: cid,
      sender_type: 'agent',
      sender_name: company?.name || 'Support',
      content: best.reply,
      message_type: 'text',
      metadata: { auto: true, keyword_reply: true, rule_id: best.id },
    })

    await db.from('conversations').update({
      last_message: String(best.reply).slice(0, 200),
      last_message_at: new Date().toISOString(),
    }).eq('id', conversationId)

    try {
      await db.from('keyword_reply_hits').insert({
        company_id: cid, conversation_id: conversationId, keyword_reply_id: best.id,
      })
      await db.from('keyword_replies').update({ match_count: (best.match_count || 0) + 1 }).eq('id', best.id)
    } catch {}

    return NextResponse.json({ ok: true, matched: true, rule: best.name })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message })
  }
}
