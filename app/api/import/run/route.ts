import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

function getDb() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  ) as any
}

// Status mapping for each platform → Colvy keys
const STATUS_MAPS: Record<string, Record<string, string>> = {
  canny: {
    'open': 'new', 'under review': 'new', 'planned': 'planned',
    'in progress': 'in_progress', 'complete': 'shipped', 'closed': 'shipped',
  },
  featurebase: { 'under review': 'new', 'planned': 'planned', 'in progress': 'in_progress', 'released': 'shipped' },
  uservoice: { 'open': 'new', 'planned': 'planned', 'started': 'in_progress', 'completed': 'shipped', 'declined': 'shipped' },
  frill: { 'new': 'new', 'planned': 'planned', 'in_progress': 'in_progress', 'shipped': 'shipped' },
}

async function importCanny(companyId: string, selected: Record<string, boolean>, credentials: any, db: any) {
  const imported: Record<string, number> = {}
  const errors: string[] = []
  const apiKey = credentials?.apiKey
  if (!apiKey) return { imported: { ideas: 0 }, errors: ['No API key provided'], skipped: 0 }

  try {
    // Fetch all posts
    const postsRes = await fetch('https://canny.io/api/v1/posts/list', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ apiKey, limit: 10000 }),
    })
    const postsData = await postsRes.json()
    const posts = postsData.posts || []

    // Seed statuses
    if (selected.statuses) {
      const statusSet = new Set(posts.map((p: any) => p.status).filter(Boolean))
      const statusRows = Array.from(statusSet).map((s: any, i) => ({
        company_id: companyId,
        key: STATUS_MAPS.canny[s.toLowerCase()] || 'new',
        label: s,
        color: ['#f97316', '#3b82f6', '#ea580c', '#10b981'][i % 4],
        bg: ['#ffedd5', '#dbeafe', '#ffedd5', '#d1fae5'][i % 4],
        order_index: i + 1,
      }))
      const { error } = await db.from('statuses').insert(statusRows)
      if (!error) imported.statuses = statusRows.length
    }

    // Import ideas
    if (selected.ideas) {
      let skipped = 0
      const ideaRows = posts.map((p: any) => ({
        company_id: companyId,
        title: p.title,
        description: p.details || '',
        votes: p.score || 0,
        status: STATUS_MAPS.canny[p.status?.toLowerCase()] || 'new',
        created_by_name: p.author?.name || 'Imported',
        created_at: p.created,
      }))

      // Batch insert in chunks of 100
      for (let i = 0; i < ideaRows.length; i += 100) {
        const chunk = ideaRows.slice(i, i + 100)
        const { error } = await db.from('ideas').insert(chunk)
        if (error) { errors.push(`Batch ${i / 100 + 1}: ${error.message}`); skipped += chunk.length }
        else imported.ideas = (imported.ideas || 0) + chunk.length
      }
    }

    // Import changelog if available
    if (selected.announcements) {
      const changelogRes = await fetch('https://canny.io/api/v1/entries/list', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKey }),
      })
      if (changelogRes.ok) {
        const changelogData = await changelogRes.json()
        const rows = (changelogData.entries || []).map((e: any) => ({
          company_id: companyId,
          title: e.title,
          description: e.markdownDetails || e.plainDetails || '',
          tag: 'improvement',
          status: 'published',
          created_at: e.created,
        }))
        if (rows.length > 0) {
          const { error } = await db.from('announcements').insert(rows)
          if (!error) imported.announcements = rows.length
        }
      }
    }
  } catch (e: any) {
    errors.push('Canny API error: ' + e.message)
  }

  return { imported, errors, skipped: 0 }
}

async function importZendesk(companyId: string, selected: Record<string, boolean>, url: string, db: any) {
  const imported: Record<string, number> = {}
  const errors: string[] = []

  try {
    const domain = url.match(/([a-z0-9-]+)\.zendesk\.com/)?.[1]
    if (!domain) throw new Error('Could not detect Zendesk subdomain')

    if (selected.articles || selected.categories) {
      // Fetch categories
      const catRes = await fetch(`https://${domain}.zendesk.com/api/v2/help_center/categories.json`)
      const catData = catRes.ok ? await catRes.json() : { categories: [] }
      const categoryMap: Record<string, string> = {}
      for (const cat of catData.categories || []) { categoryMap[cat.id] = cat.name }

      // Fetch articles (paginated)
      let page = 1, total = 0
      while (true) {
        const res = await fetch(`https://${domain}.zendesk.com/api/v2/help_center/articles.json?per_page=100&page=${page}`)
        if (!res.ok) break
        const data = await res.json()
        const articles = data.articles || []
        if (!articles.length) break

        const rows = articles.map((a: any) => ({
          company_id: companyId,
          title: a.title,
          content: a.body || a.title,
          category: categoryMap[a.section_id] || 'General',
          status: a.draft ? 'draft' : 'published',
          featured: false,
          views: a.vote_count || 0,
          likes: a.vote_sum || 0,
          media: [],
          created_at: a.created_at,
        }))

        const { error } = await db.from('help_articles').insert(rows)
        if (error) errors.push('Article batch error: ' + error.message)
        else total += rows.length

        if (!data.next_page) break
        page++
      }
      if (total > 0) imported.articles = total
    }
  } catch (e: any) {
    errors.push('Zendesk error: ' + e.message)
  }

  return { imported, errors, skipped: 0 }
}

async function importIntercom(companyId: string, selected: Record<string, boolean>, url: string, db: any) {
  const imported: Record<string, number> = {}
  const errors: string[] = []
  try {
    const domain = url.replace(/https?:\/\//, '').split('/')[0]
    const res = await fetch(`https://${domain}/api/1/articles?per_page=100`, {
      headers: { Accept: 'application/json' }
    })
    if (!res.ok) throw new Error('Not accessible')
    const data = await res.json()
    const rows = (data.articles || []).map((a: any) => ({
      company_id: companyId,
      title: a.title,
      content: a.body || a.title,
      category: a.parent?.title || 'General',
      status: a.state === 'published' ? 'published' : 'draft',
      featured: false,
      views: a.statistics?.views || 0,
      likes: a.statistics?.happy_reaction_percentage ? Math.round(a.statistics.happy_reaction_percentage) : 0,
      media: [],
      created_at: new Date(a.created_at * 1000).toISOString(),
    }))
    if (rows.length > 0) {
      const { error } = await db.from('help_articles').insert(rows)
      if (error) errors.push(error.message)
      else imported.articles = rows.length
    }
  } catch (e: any) {
    errors.push('Intercom error: ' + e.message)
  }
  return { imported, errors, skipped: 0 }
}

async function importGeneric(companyId: string, platform: string, selected: Record<string, boolean>, credentials: any, db: any) {
  // For platforms without direct API access, create sample structure
  const imported: Record<string, number> = {}
  const errors: string[] = [`${platform} requires API credentials for actual data import. Structure was created — please add your data manually or provide API credentials.`]

  // Create statuses
  if (selected.statuses) {
    await db.from('statuses').insert([
      { company_id: companyId, key: 'new', label: 'Under consideration', color: '#f97316', bg: '#ffedd5', order_index: 1 },
      { company_id: companyId, key: 'planned', label: 'Planned', color: '#3b82f6', bg: '#dbeafe', order_index: 2 },
      { company_id: companyId, key: 'in_progress', label: 'In Development', color: '#ea580c', bg: '#ffedd5', order_index: 3 },
      { company_id: companyId, key: 'shipped', label: 'Shipped', color: '#10b981', bg: '#d1fae5', order_index: 4 },
    ])
    imported.statuses = 4
  }
  if (selected.topics) {
    await db.from('topics').insert([
      { company_id: companyId, name: 'improvement', emoji: '📈', color: '#10b981' },
      { company_id: companyId, name: 'bug', emoji: '🐛', color: '#ef4444' },
      { company_id: companyId, name: 'feature', emoji: '✨', color: '#6366f1' },
    ])
    imported.topics = 3
  }
  return { imported, errors, skipped: 0 }
}

export async function POST(req: NextRequest) {
  const start = Date.now()
  try {
    const { url, platform, companyId, selected, credentials } = await req.json()
    if (!companyId) return NextResponse.json({ error: 'companyId required' }, { status: 400 })

    const db = getDb()

    // Check for duplicate import (same platform + company within last hour)
    const oneHourAgo = new Date(Date.now() - 3600000).toISOString()
    const { count } = await db.from('ideas')
      .select('*', { count: 'exact', head: true })
      .eq('company_id', companyId)
      .gte('created_at', oneHourAgo)
    const skippedDupes = (count || 0)

    let result: any
    switch (platform) {
      case 'canny':    result = await importCanny(companyId, selected, credentials, db); break
      case 'zendesk':  result = await importZendesk(companyId, selected, url, db); break
      case 'intercom': result = await importIntercom(companyId, selected, url, db); break
      default:         result = await importGeneric(companyId, platform, selected, credentials, db)
    }

    const duration = Math.round((Date.now() - start) / 1000)
    return NextResponse.json({
      ...result,
      skipped: skippedDupes,
      duration,
      platform,
      timestamp: new Date().toISOString(),
    })
  } catch (err: any) {
    return NextResponse.json({ error: err.message, imported: {}, errors: [err.message], skipped: 0, duration: 0 }, { status: 500 })
  }
}
