'use client'

// An email campaign's report: clicks first (a real person acting on the
// email), then delivery, bounces, unsubscribes, and opens with their caveat
// (Apple Mail Privacy Protection opens emails by itself). Numbers come from
// /api/email-campaigns/report (lib/email-campaign-report).

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { authFetch } from '@/lib/auth-fetch'
import { alertDialog } from '@/components/ConfirmDialog'
import { followUpAudience, inFilter, type EmailPerson, type PeopleFilter } from '@/lib/email-people-shared'

type Report = {
  recipients: number; sent: number; failed: number; skipped: number; cancelled?: number; inFlight?: number; delivered: number
  bounced: number; softBounced: number; complaints: number
  opens: number; uniqueOpens: number; clicks: number; uniqueClicks: number; unsubscribes: number
  rates: { delivery: number; open: number; click: number; clickToOpen: number; bounce: number; unsubscribe: number; complaint: number }
  opensNote: string
  topLinks: { url: string; clicks: number; uniqueClicks: number }[]
}

const SKIP: Record<string, string> = {
  unsubscribed: 'Unsubscribed', opted_out: 'Turned off marketing email', no_consent: 'No marketing consent',
  blocked: 'Blocked', no_email: 'No email address', suppressed: 'Bounced or complained before',
  duplicate: 'Same address as someone else', invalid_email: 'No email address',
}

const fmt = (iso?: string | null) => { try { return iso ? new Date(iso).toLocaleString('en-AU', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }) : '' } catch { return '' } }

export default function EmailReport({ campaign, companyId, onBack }: { campaign: any; companyId: string; onBack: () => void }) {
  const router = useRouter()
  const [report, setReport] = useState<Report | null>(null)
  const [error, setError] = useState('')
  const [people, setPeople] = useState<EmailPerson[] | null>(null)
  const [money, setMoney] = useState<{ orders: number; bookings: number; revenue: number; purchasers: number } | null>(null)
  const [filter, setFilter] = useState<PeopleFilter>('all')
  const [query, setQuery] = useState('')
  const [shown, setShown] = useState(50)
  const [creating, setCreating] = useState<'' | 'not_opened' | 'clicked_no_order'>('')
  useEffect(() => {
    const q = `companyId=${encodeURIComponent(companyId)}&campaignId=${encodeURIComponent(campaign.id)}`
    authFetch(`/api/email-campaigns/report?${q}`)
      .then(async r => { const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.error || 'Couldn’t load the report'); setReport(j.report) })
      .catch(e => setError(e.message))
    authFetch(`/api/email-campaigns/people?${q}`)
      .then(async r => { const j: any = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.error || 'Couldn’t load who it went to'); setPeople(j.people || []); setMoney(j.money || null) })
      .catch(() => setPeople([]))
  }, [companyId, campaign.id])

  const counts = useMemo(() => {
    const c: Record<PeopleFilter, number> = { all: 0, clicked: 0, opened: 0, not_opened: 0, ordered: 0, bounced: 0, unsubscribed: 0 }
    for (const p of people || []) for (const f of Object.keys(c) as PeopleFilter[]) if (inFilter(p, f)) c[f]++
    return c
  }, [people])
  const notOpened = useMemo(() => followUpAudience(people || [], 'not_opened').length, [people])
  const clickedNoOrder = useMemo(() => followUpAudience(people || [], 'clicked_no_order').length, [people])
  const list = useMemo(() => {
    const t = query.trim().toLowerCase()
    return (people || [])
      .filter(p => inFilter(p, filter) && (!t || p.name.toLowerCase().includes(t) || p.email.toLowerCase().includes(t)))
      .sort((a, b) => (b.revenue - a.revenue) || (b.clicks - a.clicks) || String(b.lastAt || '').localeCompare(String(a.lastAt || '')))
  }, [people, filter, query])
  useEffect(() => { setShown(50) }, [filter, query])

  const followUp = async (kind: 'not_opened' | 'clicked_no_order') => {
    setCreating(kind)
    try {
      const r = await authFetch('/api/email-campaigns/follow-up', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ companyId, campaignId: campaign.id, kind }) })
      const j: any = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(j.error || 'Couldn’t create the campaign')
      router.push(`/admin/campaigns/${j.id}`)
    } catch (e: any) { alertDialog(e.message); setCreating('') }
  }

  const card: React.CSSProperties = { border: '1px solid transparent', borderRadius: 20, background: '#fff', padding: 18, boxShadow: '0 0 0 1px rgba(0,0,0,.06), 0 1px 2px rgba(16,24,40,.04)', minWidth: 0 }
  const statNum: React.CSSProperties = { fontSize: 26, fontWeight: 800, letterSpacing: '-0.02em', color: 'var(--ink)', margin: '6px 0 0', fontVariantNumeric: 'tabular-nums' }
  const statLbl: React.CSSProperties = { fontSize: 13.5, fontWeight: 600, color: '#71717a' }
  const sub: React.CSSProperties = { margin: '2px 0 0', fontSize: 12.5, color: '#8e8e93' }
  const notSentYet = !['sent', 'sending', 'cancelled'].includes(campaign.status)
  const stopped = campaign.status === 'cancelled'
  const breakdown: Record<string, number> = campaign.excluded_breakdown || {}
  const skips = Object.entries(breakdown).filter(([, n]) => Number(n) > 0)

  return (
    <div className="erep" style={{ padding: '24px 28px 48px', boxSizing: 'border-box', width: '100%', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' }}>
      <style>{`.erep button::before{display:none}.erep-back{display:inline-flex;align-items:center;gap:4px;height:32px;padding:0 14px 0 10px;margin-bottom:14px;border:none;border-radius:999px;background:#f4f4f5;color:#3f3f46;font:inherit;font-size:13.5px;font-weight:600;cursor:pointer}.erep-back:hover{background:#ececef;color:#18181b}`}</style>
      <button onClick={onBack} className="erep-back">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m15 18-6-6 6-6" /></svg>
        Campaigns
      </button>
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: 30, fontWeight: 800, letterSpacing: '-0.025em', lineHeight: 1.15, color: 'var(--ink)', margin: 0 }}>{campaign.name}</h1>
        <p style={{ color: '#71717a', fontSize: 14, margin: '6px 0 0' }}>
          {campaign.status === 'sent' ? `Sent ${fmt(campaign.completed_at || campaign.sent_at)}` : stopped ? `Stopped part-way ${fmt(campaign.completed_at)}` : `Status: ${campaign.status}`} · Email
        </p>
      </div>

      {notSentYet && (
        <div style={{ ...card, borderColor: '#fde68a', background: '#fffbeb', marginBottom: 16 }}>
          <p style={{ margin: 0, fontSize: 13, color: '#78350f' }}>This campaign hasn’t been sent yet, so there are no figures.</p>
        </div>
      )}
      {stopped && (
        <div style={{ ...card, background: '#f9fafb', marginBottom: 16 }}>
          <p style={{ margin: 0, fontSize: 13, color: 'var(--ink)', lineHeight: 1.5 }}>
            {campaign.status_reason || 'Stopped part-way.'}
            {report ? ` ${report.sent.toLocaleString()} sent before it stopped; ${(report.cancelled || 0).toLocaleString()} weren\u2019t sent.` : ''}
          </p>
        </div>
      )}
      {error && <div style={{ ...card, borderColor: '#fecaca', background: '#fef2f2', color: '#7f1d1d', fontSize: 13, marginBottom: 16 }}>{error}</div>}
      {!report && !error && <p style={{ color: 'var(--slate)', fontSize: 13 }}>Loading the report…</p>}

      {report && (<>
        {/* Clicks first: the reliable measure */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10, marginBottom: 12 }}>
          <div style={{ ...card, borderColor: 'var(--coral)' }}>
            <div style={statLbl}>Clicked</div>
            <p style={statNum}>{report.uniqueClicks.toLocaleString()}</p>
            <p style={sub}>{report.rates.click}% of people emailed · {report.clicks.toLocaleString()} clicks</p>
          </div>
          <div style={card}><div style={statLbl}>Sent</div><p style={statNum}>{report.sent.toLocaleString()}</p>
            {report.failed > 0 && <p style={{ ...sub, color: '#dc2626' }}>{report.failed.toLocaleString()} failed</p>}
            {(report.cancelled || 0) > 0 && <p style={sub}>{(report.cancelled || 0).toLocaleString()} not sent (stopped)</p>}</div>
          <div style={card}><div style={statLbl}>Delivered</div><p style={statNum}>{report.delivered.toLocaleString()}</p>
            <p style={sub}>{report.rates.delivery}% of sent</p></div>
          <div style={card}><div style={statLbl}>Bounced</div>
            <p style={{ ...statNum, color: report.bounced + report.softBounced ? '#b45309' : 'var(--ink)' }}>{(report.bounced + report.softBounced).toLocaleString()}</p>
            <p style={sub}>{report.bounced} hard · {report.softBounced} soft</p></div>
          <div style={card}><div style={statLbl}>Unsubscribed</div>
            <p style={{ ...statNum, color: report.unsubscribes ? '#b45309' : 'var(--ink)' }}>{report.unsubscribes.toLocaleString()}</p>
            <p style={sub}>{report.rates.unsubscribe}%{report.complaints ? ` · ${report.complaints} spam complaint${report.complaints === 1 ? '' : 's'}` : ''}</p></div>
          <div style={card}><div style={statLbl}>Opened</div>
            <p style={{ ...statNum, color: 'var(--slate)' }}>{report.uniqueOpens.toLocaleString()}</p>
            <p style={sub}>about {report.rates.open}% · approximate</p></div>
        </div>
        <p style={{ margin: '0 0 16px', fontSize: 12, color: 'var(--slate)', lineHeight: 1.5 }}>{report.opensNote}</p>

        {/* What it earned, through the email's links */}
        {money && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10, marginBottom: 16 }}>
            <div style={card}><div style={statLbl}>Orders</div><p style={statNum}>{money.orders.toLocaleString()}</p>
              <p style={sub}>{money.purchasers ? `from ${money.purchasers.toLocaleString()} customer${money.purchasers === 1 ? '' : 's'}` : 'through the email’s links'}</p></div>
            {money.bookings > 0 && <div style={card}><div style={statLbl}>Bookings</div><p style={statNum}>{money.bookings.toLocaleString()}</p></div>}
            <div style={card}><div style={statLbl}>Revenue</div>
              <p style={{ ...statNum, color: money.revenue > 0 ? '#15803d' : 'var(--ink)' }}>{aud(money.revenue)}</p>
              <p style={sub}>influenced by this email</p></div>
            <div style={card}><div style={statLbl}>Conversion</div>
              <p style={statNum}>{report.uniqueClicks ? `${(Math.round(((money.orders + money.bookings) / report.uniqueClicks) * 1000) / 10).toLocaleString()}%` : '—'}</p>
              <p style={sub}>{money.bookings ? 'ordered or booked' : 'ordered'}, of people who clicked</p></div>
          </div>
        )}

        {/* Follow-ups */}
        {!notSentYet && (notOpened > 0 || clickedNoOrder > 0) && (
          <div className="erep-fu">
            {notOpened > 0 && (
              <div className="erep-fu-card">
                <span className="erep-fu-ic" aria-hidden><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12a9 9 0 1 1-3-6.7" /><path d="M21 4v5h-5" /></svg></span>
                <div className="erep-fu-t"><b>{notOpened.toLocaleString()} didn’t open it</b><small>Send the same email again, with a new subject line.{counts.not_opened > notOpened ? ` ${(counts.not_opened - notOpened).toLocaleString()} who unsubscribed or can’t be emailed are left out.` : ''}</small></div>
                <button type="button" className="erep-btn" onClick={() => followUp('not_opened')} disabled={!!creating}>{creating === 'not_opened' ? 'Creating…' : 'Resend to them'}</button>
              </div>
            )}
            {clickedNoOrder > 0 && (
              <div className="erep-fu-card">
                <span className="erep-fu-ic" aria-hidden><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m9 9 5 12 1.8-5.2L21 14Z" /><path d="M7.2 2.2 8 5.1" /><path d="m5.1 8-2.9-.8" /><path d="M14 4.1 12 6" /></svg></span>
                <div className="erep-fu-t"><b>{clickedNoOrder.toLocaleString()} clicked but didn’t order</b><small>They showed interest. A follow-up usually works better than a fresh send.</small></div>
                <button type="button" className="erep-btn" onClick={() => followUp('clicked_no_order')} disabled={!!creating}>{creating === 'clicked_no_order' ? 'Creating…' : 'Follow up'}</button>
              </div>
            )}
          </div>
        )}

        {/* People: who it went to and what they did */}
        <div style={{ ...card, marginBottom: 12 }} className="erep-people">
          <div className="erep-ph">
            <div style={{ ...statLbl, fontSize: 15, fontWeight: 700, color: 'var(--ink)' }}>People</div>
            <input className="erep-search" value={query} onChange={e => setQuery(e.target.value)} placeholder="Search by name or email" aria-label="Search people" />
          </div>
          <div className="erep-chips" role="tablist" aria-label="Show">
            {(([['all', 'Everyone'], ['clicked', 'Clicked'], ['opened', 'Opened'], ['not_opened', 'Didn’t open'], ['ordered', 'Ordered'], ['bounced', 'Bounced'], ['unsubscribed', 'Unsubscribed']]) as [PeopleFilter, string][])
              .filter(([k]) => k === 'all' || counts[k] > 0 || k === filter)
              .map(([k, label]) => (
                <button key={k} type="button" role="tab" aria-selected={filter === k} className={filter === k ? 'on' : ''} onClick={() => setFilter(k)}>
                  {label}<span>{counts[k].toLocaleString()}</span>
                </button>
              ))}
          </div>
          {people === null ? <p style={{ margin: '10px 0 0', fontSize: 13, color: 'var(--slate)' }}>Loading who it went to…</p>
            : list.length === 0 ? <p style={{ margin: '10px 0 0', fontSize: 13, color: 'var(--slate)' }}>{people.length ? 'Nobody here.' : 'Nobody has been sent this email yet.'}</p>
            : (<>
              <ul className="erep-list">
                {list.slice(0, shown).map(p => <PersonRow key={p.id} p={p} />)}
              </ul>
              {list.length > shown && <button type="button" className="erep-more" onClick={() => setShown(n => n + 100)}>Show more ({(list.length - shown).toLocaleString()} left)</button>}
            </>)}
          {filter === 'opened' && <p style={{ margin: '10px 0 0', fontSize: 12, color: 'var(--slate)' }}>Some iPhones open emails automatically, so a few of these may not have read it.</p>}
        </div>

        <div className="erep-grid" style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 2fr) minmax(0, 1fr)', gap: 12 }}>
          <div style={card}>
            <div style={{ ...statLbl, fontSize: 15, fontWeight: 700, color: 'var(--ink)', marginBottom: 12 }}>Links clicked</div>
            {report.topLinks.length === 0 ? (
              <p style={{ margin: 0, fontSize: 13, color: 'var(--slate)' }}>No clicks yet.</p>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead><tr style={{ textAlign: 'left', color: 'var(--slate)', fontSize: 11.5 }}>
                  <th style={{ padding: '6px 0', fontWeight: 700 }}>Link</th>
                  <th style={{ padding: '6px 0', fontWeight: 700, textAlign: 'right', whiteSpace: 'nowrap' }}>People</th>
                  <th style={{ padding: '6px 0 6px 12px', fontWeight: 700, textAlign: 'right' }}>Clicks</th>
                </tr></thead>
                <tbody>
                  {report.topLinks.map(l => (
                    <tr key={l.url} style={{ borderTop: '1px solid #f0f0f2' }}>
                      <td style={{ padding: '8px 0', color: 'var(--ink)', wordBreak: 'break-all' }}>{l.url}</td>
                      <td style={{ padding: '8px 0', textAlign: 'right', fontWeight: 700 }}>{l.uniqueClicks.toLocaleString()}</td>
                      <td style={{ padding: '8px 0 8px 12px', textAlign: 'right', color: 'var(--slate)' }}>{l.clicks.toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
          <div style={card}>
            <div style={{ ...statLbl, fontSize: 15, fontWeight: 700, color: 'var(--ink)', marginBottom: 12 }}>Not emailed</div>
            {skips.length === 0 && report.skipped === 0 ? (
              <p style={{ margin: 0, fontSize: 13, color: 'var(--slate)' }}>Everyone in the audience could be emailed.</p>
            ) : (
              <>
                {skips.map(([k, n]) => (
                  <div key={k} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, fontSize: 13, padding: '4px 0', color: 'var(--slate)' }}>
                    <span>{SKIP[k] || k}</span><strong style={{ color: 'var(--ink)' }}>{Number(n).toLocaleString()}</strong>
                  </div>
                ))}
                <p style={{ margin: '8px 0 0', fontSize: 11.5, color: 'var(--slate)' }}>Left out automatically, before sending.</p>
              </>
            )}
          </div>
        </div>
      </>)}
      <style>{`@media (max-width: 900px) { .erep-grid { grid-template-columns: 1fr !important; } } @media (max-width: 560px) { .erep { padding: 16px 16px 32px !important; } }`}</style>
      <style>{EREP_CSS}</style>
    </div>
  )
}

const aud = (n: number) => `$${(Number(n) || 0).toLocaleString('en-AU', { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 })}`
const ago = (iso?: string | null) => {
  if (!iso) return ''
  const t = new Date(iso).getTime(); if (!Number.isFinite(t)) return ''
  const m = Math.round((Date.now() - t) / 60000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m}m ago`
  if (m < 60 * 24) return `${Math.round(m / 60)}h ago`
  if (m < 60 * 24 * 7) return `${Math.round(m / 1440)}d ago`
  return new Date(t).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })
}
const shortUrl = (u: string) => { try { const x = new URL(u); return (x.hostname.replace(/^www\./, '') + x.pathname).replace(/\/$/, '') } catch { return u } }
const HUES = ['#ff7a6b', '#3b82f6', '#10b981', '#8b5cf6', '#f59e0b', '#ec4899', '#14b8a6', '#6366f1']
const hue = (s: string) => HUES[[...s].reduce((n, c) => (n * 31 + c.charCodeAt(0)) >>> 0, 7) % HUES.length]

/** One person in the People list: who, what they did, and when. */
function PersonRow({ p }: { p: EmailPerson }) {
  const who = p.name || p.email.split('@')[0] || 'Customer'
  const tags: { t: string; c: string }[] = []
  if (p.orders > 0) tags.push({ t: p.revenue > 0 ? `Ordered ${aud(p.revenue)}` : 'Ordered', c: 'good' })
  else if (p.revenue > 0) tags.push({ t: `Paid ${aud(p.revenue)}`, c: 'good' })
  if (p.clickedAt) tags.push({ t: p.clicks > 1 ? `Clicked ${p.clicks}×` : 'Clicked', c: 'hot' })
  else if (p.openedAt) tags.push({ t: p.opens > 1 ? `Opened ${p.opens}×` : 'Opened', c: 'blue' })
  if (p.complainedAt) tags.push({ t: 'Marked as spam', c: 'bad' })
  else if (p.unsubscribedAt) tags.push({ t: 'Unsubscribed', c: 'warn' })
  if (p.status === 'failed') tags.push({ t: 'Didn’t send', c: 'bad' })
  else if (p.bouncedAt) tags.push({ t: 'Bounced', c: 'warn' })
  else if (!p.openedAt) tags.push({ t: 'Didn’t open', c: 'muted' })
  const inner = (<>
    <span className="erep-av" style={{ background: hue(who) }} aria-hidden>{who.trim().charAt(0).toUpperCase()}</span>
    <span className="erep-who">
      <b>{who}</b>
      <small>{p.email}{p.links.length ? <> · <span className="erep-link">{shortUrl(p.links[0])}</span>{p.links.length > 1 ? ` +${p.links.length - 1}` : ''}</> : null}</small>
    </span>
    <span className="erep-tags">{tags.map(x => <span key={x.t} className={`erep-tag ${x.c}`}>{x.t}</span>)}</span>
    <span className="erep-when">{ago(p.clickedAt || p.openedAt || p.unsubscribedAt || p.bouncedAt || p.sentAt)}</span>
  </>)
  return <li>{p.contactId ? <a href={`/admin/customers/profile?id=${p.contactId}`} className="erep-row" title="Open their profile">{inner}</a> : <div className="erep-row">{inner}</div>}</li>
}

const EREP_CSS = `
.erep-fu{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(320px,100%),1fr));gap:10px;margin:0 0 12px}
.erep-fu-card{display:flex;align-items:center;gap:12px;padding:14px 16px;border-radius:20px;background:color-mix(in srgb,var(--coral) 7%,#fff);box-shadow:0 0 0 1px color-mix(in srgb,var(--coral) 22%,transparent)}
.erep-fu-ic{width:38px;height:38px;flex-shrink:0;border-radius:12px;display:flex;align-items:center;justify-content:center;background:#fff;color:var(--coral);box-shadow:0 0 0 1px color-mix(in srgb,var(--coral) 18%,transparent)}
.erep-fu-t{flex:1;min-width:0;display:flex;flex-direction:column;gap:2px}.erep-fu-t b{font-size:14px;color:var(--ink)}.erep-fu-t small{font-size:12.5px;line-height:1.4;color:#71717a}
.erep-btn{flex-shrink:0;height:38px;padding:0 16px;border:none;border-radius:999px;background:var(--coral);color:#fff;font:inherit;font-size:13.5px;font-weight:650;cursor:pointer;white-space:nowrap}
.erep-btn:disabled{opacity:.6;cursor:default}
.erep-ph{display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;margin-bottom:12px}
.erep-search{flex:0 1 260px;min-width:0;height:38px;padding:0 14px;border:1.5px solid transparent;border-radius:999px;background:#f4f4f5;font:inherit;font-size:13.5px;color:var(--ink);outline:none}
.erep-search:focus{background:#fff;border-color:#ececef;box-shadow:0 0 0 3px color-mix(in srgb,var(--coral) 14%,transparent)}
.erep-chips{display:flex;gap:6px;overflow-x:auto;scrollbar-width:none;padding-bottom:2px;margin-bottom:6px}.erep-chips::-webkit-scrollbar{display:none}
.erep-chips button{flex-shrink:0;display:inline-flex;align-items:center;gap:7px;height:34px;padding:0 13px;border:none;border-radius:999px;background:#f4f4f5;color:#52525b;font:inherit;font-size:13px;font-weight:600;cursor:pointer}
.erep-chips button span{font-size:12px;font-weight:700;color:#a1a1aa;font-variant-numeric:tabular-nums}
.erep-chips button.on{background:var(--ink);color:#fff}.erep-chips button.on span{color:rgba(255,255,255,.7)}
.erep-list{list-style:none;margin:0;padding:0}
.erep-list li+li{border-top:1px solid #f0f0f2}
.erep-row{display:flex;align-items:center;gap:12px;padding:11px 6px;margin:0 -6px;border-radius:14px;color:inherit;text-decoration:none}
a.erep-row:hover{background:#fafafa}
.erep-av{width:36px;height:36px;flex-shrink:0;border-radius:50%;display:flex;align-items:center;justify-content:center;color:#fff;font-size:14px;font-weight:700}
.erep-who{flex:1;min-width:0;display:flex;flex-direction:column;gap:1px}
.erep-who b{font-size:14px;color:var(--ink);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.erep-who small{font-size:12.5px;color:#8e8e93;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.erep-link{color:#52525b}
.erep-tags{display:flex;gap:5px;flex-wrap:wrap;justify-content:flex-end}
.erep-tag{display:inline-flex;align-items:center;height:24px;padding:0 9px;border-radius:999px;font-size:12px;font-weight:650;white-space:nowrap}
.erep-tag.good{background:#dcfce7;color:#15803d}.erep-tag.hot{background:color-mix(in srgb,var(--coral) 14%,#fff);color:color-mix(in srgb,var(--coral) 80%,#000)}
.erep-tag.blue{background:#e0ecff;color:#1d4ed8}.erep-tag.warn{background:#fef3c7;color:#b45309}.erep-tag.bad{background:#fee2e2;color:#b91c1c}.erep-tag.muted{background:#f4f4f5;color:#71717a}
.erep-when{flex-shrink:0;width:70px;text-align:right;font-size:12px;color:#a1a1aa;font-variant-numeric:tabular-nums}
.erep-more{display:block;margin:10px auto 0;height:36px;padding:0 16px;border:none;border-radius:999px;background:#f4f4f5;color:#3f3f46;font:inherit;font-size:13px;font-weight:600;cursor:pointer}
.erep-more:hover{background:#ececef}
@media (max-width:640px){
  .erep-row{flex-wrap:wrap;gap:4px 12px}
  .erep-who{flex-basis:calc(100% - 48px)}
  .erep-tags{order:3;margin-left:48px;justify-content:flex-start}
  .erep-when{order:4;width:auto;margin-left:auto}
  .erep-fu-card{flex-wrap:wrap}.erep-fu-card .erep-btn{width:100%}
  .erep-search{flex-basis:100%}
}
[data-theme="dark"] .erep-fu-card{background:color-mix(in srgb,var(--coral) 12%,#1c1c1f)}
[data-theme="dark"] .erep-fu-ic{background:#232327}
[data-theme="dark"] .erep-search,[data-theme="dark"] .erep-chips button:not(.on),[data-theme="dark"] .erep-more,[data-theme="dark"] .erep-tag.muted{background:#2a2a2e}
[data-theme="dark"] .erep-chips button.on{background:#f4f4f5;color:#18181b}[data-theme="dark"] .erep-chips button.on span{color:#71717a}
[data-theme="dark"] .erep-list li+li{border-color:#2c2c31}
[data-theme="dark"] a.erep-row:hover{background:#232327}
`
