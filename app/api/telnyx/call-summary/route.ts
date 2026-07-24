import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

// Summarize a call from its transcription. If there's no transcription yet,
// returns a graceful message. Uses Claude Haiku (same pattern as chat summaries).
export async function POST(req: NextRequest) {
  try {
    const { callId, transcription } = await req.json()
    const db = admin()

    let text = transcription
    if (!text && callId) {
      const { data: call } = await db.from('calls').select('transcription').eq('id', callId).maybeSingle()
      text = call?.transcription
    }
    if (!text) return NextResponse.json({ summary: 'No transcript available for this call yet.' })

    const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY
    if (!ANTHROPIC_KEY) {
      return NextResponse.json({ summary: text.slice(0, 200) })
    }

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': ANTHROPIC_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({
        model: 'claude-3-5-haiku-20241022',
        max_tokens: 350,
        messages: [{
          role: 'user',
          content: `Summarize this phone call between a support agent and a customer in 1-2 sentences, then list any follow-up action items. Respond ONLY with JSON: {"summary":"...","todos":["..."]}\n\nTranscript:\n${text}`,
        }],
      }),
    })
    if (!res.ok) return NextResponse.json({ summary: 'AI summary unavailable.' })
    const data = await res.json()
    const out = (data.content?.[0]?.text || '').replace(/```json|```/g, '').trim()
    try {
      const parsed = JSON.parse(out)
      if (callId) {
        // Persist todos and sentiment too — both are shown on the call detail
        // screen, and previously only the summary was stored.
        const sentiment = ['positive', 'neutral', 'negative']
          .includes(String(parsed.sentiment || '').toLowerCase())
          ? String(parsed.sentiment).toLowerCase()
          : null

        await db.from('calls').update({
          ai_summary: parsed.summary,
          ai_todos: Array.isArray(parsed.todos) ? parsed.todos : [],
          ...(sentiment ? { sentiment } : {}),
        }).eq('id', callId)
      }
      return NextResponse.json({
        summary: parsed.summary,
        todos: parsed.todos || [],
        sentiment: parsed.sentiment || null,
      })
    } catch {
      return NextResponse.json({ summary: out.slice(0, 300) })
    }
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
