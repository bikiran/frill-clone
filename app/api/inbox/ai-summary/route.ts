import { NextRequest, NextResponse } from 'next/server'
import { guardAiRequest } from '@/lib/rate-limit'
import { modelFor, trackAi } from '@/lib/ai-models'
import { createClient } from '@supabase/supabase-js'
import { ACTION_ITEMS_GUIDE, loadOpenTasks, openTasksForSummaryPrompt, refineActionItemsDetailed, type OpenTask } from '@/lib/task-dedupe'

// Open tasks for this conversation's customer (when the caller says which
// conversation), so the summary adds to them instead of proposing them again.
async function openTasksFor(companyId: string, conversationId: unknown): Promise<{ openTasks: OpenTask[]; contactName: string | null }> {
  if (typeof conversationId !== 'string' || !conversationId || !process.env.NEXT_PUBLIC_SUPABASE_URL) return { openTasks: [], contactName: null }
  try {
    const db: any = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { autoRefreshToken: false, persistSession: false } })
    const { data: conv } = await db.from('conversations').select('id, contact_id').eq('company_id', companyId).eq('id', conversationId).maybeSingle()
    if (!conv) return { openTasks: [], contactName: null }
    const [openTasks, ct] = await Promise.all([
      loadOpenTasks(db, { companyId, conversationId, contactId: conv.contact_id || null }),
      conv.contact_id ? db.from('contacts').select('name').eq('company_id', companyId).eq('id', conv.contact_id).maybeSingle() : Promise.resolve({ data: null }),
    ])
    return { openTasks, contactName: (ct as any)?.data?.name || null }
  } catch { return { openTasks: [], contactName: null } }
}

// Generates a short summary + action items for a conversation using Claude.
// Falls back gracefully if no API key is configured.
export async function POST(req: NextRequest) {
  try {
    const { companyId, messages, conversationId } = await req.json()
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

    const { openTasks, contactName } = await openTasksFor(companyId, conversationId)
    const transcript = capped.map((m: any) => `${m.role === 'agent' ? 'Agent' : 'Customer'}: ${m.content}`).join('\n')

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': ANTHROPIC_KEY,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: await modelFor('conversation_summary'),
        max_tokens: 600,
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
Write each step as a short imperative starting with a verb (e.g. "Send photos of the 4-5cm oranda", "Follow up with Cathy once stock arrives").

${ACTION_ITEMS_GUIDE}${openTasksForSummaryPrompt(openTasks)}

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
    await trackAi('conversation_summary', companyId, data)
    const text = data.content?.[0]?.text || ''
    // Parse the JSON out of the response
    const clean = text.replace(/```json|```/g, '').trim()
    try {
      const parsed = JSON.parse(clean)
      // One item per job (related steps grouped), minus jobs an open task already has every step of.
      const refined = refineActionItemsDetailed(parsed.todos || [], { contactName, openTasks })
      if (refined.covered.length) console.info('[ai-summary] already open tasks, not proposed again:', refined.covered.map(c => `${c.item} → ${c.taskTitle}`).join(' | '))
      // `at`: when these were generated — the Draft tasks card's place in the thread.
      const at = new Date().toISOString()
      return NextResponse.json({
        summary: parsed.summary || 'No summary available.',
        todos: refined.items.map((t: string) => ({ text: t, done: false, at })),
        alreadyTasks: refined.covered,
      })
    } catch {
      return NextResponse.json({ summary: text.slice(0, 300), todos: [] })
    }
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
