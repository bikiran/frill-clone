import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

// POST { slug, subject, message, email, name?, articleId? }
// Public help-centre ticket submission. Resolves the company by slug and writes
// a support_ticket mapped to the real schema (there is no email/message column,
// so the requester's details go into the description).
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}))
    const slug = String(body.slug || '').trim().toLowerCase()
    const subject = String(body.subject || '').trim()
    const message = String(body.message || '').trim()
    const email = String(body.email || '').trim()
    const name = String(body.name || '').trim()
    if (!slug) return NextResponse.json({ error: 'Missing workspace' }, { status: 400 })
    if (!subject) return NextResponse.json({ error: 'A subject is required.' }, { status: 400 })
    if (!email) return NextResponse.json({ error: 'Your email is required.' }, { status: 400 })

    const db = admin()
    // `slug` may be a real slug (colvy subdomain) or a custom domain host.
    let { data: co } = await db.from('companies').select('id').eq('slug', slug).maybeSingle()
    if (!co?.id) {
      const { data: byHelp } = await db.from('companies').select('id').eq('help_domain', slug).maybeSingle()
      co = byHelp || null
    }
    if (!co?.id) {
      const { data: byBoard } = await db.from('companies').select('id').eq('board_domain', slug).maybeSingle()
      co = byBoard || null
    }
    if (!co?.id) return NextResponse.json({ error: 'Workspace not found' }, { status: 404 })

    const ticketNumber = `TICK-${Date.now().toString().slice(-6)}`
    const description = `${message || '(no message)'}\n\n— From: ${name || 'Anonymous'} <${email}>${body.articleId ? `\nArticle: ${body.articleId}` : ''}`

    const { error } = await db.from('support_tickets').insert({
      company_id: co.id, ticket_number: ticketNumber, subject, description,
      priority: 'normal', status: 'open',
    })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json({ ok: true, ticketNumber })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Failed' }, { status: 500 })
  }
}
