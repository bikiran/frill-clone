'use client'

import { useState, useEffect, useMemo } from 'react'
import { supabase } from '@/lib/supabase'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'

const ADMIN_EMAIL = 'bishalstha76@gmail.com'

const DEMO_ARTICLES: Record<string, any> = {
  'demo-1': { id: 'demo-1', title: 'Getting started with Colvy', content: `# Getting started with Colvy\n\nWelcome to Colvy! This guide will help you set up your feedback board in minutes.\n\n## Step 1: Create your board\n\nAfter signing up, your feedback board is automatically created. You can customize it from the Admin panel.\n\nVisit **Admin → Settings** to:\n- Set your board name and logo\n- Choose your brand colors\n- Configure navigation items\n\n## Step 2: Invite your team\n\nGo to **Admin → Team Members** to invite colleagues. You can assign roles:\n\n- **Admin** — full access to all settings\n- **Editor** — can manage ideas, announcements\n- **Viewer** — read-only access\n\n## Step 3: Collect feedback\n\nShare your board URL with customers and start collecting ideas. You can also embed a widget on your website.\n\n## Step 4: Manage ideas\n\nAs ideas come in, update their status to keep customers informed. Ideas move through:\n\n1. Under Review\n2. Planned\n3. In Development\n4. Shipped\n\n---\n\nNeed help? Contact our support team below.`, category: 'Getting Started', status: 'published', featured: true, views: 142, likes: 28, created_at: new Date().toISOString() },
  'demo-5': { id: 'demo-5', title: 'Embedding the Colvy widget', content: `# Embedding the Colvy widget\n\nAdd Colvy directly to your app with a few lines of code.\n\n## Installation\n\nPaste this snippet before the closing \`</body>\` tag:\n\n\`\`\`html\n<script>\n  window.ColvyConfig = {\n    key: 'YOUR_WIDGET_KEY',\n    // optional: pre-fill user info\n    user: {\n      email: 'user@example.com',\n      name: 'John Doe'\n    }\n  }\n</script>\n<script async src="https://widget.colvy.com/v2/widget.js"></script>\n\`\`\`\n\n## Configuration options\n\n| Option | Type | Description |\n|--------|------|-------------|\n| key | string | Your widget key (required) |\n| user.email | string | Pre-fill user email |\n| user.name | string | Pre-fill user name |\n| position | string | 'bottom-right' or 'bottom-left' |\n| color | string | Hex color for widget button |\n\n## React / Next.js\n\nFor Next.js, add to your layout:\n\n\`\`\`tsx\nuseEffect(() => {\n  window.ColvyConfig = { key: 'YOUR_KEY' }\n  const script = document.createElement('script')\n  script.src = 'https://widget.colvy.com/v2/widget.js'\n  script.async = true\n  document.body.appendChild(script)\n}, [])\n\`\`\``, category: 'Integrations', status: 'published', featured: true, views: 203, likes: 41, created_at: new Date().toISOString() },
  'demo-9': { id: 'demo-9', title: 'REST API overview', content: `# REST API overview\n\nColvy provides a REST API for programmatic access to your feedback data.\n\n## Authentication\n\nAll API requests require your API key in the Authorization header:\n\n\`\`\`\nAuthorization: Bearer YOUR_API_KEY\n\`\`\`\n\nGenerate API keys in **Admin → Settings → API**.\n\n## Base URL\n\n\`\`\`\nhttps://yourboard.colvy.com/api/v1\n\`\`\`\n\n## Endpoints\n\n### Ideas\n\n\`\`\`\nGET    /ideas         List all ideas\nPOST   /ideas         Create an idea\nGET    /ideas/:id     Get a single idea\nPATCH  /ideas/:id     Update an idea\nDELETE /ideas/:id     Delete an idea\n\`\`\`\n\n### Announcements\n\n\`\`\`\nGET    /announcements        List announcements\nPOST   /announcements        Create announcement\n\`\`\`\n\n## Rate limiting\n\nRequests are limited to **1,000 per hour** per API key. Rate limit headers are included in every response:\n\n\`\`\`\nX-RateLimit-Limit: 1000\nX-RateLimit-Remaining: 999\nX-RateLimit-Reset: 1704067200\n\`\`\`\n\n## Example request\n\n\`\`\`bash\ncurl -H "Authorization: Bearer YOUR_KEY" \\\n  https://yourboard.colvy.com/api/v1/ideas\n\`\`\``, category: 'API', status: 'published', featured: false, views: 123, likes: 22, created_at: new Date().toISOString() },
}

const CATEGORY_ICONS: Record<string, string> = {
  'Getting Started': '🚀', 'Features': '✨', 'Billing': '💳',
  'Integrations': '🔗', 'Troubleshooting': '🔧', 'API': '⚡', 'Other': '📁',
}

// Stable id for a heading so the "On this page" links and the rendered headings
// agree. Lowercase FIRST, then strip — the other order deletes capitals.
function headingId(text: string) {
  return text.toLowerCase().trim().replace(/[^\w\s-]/g, '').replace(/\s+/g, '-') || 'section'
}

// Pull the h2/h3 headings out of an article body for the contents nav.
export function extractHeadings(content: string) {
  const out: { id: string; text: string; level: number }[] = []
  if (!content) return out
  let inCode = false
  for (const line of content.split('\n')) {
    if (line.trim().startsWith('```')) { inCode = !inCode; continue }
    if (inCode) continue
    if (line.startsWith('### ')) out.push({ id: headingId(line.slice(4)), text: line.slice(4), level: 3 })
    else if (line.startsWith('## ')) out.push({ id: headingId(line.slice(3)), text: line.slice(3), level: 2 })
  }
  return out
}

function renderContent(content: string) {
  if (!content) return null
  const lines = content.split('\n')
  const elements: JSX.Element[] = []
  let i = 0
  let codeBlock = false
  let codeLines: string[] = []
  let tableLines: string[] = []
  let inTable = false

  const flushTable = () => {
    if (tableLines.length < 2) { tableLines = []; inTable = false; return }
    const [headerRow, , ...dataRows] = tableLines
    const headers = headerRow.split('|').map(h => h.trim()).filter(Boolean)
    const rows = dataRows.map(r => r.split('|').map(c => c.trim()).filter(Boolean))
    elements.push(
      <div key={`table-${i}`} className="overflow-x-auto mb-4">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr style={{ background: 'var(--peach)' }}>
              {headers.map((h, j) => <th key={j} className="px-4 py-2 text-left font-semibold border" style={{ borderColor: 'var(--border)', color: 'var(--ink)' }}>{h}</th>)}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, j) => (
              <tr key={j} style={{ background: j % 2 === 0 ? 'white' : 'var(--canvas)' }}>
                {row.map((cell, k) => <td key={k} className="px-4 py-2 border" style={{ borderColor: 'var(--border)', color: 'var(--ink)' }}>{cell}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )
    tableLines = []; inTable = false
  }

  while (i < lines.length) {
    const line = lines[i]
    if (line.startsWith('```')) {
      if (!codeBlock) { codeBlock = true; codeLines = []; i++; continue }
      else {
        elements.push(<pre key={`code-${i}`} className="rounded-xl p-4 mb-4 text-sm max-w-full overflow-x-auto" style={{ background: '#1e1e2e', color: '#cdd6f4', wordBreak: 'break-word', whiteSpace: 'pre-wrap', overflowWrap: 'break-word', fontSize: 'min(14px, 2vw)', lineHeight: 1.5 }}><code style={{ display: 'block', wordBreak: 'break-word', whiteSpace: 'pre-wrap', fontFamily: 'monospace' }}>{codeLines.join('\n')}</code></pre>)
        codeBlock = false; codeLines = []; i++; continue
      }
    }
    if (codeBlock) { codeLines.push(line); i++; continue }
    if (line.startsWith('|')) {
      inTable = true; tableLines.push(line); i++; continue
    }
    if (inTable) flushTable()
    if (!line.trim()) { elements.push(<br key={`br-${i}`} />); i++; continue }
    if (line.startsWith('# ')) {
      elements.push(<h1 key={i} className="text-2xl font-black mb-4 mt-6" style={{ color: 'var(--ink)' }}>{line.slice(2)}</h1>)
    } else if (line.startsWith('## ')) {
      elements.push(<h2 id={headingId(line.slice(3))} key={i} className="text-lg font-bold mb-3 mt-6 pb-2 border-b" style={{ color: 'var(--ink)', borderColor: 'var(--border)', scrollMarginTop: 90 }}>{line.slice(3)}</h2>)
    } else if (line.startsWith('### ')) {
      elements.push(<h3 id={headingId(line.slice(4))} key={i} className="text-base font-bold mb-2 mt-4" style={{ color: 'var(--ink)', scrollMarginTop: 90 }}>{line.slice(4)}</h3>)
    } else if (line.startsWith('- ') || line.startsWith('* ')) {
      const items = []
      while (i < lines.length && (lines[i].startsWith('- ') || lines[i].startsWith('* '))) {
        items.push(lines[i].slice(2))
        i++
      }
      elements.push(<ul key={`ul-${i}`} className="mb-4 space-y-1 ml-4">{items.map((item, j) => (
        <li key={j} className="text-sm flex items-start gap-2" style={{ color: 'var(--ink)' }}>
          <span style={{ color: 'var(--coral)', marginTop: 2 }}>•</span>
          <span dangerouslySetInnerHTML={{ __html: item.replace(/`([^`]+)`/g, '<code class="px-1 py-0.5 rounded text-xs" style="background:#f3f4f6;color:var(--ink);font-family:monospace">$1</code>').replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>') }} />
        </li>
      ))}</ul>)
      continue
    } else if (/^\d+\. /.test(line)) {
      const items = []
      while (i < lines.length && /^\d+\. /.test(lines[i])) {
        items.push(lines[i].replace(/^\d+\. /, ''))
        i++
      }
      elements.push(<ol key={`ol-${i}`} className="mb-4 space-y-1 ml-4 list-decimal">{items.map((item, j) => (
        <li key={j} className="text-sm" style={{ color: 'var(--ink)' }} dangerouslySetInnerHTML={{ __html: item.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>') }} />
      ))}</ol>)
      continue
    } else if (line === '---') {
      elements.push(<hr key={i} className="my-6" style={{ borderColor: 'var(--border)' }} />)
    } else {
      const html = line
        .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
        .replace(/`([^`]+)`/g, '<code class="px-1.5 py-0.5 rounded text-xs font-mono" style="background:#f3f4f6;color:var(--coral)">$1</code>')
        .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" class="underline" style="color:var(--coral)">$1</a>')
      elements.push(<p key={i} className="text-sm leading-relaxed mb-3" style={{ color: 'var(--ink)' }} dangerouslySetInnerHTML={{ __html: html }} />)
    }
    i++
  }
  if (inTable) flushTable()
  return elements
}

export default function HelpArticlePage() {
  const params = useParams()
  const router = useRouter()
  const id = params?.id as string

  const [article, setArticle] = useState<any>(null)
  // Headings extracted from the article body, for the "On this page" nav.
  const [activeHeading, setActiveHeading] = useState<string>('')
  // Articles store the category SLUG. Map slug → { name, icon } so we can show
  // the readable name and the category's chosen icon instead of the raw slug.
  const [catMap, setCatMap] = useState<Record<string, { name: string; icon: string }>>({})
  const [loading, setLoading] = useState(true)
  const [liked, setLiked] = useState(false)
  const [feedback, setFeedback] = useState<'helpful' | 'not_helpful' | null>(null)
  const [feedbackNote, setFeedbackNote] = useState('')
  const [feedbackEmail, setFeedbackEmail] = useState('')
  const [feedbackSubmitted, setFeedbackSubmitted] = useState(false)
  const [user, setUser] = useState<any>(null)
  const [isCompanyAdmin, setIsCompanyAdmin] = useState(false)
  const [openMenu, setOpenMenu] = useState(false)
  const [related, setRelated] = useState<any[]>([])
  const [helpSearch, setHelpSearch] = useState('')
  // The business's own support address, not a hardcoded Colvy one — customers
  // emailing about an aquarium order shouldn't land in Colvy's inbox.
  const [helpEmail, setHelpEmail] = useState('support@colvy.com')
  const [showTicketForm, setShowTicketForm] = useState(false)
  const [ticketSubject, setTicketSubject] = useState('')
  const [ticketMessage, setTicketMessage] = useState('')
  const [ticketEmail, setTicketEmail] = useState('')
  const [ticketSubmitted, setTicketSubmitted] = useState(false)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }: any) => setUser(data?.session?.user))
    if (id) fetchArticle(id)
  }, [id])

  const fetchArticle = async (articleId: string) => {
    // Check demo first
    if (DEMO_ARTICLES[articleId]) {
      setArticle(DEMO_ARTICLES[articleId])
      const allDemo = Object.values(DEMO_ARTICLES)
      setRelated(allDemo.filter((a: any) => a.category === DEMO_ARTICLES[articleId].category && a.id !== articleId).slice(0, 4))
      setLoading(false)
      return
    }
    try {
      // Load the company's categories so a stored slug can be shown as its
      // readable name with the icon chosen in Settings → Help Categories.
      try {
        const { data: cats } = await (supabase as any)
          .from('help_categories').select('slug, name, icon')
        if (cats) {
          const m: Record<string, { name: string; icon: string }> = {}
          for (const c of cats) m[c.slug] = { name: c.name, icon: c.icon || '📁' }
          setCatMap(m)
        }
      } catch { /* fall back to the raw category value */ }
      // The company's own support address for the Contact panel.
      try {
        const host = typeof window !== 'undefined' ? window.location.hostname : ''
        if (host.endsWith('.colvy.com') && host !== 'colvy.com') {
          const slug = host.replace('.colvy.com', '')
          const { data: co } = await (supabase as any).from('companies')
            .select('support_email, email, name').eq('slug', slug).maybeSingle()
          const addr = co?.support_email || co?.email
          if (addr) setHelpEmail(addr)
        }
      } catch { /* keep the default */ }

      const { data } = await (supabase as any).from('help_articles').select('*').eq('id', articleId).maybeSingle()
      if (data) {
        // Unpublished articles are only visible to company admins, even via direct URL
        if (data.status !== 'published') {
          const { isCompanyAdminUser } = await import('@/lib/board')
          const { data: { session } } = await supabase.auth.getSession()
          const admin = session?.user ? await isCompanyAdminUser(session.user) : false
          if (!admin) {
            setArticle(null)
            setLoading(false)
            return
          }
        }
        setArticle(data)
        const likedStr = localStorage.getItem('help_likes') || '[]'
        setLiked(JSON.parse(likedStr).includes(articleId))
        // Restore this person's previous feedback so it's remembered
        try {
          const cached = localStorage.getItem(`colvy-help-fb-${articleId}`)
          if (cached === 'helpful' || cached === 'not_helpful') {
            setFeedback(cached as any)
            if (cached === 'helpful') setFeedbackSubmitted(true)
          }
          const { data: { user } } = await supabase.auth.getUser()
          let q = (supabase as any).from('help_article_feedback').select('helpful').eq('article_id', articleId)
          if (user) q = q.eq('user_id', user.id)
          else { const vk = localStorage.getItem('colvy-visitor-key'); if (vk) q = q.eq('visitor_key', vk); else q = null }
          if (q) {
            const { data: fb } = await q.maybeSingle()
            if (fb) { const v = fb.helpful ? 'helpful' : 'not_helpful'; setFeedback(v as any); if (fb.helpful) setFeedbackSubmitted(true) }
          }
        } catch {}
        await (supabase as any).from('help_articles').update({ views: (data.views || 0) + 1 }).eq('id', articleId)
        // Log a row for help center analytics (daily views chart)
        try {
          if (data.company_id) {
            await (supabase as any).from('help_article_views').insert({
              article_id: articleId,
              company_id: data.company_id,
              source: 'help_center',
            })
          }
        } catch {}
        const { data: rel } = await (supabase as any).from('help_articles').select('id, title, category').eq('category', data.category).eq('status', 'published').neq('id', articleId).limit(4)
        setRelated(rel || [])
      }
    } catch {}
    setLoading(false)
  }

  const toggleLike = async () => {
    if (!article || article.id.startsWith('demo-')) return
    const likedStr = localStorage.getItem('help_likes') || '[]'
    const likedArr = JSON.parse(likedStr)
    const newLiked = !liked
    setLiked(newLiked)
    const updated = newLiked ? [...likedArr, article.id] : likedArr.filter((i: string) => i !== article.id)
    localStorage.setItem('help_likes', JSON.stringify(updated))
    await (supabase as any).from('help_articles').update({ likes: (article.likes || 0) + (newLiked ? 1 : -1) }).eq('id', article.id)
    setArticle((a: any) => ({ ...a, likes: (a.likes || 0) + (newLiked ? 1 : -1) }))
  }

  const submitFeedback = async (vote: 'helpful' | 'not_helpful') => {
    setFeedback(vote)
    if (vote === 'helpful') setFeedbackSubmitted(true)
    if (!article.id.startsWith('demo-')) {
      await (supabase as any).from('help_articles').update({ likes: (article.likes || 0) + (vote === 'helpful' ? 1 : 0) }).eq('id', article.id)
      // Remember this person's feedback so it persists across visits — keyed by
      // logged-in user id, or by an anonymous browser key for guests.
      try {
        const { data: { user } } = await supabase.auth.getUser()
        let visitorKey: string | null = null
        if (!user) {
          try {
            visitorKey = localStorage.getItem('colvy-visitor-key')
            if (!visitorKey) { visitorKey = 'v_' + Math.random().toString(36).slice(2) + Date.now().toString(36); localStorage.setItem('colvy-visitor-key', visitorKey) }
          } catch {}
        }
        const row: any = { article_id: article.id, company_id: article.company_id || null, helpful: vote === 'helpful', updated_at: new Date().toISOString() }
        if (user) row.user_id = user.id; else row.visitor_key = visitorKey
        // Upsert on the appropriate unique key
        await (supabase as any).from('help_article_feedback').upsert(row, { onConflict: user ? 'article_id,user_id' : 'article_id,visitor_key' })
        try { localStorage.setItem(`colvy-help-fb-${article.id}`, vote) } catch {}
      } catch {}
    }
  }

  const submitTicket = async () => {
    if (!ticketSubject || !ticketEmail) return
    try {
      await (supabase as any).from('support_tickets').insert({ subject: ticketSubject, message: ticketMessage, email: ticketEmail, article_id: article.id })
    } catch {}
    setTicketSubmitted(true)
  }

  const copyLink = () => {
    navigator.clipboard.writeText(window.location.href)
    alert('Link copied!')
    setOpenMenu(false)
  }

  const isAdmin = isCompanyAdmin

  // Contents nav for the article body.
  const toc = useMemo(() => extractHeadings(article?.content || ''), [article?.content])

  const scrollToHeading = (id: string) => {
    const el = document.getElementById(id)
    if (!el) return
    el.scrollIntoView({ behavior: 'smooth', block: 'start' })
    setActiveHeading(id)
    // Keep the URL shareable without triggering a jump.
    if (typeof history !== 'undefined') history.replaceState(null, '', `#${id}`)
  }

  // Highlight whichever heading you're currently reading. The heading closest
  // to (but still above) the top of the viewport wins; near the bottom of the
  // page the last one wins so the final short section can still activate.
  useEffect(() => {
    if (toc.length === 0) return
    const onScroll = () => {
      const atBottom = window.innerHeight + window.scrollY >= document.body.offsetHeight - 40
      if (atBottom) { setActiveHeading(toc[toc.length - 1].id); return }
      let current = toc[0].id
      for (const h of toc) {
        const el = document.getElementById(h.id)
        if (el && el.getBoundingClientRect().top <= 100) current = h.id
        else break
      }
      setActiveHeading(current)
    }
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [toc])

  if (loading) return <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--canvas)' }}>Loading...</div>
  if (!article) return (
    <div className="min-h-screen flex flex-col items-center justify-center" style={{ background: 'var(--canvas)' }}>
      <div className="text-5xl mb-4">😕</div>
      <p className="text-xl font-bold mb-2" style={{ color: 'var(--ink)' }}>Article not found</p>
      <Link href="/help" className="mt-4 px-4 py-2 rounded-lg text-sm font-semibold text-white" style={{ background: 'var(--coral)' }}>Back to Help Centre</Link>
    </div>
  )

  return (
    <div className="min-h-screen" style={{ background: 'var(--canvas)' }}>
      {/* Breadcrumb */}
      <div className="border-b bg-white" style={{ borderColor: 'var(--border)' }}>
        <div className="max-w-[1600px] mx-auto px-6 py-3 flex items-center gap-2 text-sm flex-wrap" style={{ color: 'var(--slate)' }}>
          <Link href="/" className="hover:underline" style={{ color: 'var(--slate)' }}>Home</Link>
          <span>/</span>
          <Link href="/help" className="hover:underline" style={{ color: 'var(--slate)' }}>Help Centre</Link>
          <span>/</span>
          <span style={{ color: 'var(--coral)' }}>{catMap[article.category]?.name || article.category}</span>
          <span>/</span>
          <span className="truncate max-w-48" style={{ color: 'var(--ink)' }}>{article.title}</span>
        </div>
      </div>

      <div className="max-w-[1600px] mx-auto px-6 py-10">
        <style>{`
          /* Explicit three-column layout rather than Tailwind's responsive grid
             utilities — those weren't taking effect here, which dropped the
             side panel to the bottom of the page at full width. Fixed track
             widths for the rails and a flexible middle keeps the article
             readable at any window size. */
          .help-layout {
            display: grid;
            grid-template-columns: minmax(0, 1fr);
            gap: 32px;
          }
          .help-toc { display: none; }
          .help-main { min-width: 0; }
          .help-panel { min-width: 0; }

          /* Article + right panel as soon as there's room for them. */
          @media (min-width: 900px) {
            .help-layout { grid-template-columns: minmax(0, 1fr) 300px; }
          }
          /* Add the "on this page" rail on wider screens. */
          @media (min-width: 1180px) {
            .help-layout { grid-template-columns: 210px minmax(0, 1fr) 300px; }
            .help-toc { display: block; }
          }
          /* Both rails stick while the article scrolls. */
          .help-sticky {
            position: sticky; top: 24px;
            max-height: calc(100vh - 48px);
            overflow-y: auto;
            overscroll-behavior: contain;
          }
          @media (max-width: 899px) {
            .help-sticky { position: static; max-height: none; overflow: visible; }
          }
        `}</style>
        <div className="help-layout">
          {/* On this page — headings pulled from the article, sticky, with the
              section you're currently reading highlighted. */}
          <aside className="help-toc">
            {/* The nav scrolls on its own once the heading list outgrows the
                viewport, instead of running off the bottom of the page. */}
            {toc.length > 0 && (
              <nav className="help-sticky">
                <p className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: 'var(--slate)' }}>
                  On this page
                </p>
                <ul className="space-y-1 border-l" style={{ borderColor: 'var(--border)' }}>
                  {toc.map(h => (
                    <li key={h.id}>
                      <a
                        href={`#${h.id}`}
                        onClick={e => { e.preventDefault(); scrollToHeading(h.id) }}
                        className="block text-sm py-1 cursor-pointer transition-colors"
                        style={{
                          paddingLeft: h.level === 3 ? 22 : 12,
                          marginLeft: -1,
                          borderLeft: activeHeading === h.id ? '2px solid var(--coral)' : '2px solid transparent',
                          color: activeHeading === h.id ? 'var(--coral)' : 'var(--slate)',
                          fontWeight: activeHeading === h.id ? 600 : 400,
                        }}>
                        {h.text}
                      </a>
                    </li>
                  ))}
                </ul>
              </nav>
            )}
          </aside>

          {/* Main article */}
          <div className="help-main space-y-6">
            <div className="bg-white rounded-2xl border p-8" style={{ borderColor: 'var(--border)' }}>
              {/* Header */}
              <div className="flex items-start justify-between gap-4 mb-6">
                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <span className="text-2xl">
                      {catMap[article.category]?.icon || CATEGORY_ICONS[article.category] || '📄'}
                    </span>
                    <span className="text-xs font-semibold px-2 py-0.5 rounded-full" style={{ background: 'var(--peach)', color: 'var(--coral)' }}>
                      {catMap[article.category]?.name || article.category}
                    </span>
                  </div>
                  <h1 className="text-2xl font-bold" style={{ color: 'var(--ink)' }}>{article.title}</h1>
                  <p className="text-sm mt-1" style={{ color: 'var(--slate)' }}>
                    {article.views || 0} views · {article.likes || 0} found helpful
                  </p>
                </div>
                {/* 3-dot menu */}
                <div className="relative">
                  <button onClick={() => setOpenMenu(!openMenu)}
                    className="w-8 h-8 rounded-lg flex items-center justify-center border cursor-pointer hover:bg-gray-50"
                    style={{ borderColor: 'var(--border)', color: 'var(--slate)' }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="5" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="12" cy="19" r="1.5"/></svg>
                  </button>
                  {openMenu && (
                    <>
                      <div className="fixed inset-0 z-30" onClick={() => setOpenMenu(false)} />
                      <div className="absolute right-0 top-full mt-1 w-44 bg-white rounded-xl shadow-xl border z-40 overflow-hidden" style={{ borderColor: 'var(--border)' }}>
                        {isAdmin && !article.id.startsWith('demo-') && (
                          <Link href={`/admin/help/new?edit=${article.id}`} onClick={() => setOpenMenu(false)}
                            className="flex items-center gap-2.5 px-4 py-2.5 text-sm hover:bg-gray-50" style={{ color: 'var(--ink)' }}>
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                            Edit
                          </Link>
                        )}
                        <button onClick={copyLink}
                          className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm hover:bg-gray-50 text-left cursor-pointer" style={{ color: 'var(--ink)' }}>
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="1" fill="currentColor"/><circle cx="12" cy="12" r="8"/></svg>
                          Copy link
                        </button>
                        {isAdmin && !article.id.startsWith('demo-') && (
                          <>
                            <div className="border-t" style={{ borderColor: 'var(--border)' }} />
                            <button onClick={async () => {
                              if (!confirm('Delete this article?')) return
                              await (supabase as any).from('help_articles').delete().eq('id', article.id)
                              window.location.href = '/help'
                            }} className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm hover:bg-red-50 text-left cursor-pointer" style={{ color: '#dc2626' }}>
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>
                              Delete
                            </button>
                          </>
                        )}
                      </div>
                    </>
                  )}
                </div>
              </div>

              {/* Rendered content */}
              <div className="min-h-48">
                {renderContent(article.content)}
              </div>

            </div>


            {/* Submit a Ticket */}
            <div className="bg-white rounded-2xl border p-6" style={{ borderColor: 'var(--border)' }}>
              <div className="flex items-center justify-between mb-3">
                <div>
                  <h3 className="font-bold" style={{ color: 'var(--ink)' }}>🎫 Still need help?</h3>
                  <p className="text-sm mt-0.5" style={{ color: 'var(--slate)' }}>Submit a support ticket and we'll get back to you.</p>
                </div>
                <button onClick={() => setShowTicketForm(!showTicketForm)}
                  className="px-4 py-2 rounded-lg text-sm font-semibold border cursor-pointer"
                  style={{ borderColor: 'var(--border)', color: 'var(--ink)' }}>
                  {showTicketForm ? 'Cancel' : 'Open Ticket'}
                </button>
              </div>

              {showTicketForm && !ticketSubmitted && (
                <div className="mt-4 space-y-3 border-t pt-4" style={{ borderColor: 'var(--border)' }}>
                  <input type="email" value={ticketEmail} onChange={e => setTicketEmail(e.target.value)}
                    placeholder="Your email address"
                    className="w-full px-3 py-2.5 rounded-lg border text-sm focus:outline-none"
                    style={{ borderColor: 'var(--border)', fontSize: '16px' }} />
                  <input type="text" value={ticketSubject} onChange={e => setTicketSubject(e.target.value)}
                    placeholder="Subject"
                    className="w-full px-3 py-2.5 rounded-lg border text-sm focus:outline-none"
                    style={{ borderColor: 'var(--border)', fontSize: '16px' }} />
                  <textarea value={ticketMessage} onChange={e => setTicketMessage(e.target.value)}
                    placeholder="Describe your issue in detail..."
                    rows={4}
                    className="w-full px-3 py-2.5 rounded-lg border text-sm focus:outline-none"
                    style={{ borderColor: 'var(--border)', fontSize: '16px' }} />
                  <button onClick={submitTicket}
                    disabled={!ticketSubject || !ticketEmail}
                    className="w-full py-2.5 rounded-lg text-sm font-semibold text-white cursor-pointer disabled:opacity-50"
                    style={{ background: 'var(--coral)' }}>
                    Submit Ticket
                  </button>
                </div>
              )}
              {ticketSubmitted && (
                <div className="mt-4 p-4 rounded-xl text-sm" style={{ background: 'var(--peach)', color: 'var(--coral)' }}>
                  ✓ Ticket submitted! We'll respond to <strong>{ticketEmail}</strong> within 24 hours.
                </div>
              )}
            </div>
          </div>

          {/* Sidebar */}
          <div className="space-y-4">
            {/* Like */}
            <div className="bg-white rounded-2xl border p-5" style={{ borderColor: 'var(--border)' }}>
              <button onClick={toggleLike}
                className="flex items-center gap-2 w-full justify-center py-2 rounded-lg border text-sm font-medium cursor-pointer transition-all"
                style={{ background: liked ? 'var(--peach)' : 'white', borderColor: liked ? 'var(--coral)' : 'var(--border)', color: liked ? 'var(--coral)' : 'var(--ink)' }}>
                {liked ? (
                  <>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" strokeWidth="2"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
                    Helpful!
                  </>
                ) : (
                  <>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
                    Mark as helpful
                  </>
                )}
                {(article.likes || 0) > 0 && <span className="ml-1">({article.likes})</span>}
              </button>
            </div>
          </div>

          {/* Right sidebar — sticks while the article scrolls */}
          <aside className="help-panel">
            <div className="help-sticky space-y-6">

            {/* Search — first thing in the sidebar, so it's reachable from
                inside an article without scrolling back to the top. */}
            <div className="bg-white rounded-2xl border p-4" style={{ borderColor: 'var(--border)' }}>
              <form onSubmit={(e) => { e.preventDefault(); if (helpSearch.trim()) router.push(`/help?q=${encodeURIComponent(helpSearch.trim())}`) }}>
                <div style={{ position: 'relative' }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"
                    style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', color: 'var(--slate)', pointerEvents: 'none' }}>
                    <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
                  </svg>
                  <input
                    value={helpSearch}
                    onChange={e => setHelpSearch(e.target.value)}
                    placeholder="Search help articles…"
                    style={{ width: '100%', padding: '10px 12px 10px 34px', borderRadius: 10, border: '1px solid var(--border)', fontSize: 14, boxSizing: 'border-box' }}
                  />
                </div>
              </form>
            </div>

            {/* Was this helpful? — compact icon buttons, instant thanks, improve form on downvote */}
            <div className="bg-white rounded-2xl border p-5" style={{ borderColor: 'var(--border)' }}>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 10 }}>
                <span style={{ fontSize: 15, fontWeight: 600, color: 'var(--slate)' }}>Was this helpful?</span>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button
                    type="button"
                    onClick={() => { if (!feedbackSubmitted) submitFeedback('helpful') }}
                    title="Yes, it helped"
                    style={{
                      width: 46, height: 42, borderRadius: 12, cursor: feedbackSubmitted ? 'default' : 'pointer',
                      border: feedback === 'helpful' ? '1.5px solid #86b34d' : '1.5px solid var(--border)',
                      background: feedback === 'helpful' ? 'linear-gradient(135deg, #f2f8e8, #e5f2d3)' : '#fff',
                      boxShadow: feedback === 'helpful' ? '0 0 0 4px rgba(134,179,77,0.12), 0 4px 14px rgba(134,179,77,0.2)' : '0 1px 3px rgba(0,0,0,0.05)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      transition: 'all 0.2s cubic-bezier(0.34, 1.56, 0.64, 1)',
                      transform: feedback === 'helpful' ? 'scale(1.06)' : 'scale(1)',
                    }}>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill={feedback === 'helpful' ? '#6f9c3d' : 'none'} stroke={feedback === 'helpful' ? '#4d6e28' : '#9ca3af'} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3zM7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3"/>
                    </svg>
                  </button>
                  <button
                    type="button"
                    onClick={() => { if (!feedbackSubmitted) submitFeedback('not_helpful') }}
                    title="Not really"
                    style={{
                      width: 46, height: 42, borderRadius: 12, cursor: feedbackSubmitted ? 'default' : 'pointer',
                      border: feedback === 'not_helpful' ? '1.5px solid #d97706' : '1.5px solid var(--border)',
                      background: feedback === 'not_helpful' ? 'linear-gradient(135deg, #fdf3e7, #fae5cc)' : '#fff',
                      boxShadow: feedback === 'not_helpful' ? '0 0 0 4px rgba(217,119,6,0.12), 0 4px 14px rgba(217,119,6,0.18)' : '0 1px 3px rgba(0,0,0,0.05)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      transition: 'all 0.2s cubic-bezier(0.34, 1.56, 0.64, 1)',
                      transform: feedback === 'not_helpful' ? 'scale(1.06)' : 'scale(1)',
                    }}>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill={feedback === 'not_helpful' ? '#c2701e' : 'none'} stroke={feedback === 'not_helpful' ? '#8a4f13' : '#9ca3af'} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M10 15v4a3 3 0 0 0 3 3l4-9V2H5.72a2 2 0 0 0-2 1.7l-1.38 9a2 2 0 0 0 2 2.3zm7 7h2.67A2.31 2.31 0 0 0 22 20v-7a2.31 2.31 0 0 0-2.33-2H17"/>
                    </svg>
                  </button>
                </div>
              </div>

              {/* Upvote: instant thanks banner */}
              {feedback === 'helpful' && (
                <div style={{ marginTop: 14, padding: '13px 16px', borderRadius: 12, background: 'linear-gradient(135deg, #f2f8e8, #eaf4dc)', display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ width: 22, height: 22, borderRadius: '50%', border: '1.8px solid #6f9c3d', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#4d6e28" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                  </span>
                  <span style={{ fontSize: 15, fontWeight: 600, color: '#4d6e28' }}>Thank you for your feedback!</span>
                </div>
              )}

              {/* Downvote: how can we improve form */}
              {feedback === 'not_helpful' && !feedbackSubmitted && (
                <div style={{ marginTop: 14 }}>
                  <textarea value={feedbackNote} onChange={e => setFeedbackNote(e.target.value)}
                    placeholder="How can we improve?"
                    rows={4}
                    style={{ width: '100%', padding: '14px 16px', borderRadius: 14, border: 'none', background: 'var(--canvas)', fontSize: 15, outline: 'none', resize: 'vertical', boxSizing: 'border-box', marginBottom: 10, fontFamily: 'inherit' }} />
                  <input value={feedbackEmail} onChange={e => setFeedbackEmail(e.target.value)}
                    type="email" placeholder="Your email (optional)"
                    style={{ width: '100%', padding: '14px 16px', borderRadius: 14, border: 'none', background: 'var(--canvas)', fontSize: 15, outline: 'none', boxSizing: 'border-box', marginBottom: 12 }} />
                  <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                    <button
                      type="button"
                      onClick={async () => {
                        try {
                          if (article?.company_id) {
                            await (supabase as any).from('help_article_feedback').insert({
                              article_id: article.id,
                              company_id: article.company_id,
                              helpful: false,
                              comment: feedbackNote.trim() ? `${feedbackNote.trim()}${feedbackEmail ? ` — ${feedbackEmail}` : ''}` : null,
                            })
                          }
                        } catch {}
                        setFeedbackSubmitted(true)
                      }}
                      style={{ padding: '12px 26px', borderRadius: 14, border: '1px solid var(--border)', background: '#fff', fontSize: 15, fontWeight: 600, color: 'var(--ink)', cursor: 'pointer', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
                      Submit Feedback
                    </button>
                  </div>
                </div>
              )}

              {feedback === 'not_helpful' && feedbackSubmitted && (
                <div style={{ marginTop: 14, padding: '13px 16px', borderRadius: 12, background: 'var(--peach)', display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontSize: 15, fontWeight: 600, color: 'var(--coral)' }}>Thanks — we'll use this to improve the article.</span>
                </div>
              )}
            </div>

            {/* Related articles */}
            {related.length > 0 && (
              <div className="bg-white rounded-2xl border p-5" style={{ borderColor: 'var(--border)' }}>
                <p className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: 'var(--slate)' }}>Related Articles</p>
                <div className="space-y-2">
                  {related.map(r => (
                    <Link key={r.id} href={`/help/${r.id}`}
                      className="block text-sm py-1.5 hover:underline cursor-pointer" style={{ color: 'var(--coral)' }}>
                      {r.title}
                    </Link>
                  ))}
                </div>
              </div>
            )}

            {/* Quick contacts */}
            <div className="bg-white rounded-2xl border p-5" style={{ borderColor: 'var(--border)' }}>
              <p className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: 'var(--slate)' }}>Contact Options</p>
              <div className="space-y-2">
                <button onClick={() => setShowTicketForm(true)}
                  className="w-full flex items-center gap-2 px-3 py-2 rounded-lg border text-sm hover:bg-gray-50 cursor-pointer text-left"
                  style={{ borderColor: 'var(--border)', color: 'var(--ink)' }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 7.5V21a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V7.5M12 7.5V2H8a2 2 0 0 0-2 2v3.5m8 0V4a2 2 0 0 1 2 2v3.5"/><line x1="3" y1="12" x2="21" y2="12"/></svg>
                  Submit a ticket
                </button>
                <a href={`mailto:${helpEmail}`}
                  className="w-full flex items-center gap-2 px-3 py-2 rounded-lg border text-sm hover:bg-gray-50 cursor-pointer"
                  style={{ borderColor: 'var(--border)', color: 'var(--ink)' }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/></svg>
                  {helpEmail}
                </a>
                <Link href="/"
                  className="w-full flex items-center gap-2 px-3 py-2 rounded-lg border text-sm hover:bg-gray-50 cursor-pointer"
                  style={{ borderColor: 'var(--border)', color: 'var(--ink)' }}>
                  💡 Request a feature
                </Link>
              </div>
            </div>

            {/* Back */}
            <Link href="/help"
              className="flex items-center gap-2 text-sm font-medium cursor-pointer hover:underline"
              style={{ color: 'var(--slate)' }}>
              ← Back to Help Centre
            </Link>
            </div>
          </aside>
        </div>
      </div>
    </div>
  )
}
