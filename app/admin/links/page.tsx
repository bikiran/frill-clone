'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { peekCompanyUser, readCache, writeCache } from '@/lib/client-cache'
import { SkeletonList } from '@/components/Skeleton'
import { authFetch } from '@/lib/auth-fetch'
import {
  PUBLIC_LINK_CHANNELS, PUBLIC_CHANNEL_LABEL, linkFunnel,
  type Funnel, type FunnelClick, type FunnelConversion,
} from '@/lib/link-channels'
import EmptyScroll from '@/components/EmptyScroll'

function parseTs(d: string | null | undefined): Date | null {
  if (!d) return null
  let s = String(d).trim()
  if (!s) return null
  s = s.replace(' ', 'T').replace(/([+-]\d{2})$/, '$1:00')
  if (!/(Z|[+-]\d{2}:?\d{2})$/.test(s)) s += 'Z'
  const p = new Date(s)
  return isNaN(p.getTime()) ? null : p
}
const fmt = (d: string | null | undefined) => {
  const p = parseTs(d)
  return p ? p.toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'
}
const money = (n: number) =>
  new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD', currencyDisplay: 'narrowSymbol' }).format(n || 0)
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`

const TYPE_LABEL: Record<string, string> = {
  product: 'Product', image: 'Image', help: 'Help article', form: 'Form',
  checkout: 'Checkout', external: 'Website', booking: 'Booking', payment: 'Payment',
}
const SHORT_CHANNEL: Record<string, string> = Object.fromEntries(PUBLIC_LINK_CHANNELS.map(c => [c.id, c.short]))

/** Download a QR code for a short link, as a print-ready PNG or a scalable SVG. */
async function downloadQr(url: string, code: string, format: 'png' | 'svg') {
  const QR = (await import('qrcode')).default
  // Medium error correction keeps the pattern simple enough to scan from a
  // poster across the room, with no logo covering it.
  const opts = { errorCorrectionLevel: 'M' as const, margin: 2, width: 1024, color: { dark: '#000000', light: '#ffffff' } }
  let href: string
  if (format === 'svg') {
    const svg = await QR.toString(url, { ...opts, type: 'svg' })
    href = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }))
  } else {
    href = await QR.toDataURL(url, opts)
  }
  const a = document.createElement('a')
  a.href = href
  a.download = `qr-${code}.${format}`
  document.body.appendChild(a)
  a.click()
  a.remove()
  if (format === 'svg') setTimeout(() => URL.revokeObjectURL(href), 2000)
}

/** A small preview of the QR code, drawn on demand. */
function QrPreview({ url }: { url: string }) {
  const [src, setSrc] = useState('')
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const QR = (await import('qrcode')).default
        const d = await QR.toDataURL(url, { errorCorrectionLevel: 'M', margin: 1, width: 240 })
        if (!cancelled) setSrc(d)
      } catch { /* the download buttons still work */ }
    })()
    return () => { cancelled = true }
  }, [url])
  return src
    ? <img src={src} alt="QR code" width={120} height={120} style={{ display: 'block', borderRadius: 14, background: '#fff', boxShadow: '0 0 0 1px rgba(0,0,0,.06)' }} />
    : <div style={{ width: 120, height: 120, borderRadius: 14, background: '#fff' }} />
}

function QrButtons({ url, code, compact }: { url: string; code: string; compact?: boolean }) {
  const [busy, setBusy] = useState('')
  const go = async (f: 'png' | 'svg') => {
    setBusy(f)
    try { await downloadQr(url, code, f) } catch { /* nothing to download */ } finally { setBusy('') }
  }
  const btn: React.CSSProperties = { height: compact ? 32 : 34, padding: '0 13px', borderRadius: 999, border: 'none', background: '#fff', boxShadow: '0 0 0 1px rgba(0,0,0,.08)', fontSize: 13, fontWeight: 600, cursor: 'pointer', color: '#18181b', display: 'inline-flex', alignItems: 'center', gap: 6, fontFamily: 'inherit' }
  const icon = (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
  )
  return (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
      <button type="button" onClick={() => go('png')} disabled={!!busy} style={btn}>{icon}{busy === 'png' ? 'Preparing…' : 'QR as PNG'}</button>
      <button type="button" onClick={() => go('svg')} disabled={!!busy} style={btn}>{icon}{busy === 'svg' ? 'Preparing…' : 'QR as SVG'}</button>
    </div>
  )
}

/** "12 clicks · 9 people · 2 chats · 1 booking · $85" — only the steps reached. */
function FunnelLine({ f }: { f: Funnel }) {
  if (!f.clicks) return null
  const parts = [plural(f.clicks, 'click'), plural(f.visitors, 'person', 'people')]
  if (f.chats) parts.push(plural(f.chats, 'chat'))
  if (f.leads) parts.push(plural(f.leads, 'new lead'))
  if (f.bookings) parts.push(plural(f.bookings, 'booking'))
  if (f.orders) parts.push(plural(f.orders, 'order'))
  return (
    <div className="lg-funnel">
      {parts.join(' · ')}
      {f.revenue > 0 && <> · <strong style={{ color: '#15803d' }}>{money(f.revenue)}</strong></>}
    </div>
  )
}

export default function LinksGeneratorPage() {
  const router = useRouter()
  const seededCid = peekCompanyUser()?.companyId ?? null
  const seededLinks = seededCid ? readCache<any[]>(`links:${seededCid}`) : undefined
  const [loading, setLoading] = useState(!seededLinks)
  const [companyId, setCompanyId] = useState<string | null>(seededCid)
  const [slug, setSlug] = useState<string | null>(null)
  const [links, setLinks] = useState<any[]>(seededLinks ?? [])
  const [funnels, setFunnels] = useState<Record<string, Funnel>>({})
  const [url, setUrl] = useState('')
  const [channel, setChannel] = useState('')
  const [label, setLabel] = useState('')
  const [customCode, setCustomCode] = useState('')
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState<{ url: string; target: string; code: string } | null>(null)
  const [copied, setCopied] = useState('')
  const [search, setSearch] = useState('')
  const [qrOpen, setQrOpen] = useState<string | null>(null)

  useEffect(() => {
    ;(async () => {
      try {
        let cid: string | null = seededCid
        if (!cid && typeof window !== 'undefined') {
          const host = window.location.hostname
          if (host.endsWith('.colvy.com') && host !== 'colvy.com') {
            const slug = host.replace('.colvy.com', '')
            const { data: co } = await (supabase as any).from('companies').select('id').eq('slug', slug).maybeSingle()
            if (co) cid = co.id
          }
        }
        if (!cid) {
          const { data: { session } } = await supabase.auth.getSession()
          if (session?.user) {
            const { data: own } = await (supabase as any).from('companies').select('id').eq('owner_id', session.user.id).maybeSingle()
            if (own?.id) cid = own.id
            else {
              const { data: mem } = await (supabase as any).from('team_members').select('company_id').eq('user_id', session.user.id).limit(1)
              if (mem?.length) cid = mem[0].company_id
            }
          }
        }
        if (!cid) { setLoading(false); return }
        setCompanyId(cid)
        supabase.from('companies').select('slug').eq('id', cid).maybeSingle()
          .then(({ data }) => { if (data?.slug) setSlug(String(data.slug)) }, () => {})
        await loadLinks(cid)
      } finally { setLoading(false) }
    })()
  }, [])

  const loadLinks = async (cid: string) => {
    const { data } = await (supabase as any).from('short_links')
      .select('*').eq('company_id', cid)
      .order('created_at', { ascending: false }).limit(200)
    setLinks(data || [])
    writeCache(`links:${cid}`, data || [])
    loadFunnels(cid, data || [])
  }

  // Clicks and what they led to, per link. Read in chunks so the id list stays
  // a sensible size; a failure just leaves the funnel line off.
  const loadFunnels = async (cid: string, rows: { id: string; clicks?: number | null }[]) => {
    try {
      const ids = rows.map(l => l.id)
      const clicks: (FunnelClick & { link_id: string })[] = []
      const convs: (FunnelConversion & { link_id: string })[] = []
      for (let i = 0; i < ids.length; i += 100) {
        const chunk = ids.slice(i, i + 100)
        const [cl, cv] = await Promise.all([
          supabase.from('link_clicks').select('id, link_id, contact_id, ip, user_agent')
            .eq('company_id', cid).in('link_id', chunk).limit(10000),
          // Conversions only exist once the V192 migration has been run.
          Promise.resolve(supabase.from('link_conversions').select('id, link_id, stage, order_id, revenue')
            .eq('company_id', cid).in('link_id', chunk).limit(5000)).catch(() => ({ data: null })),
        ])
        clicks.push(...(cl?.data || []))
        convs.push(...(cv?.data || []))
      }
      const out: Record<string, Funnel> = {}
      for (const l of rows) {
        out[l.id] = linkFunnel(clicks.filter(c => c.link_id === l.id), convs.filter(v => v.link_id === l.id), l.clicks || 0)
      }
      setFunnels(out)
    } catch { /* the plain click counts still show */ }
  }

  const create = async () => {
    if (!url.trim() || !companyId) return
    setBusy(true); setError(''); setResult(null)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await authFetch('/api/short-links/create', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          companyId, kind: 'redirect', url: url.trim(),
          // Always sent, so every link made here is its own link and Link
          // Reports can tell the Reel from the poster.
          channel: channel || 'public_other',
          label: label.trim() || undefined,
          customCode: customCode.trim() || undefined,
          sentBy: session?.user?.user_metadata?.display_name || session?.user?.email?.split('@')[0] || null,
        }),
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error || 'Could not create the link')
      setResult({ url: d.url, target: d.target || url.trim(), code: d.code })
      setUrl(''); setLabel(''); setCustomCode('')
      await loadLinks(companyId)
    } catch (e: any) { setError(e.message) }
    finally { setBusy(false) }
  }

  const copy = async (text: string, id: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(id)
      setTimeout(() => setCopied(''), 1800)
    } catch { /* clipboard blocked — the text is selectable anyway */ }
  }

  const visible = links.filter(l => {
    if (!search) return true
    const q = search.toLowerCase()
    return [l.target_url, l.label, l.code, PUBLIC_CHANNEL_LABEL[l.channel || '']].filter(Boolean).join(' ').toLowerCase().includes(q)
  })

  // The link as customers see it: on the business's own subdomain when we're
  // on colvy.com, so a printed QR code reads as the business, not as Colvy.
  const shortUrlFor = (l: any) => {
    const path = (l.kind === 'review' || l.kind === 'media') ? 'm' : 'l'
    if (typeof window === 'undefined') return `/${path}/${l.code}`
    const onColvy = window.location.hostname === 'colvy.com' || window.location.hostname.endsWith('.colvy.com')
    const origin = onColvy && slug ? `https://${slug}.colvy.com` : window.location.origin
    return `${origin}/${path}/${l.code}`
  }

  if (loading) return <div style={{ padding: '24px 28px' }}><SkeletonList rows={5} /></div>

  const I = (d: React.ReactNode, size = 15) => <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{d}</svg>
  const linkIcon = I(<><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" /><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" /></>, 16)
  const totalClicks = links.reduce((n, l) => n + (funnels[l.id]?.clicks ?? (l.clicks || 0)), 0)

  return (
    <div className="lg-page">
      <style>{LG_CSS}</style>
      <div className="lg-head">
        <div>
          <h1>Short links</h1>
          <p>Make one link for each Reel, TikTok, video or poster. Every click is recorded, and when that person chats, books or buys, it&apos;s credited to the link, so you can see which post worked.</p>
        </div>
        <button type="button" className="lg-pill" onClick={() => router.push('/admin/link-reports')}>
          {I(<><line x1="18" y1="20" x2="18" y2="10" /><line x1="12" y1="20" x2="12" y2="4" /><line x1="6" y1="20" x2="6" y2="14" /></>, 15)} Full reports
        </button>
      </div>

      {/* Creator */}
      <div className="lg-card lg-create">
        <label className="lg-label" htmlFor="lg-url">Paste a link</label>
        <div className="lg-url-row">
          <div className="lg-url">
            {linkIcon}
            <input id="lg-url" value={url} onChange={e => setUrl(e.target.value)} onKeyDown={e => e.key === 'Enter' && create()}
              placeholder="https://roxyaquarium.com.au/product/..." />
          </div>
          <button type="button" className="cv-btn cv-btn-primary lg-go" onClick={create} disabled={busy || !url.trim()}>
            {busy ? 'Shortening…' : 'Shorten'}
          </button>
        </div>

        <p className="lg-label" style={{ marginTop: 18 }}>Where will you post it?</p>
        <div className="lg-chips" role="radiogroup" aria-label="Where will you post it?">
          {PUBLIC_LINK_CHANNELS.map(c => (
            <button key={c.id} type="button" role="radio" aria-checked={channel === c.id}
              className={`lg-chip${channel === c.id ? ' on' : ''}`} onClick={() => setChannel(channel === c.id ? '' : c.id)}>
              {c.label}
            </button>
          ))}
        </div>

        <div className="lg-two" style={{ marginTop: 16 }}>
          <label className="lg-field">
            <span className="lg-label">Name <em>(so you can find it later)</em></span>
            <input value={label} onChange={e => setLabel(e.target.value)} placeholder="New arrivals Reel, 12 Oct" />
          </label>
          {showAdvanced ? (
            <label className="lg-field">
              <span className="lg-label">Custom code <em>(optional)</em></span>
              <input value={customCode} onChange={e => setCustomCode(e.target.value)} placeholder="weekend-sale" />
            </label>
          ) : (
            <div style={{ display: 'flex', alignItems: 'flex-end' }}>
              <button type="button" className="lg-quiet" onClick={() => setShowAdvanced(true)}>
                {I(<><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></>, 14)} Use a custom code
              </button>
            </div>
          )}
        </div>

        {error && <p className="lg-error" role="alert">{error}</p>}

        {result && (
          <div className="lg-result" role="status">
            <p className="lg-result-h">{I(<polyline points="20 6 9 17 4 12" />, 15)} Your short link is ready</p>
            <div className="lg-result-row">
              <code>{result.url}</code>
              <button type="button" className="lg-copy-big" onClick={() => copy(result.url, 'new')}>{copied === 'new' ? 'Copied' : 'Copy'}</button>
            </div>
            <p className="lg-result-target">Goes to {result.target}</p>
            {result.code && <QrButtons url={result.url} code={result.code} />}
          </div>
        )}
      </div>

      {/* Existing links */}
      <div className="lg-list-head">
        <h2>Your links{links.length > 0 && <span className="lg-count">{links.length}</span>}{totalClicks > 0 && <span className="lg-sub">{totalClicks.toLocaleString()} click{totalClicks === 1 ? '' : 's'}</span>}</h2>
        <label className="lg-search">
          {I(<><circle cx="11" cy="11" r="7" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></>, 15)}
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search links" aria-label="Search links" />
          {search && <button type="button" className="lg-x" onClick={() => setSearch('')} aria-label="Clear search">{I(<><path d="M18 6 6 18" /><path d="m6 6 12 12" /></>, 12)}</button>}
        </label>
      </div>

      <div className="lg-card lg-list">
        {visible.length === 0 && (
          <div style={{ padding: '20px 12px' }}>
            {links.length === 0
              ? <EmptyScroll kinds={['link']} title="No links yet" line="Shorten a link above to track every click, and who it came from." />
              : <EmptyScroll kinds={['link']} title="No matches" line={`Nothing matches “${search.trim()}”. Try part of the address or label.`}
                  action={<button type="button" className="cv-btn" onClick={() => setSearch('')}>Clear search</button>} />}
          </div>
        )}
        {visible.map(l => {
          const full = shortUrlFor(l)
          const where = SHORT_CHANNEL[l.channel || '']
          const clicks = funnels[l.id]?.clicks ?? (l.clicks || 0)
          return (
            <div key={l.id} className="lg-item">
              <div className="lg-row">
                <span className="lg-ic">{linkIcon}</span>
                <div className="lg-main">
                  <div className="lg-top">
                    <span className="lg-name">{l.label && l.label !== 'Link' ? l.label : `/${(l.kind === 'review' || l.kind === 'media') ? 'm' : 'l'}/${l.code}`}</span>
                    {where && <span className="lg-tag dot">{where}</span>}
                    {l.link_type && <span className="lg-tag">{TYPE_LABEL[l.link_type] || l.link_type}</span>}
                  </div>
                  <div className="lg-meta">
                    {l.label && l.label !== 'Link' && <code>/{(l.kind === 'review' || l.kind === 'media') ? 'm' : 'l'}/{l.code}</code>}
                    <span className="lg-target">{l.target_url}</span>
                  </div>
                  {funnels[l.id] && <FunnelLine f={funnels[l.id]} />}
                </div>
                <div className="lg-clicks">
                  <b className={clicks ? 'on' : ''}>{clicks.toLocaleString()}</b>
                  <span>click{clicks === 1 ? '' : 's'}</span>
                </div>
                <div className="lg-date">{fmt(l.created_at)}</div>
                <div className="lg-acts">
                  <button type="button" className={`lg-btn${qrOpen === l.id ? ' on' : ''}`} onClick={() => setQrOpen(qrOpen === l.id ? null : l.id)} aria-expanded={qrOpen === l.id} title="QR code">
                    {I(<><rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" /><rect x="3" y="14" width="7" height="7" /><path d="M14 14h3v3h-3zM20 14v1M14 20h1M18 18h3v3" /></>, 14)}QR
                  </button>
                  <button type="button" className={`lg-btn${copied === l.id ? ' done' : ''}`} onClick={() => copy(full, l.id)}>
                    {copied === l.id ? I(<polyline points="20 6 9 17 4 12" />, 14) : I(<><rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></>, 14)}
                    {copied === l.id ? 'Copied' : 'Copy'}
                  </button>
                </div>
              </div>
              {qrOpen === l.id && (
                <div className="lg-qr">
                  <QrPreview url={full} />
                  <div style={{ flex: 1, minWidth: 200 }}>
                    <div style={{ fontSize: 14, color: 'var(--ink)', fontWeight: 600, wordBreak: 'break-all', marginBottom: 4 }}>{full}</div>
                    <p style={{ margin: '0 0 12px', fontSize: 13, color: '#71717a' }}>
                      Every scan counts as a click on this link. Print it at least 2 cm wide.
                    </p>
                    <QrButtons url={full} code={l.code} compact />
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// The Links look: a big bold header, a soft creator card with a grey pill
// field and channel chips, and a list of links with pill actions.
const LG_CSS = `
.lg-page{max-width:980px;margin:0 auto;padding:24px 28px 48px;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:var(--ink)}
.lg-page button::before{display:none}
.lg-head{display:flex;align-items:flex-end;justify-content:space-between;gap:16px;margin-bottom:20px}
.lg-head h1{margin:0;font-size:30px;font-weight:800;letter-spacing:-.025em;line-height:1.1}
.lg-head p{margin:8px 0 0;font-size:14px;color:#71717a;line-height:1.55;max-width:640px}
.lg-pill{display:inline-flex;align-items:center;gap:7px;height:38px;padding:0 15px;border:none;border-radius:999px;background:#f4f4f5;color:#18181b;font:inherit;font-size:13.5px;font-weight:600;cursor:pointer;white-space:nowrap;flex-shrink:0;transition:background-color .15s}
.lg-pill:hover{background-color:#ececef}
.lg-card{background:#fff;border-radius:20px;box-shadow:0 0 0 1px rgba(0,0,0,.06),0 1px 2px rgba(16,24,40,.04)}
.lg-create{padding:20px;margin-bottom:24px}
.lg-label{display:block;margin:0 0 8px;font-size:14px;font-weight:600;color:var(--ink)}
.lg-label em{font-style:normal;font-weight:400;color:#8e8e93}
.lg-url-row{display:flex;gap:8px;flex-wrap:wrap}
.lg-url{flex:1;min-width:220px;display:flex;align-items:center;gap:10px;height:46px;padding:0 16px;border-radius:999px;border:1.5px solid transparent;background:#f4f4f5;color:#a1a1aa;box-sizing:border-box;transition:background-color .15s,border-color .15s,box-shadow .15s}
.lg-url:focus-within{background:#fff;border-color:#d4d4d8;box-shadow:0 0 0 3px color-mix(in srgb,var(--coral) 16%,transparent)}
.lg-url input{flex:1;min-width:0;border:none;outline:none;background:transparent;font:inherit;font-size:15px;color:var(--ink)}
.lg-url input:focus{box-shadow:none}
.lg-go{height:46px!important;padding:0 24px!important;font-size:15px!important}
.lg-chips{display:flex;flex-wrap:wrap;gap:6px}
.lg-chip{height:34px;padding:0 14px;border:none;border-radius:999px;background:#f4f4f5;color:#3f3f46;font:inherit;font-size:13.5px;font-weight:600;cursor:pointer;transition:background-color .15s,color .15s}
.lg-chip:hover{background-color:#ececef;color:#18181b}
.lg-chip.on{background:#18181b;color:#fff}
.lg-two{display:grid;grid-template-columns:1fr 1fr;gap:12px}
.lg-field{display:block}
.lg-field input{display:block;width:100%;box-sizing:border-box;height:42px;padding:0 14px;border:1.5px solid transparent;border-radius:12px;background:#f4f4f5;font:inherit;font-size:14px;color:var(--ink);outline:none;transition:background-color .15s,border-color .15s,box-shadow .15s}
.lg-field input:focus{background:#fff;border-color:#d4d4d8!important;box-shadow:0 0 0 3px color-mix(in srgb,var(--coral) 16%,transparent)}
.lg-quiet{display:inline-flex;align-items:center;gap:6px;height:42px;padding:0 14px;border:none;border-radius:999px;background:none;font:inherit;font-size:13.5px;font-weight:600;color:#52525b;cursor:pointer}
.lg-quiet:hover{background:#f4f4f5;color:#18181b}
.lg-error{margin:12px 0 0;padding:10px 14px;border-radius:14px;background:#fef2f2;color:#b91c1c;font-size:13.5px}
.lg-result{margin-top:16px;padding:16px;border-radius:18px;background:color-mix(in srgb,#22c55e 8%,#fff);box-shadow:0 0 0 1px color-mix(in srgb,#22c55e 20%,transparent)}
.lg-result-h{display:flex;align-items:center;gap:6px;margin:0 0 10px;font-size:14px;font-weight:700;color:#15803d}
.lg-result-row{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
.lg-result-row code{flex:1;min-width:200px;font-family:inherit;padding:10px 14px;border-radius:12px;background:#fff;font-size:15px;font-weight:700;color:#166534;word-break:break-all}
.lg-copy-big{height:42px;padding:0 20px;border:none;border-radius:999px;background:#15803d;color:#fff;font:inherit;font-size:14px;font-weight:600;cursor:pointer}
.lg-copy-big:hover{filter:brightness(.95)}
.lg-result-target{margin:8px 0 12px;font-size:13px;color:#166534;word-break:break-all}
.lg-list-head{display:flex;justify-content:space-between;align-items:center;gap:12px;margin-bottom:12px;flex-wrap:wrap}
.lg-list-head h2{display:flex;align-items:center;gap:8px;margin:0;font-size:18px;font-weight:700;letter-spacing:-.01em}
.lg-count{display:inline-flex;align-items:center;justify-content:center;min-width:22px;height:22px;padding:0 7px;border-radius:999px;background:#f4f4f5;font-size:12px;font-weight:700;color:#52525b}
.lg-sub{font-size:13.5px;font-weight:500;color:#8e8e93}
.lg-search{display:flex;align-items:center;gap:8px;width:260px;max-width:100%;height:38px;padding:0 10px 0 14px;border-radius:999px;border:1.5px solid transparent;background:#f4f4f5;color:#a1a1aa;box-sizing:border-box;transition:background-color .15s,border-color .15s,box-shadow .15s}
.lg-search:focus-within{background:#fff;border-color:#d4d4d8;box-shadow:0 0 0 3px color-mix(in srgb,var(--coral) 16%,transparent)}
.lg-search input{flex:1;min-width:0;border:none;outline:none;background:transparent;font:inherit;font-size:14px;color:var(--ink)}
.lg-search input:focus{box-shadow:none}
.lg-x{width:24px;height:24px;padding:0;border:none;border-radius:999px;background:#e4e4e7;color:#52525b;display:inline-flex;align-items:center;justify-content:center;cursor:pointer}
.lg-list{overflow:hidden}
.lg-item + .lg-item{border-top:1px solid #f4f4f5}
.lg-row{display:flex;align-items:center;gap:14px;padding:14px 18px}
.lg-ic{width:38px;height:38px;border-radius:12px;flex-shrink:0;display:inline-flex;align-items:center;justify-content:center;background:color-mix(in srgb,var(--coral) 10%,#fff);color:var(--coral)}
.lg-main{flex:1;min-width:0}
.lg-top{display:flex;align-items:center;gap:7px;flex-wrap:wrap;min-width:0}
.lg-name{font-size:14.5px;font-weight:600;color:var(--ink);min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:100%}
.lg-tag{display:inline-flex;align-items:center;gap:5px;height:22px;padding:0 8px;border-radius:999px;background:#f4f4f5;color:#52525b;font-size:12px;font-weight:600;white-space:nowrap}
.lg-tag.dot{background:color-mix(in srgb,var(--coral) 11%,#fff);color:color-mix(in srgb,var(--coral) 82%,#000)}
.lg-tag.dot::before{content:'';width:6px;height:6px;border-radius:50%;background:var(--coral)}
.lg-meta{display:flex;align-items:center;gap:8px;margin-top:3px;font-size:12.5px;color:#8e8e93;min-width:0}
.lg-meta code{flex-shrink:0;font-family:inherit;font-weight:600;color:color-mix(in srgb,var(--coral) 85%,#000)}
.lg-target{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.lg-funnel{font-size:12.5px;color:#71717a;margin-top:4px}
.lg-clicks{display:flex;flex-direction:column;align-items:flex-end;flex-shrink:0;min-width:56px}
.lg-clicks b{font-size:18px;font-weight:800;color:#c4c4c8;font-variant-numeric:tabular-nums;line-height:1.1}
.lg-clicks b.on{color:#15803d}
.lg-clicks span{font-size:12px;color:#8e8e93}
.lg-date{flex-shrink:0;min-width:96px;font-size:13px;color:#8e8e93;text-align:right}
.lg-acts{display:flex;gap:6px;flex-shrink:0}
.lg-btn{display:inline-flex;align-items:center;gap:6px;height:32px;padding:0 12px;border:none;border-radius:999px;background:#f4f4f5;color:#18181b;font:inherit;font-size:13px;font-weight:600;cursor:pointer;transition:background-color .15s,color .15s}
.lg-btn:hover{background-color:#ececef}
.lg-btn.on{background:#18181b;color:#fff}
.lg-btn.done{background:#dcfce7;color:#15803d}
.lg-qr{display:flex;gap:16px;align-items:center;flex-wrap:wrap;margin:0 18px 14px;padding:14px 16px;border-radius:16px;background:#f4f4f5}
.lg-chip:focus-visible,.lg-btn:focus-visible,.lg-pill:focus-visible,.lg-quiet:focus-visible{outline:none;box-shadow:0 0 0 3px color-mix(in srgb,var(--coral) 28%,transparent)}
@media(max-width:760px){
  .lg-row{flex-wrap:wrap;gap:10px 12px}
  .lg-main{flex:1 1 calc(100% - 120px)}
  .lg-date{display:none}
  .lg-acts{width:100%;padding-left:50px}
}
@media(max-width:640px){
  .lg-page{padding:16px 14px 40px}
  .lg-head{flex-direction:column;align-items:stretch}
  .lg-head h1{font-size:26px}
  .lg-two{grid-template-columns:1fr}
  .lg-create{padding:16px}
  .lg-url{min-width:0;flex-basis:100%}
  .lg-go{flex:1}
  .lg-url input,.lg-field input,.lg-search input{font-size:16px}
  .lg-search{width:100%}
  .lg-row{padding:14px}
  .lg-qr{margin:0 14px 14px}
}
`
