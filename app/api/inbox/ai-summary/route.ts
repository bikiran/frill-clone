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
        model: 'claude-3-5-haiku-20241022',
        max_tokens: 400,
        messages: [{
          role: 'user',
          content: `Summarize this customer support conversation in 1-2 sentences, then list any action items for the support agent. Respond ONLY with JSON in this exact format: {"summary": "...", "todos": ["...", "..."]}\n\nConversation:\n${transcript}`,
        }],
      }),
    })

    if (!res.ok) {
      const err = await res.text()
      return NextResponse.json({ error: 'AI request failed', detail: err }, { status: 500 })
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
