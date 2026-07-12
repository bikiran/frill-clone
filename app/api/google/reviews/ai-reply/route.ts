import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

// Drafts a reply to a Google review. The agent always reviews and edits it
// before it's posted — we never auto-publish an AI reply.
export async function POST(req: NextRequest) {
  try {
    const { companyId, reviewId } = await req.json()
    if (!companyId || !reviewId) return NextResponse.json({ error: 'companyId and reviewId required' }, { status: 400 })

    const key = process.env.ANTHROPIC_API_KEY
    if (!key) return NextResponse.json({ error: 'AI is not configured (ANTHROPIC_API_KEY missing).' }, { status: 500 })

    const db = admin()
    const { data: review } = await db.from('google_reviews')
      .select('*').eq('company_id', companyId).eq('review_id', reviewId).maybeSingle()
    if (!review) return NextResponse.json({ error: 'Review not found' }, { status: 404 })

    const { data: company } = await db.from('companies').select('name').eq('id', companyId).maybeSingle()
    const business = company?.name || 'our business'

    const prompt = `You are writing a public reply, on behalf of ${business}, to a Google review.

Reviewer: ${review.reviewer_name || 'A customer'}
Rating: ${review.star_rating || '?'} out of 5 stars
Review: "${review.comment || '(no written comment)'}"

Write a reply that:
- Thanks them by first name if we have it
- Sounds like a real person from the business, not a template
- Is 2-3 sentences, warm but not gushing
- If the rating is 3 stars or below, acknowledges the problem specifically and invites them to get in touch to put it right — do not be defensive
- Does not invent facts, offers, or details we haven't been told
- Contains no placeholders

Reply with ONLY the reply text, nothing else.`

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 400,
        messages: [{ role: 'user', content: prompt }],
      }),
    })

    const data = await res.json()
    if (!res.ok) return NextResponse.json({ error: data?.error?.message || 'AI request failed' }, { status: 502 })

    const text = (data.content || []).map((c: any) => (c.type === 'text' ? c.text : '')).join('').trim()
    return NextResponse.json({ ok: true, reply: text })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
