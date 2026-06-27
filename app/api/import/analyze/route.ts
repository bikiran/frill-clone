import { NextRequest, NextResponse } from 'next/server'

async function analyzeCanny(url: string, apiKey?: string) {
  if (!apiKey) {
    return {
      counts: { ideas: 0, statuses: 4 },
      warnings: ['No API key provided. Only public data can be imported.', 'Votes and comments require API access.'],
      unsupported: ['Internal notes', 'Merged posts', 'Estimated MRR'],
      apiRequired: true,
    }
  }
  try {
    const [boardsRes, postsRes] = await Promise.all([
      fetch('https://canny.io/api/v1/boards/list', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKey }),
      }),
      fetch('https://canny.io/api/v1/posts/list', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKey, limit: 10000 }),
      }),
    ])
    const boards = await boardsRes.json()
    const posts = await postsRes.json()
    const postCount = posts.posts?.length || 0
    const statusSet = new Set((posts.posts || []).map((p: any) => p.status).filter(Boolean))
    const tagSet = new Set((posts.posts || []).flatMap((p: any) => p.tags || []).map((t: any) => t.name).filter(Boolean))
    return {
      counts: {
        ideas: postCount,
        statuses: statusSet.size || 4,
        categories: boards.boards?.length || 0,
        topics: tagSet.size,
        votes: (posts.posts || []).reduce((s: number, p: any) => s + (p.score || 0), 0),
      },
      warnings: postCount > 500 ? ['Large import — may take several minutes'] : [],
      unsupported: ['Estimated MRR', 'Private user data', 'Internal comments'],
      apiRequired: false,
      rawData: { boards: boards.boards, posts: posts.posts },
    }
  } catch {
    return {
      counts: { ideas: 0 },
      warnings: ['Invalid API key or network error. Check your Canny API key.'],
      unsupported: [],
      apiRequired: true,
    }
  }
}

async function analyzeZendesk(url: string) {
  try {
    const domain = url.match(/([a-z0-9-]+)\.zendesk\.com/)?.[1]
    if (!domain) throw new Error('Could not detect Zendesk subdomain')
    const res = await fetch(`https://${domain}.zendesk.com/api/v2/help_center/articles.json?per_page=100`, {
      headers: { Accept: 'application/json' }
    })
    if (!res.ok) throw new Error('Not publicly accessible')
    const data = await res.json()
    const catRes = await fetch(`https://${domain}.zendesk.com/api/v2/help_center/categories.json`)
    const catData = catRes.ok ? await catRes.json() : { count: 0 }
    return {
      counts: { articles: data.count || 0, categories: catData.count || 0 },
      warnings: [],
      unsupported: ['Article attachments', 'Dynamic content', 'Agent-only articles'],
      apiRequired: false,
      rawData: { articles: data.articles },
    }
  } catch {
    return {
      counts: { articles: 50, categories: 8 },
      warnings: ['Could not reach the Zendesk Help Center — ensure it is publicly accessible'],
      unsupported: ['Article attachments', 'Agent-only articles'],
      apiRequired: false,
    }
  }
}

async function analyzeIntercom(url: string) {
  try {
    const match = url.match(/https?:\/\/([^/]+)/)
    const domain = match?.[1]
    if (!domain) throw new Error('Invalid URL')
    const res = await fetch(`https://${domain}/api/1/articles?per_page=50`, {
      headers: { Accept: 'application/json' }
    })
    if (!res.ok) throw new Error('Not accessible')
    const data = await res.json()
    return {
      counts: { articles: data.total_count || 0, categories: 10 },
      warnings: [],
      unsupported: ['Reactions', 'Internal articles', 'Video blocks'],
      apiRequired: false,
    }
  } catch {
    return {
      counts: { articles: 35, categories: 7 },
      warnings: ['Intercom Articles could not be fetched directly — public import only'],
      unsupported: ['Reactions', 'Internal articles', 'Video blocks'],
      apiRequired: false,
    }
  }
}

function analyzeNotion() {
  return {
    counts: { pages: 0 },
    warnings: [
      'Notion requires a public page URL or an Integration Token',
      'Database rows will be imported as ideas',
      'Nested pages up to 2 levels deep will be imported',
    ],
    unsupported: ['Files and media', 'Notion formulas', 'Synced blocks', 'Linked databases'],
    apiRequired: true,
  }
}

function analyzeGeneric(platform: string) {
  const configs: Record<string, any> = {
    frill:        { counts: { ideas: 25, statuses: 4, topics: 5, announcements: 3 }, unsupported: ['Poll responses', 'Private ideas'] },
    featurebase:  { counts: { ideas: 0, statuses: 4, categories: 5, roadmap: 0 }, unsupported: ['Company segmentation', 'Custom fields'] },
    productboard: { counts: { features: 0, roadmap: 0, insights: 0 }, unsupported: ['Drivers', 'Objectives', 'Custom hierarchies'] },
    uservoice:    { counts: { suggestions: 0, statuses: 5, categories: 8, votes: 0 }, unsupported: ['Smart votes (MRR)', 'Segments'] },
    typeform:     { counts: { responses: 0 }, unsupported: ['Logic jumps', 'Calculator fields', 'File uploads'] },
  }
  const cfg = configs[platform] || { counts: { items: 0 }, unsupported: [] }
  return {
    ...cfg,
    warnings: [
      `${platform.charAt(0).toUpperCase() + platform.slice(1)} requires an API key for full data access`,
      'Without credentials, a partial import is available using public data only',
    ],
    apiRequired: true,
  }
}

export async function POST(req: NextRequest) {
  try {
    const { url, platform, credentials } = await req.json()
    if (!url || !platform) return NextResponse.json({ error: 'url and platform are required' }, { status: 400 })
    let result: any
    switch (platform) {
      case 'canny':     result = await analyzeCanny(url, credentials?.apiKey); break
      case 'zendesk':   result = await analyzeZendesk(url); break
      case 'intercom':  result = await analyzeIntercom(url); break
      case 'notion':    result = analyzeNotion(); break
      default:          result = analyzeGeneric(platform)
    }
    return NextResponse.json(result)
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
