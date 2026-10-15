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
    ? <img src={src} alt="QR code" width={120} height={120} style={{ display: 'block', borderRadius: 8, border: '1px solid var(--border)' }} />
    : <div style={{ width: 120, height: 120, borderRadius: 8, background: 'var(--canvas)' }} />
}

function QrButtons({ url, code, compact }: { url: string; code: string; compact?: boolean }) {
  const [busy, setBusy] = useState('')
  const go = async (f: 'png' | 'svg') => {
    setBusy(f)
    try { await downloadQr(url, code, f) } catch { /* nothing to download */ } finally { setBusy('') }
  }
  const btn: React.CSSProperties = { padding: compact ? '6px 11px' : '8px 14px', borderRadius: 9, border: '1px solid var(--border)', background: '#fff', fontSize: 12.5, fontWeight: 700, cursor: 'pointer', color: 'var(--ink)', display: 'inline-flex', alignItems: 'center', gap: 6 }
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

  const card: React.CSSProperties = { border: '1px solid var(--border)', borderRadius: 14, background: '#fff', padding: 18 }
  const input: React.CSSProperties = { width: '100%', padding: '11px 13px', borderRadius: 10, border: '1px solid var(--border)', fontSize: 14, boxSizing: 'border-box' }
  const label_: React.CSSProperties = { fontSize: 11.5, fontWeight: 700, color: 'var(--slate)', textTransform: 'uppercase', letterSpacing: '0.03em', display: 'block', marginBottom: 6 }

  if (loading) return <SkeletonList rows={5} />

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: 24 }} className="lg-page">
      <style>{`
        .lg-chips { display: flex; flex-wrap: wrap; gap: 6px; }
        .lg-chip { padding: 7px 12px; border-radius: 999px; border: 1px solid var(--border); background: #fff; color: var(--slate); font-size: 12.5px; font-weight: 700; cursor: pointer; }
        .lg-chip.on { border-color: var(--coral); background: var(--peach); color: var(--coral); }
        .lg-two { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
        .lg-funnel { font-size: 11.5px; color: var(--slate); margin-top: 4px; }
        .lg-qr { display: flex; gap: 14px; align-items: center; flex-wrap: wrap; padding: 12px 15px 14px; background: var(--canvas); border-bottom: 1px solid var(--border); }
        @media (max-width: 640px) {
          .lg-page { padding: 16px !important; }
          .lg-two { grid-template-columns: 1fr; }
        }
      `}</style>
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: 24, fontWeight: 800, color: 'var(--ink)', margin: 0 }}>Create Short URL</h1>
        <p style={{ color: 'var(--slate)', fontSize: 13.5, margin: '6px 0 0' }}>
          Make one link for each Reel, TikTok, video or poster. Every click is recorded, and when that
          person chats, books or buys, it&apos;s credited to the link — so you can see which post worked.
        </p>
      </div>

      {/* Creator */}
      <div style={{ ...card, marginBottom: 18 }}>
        <label style={label_}>Paste URL</label>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <input value={url} onChange={e => setUrl(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && create()}
            placeholder="https://roxyaquarium.com.au/product/..."
            style={{ ...input, flex: 1, minWidth: 220 }} />
          <button onClick={create} disabled={busy || !url.trim()}
            style={{ padding: '11px 22px', borderRadius: 10, background: 'var(--coral)', color: '#fff', border: 'none', fontSize: 14, fontWeight: 700, cursor: 'pointer', opacity: busy || !url.trim() ? 0.5 : 1, whiteSpace: 'nowrap' }}>
            {busy ? 'Shortening…' : 'Shorten'}
          </button>
        </div>

        <div style={{ marginTop: 14 }}>
          <label style={label_}>Where will you post this?</label>
          <div className="lg-chips" role="radiogroup" aria-label="Where will you post this?">
            {PUBLIC_LINK_CHANNELS.map(c => (
              <button key={c.id} type="button" role="radio" aria-checked={channel === c.id}
                className={`lg-chip${channel === c.id ? ' on' : ''}`}
                onClick={() => setChannel(channel === c.id ? '' : c.id)}>
                {c.label}
              </button>
            ))}
          </div>
        </div>

        <div className="lg-two" style={{ marginTop: 12 }}>
          <div>
            <label style={label_}>Name (so you can find it later)</label>
            <input value={label} onChange={e => setLabel(e.target.value)}
              placeholder="New arrivals Reel, 12 Oct" style={input} />
          </div>
          {showAdvanced ? (
            <div>
              <label style={label_}>Custom code (optional)</label>
              <input value={customCode} onChange={e => setCustomCode(e.target.value)}
                placeholder="weekend-sale" style={input} />
            </div>
          ) : (
            <div style={{ display: 'flex', alignItems: 'flex-end' }}>
              <button type="button" onClick={() => setShowAdvanced(true)}
                style={{ border: 'none', background: 'none', padding: '0 0 12px', color: 'var(--slate)', fontSize: 12.5, fontWeight: 600, cursor: 'pointer' }}>
                + Use a custom code
              </button>
            </div>
          )}
        </div>

        {error && (
          <p style={{ margin: '10px 0 0', fontSize: 13, color: '#dc2626' }}>{error}</p>
        )}

        {result && (
          <div style={{ marginTop: 14, padding: 14, borderRadius: 11, background: '#f0fdf4', border: '1px solid #bbf7d0' }}>
            <div style={{ fontSize: 11.5, fontWeight: 700, color: '#15803d', textTransform: 'uppercase', letterSpacing: '0.03em', marginBottom: 6 }}>
              Your short link
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <code style={{ flex: 1, minWidth: 200, fontSize: 15, fontWeight: 700, color: '#166534', wordBreak: 'break-all' }}>
                {result.url}
              </code>
              <button onClick={() => copy(result.url, 'new')}
                style={{ padding: '8px 16px', borderRadius: 9, background: '#15803d', color: '#fff', border: 'none', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
                {copied === 'new' ? 'Copied' : 'Copy'}
              </button>
            </div>
            <p style={{ margin: '8px 0 10px', fontSize: 12, color: '#166534', wordBreak: 'break-all' }}>
              → {result.target}
            </p>
            {result.code && <QrButtons url={result.url} code={result.code} />}
          </div>
        )}
      </div>

      {/* Existing links */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, marginBottom: 10, flexWrap: 'wrap' }}>
        <h2 style={{ fontSize: 15, fontWeight: 800, color: 'var(--ink)', margin: 0 }}>Your links</h2>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search links…"
            style={{ padding: '7px 11px', borderRadius: 9, border: '1px solid var(--border)', fontSize: 13, minWidth: 0 }} />
          <button onClick={() => router.push('/admin/link-reports')}
            style={{ padding: '7px 14px', borderRadius: 9, border: '1px solid var(--border)', background: '#fff', fontSize: 12.5, fontWeight: 700, cursor: 'pointer', color: 'var(--slate)', whiteSpace: 'nowrap' }}>
            Full reports
          </button>
        </div>
      </div>

      <div style={{ border: '1px solid var(--border)', borderRadius: 14, background: '#fff', overflow: 'hidden' }}>
        {visible.length === 0 && (
          <p style={{ padding: 30, textAlign: 'center', color: 'var(--slate)', fontSize: 13.5, margin: 0 }}>
            {links.length === 0 ? 'No links yet — shorten one above.' : 'No links match that search.'}
          </p>
        )}
        {visible.map(l => {
          const full = shortUrlFor(l)
          const where = SHORT_CHANNEL[l.channel || '']
          return (
            <div key={l.id}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '13px 15px', borderBottom: '1px solid var(--border)', flexWrap: 'wrap' }}>
                <div style={{ flex: 1, minWidth: 200 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <code style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--coral)' }}>/{(l.kind === 'review' || l.kind === 'media') ? 'm' : 'l'}/{l.code}</code>
                    {where && (
                      <span style={{ fontSize: 10.5, fontWeight: 700, padding: '2px 7px', borderRadius: 20, background: 'var(--peach)', color: 'var(--coral)' }}>
                        {where}
                      </span>
                    )}
                    {l.link_type && (
                      <span style={{ fontSize: 10.5, fontWeight: 700, padding: '2px 7px', borderRadius: 20, background: 'var(--canvas)', color: 'var(--slate)' }}>
                        {TYPE_LABEL[l.link_type] || l.link_type}
                      </span>
                    )}
                  </div>
                  {l.label && l.label !== 'Link' && (
                    <div style={{ fontSize: 12.5, color: 'var(--ink)', fontWeight: 600, marginTop: 2 }}>{l.label}</div>
                  )}
                  <div style={{ fontSize: 11.5, color: '#9ca3af', wordBreak: 'break-all', marginTop: 2 }}>{l.target_url}</div>
                  {funnels[l.id] && <FunnelLine f={funnels[l.id]} />}
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 16, fontWeight: 800, color: l.clicks ? '#059669' : '#d1d5db' }}>{funnels[l.id]?.clicks ?? (l.clicks || 0)}</div>
                  <div style={{ fontSize: 10.5, color: 'var(--slate)' }}>clicks</div>
                </div>
                <div style={{ fontSize: 11.5, color: 'var(--slate)', minWidth: 90 }}>{fmt(l.created_at)}</div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button onClick={() => setQrOpen(qrOpen === l.id ? null : l.id)} aria-expanded={qrOpen === l.id} title="QR code"
                    style={{ padding: '6px 11px', borderRadius: 8, border: '1px solid ' + (qrOpen === l.id ? 'var(--coral)' : 'var(--border)'), background: qrOpen === l.id ? 'var(--peach)' : '#fff', fontSize: 12.5, fontWeight: 700, cursor: 'pointer', color: qrOpen === l.id ? 'var(--coral)' : 'var(--slate)', display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><path d="M14 14h3v3h-3zM20 14v1M14 20h1M18 18h3v3"/></svg>
                    QR
                  </button>
                  <button onClick={() => copy(full, l.id)}
                    style={{ padding: '6px 13px', borderRadius: 8, border: '1px solid var(--border)', background: '#fff', fontSize: 12.5, fontWeight: 700, cursor: 'pointer', color: copied === l.id ? '#15803d' : 'var(--slate)' }}>
                    {copied === l.id ? 'Copied' : 'Copy'}
                  </button>
                </div>
              </div>
              {qrOpen === l.id && (
                <div className="lg-qr">
                  <QrPreview url={full} />
                  <div style={{ flex: 1, minWidth: 200 }}>
                    <div style={{ fontSize: 12.5, color: 'var(--ink)', fontWeight: 700, wordBreak: 'break-all', marginBottom: 4 }}>{full}</div>
                    <p style={{ margin: '0 0 10px', fontSize: 12, color: 'var(--slate)' }}>
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
