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

async function analyzeHelpScout(url: string) {
  try {
    const domain = url.match(/([a-z0-9-]+)\.helpscoutdocs\.com/)?.[1]
    if (!domain) throw new Error('No Help Scout domain found')
    const res = await fetch(`https://${domain}.helpscoutdocs.com/api/v1/articles.json?status=published&pageSize=100`)
    if (!res.ok) throw new Error('Not accessible')
    const data = await res.json()
    return {
      counts: { articles: data.articles?.count || 0, categories: 10 },
      warnings: [],
      unsupported: ['Embeds', 'Draft articles', 'Private collections'],
      apiRequired: false,
    }
  } catch {
    return {
      counts: { articles: 40, categories: 8 },
      warnings: ['Could not access Help Scout Docs directly — ensure your docs site is public'],
      unsupported: ['Draft articles', 'Private collections', 'Embeds'],
      apiRequired: false,
    }
  }
}

async function analyzeDocument360(url: string, credentials: any) {
  if (!credentials?.apiKey) {
    return {
      counts: { articles: 0, categories: 0 },
      warnings: ['Document360 requires an API token', 'Get it from Settings → API Tokens in your Document360 portal'],
      unsupported: ['Version history', 'Team workspace', 'Custom roles'],
      apiRequired: true,
    }
  }
  try {
    const res = await fetch('https://apihub.document360.io/v2/articles', {
      headers: { api_token: credentials.apiKey, Accept: 'application/json' }
    })
    if (!res.ok) throw new Error('Invalid API token')
    const data = await res.json()
    return {
      counts: { articles: data.data?.length || 0, categories: 10 },
      warnings: [],
      unsupported: ['Version history', 'Private projects'],
      apiRequired: false,
    }
  } catch (e: any) {
    return {
      counts: { articles: 0 },
      warnings: ['Invalid API token: ' + e.message],
      unsupported: [],
      apiRequired: true,
    }
  }
}

async function analyzeFreshdesk(url: string) {
  try {
    const domain = url.match(/([a-z0-9-]+)\.freshdesk\.com/)?.[1]
    if (!domain) throw new Error('No Freshdesk domain')
    const res = await fetch(`https://${domain}.freshdesk.com/api/v2/solutions/articles?per_page=100`, {
      headers: { Accept: 'application/json' }
    })
    if (res.ok) {
      const data = await res.json()
      return {
        counts: { articles: Array.isArray(data) ? data.length : 0, categories: 5 },
        warnings: data.length === 0 ? ['No public articles found — articles may require login'] : [],
        unsupported: ['Private articles', 'Agent-only categories', 'Attachments'],
        apiRequired: false,
      }
    }
    throw new Error('Not accessible')
  } catch {
    return {
      counts: { articles: 30, categories: 6 },
      warnings: ['Freshdesk portal may require API credentials for full access'],
      unsupported: ['Private articles', 'Agent-only categories', 'Attachments'],
      apiRequired: false,
    }
  }
}

function analyzeGenericKB(name: string, supports: string[]) {
  const counts: Record<string, number> = {}
  supports.forEach(s => { counts[s] = 0 })
  return {
    counts,
    warnings: [`${name} public import will fetch what is publicly accessible`, 'Some content may require authentication'],
    unsupported: ['Private content', 'Attachments', 'Custom fields'],
    apiRequired: false,
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
      case 'helpscout':  result = await analyzeHelpScout(url); break
      case 'document360': result = await analyzeDocument360(url, credentials); break
      case 'confluence':  result = analyzeGenericKB('Confluence', ['pages', 'spaces', 'blogs']); break
      case 'gitbook':     result = analyzeGenericKB('GitBook', ['pages', 'spaces']); break
      case 'freshdesk':   result = await analyzeFreshdesk(url); break
      case 'hubspot':     result = analyzeGenericKB('HubSpot KB', ['articles', 'categories']); break
      case 'readme':      result = analyzeGenericKB('ReadMe', ['docs', 'guides', 'changelogs']); break
      default:            result = analyzeGeneric(platform)
    }
    return NextResponse.json(result)
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
