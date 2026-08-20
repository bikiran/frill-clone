import { NextRequest, NextResponse } from 'next/server'
import { guardAiRequest } from '@/lib/rate-limit'

// Generates a short summary + action items for a conversation using Claude.
// Falls back gracefully if no API key is configured.
export async function POST(req: NextRequest) {
  try {
    const { companyId, messages } = await req.json()
    if (!Array.isArray(messages) || messages.length === 0) {
      return NextResponse.json({ error: 'No messages to summarize' }, { status: 400 })
    }

    const guard = await guardAiRequest(req, companyId, 'ai-summary')
    if (!guard.ok) return guard.response!

    // Cap the input as well: an enormous transcript is expensive, and nothing
    // useful is lost by summarising the most recent stretch of a conversation.
    const capped = messages.slice(-80)

    const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY
    if (!ANTHROPIC_KEY) {
      // Simple heuristic fallback — first visitor message as summary
      const firstVisitor = messages.find((m: any) => m.role === 'visitor')
      return NextResponse.json({
        summary: firstVisitor ? `Customer enquiry: ${firstVisitor.content.slice(0, 140)}` : 'Conversation in progress.',
        todos: [],
      })
    }

    const transcript = capped.map((m: any) => `${m.role === 'agent' ? 'Agent' : 'Customer'}: ${m.content}`).join('\n')

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': ANTHROPIC_KEY,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5',
        max_tokens: 400,
        messages: [{
          role: 'user',
          content: `You are assisting a customer-support agent.

1. Summarize this conversation in 1-2 sentences.
2. Extract concrete ACTION ITEMS the agent still needs to do — things the conversation implies are outstanding. Look especially for:
   • follow-ups / call-backs ("get back to them", "check and reply", "let them know when…")
   • photo / video / media requests (either party asked for or promised an image)
   • order-related actions (place, change, refund, track, chase, confirm an order)
   • stock / availability checks with a supplier
   • sending a link, quote, invoice, or booking
Write each action item as a short imperative task starting with a verb (e.g. "Send photos of the 4-5cm oranda", "Follow up with Cathy once stock arrives"). Only include real, outstanding actions — return an empty list if there are none. Do not invent tasks.

Respond ONLY with JSON in this exact format: {"summary": "...", "todos": ["...", "..."]}

Conversation:
${transcript}`,
        }],
      }),
    })

    if (!res.ok) {
      const err = await res.text()
      // Surface the real reason (status + Anthropic's message) so a bad key,
      // exhausted credits, or a retired model is diagnosable from the device
      // instead of a generic "AI request failed". Log the full body server-side.
      console.error('[ai-summary] anthropic error', res.status, err)
      let detail = err
      try { detail = JSON.parse(err)?.error?.message || err } catch {}
      return NextResponse.json({ error: `AI request failed (${res.status})`, detail: String(detail).slice(0, 300) }, { status: 502 })
    }

    const data = await res.json()
    const text = data.content?.[0]?.text || ''
    // Parse the JSON out of the response
    const clean = text.replace(/```json|```/g, '').trim()
    try {
      const parsed = JSON.parse(clean)
      return NextResponse.json({
        summary: parsed.summary || 'No summary available.',
        todos: (parsed.todos || []).map((t: string) => ({ text: t, done: false })),
      })
    } catch {
      return NextResponse.json({ summary: text.slice(0, 300), todos: [] })
    }
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
