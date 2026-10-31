'use client'

// An SMS campaign's report: clicks first, then delivery, replies and STOPs,
// orders and return on spend, one-tap follow-ups, everyone it went to, links
// by page, activity by day, failures and outlets. From /api/campaigns/report
// (lib/sms-campaign-report).

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { authFetch } from '@/lib/auth-fetch'
import { alertDialog } from '@/components/ConfirmDialog'
import { inSmsFilter, smsFollowUpAudience, type SmsPerson, type SmsFilter } from '@/lib/sms-people-shared'
import { DailyBars, FollowUpCard, PeopleList, RK_CSS, aud, shortUrl, type PeopleFilterDef, type Tag } from '@/components/campaigns/ReportKit'

type Report = {
  sent: number; delivered: number; failed: number; skipped: number; cancelled: number; pending: number
  clicks: number; uniqueClicks: number; replied: number; stopped: number
  orders: number; bookings: number; revenue: number; purchasers: number; cost: number
  skipReasons: [string, number][]; failureReasons: [string, number][]
  links: { url: string; label: string | null; people: number; clicks: number }[]
  outlets: { name: string; sent: number; clicks: number; revenue: number }[]
  daily: { day: string; clicks: number; replies: number }[]
}

const SKIP: Record<string, string> = {
  unsubscribed: 'Unsubscribed', opted_out: 'Replied STOP before', no_consent: 'No marketing consent', blocked: 'Blocked',
  invalid_number: 'No valid mobile', duplicate: 'Same number as someone else', unverified: 'Opt-out couldn’t be checked', cancelled: 'Stopped before sending',
}
const fmt = (iso?: string | null) => { try { return iso ? new Date(iso).toLocaleString('en-AU', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }) : '' } catch { return '' } }
const pct = (n: number, d: number) => (d > 0 ? `${(Math.round((n / d) * 1000) / 10).toLocaleString()}%` : '—')

const FILTERS: (PeopleFilterDef<SmsPerson> & { key: SmsFilter })[] = [
  { key: 'all', label: 'Everyone', test: () => true },
  { key: 'clicked', label: 'Clicked', test: p => inSmsFilter(p, 'clicked') },
  { key: 'not_clicked', label: 'Didn’t click', test: p => inSmsFilter(p, 'not_clicked') },
  { key: 'replied', label: 'Replied', test: p => inSmsFilter(p, 'replied'), note: 'Texts they sent back within a week, not counting STOP or START.' },
  { key: 'ordered', label: 'Ordered', test: p => inSmsFilter(p, 'ordered') },
  { key: 'failed', label: 'Didn’t deliver', test: p => inSmsFilter(p, 'failed') },
  { key: 'stopped', label: 'Replied STOP', test: p => inSmsFilter(p, 'stopped'), note: 'Replied STOP within two weeks of this text. They won’t get marketing texts again unless they text START.' },
]

function view(p: SmsPerson) {
  const tags: Tag[] = []
  if (p.orders > 0) tags.push({ t: p.revenue > 0 ? `Ordered ${aud(p.revenue)}` : 'Ordered', c: 'good' })
  else if (p.revenue > 0) tags.push({ t: `Paid ${aud(p.revenue)}`, c: 'good' })
  if (p.clickedAt) tags.push({ t: p.clicks > 1 ? `Clicked ${p.clicks}×` : 'Clicked', c: 'hot' })
  if (p.replies > 0) tags.push({ t: p.replies > 1 ? `Replied ${p.replies}×` : 'Replied', c: 'blue' })
  if (p.stoppedAt) tags.push({ t: 'Replied STOP', c: 'warn' })
  if (p.status === 'failed') tags.push({ t: 'Didn’t deliver', c: 'bad' })
  else if (!p.clickedAt && !p.replies && !p.stoppedAt) tags.push({ t: p.status === 'delivered' ? 'Delivered' : 'Sent', c: 'muted' })
  return {
    contactId: p.contactId, name: p.name || p.phone || 'Customer',
    sub: <>{p.phone}{p.status === 'failed' && p.error ? ` · ${p.error}` : p.link && p.clickedAt ? <> · <span className="rk-link">{shortUrl(p.link)}</span></> : null}</>,
    extra: p.reply ? <span className="rk-quote">{p.reply}</span> : undefined,
    tags, when: p.stoppedAt || p.repliedAt || p.clickedAt || p.deliveredAt || p.sentAt,
  }
}
const sortPeople = (a: SmsPerson, b: SmsPerson) => (b.revenue - a.revenue) || (b.replies - a.replies) || (b.clicks - a.clicks) || String(b.lastAt || '').localeCompare(String(a.lastAt || ''))
const textOf = (p: SmsPerson) => `${p.name} ${p.phone}`

export default function SmsReport({ campaign, companyId, onBack }: { campaign: any; companyId: string; onBack: () => void }) {
  const router = useRouter()
  const [report, setReport] = useState<Report | null>(null)
  const [people, setPeople] = useState<SmsPerson[] | null>(null)
  const [error, setError] = useState('')
  const [creating, setCreating] = useState<'' | 'not_clicked' | 'clicked_no_order'>('')
  useEffect(() => {
    authFetch(`/api/campaigns/report?companyId=${encodeURIComponent(companyId)}&campaignId=${encodeURIComponent(campaign.id)}`)
      .then(async r => { const j: any = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.error || 'Couldn’t load the report'); setReport(j.report); setPeople(j.people || []) })
      .catch(e => { setError(e.message); setPeople([]) })
  }, [companyId, campaign.id])

  const notClicked = useMemo(() => smsFollowUpAudience(people || [], 'not_clicked').length, [people])
  const clickedNoOrder = useMemo(() => smsFollowUpAudience(people || [], 'clicked_no_order').length, [people])
  const followUp = async (kind: 'not_clicked' | 'clicked_no_order') => {
    setCreating(kind)
    try {
      const r = await authFetch('/api/campaigns/follow-up', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ companyId, campaignId: campaign.id, kind }) })
      const j: any = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(j.error || 'Couldn’t create the campaign')
      router.push(`/admin/campaigns/${j.id}`)
    } catch (e: any) { alertDialog(e.message); setCreating('') }
  }

  const notSentYet = !['sent', 'sending', 'cancelled'].includes(campaign.status)
  const stopped = campaign.status === 'cancelled'
  const statNum: React.CSSProperties = { fontSize: 26, fontWeight: 800, letterSpacing: '-0.02em', color: 'var(--ink)', margin: '6px 0 0', fontVariantNumeric: 'tabular-nums' }
  const statLbl: React.CSSProperties = { fontSize: 13.5, fontWeight: 600, color: '#71717a' }
  const sub: React.CSSProperties = { margin: '2px 0 0', fontSize: 12.5, color: '#8e8e93' }
  const grid = (min: number): React.CSSProperties => ({ display: 'grid', gridTemplateColumns: `repeat(auto-fit, minmax(${min}px, 1fr))`, gap: 10, marginBottom: 12 })
  const roi = report && report.cost > 0 ? ((report.revenue - report.cost) / report.cost) * 100 : null

  return (
    <div className="srep" style={{ padding: '24px 28px 48px', boxSizing: 'border-box', width: '100%', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' }}>
      <style>{RK_CSS}</style>
      <style>{`.srep button::before{display:none}.srep-back{display:inline-flex;align-items:center;gap:4px;height:32px;padding:0 14px 0 10px;margin-bottom:14px;border:none;border-radius:999px;background:#f4f4f5;color:#3f3f46;font:inherit;font-size:13.5px;font-weight:600;cursor:pointer}.srep-back:hover{background:#ececef;color:#18181b}
.srep-grid{display:grid;grid-template-columns:minmax(0,1.4fr) minmax(0,1fr);gap:12px;margin-bottom:12px}
.srep-t{width:100%;border-collapse:collapse;font-size:13px}.srep-t th{padding:6px 0;font-size:11.5px;font-weight:700;color:var(--slate);text-align:left}.srep-t td{padding:8px 0;border-top:1px solid #f0f0f2;color:#52525b}.srep-t .n{text-align:right;font-variant-numeric:tabular-nums;padding-left:12px}
.srep-kv{display:flex;justify-content:space-between;gap:10px;font-size:13px;padding:5px 0;color:var(--slate)}.srep-kv strong{color:var(--ink)}
@media (max-width:900px){.srep-grid{grid-template-columns:1fr}}@media (max-width:560px){.srep{padding:16px 16px 32px!important}}
[data-theme="dark"] .srep-back{background:#2a2a2e;color:#e4e4e7}[data-theme="dark"] .srep-t td{border-color:#2c2c31}`}</style>
      <button onClick={onBack} className="srep-back">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m15 18-6-6 6-6" /></svg>
        Campaigns
      </button>
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: 30, fontWeight: 800, letterSpacing: '-0.025em', lineHeight: 1.15, color: 'var(--ink)', margin: 0 }}>{campaign.name}</h1>
        <p style={{ color: '#71717a', fontSize: 14, margin: '6px 0 0' }}>
          {campaign.status === 'sent' ? `Sent ${fmt(campaign.completed_at || campaign.sent_at)}` : stopped ? `Stopped part-way ${fmt(campaign.completed_at)}` : `Status: ${campaign.status}`} · SMS
        </p>
      </div>

      {notSentYet && <div className="rk-card" style={{ background: '#fffbeb', boxShadow: '0 0 0 1px #fde68a', marginBottom: 16 }}><p style={{ margin: 0, fontSize: 13, color: '#78350f' }}>This campaign hasn’t been sent yet, so there are no figures.</p></div>}
      {stopped && <div className="rk-card" style={{ marginBottom: 16 }}><p style={{ margin: 0, fontSize: 13, color: 'var(--ink)', lineHeight: 1.5 }}>{campaign.status_reason || 'Stopped part-way.'}{report ? ` ${report.sent.toLocaleString()} sent before it stopped; ${report.cancelled.toLocaleString()} weren’t sent.` : ''}</p></div>}
      {error && <div className="rk-card" style={{ background: '#fef2f2', boxShadow: '0 0 0 1px #fecaca', color: '#7f1d1d', fontSize: 13, marginBottom: 16 }}>{error}</div>}
      {!report && !error && <p style={{ color: 'var(--slate)', fontSize: 13 }}>Loading the report…</p>}

      {report && (<>
        <div style={grid(150)}>
          <div className="rk-card" style={{ boxShadow: '0 0 0 1.5px var(--coral)' }}><div style={statLbl}>Clicked</div><p style={statNum}>{report.uniqueClicks.toLocaleString()}</p><p style={sub}>{pct(report.uniqueClicks, report.sent)} of people texted · {report.clicks.toLocaleString()} clicks</p></div>
          <div className="rk-card"><div style={statLbl}>Sent</div><p style={statNum}>{report.sent.toLocaleString()}</p>{report.cancelled > 0 && <p style={sub}>{report.cancelled.toLocaleString()} not sent (stopped)</p>}</div>
          <div className="rk-card"><div style={statLbl}>Delivered</div><p style={statNum}>{report.delivered.toLocaleString()}</p><p style={{ ...sub, color: report.failed ? '#dc2626' : '#8e8e93' }}>{report.failed ? `${report.failed.toLocaleString()} didn’t deliver` : pct(report.delivered, report.sent) + ' of sent'}</p></div>
          <div className="rk-card"><div style={statLbl}>Replied</div><p style={statNum}>{report.replied.toLocaleString()}</p><p style={sub}>{pct(report.replied, report.sent)} · within a week</p></div>
          <div className="rk-card"><div style={statLbl}>Replied STOP</div><p style={{ ...statNum, color: report.stopped ? '#b45309' : 'var(--ink)' }}>{report.stopped.toLocaleString()}</p><p style={sub}>{pct(report.stopped, report.sent)} · within two weeks</p></div>
        </div>
        <div style={{ ...grid(140), marginBottom: 16 }}>
          <div className="rk-card"><div style={statLbl}>Orders</div><p style={statNum}>{report.orders.toLocaleString()}</p><p style={sub}>{report.purchasers ? `from ${report.purchasers.toLocaleString()} customer${report.purchasers === 1 ? '' : 's'}` : 'through the text’s link'}</p></div>
          {report.bookings > 0 && <div className="rk-card"><div style={statLbl}>Bookings</div><p style={statNum}>{report.bookings.toLocaleString()}</p></div>}
          <div className="rk-card"><div style={statLbl}>Revenue</div><p style={{ ...statNum, color: report.revenue > 0 ? '#15803d' : 'var(--ink)' }}>{aud(report.revenue)}</p><p style={sub}>influenced by this text</p></div>
          <div className="rk-card"><div style={statLbl}>Conversion</div><p style={statNum}>{pct(report.orders + report.bookings, report.uniqueClicks)}</p><p style={sub}>{report.bookings ? 'ordered or booked' : 'ordered'}, of people who clicked</p></div>
          <div className="rk-card"><div style={statLbl}>Cost</div><p style={statNum}>{aud(report.cost)}</p></div>
          <div className="rk-card"><div style={statLbl}>Return on spend</div><p style={{ ...statNum, color: roi == null ? 'var(--ink)' : roi > 0 ? '#15803d' : roi < 0 ? '#dc2626' : 'var(--ink)' }}>{roi == null ? '—' : `${roi > 0 ? '+' : ''}${Math.round(roi).toLocaleString()}%`}</p></div>
        </div>

        {!notSentYet && (notClicked > 0 || clickedNoOrder > 0) && (
          <div className="rk-fu">
            {notClicked > 0 && <FollowUpCard icon="resend" title={`${notClicked.toLocaleString()} didn’t click or reply`} text="Text them again, maybe with a sharper offer. Anyone who replied STOP is left out." button="Text them again" busy={creating === 'not_clicked'} disabled={!!creating} onClick={() => followUp('not_clicked')} />}
            {clickedNoOrder > 0 && <FollowUpCard icon="click" title={`${clickedNoOrder.toLocaleString()} clicked but didn’t order`} text="They showed interest. A follow-up usually works better than a fresh send." button="Follow up" busy={creating === 'clicked_no_order'} disabled={!!creating} onClick={() => followUp('clicked_no_order')} />}
          </div>
        )}

        <div style={{ marginBottom: 12 }}>
          <PeopleList items={people} filters={FILTERS} text={textOf} sort={sortPeople} view={view} emptyText="Nobody has been sent this text yet." />
        </div>

        <div className="srep-grid">
          <div className="rk-card">
            <div className="rk-h" style={{ marginBottom: 12 }}>Activity by day</div>
            <DailyBars days={report.daily} series={[{ key: 'clicks', label: 'Clicks' }, { key: 'replies', label: 'Replies' }]} />
          </div>
          <div className="rk-card">
            <div className="rk-h" style={{ marginBottom: 8 }}>Links clicked</div>
            {report.links.length === 0 ? <p className="rk-muted">This text had no link.</p> : (
              <table className="srep-t">
                <thead><tr><th>Page</th><th className="n">People</th><th className="n">Clicks</th></tr></thead>
                <tbody>{report.links.map(l => (
                  <tr key={l.url}><td style={{ color: 'var(--ink)', wordBreak: 'break-all' }}>{l.label ? <><b style={{ fontWeight: 650 }}>{l.label}</b><br /></> : null}<span style={{ fontSize: 12, color: '#8e8e93' }}>{shortUrl(l.url)}</span></td><td className="n" style={{ fontWeight: 700, color: 'var(--ink)' }}>{l.people.toLocaleString()}</td><td className="n">{l.clicks.toLocaleString()}</td></tr>
                ))}</tbody>
              </table>
            )}
          </div>
        </div>

        <div style={grid(260)}>
          {report.outlets.length > 1 && (
            <div className="rk-card">
              <div className="rk-h" style={{ marginBottom: 8 }}>By outlet</div>
              <table className="srep-t"><thead><tr><th>Outlet</th><th className="n">Sent</th><th className="n">Clicked</th><th className="n">Revenue</th></tr></thead>
                <tbody>{report.outlets.map(o => <tr key={o.name}><td style={{ color: 'var(--ink)', fontWeight: 600 }}>{o.name}</td><td className="n">{o.sent.toLocaleString()}</td><td className="n">{o.clicks.toLocaleString()}</td><td className="n" style={{ color: o.revenue > 0 ? '#15803d' : undefined, fontWeight: o.revenue > 0 ? 700 : 400 }}>{aud(o.revenue)}</td></tr>)}</tbody>
              </table>
            </div>
          )}
          <div className="rk-card">
            <div className="rk-h" style={{ marginBottom: 8 }}>Didn’t deliver</div>
            {report.failureReasons.length === 0 ? <p className="rk-muted">Every text was accepted.</p> : report.failureReasons.map(([k, n]) => <div key={k} className="srep-kv"><span>{k}</span><strong style={{ color: '#dc2626' }}>{n.toLocaleString()}</strong></div>)}
          </div>
          <div className="rk-card">
            <div className="rk-h" style={{ marginBottom: 8 }}>Not texted</div>
            {report.skipReasons.length === 0 ? <p className="rk-muted">Everyone in the audience could be texted.</p> : (<>
              {report.skipReasons.map(([k, n]) => <div key={k} className="srep-kv"><span>{SKIP[k] || k}</span><strong>{n.toLocaleString()}</strong></div>)}
              <p className="rk-note">Left out automatically, before sending.</p>
            </>)}
          </div>
        </div>
      </>)}
    </div>
  )
}
