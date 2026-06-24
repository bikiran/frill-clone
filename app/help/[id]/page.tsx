'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import Link from 'next/link'
import { useParams } from 'next/navigation'

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
        elements.push(<pre key={`code-${i}`} className="rounded-xl p-4 mb-4 overflow-x-auto text-sm" style={{ background: '#1e1e2e', color: '#cdd6f4' }}><code>{codeLines.join('\n')}</code></pre>)
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
      elements.push(<h2 key={i} className="text-lg font-bold mb-3 mt-6 pb-2 border-b" style={{ color: 'var(--ink)', borderColor: 'var(--border)' }}>{line.slice(3)}</h2>)
    } else if (line.startsWith('### ')) {
      elements.push(<h3 key={i} className="text-base font-bold mb-2 mt-4" style={{ color: 'var(--ink)' }}>{line.slice(4)}</h3>)
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
  const id = params?.id as string

  const [article, setArticle] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [liked, setLiked] = useState(false)
  const [feedback, setFeedback] = useState<'helpful' | 'not_helpful' | null>(null)
  const [feedbackNote, setFeedbackNote] = useState('')
  const [feedbackSubmitted, setFeedbackSubmitted] = useState(false)
  const [user, setUser] = useState<any>(null)
  const [openMenu, setOpenMenu] = useState(false)
  const [related, setRelated] = useState<any[]>([])
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
      const { data } = await (supabase as any).from('help_articles').select('*').eq('id', articleId).single()
      if (data) {
        setArticle(data)
        const likedStr = localStorage.getItem('help_likes') || '[]'
        setLiked(JSON.parse(likedStr).includes(articleId))
        await (supabase as any).from('help_articles').update({ views: (data.views || 0) + 1 }).eq('id', articleId)
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
    if (!article.id.startsWith('demo-')) {
      await (supabase as any).from('help_articles').update({ likes: (article.likes || 0) + (vote === 'helpful' ? 1 : 0) }).eq('id', article.id)
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

  const isAdmin = user?.email === ADMIN_EMAIL

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
        <div className="max-w-5xl mx-auto px-6 py-3 flex items-center gap-2 text-sm flex-wrap" style={{ color: 'var(--slate)' }}>
          <Link href="/" className="hover:underline" style={{ color: 'var(--slate)' }}>Home</Link>
          <span>/</span>
          <Link href="/help" className="hover:underline" style={{ color: 'var(--slate)' }}>Help Centre</Link>
          <span>/</span>
          <span style={{ color: 'var(--coral)' }}>{article.category}</span>
          <span>/</span>
          <span className="truncate max-w-48" style={{ color: 'var(--ink)' }}>{article.title}</span>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-6 py-10">
        <div className="grid lg:grid-cols-3 gap-8">
          {/* Main article */}
          <div className="lg:col-span-2 space-y-6">
            <div className="bg-white rounded-2xl border p-8" style={{ borderColor: 'var(--border)' }}>
              {/* Header */}
              <div className="flex items-start justify-between gap-4 mb-6">
                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <span className="text-2xl">{CATEGORY_ICONS[article.category] || '📄'}</span>
                    <span className="text-xs font-semibold px-2 py-0.5 rounded-full" style={{ background: 'var(--peach)', color: 'var(--coral)' }}>{article.category}</span>
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
                            ✏️ Edit
                          </Link>
                        )}
                        <button onClick={copyLink}
                          className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm hover:bg-gray-50 text-left cursor-pointer" style={{ color: 'var(--ink)' }}>
                          🔗 Copy link
                        </button>
                        {isAdmin && !article.id.startsWith('demo-') && (
                          <>
                            <div className="border-t" style={{ borderColor: 'var(--border)' }} />
                            <button onClick={async () => {
                              if (!confirm('Delete this article?')) return
                              await (supabase as any).from('help_articles').delete().eq('id', article.id)
                              window.location.href = '/help'
                            }} className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm hover:bg-red-50 text-left cursor-pointer" style={{ color: '#dc2626' }}>
                              🗑️ Delete
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

              {/* Was this helpful? */}
              <div className="border-t mt-8 pt-6" style={{ borderColor: 'var(--border)' }}>
                <h3 className="text-base font-bold mb-1" style={{ color: 'var(--ink)' }}>Did this article help solve your problem?</h3>
                <p className="text-sm mb-4" style={{ color: 'var(--slate)' }}>Your feedback helps us improve our documentation.</p>

                {feedbackSubmitted ? (
                  <div className="p-4 rounded-xl text-sm font-medium" style={{ background: 'var(--peach)', color: 'var(--coral)' }}>
                    ✅ Thanks for your feedback! We'll use it to improve this article.
                  </div>
                ) : !feedback ? (
                  <div className="flex gap-3">
                    <button onClick={() => submitFeedback('helpful')}
                      className="flex items-center gap-2 px-5 py-2.5 rounded-xl border font-medium text-sm cursor-pointer hover:shadow-sm transition-all"
                      style={{ borderColor: 'var(--border)', color: 'var(--ink)' }}>
                      👍 Yes, it helped!
                    </button>
                    <button onClick={() => submitFeedback('not_helpful')}
                      className="flex items-center gap-2 px-5 py-2.5 rounded-xl border font-medium text-sm cursor-pointer hover:shadow-sm transition-all"
                      style={{ borderColor: 'var(--border)', color: 'var(--ink)' }}>
                      👎 Not really
                    </button>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <p className="text-sm font-medium" style={{ color: 'var(--ink)' }}>
                      {feedback === 'helpful' ? '👍 Glad it helped! Any other comments?' : '👎 Sorry to hear that. What can we improve?'}
                    </p>
                    <textarea value={feedbackNote} onChange={e => setFeedbackNote(e.target.value)}
                      placeholder="Optional: tell us more..."
                      rows={3}
                      className="w-full px-3 py-2 rounded-xl border text-sm focus:outline-none"
                      style={{ borderColor: 'var(--border)', fontSize: '16px' }} />
                    <div className="flex gap-2">
                      <button onClick={() => setFeedbackSubmitted(true)}
                        className="px-4 py-2 rounded-lg text-sm font-semibold text-white cursor-pointer"
                        style={{ background: 'var(--coral)' }}>
                        Submit feedback
                      </button>
                      <button onClick={() => setFeedback(null)}
                        className="px-4 py-2 rounded-lg text-sm font-medium border cursor-pointer"
                        style={{ borderColor: 'var(--border)', color: 'var(--slate)' }}>
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
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
                  ✅ Ticket submitted! We'll respond to <strong>{ticketEmail}</strong> within 24 hours.
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
                {liked ? '❤️ Helpful!' : '🤍 Mark as helpful'}
                {(article.likes || 0) > 0 && <span className="ml-1">({article.likes})</span>}
              </button>
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
                  🎫 Submit a ticket
                </button>
                <a href="mailto:support@colvy.com"
                  className="w-full flex items-center gap-2 px-3 py-2 rounded-lg border text-sm hover:bg-gray-50 cursor-pointer"
                  style={{ borderColor: 'var(--border)', color: 'var(--ink)' }}>
                  📧 Email support
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
        </div>
      </div>
    </div>
  )
}
