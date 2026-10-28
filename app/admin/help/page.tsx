'use client'

import { useState, useEffect, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { IconEdit, IconLink, IconView, IconDelete } from '@/components/SvgIcons'
import { confirmDialog } from '@/components/ConfirmDialog'
import { peekCompanyUser, resolveCompanyUser, readCache, writeCache } from '@/lib/client-cache'
import { readLocal, writeLocal } from '@/lib/local-cache'
import { HELP_LIST_COLUMNS } from '@/lib/help-shared'
import { refreshPublicHelp } from '@/lib/help-revalidate'
import HelpShell from '@/components/help/HelpShell'


const SEED_ARTICLES = [
  { title: 'Getting started with Colvy', content: `# Getting started with Colvy\n\nWelcome to Colvy! This guide will help you set up your feedback board in minutes.\n\n## Step 1: Create your board\n\nAfter signing up, your feedback board is automatically created. Customize it from the Admin panel.\n\n## Step 2: Invite your team\n\nGo to **Admin → Team Members** to invite colleagues.\n\n## Step 3: Collect feedback\n\nShare your board URL with customers and start collecting ideas.`, category: 'Getting Started', status: 'published', featured: true, views: 142, likes: 28 },
  { title: 'How to create and manage ideas', content: `# How to create and manage ideas\n\nIdeas are the core of Colvy. Here's how to manage them effectively.\n\n## Creating ideas\n\nClick **"Share an Idea"** on your board to submit new ideas. Customers can also submit directly.\n\n## Voting\n\nUsers can upvote ideas they care about. The most voted rise to the top.\n\n## Status management\n\nUpdate idea status: Under Review → Planned → In Progress → Shipped.`, category: 'Features', status: 'published', featured: true, views: 98, likes: 19 },
  { title: 'Setting up your public roadmap', content: `# Setting up your public roadmap\n\nThe roadmap gives customers visibility into your product direction.\n\n## Enabling roadmap\n\nGo to **Admin → Settings → Site Navigation** and enable Roadmap.\n\n## Adding ideas\n\nFrom the Ideas board, mark ideas as "Show on Roadmap".\n\n## Kanban columns\n\nDrag ideas between: Under Consideration → Planned → In Development → Shipped.`, category: 'Features', status: 'published', featured: false, views: 76, likes: 12 },
  { title: 'Publishing announcements', content: `# Publishing announcements\n\nKeep customers updated with Announcements (your changelog).\n\n## Creating an announcement\n\nGo to **Admin → Announcements → New Announcement**.\n\n## Tags\n\nUse tags like Feature, Bug Fix, Update to categorize announcements.\n\n## Boost\n\nEnable Boost to display as a banner or modal in your widget.\n\n## Notify subscribers\n\nToggle "Notify subscribers" to email users when you publish.`, category: 'Features', status: 'published', featured: false, views: 54, likes: 9 },
  { title: 'Embedding the Colvy widget', content: `# Embedding the Colvy widget\n\nAdd Colvy to your app with a simple JavaScript snippet.\n\n## Installation\n\nPaste this code before the closing \`</body>\` tag:\n\n\`\`\`html\n<script src="https://yourapp.colvy.com/embed.js"></script>\n\`\`\`\n\n## Configuration\n\nCustomize the widget color, position, and features.\n\n## SSO\n\nPass user data to Colvy so users are automatically logged in.`, category: 'Integrations', status: 'published', featured: true, views: 203, likes: 41 },
  { title: 'Connecting Slack', content: `# Connecting Slack\n\nGet notified in Slack when new ideas are submitted.\n\n## Setup\n\n1. Go to **Admin → Settings → Integrations**\n2. Click "Connect Slack"\n3. Choose your workspace and channel\n4. Select which events to post\n\n## Notifications\n\nFrill posts to your chosen channel on new ideas, comments, and status changes.`, category: 'Integrations', status: 'published', featured: false, views: 67, likes: 11 },
  { title: 'Understanding your subscription', content: `# Understanding your subscription\n\nFrill offers flexible plans for every team size.\n\n## Free plan\n\nUp to 5 team members, unlimited ideas, basic analytics.\n\n## Pro plan ($99/month)\n\nUnlimited team members, white labeling, API access, advanced analytics.\n\n## Enterprise\n\nSSO, custom integrations, priority support, SLA.\n\n## Changing plans\n\nGo to **Settings → Billing** to upgrade or downgrade at any time.`, category: 'Billing', status: 'published', featured: false, views: 45, likes: 7 },
  { title: "Why can't users vote?", content: `# Why can't users vote?\n\nIf users are unable to vote on ideas, here are the most common causes.\n\n## Guest voting disabled\n\nGo to **Admin → Settings → Guest Access** and ensure "Allow guest voting" is enabled.\n\n## User not logged in\n\nIf you've disabled guest voting, users must sign in to vote.\n\n## Already voted\n\nUsers can only vote once per idea. They can un-vote by clicking again.`, category: 'Troubleshooting', status: 'published', featured: false, views: 89, likes: 14 },
  { title: 'REST API overview', content: `# REST API overview\n\nColvy provides a REST API for programmatic access to your data.\n\n## Authentication\n\n\`\`\`\nAuthorization: Bearer YOUR_API_KEY\n\`\`\`\n\n## Endpoints\n\n- \`GET /api/v1/ideas\` — List all ideas\n- \`POST /api/v1/ideas\` — Create an idea\n- \`GET /api/v1/announcements\` — List announcements\n\n## Rate limiting\n\n1,000 requests per hour per API key.`, category: 'API', status: 'published', featured: false, views: 123, likes: 22 },
]

// The list only needs these columns. Bodies and media (inline base64 uploads,
// often megabytes) are fetched for the open article only.
const LIST_COLUMNS = `${HELP_LIST_COLUMNS}, company_id`
const memKey = (cid: string | null) => `help-admin:${cid || 'none'}`
// Body + media of articles already opened this session, shown straight away
// when you come back to one (and refreshed in the background).
const detailCache = new Map<string, { content: string | null; media: any[] | null }>()

export default function HelpAdminPage() {
  const router = useRouter()
  // Paint the last list seen (this session, or this device) straight away and
  // refresh it in the background, instead of a "Loading..." screen every visit.
  const seed = peekCompanyUser()
  const seeded = seed?.user ? readCache<any[]>(memKey(seed.companyId)) : undefined
  const [user, setUser] = useState<any>(seeded ? seed?.user : null)
  const [companyId, setCompanyId] = useState<string | null>(seeded ? seed?.companyId ?? null : null)
  const [articles, setArticles] = useState<any[]>(seeded ?? [])
  const [selected, setSelected] = useState<any>(seeded?.[0] ?? null)
  const [details, setDetails] = useState<Record<string, { content: string | null; media: any[] | null }>>(() => Object.fromEntries(detailCache))
  const [loading, setLoading] = useState(!seeded)
  const [seeding, setSeeding] = useState(false)
  const [openMenuId, setOpenMenuId] = useState<string | null>(null)
  const userIdRef = useRef<string | null>(seed?.user?.id ?? null)

  // Show a list and remember it for the next visit.
  const commitList = (list: any[], cid: string | null) => {
    setArticles(list)
    writeCache(memKey(cid), list)
    writeLocal('help-admin', userIdRef.current, cid || '', list)
  }

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }: any) => {
      const u = data?.session?.user
      setUser(u)
      userIdRef.current = u?.id || null
      let started: string | null | undefined = seeded ? (seed?.companyId ?? null) : undefined
      if (started === undefined && u) {
        const cached = readLocal<any[]>('help-admin', u.id)
        if (cached && Array.isArray(cached.data)) {
          started = cached.companyId || null
          setCompanyId(started)
          setArticles(cached.data)
          setSelected((prev: any) => prev || cached.data[0] || null)
          setLoading(false)
        }
      }
      const cid = u ? (await resolveCompanyUser()).companyId : null
      if (started !== undefined && cid !== started) {
        // A different workspace than the cached list — start clean.
        setArticles([]); setSelected(null); setLoading(true)
      }
      setCompanyId(cid)
      fetchArticles(cid)
    })
  }, [router])

  const fetchArticles = async (cid: string | null = companyId) => {
    try {
      let q = (supabase as any).from('help_articles').select(LIST_COLUMNS).order('created_at', { ascending: false })
      if (cid) q = q.eq('company_id', cid)
      const { data, error } = await q
      if (error) throw error
      const list = data || []
      commitList(list, cid)
      if (list.length > 0) setSelected((prev: any) => prev ? list.find((a: any) => a.id === prev.id) || list[0] : list[0])
    } catch { setArticles(prev => prev.length ? prev : []) }
    setLoading(false)
  }

  // Load the body/media of the article that's open — and only that one. A copy
  // from earlier this session shows at once; it's still refreshed once per
  // visit in case the article was edited since.
  const fetchedDetails = useRef(new Set<string>())
  useEffect(() => {
    const id = selected?.id
    if (!id || fetchedDetails.current.has(id)) return
    fetchedDetails.current.add(id)
    ;(async () => {
      try {
        const { data } = await (supabase as any).from('help_articles').select('id, content, media').eq('id', id).maybeSingle()
        if (!data) { fetchedDetails.current.delete(id); return }
        const d = { content: data.content ?? null, media: data.media ?? null }
        detailCache.set(id, d)
        setDetails(prev => ({ ...prev, [id]: d }))
      } catch { fetchedDetails.current.delete(id) }
    })()
  }, [selected?.id])

  // The open article with its body merged in once it has loaded.
  const current = selected ? { ...selected, ...(details[selected.id] || {}) } : null

  const seedArticles = async () => {
    setSeeding(true)
    try {
      await (supabase as any).from('help_articles').insert(
        // Into this workspace: a row with no company_id belongs to nobody, and
        // only the platform admin may write those (COLVY_V412).
        SEED_ARTICLES.map(a => ({ ...a, media: [], company_id: companyId }))
      )
      await fetchArticles()
      refreshPublicHelp(companyId)
    } catch (err: any) {
      alert('Seed failed: ' + err.message)
    }
    setSeeding(false)
  }

  const deleteArticle = async (id: string) => {
    if (!await confirmDialog('Delete this article?')) return
    await (supabase as any).from('help_articles').delete().eq('id', id)
    detailCache.delete(id)
    commitList(articles.filter((a: any) => a.id !== id), companyId)
    if (selected?.id === id) setSelected(null)
    setOpenMenuId(null)
    refreshPublicHelp(companyId, [id])
  }

  const copyLink = (id: string) => {
    navigator.clipboard.writeText(`${window.location.origin}/help/${id}`)
    alert('Link copied!')
    setOpenMenuId(null)
  }

  const formatDate = (d: string) => new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })

  const live = (a: any) => a.status === 'published'
  const statusTag = (a: any) => <span className="hc-tag" style={{ ['--tag' as any]: live(a) ? '#16a34a' : '#a1a1aa' }}>{live(a) ? 'Live' : 'Draft'}</span>

  const list = (
    <>
      <p className="hc-group">{articles.length} article{articles.length === 1 ? '' : 's'}</p>
      {articles.map(a => (
        <button key={a.id} type="button" onClick={() => setSelected(a)} className={`hc-art${selected?.id === a.id ? ' on' : ''}`} aria-current={selected?.id === a.id ? 'true' : undefined}>
          <span className="hc-art-t">{a.title}</span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4, minWidth: 0 }}>
            {a.category && <span className="hc-chip" style={{ maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis' }}>{a.category}</span>}
            {statusTag(a)}
          </span>
        </button>
      ))}
      {articles.length > 0 && articles.length < 9 && (
        <button type="button" onClick={seedArticles} disabled={seeding} className="cv-btn" style={{ width: '100%', height: 34, fontSize: 13, marginTop: 10 }}>
          {seeding ? 'Adding…' : 'Add sample articles'}
        </button>
      )}
      <style>{`
        .hc-art { display: block; width: 100%; padding: 9px 10px; margin-bottom: 2px; border: none; border-radius: 11px; background: none; font: inherit; text-align: left; cursor: pointer; transition: background .12s; }
        .hc-art:hover { background: #f4f4f5; }
        .hc-art.on { background: #f4f4f5; }
        .hc-art.on .hc-art-t { font-weight: 650; color: #111; }
        .hc-art:focus-visible { outline: 2px solid var(--coral); outline-offset: -2px; }
        .hc-art-t { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 14.5px; font-weight: 500; color: #27272a; }
        .hc-act { width: 100%; justify-content: flex-start; height: 40px; }
      `}</style>
    </>
  )

  if (!user || loading) return (
    <HelpShell>
      <div style={{ padding: '36px 44px' }}>
        {[180, 120, 320].map((w, i) => <div key={i} style={{ width: w, height: i === 2 ? 220 : 22, marginBottom: 16, borderRadius: 10, background: '#f4f4f5' }} />)}
      </div>
    </HelpShell>
  )

  return (
    <HelpShell nav={articles.length ? list : undefined}>
      <div className="hc-page" style={{ padding: '36px 44px 64px' }}>
        <style>{`@media (max-width: 860px) { .hc-page { padding: 20px 16px 40px !important; } }`}</style>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', marginBottom: 28 }}>
          <div>
            <h1 style={{ margin: '0 0 6px' }}>Articles</h1>
            <p style={{ margin: 0, fontSize: 15, color: '#71717a' }}>
              {articles.length} article{articles.length === 1 ? '' : 's'} · {articles.filter(live).length} live
            </p>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <Link href="/admin/help/import" className="cv-btn">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><circle cx="12" cy="12" r="9" /><path d="M3 12h18" /><path d="M12 3a14 14 0 0 1 0 18 14 14 0 0 1 0-18z" /></svg>
              Import from website
            </Link>
            <Link href="/admin/help/new" className="cv-btn cv-btn-primary">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
              New article
            </Link>
          </div>
        </div>

        {!selected ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', padding: '64px 16px', borderRadius: 20, background: '#f6f6f7' }}>
            <div style={{ width: 60, height: 60, borderRadius: 18, background: '#fff', color: 'var(--coral)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 1px 2px rgba(0,0,0,.06)', marginBottom: 16 }}>
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" /><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" /></svg>
            </div>
            <h2 style={{ margin: '0 0 6px', fontSize: 20, fontWeight: 800, color: '#111' }}>Your help centre</h2>
            <p style={{ margin: '0 0 20px', fontSize: 14.5, color: '#71717a' }}>Start from your website, or write your first article.</p>
            <Link href="/admin/help/import" className="cv-btn cv-btn-primary" style={{ height: 42, padding: '0 20px' }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><circle cx="12" cy="12" r="9" /><path d="M3 12h18" /><path d="M12 3a14 14 0 0 1 0 18 14 14 0 0 1 0-18z" /></svg>
              Import from your website with AI
            </Link>
            <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap', justifyContent: 'center' }}>
              <button type="button" onClick={seedArticles} disabled={seeding} className="cv-btn">{seeding ? 'Adding…' : 'Add 9 sample articles'}</button>
              <Link href="/admin/help/new" className="cv-btn">Write an article</Link>
            </div>
          </div>
        ) : (
          <div className="hc-detail">
            <style>{`
              .hc-detail { display: grid; grid-template-columns: minmax(0, 1fr) 260px; gap: 24px; align-items: start; }
              @media (max-width: 1100px) { .hc-detail { grid-template-columns: minmax(0, 1fr); } }
            `}</style>
            {/* The article */}
            <div style={{ minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
                {selected.category && <span className="hc-chip">{selected.category}</span>}
                {selected.featured && <span className="hc-tag" style={{ ['--tag' as any]: '#d97706' }}>Featured</span>}
                {statusTag(selected)}
              </div>
              <h2 style={{ margin: '0 0 6px', fontSize: 24, fontWeight: 800, letterSpacing: '-0.02em', color: '#111' }}>{selected.title}</h2>
              <p style={{ margin: '0 0 18px', fontSize: 13.5, color: '#8e8e93' }}>{formatDate(selected.created_at)} · {selected.views || 0} views · {selected.likes || 0} helpful</p>
              <div className="hc-card" style={{ padding: '22px 24px' }}>
                <div style={{ color: '#27272a', fontSize: 15, lineHeight: 1.75, whiteSpace: 'pre-wrap' }}>
                  {current?.content?.replace(/#{1,6} /g, '').replace(/\*\*([^*]+)\*\*/g, '$1').replace(/`([^`]+)`/g, '$1').slice(0, 600)}
                  {current?.content?.length > 600 && '…'}
                </div>
              </div>

              {/* Media */}
              {current?.media?.length > 0 && (
                <div className="hc-card" style={{ padding: 16, marginTop: 14 }}>
                  <p style={{ margin: '0 0 10px', fontSize: 13, fontWeight: 500, color: '#8e8e93' }}>Media ({current?.media.length})</p>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    {current?.media.map((m: any, i: number) => (
                      <div key={i} style={{ width: 84, height: 64, borderRadius: 10, overflow: 'hidden', background: '#f4f4f5' }}>
                        {m.type === 'youtube' ? (
                          <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#dc2626' }}>
                            <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-label="YouTube video"><path d="M8 5v14l11-7z" /></svg>
                          </div>
                        ) : m.type === 'video' ? (
                          <video src={m.src} style={{ width: '100%', height: '100%', objectFit: 'cover' }} muted />
                        ) : (
                          <img src={m.src} alt="" loading="lazy" decoding="async" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Numbers and actions */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div className="hc-card" style={{ padding: '16px 18px' }}>
                <p style={{ margin: '0 0 10px', fontSize: 14.5, fontWeight: 700, color: '#111' }}>Stats</p>
                {[
                  ['Views', selected.views || 0],
                  ['Helpful votes', selected.likes || 0],
                ].map(([label, value]) => (
                  <div key={label as string} style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', fontSize: 14 }}>
                    <span style={{ color: '#71717a' }}>{label}</span><span style={{ fontWeight: 650, color: '#111' }}>{value}</span>
                  </div>
                ))}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '5px 0', fontSize: 14 }}>
                  <span style={{ color: '#71717a' }}>Status</span>{statusTag(selected)}
                </div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <Link href={`/admin/help/new?edit=${selected.id}`} className="cv-btn cv-btn-dark hc-act"><IconEdit /> Edit article</Link>
                <button type="button" onClick={() => copyLink(selected.id)} className="cv-btn hc-act"><IconLink /> Copy link</button>
                <Link href={`/help/${selected.id}`} target="_blank" className="cv-btn hc-act"><IconView /> View live</Link>
                <button type="button" onClick={() => deleteArticle(selected.id)} className="cv-btn hc-act" style={{ color: '#dc2626' }}><IconDelete /> Delete</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </HelpShell>
  )
}
