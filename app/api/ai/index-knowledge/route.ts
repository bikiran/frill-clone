import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

const strip = (html: string) =>
  String(html || '').replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

// Rebuild what the AI knows from the company's OWN material. Nothing invented,
// nothing from outside the business.
export async function POST(req: NextRequest) {
  try {
    const { companyId } = await req.json()
    if (!companyId) return NextResponse.json({ error: 'companyId required' }, { status: 400 })
    const db = admin()

    const { data: company } = await db.from('companies')
      .select('name, ai_settings, website_domains').eq('id', companyId).maybeSingle()
    const cfg = company?.ai_settings || {}
    const want = cfg.knowledge || {}

    const rows: any[] = []
    const counts: Record<string, number> = {}

    // ── Ideas (what customers ask for, and how the team responded)
    if (want.ideas !== false) {
      const { data } = await db.from('ideas')
        .select('id, title, description, status').eq('company_id', companyId).limit(200)
      for (const i of data || []) {
        rows.push({
          company_id: companyId, source: 'idea', source_id: String(i.id),
          title: i.title,
          content: `${i.title}\n${i.description || ''}\nStatus: ${i.status || 'open'}`.trim(),
        })
      }
      counts.ideas = (data || []).length
    }

    // ── Roadmap
    if (want.roadmap !== false) {
      const { data } = await db.from('ideas')
        .select('id, title, description, status').eq('company_id', companyId)
        .in('status', ['planned', 'in_progress', 'completed']).limit(100)
      for (const r of data || []) {
        rows.push({
          company_id: companyId, source: 'roadmap', source_id: String(r.id),
          title: r.title,
          content: `Roadmap — ${r.status}: ${r.title}\n${r.description || ''}`.trim(),
        })
      }
      counts.roadmap = (data || []).length
    }

    // ── Announcements / changelog
    if (want.announcements !== false) {
      const { data } = await db.from('announcements')
        .select('id, title, content').eq('company_id', companyId).limit(100)
      for (const a of data || []) {
        rows.push({
          company_id: companyId, source: 'announcement', source_id: String(a.id),
          title: a.title, content: `${a.title}\n${strip(a.content || '')}`.trim(),
        })
      }
      counts.announcements = (data || []).length
    }

    // ── Help centre articles — usually the best material for answering
    if (want.help !== false) {
      const { data } = await db.from('help_articles')
        .select('id, title, content').eq('company_id', companyId).limit(300)
      for (const h of data || []) {
        rows.push({
          company_id: companyId, source: 'help', source_id: String(h.id),
          title: h.title, content: `${h.title}\n${strip(h.content || '')}`.trim(),
        })
      }
      counts.help = (data || []).length
    }

    // ── The company's website
    if (want.website && Array.isArray(company?.website_domains) && company.website_domains.length) {
      let pages = 0
      for (const domain of company.website_domains.slice(0, 2)) {
        try {
          const res = await fetch(`https://${domain}`, { headers: { 'User-Agent': 'Colvy/1.0' } })
          if (!res.ok) continue
          const html = await res.text()
          const text = strip(html).slice(0, 8000)
          if (text.length > 200) {
            rows.push({
              company_id: companyId, source: 'website', source_id: domain,
              title: domain, content: text, url: `https://${domain}`,
            })
            pages++
          }
        } catch { /* a site being unreachable shouldn't fail the whole index */ }
      }
      counts.website = pages
    }

    // ── Past conversations — how the team actually answers, in their own words
    if (want.past_chats) {
      const { data: convs } = await db.from('conversations')
        .select('id').eq('company_id', companyId)
        .in('status', ['resolved', 'closed'])
        .order('last_message_at', { ascending: false }).limit(60)

      let learned = 0
      for (const c of convs || []) {
        const { data: msgs } = await db.from('messages')
          .select('sender_type, content, is_ai')
          .eq('conversation_id', c.id)
          .order('created_at', { ascending: true }).limit(20)

        // Only learn from HUMAN answers — otherwise the AI trains on itself and
        // its own mistakes compound.
        const pairs: string[] = []
        const list = msgs || []
        for (let i = 0; i < list.length - 1; i++) {
          const q = list[i], a = list[i + 1]
          if (q.sender_type === 'visitor' && a.sender_type === 'agent' && !a.is_ai) {
            if ((q.content || '').length > 8 && (a.content || '').length > 8) {
              pairs.push(`Customer: ${q.content}\nUs: ${a.content}`)
            }
          }
        }
        if (pairs.length) {
          rows.push({
            company_id: companyId, source: 'chat', source_id: String(c.id),
            title: 'Past conversation',
            content: pairs.slice(0, 6).join('\n\n'),
          })
          learned++
        }
      }
      counts.past_chats = learned
    }

    // Replace the index wholesale — stale answers are worse than none.
    await db.from('ai_knowledge').delete().eq('company_id', companyId)
    if (rows.length) {
      // Insert in batches to stay well inside statement limits.
      for (let i = 0; i < rows.length; i += 100) {
        const batch = rows.slice(i, i + 100)
        const { error } = await db.from('ai_knowledge').insert(batch)
        if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      }
    }

    return NextResponse.json({ ok: true, indexed: rows.length, counts })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

// GET → what's currently indexed
export async function GET(req: NextRequest) {
  try {
    const companyId = req.nextUrl.searchParams.get('companyId')
    if (!companyId) return NextResponse.json({ error: 'companyId required' }, { status: 400 })
    const db = admin()
    const { data } = await db.from('ai_knowledge')
      .select('source, indexed_at').eq('company_id', companyId)

    const counts: Record<string, number> = {}
    let latest: string | null = null
    for (const r of data || []) {
      counts[r.source] = (counts[r.source] || 0) + 1
      if (!latest || r.indexed_at > latest) latest = r.indexed_at
    }
    return NextResponse.json({ total: (data || []).length, counts, lastIndexedAt: latest })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
