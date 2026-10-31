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
import { FollowUpCard, PeopleList, RK_CSS, aud, shortUrl, type PeopleFilterDef, type Tag } from '@/components/campaigns/ReportKit'

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
          <div className="rk-fu">
            {notOpened > 0 && <FollowUpCard icon="resend" title={`${notOpened.toLocaleString()} didn’t open it`} text={`Send the same email again, with a new subject line.${counts.not_opened > notOpened ? ` ${(counts.not_opened - notOpened).toLocaleString()} who unsubscribed or can’t be emailed are left out.` : ''}`} button="Resend to them" busy={creating === 'not_opened'} disabled={!!creating} onClick={() => followUp('not_opened')} />}
            {clickedNoOrder > 0 && <FollowUpCard icon="click" title={`${clickedNoOrder.toLocaleString()} clicked but didn’t order`} text="They showed interest. A follow-up usually works better than a fresh send." button="Follow up" busy={creating === 'clicked_no_order'} disabled={!!creating} onClick={() => followUp('clicked_no_order')} />}
          </div>
        )}

        {/* People: who it went to and what they did */}
        <div style={{ marginBottom: 12 }}>
          <PeopleList items={people} filters={EMAIL_FILTERS} text={emailText} sort={emailSort} view={emailView} emptyText="Nobody has been sent this email yet." />
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
      <style>{RK_CSS}</style>
    </div>
  )
}

const EMAIL_FILTERS: (PeopleFilterDef<EmailPerson> & { key: PeopleFilter })[] = [
  { key: 'all', label: 'Everyone', test: () => true },
  { key: 'clicked', label: 'Clicked', test: p => inFilter(p, 'clicked') },
  { key: 'opened', label: 'Opened', test: p => inFilter(p, 'opened'), note: 'Some iPhones open emails automatically, so a few of these may not have read it.' },
  { key: 'not_opened', label: 'Didn’t open', test: p => inFilter(p, 'not_opened') },
  { key: 'ordered', label: 'Ordered', test: p => inFilter(p, 'ordered') },
  { key: 'bounced', label: 'Bounced', test: p => inFilter(p, 'bounced') },
  { key: 'unsubscribed', label: 'Unsubscribed', test: p => inFilter(p, 'unsubscribed') },
]
const emailText = (p: EmailPerson) => `${p.name} ${p.email}`
const emailSort = (a: EmailPerson, b: EmailPerson) => (b.revenue - a.revenue) || (b.clicks - a.clicks) || String(b.lastAt || '').localeCompare(String(a.lastAt || ''))

/** One person in the People list: who, what they did, and when. */
function emailView(p: EmailPerson) {
  const tags: Tag[] = []
  if (p.orders > 0) tags.push({ t: p.revenue > 0 ? `Ordered ${aud(p.revenue)}` : 'Ordered', c: 'good' })
  else if (p.revenue > 0) tags.push({ t: `Paid ${aud(p.revenue)}`, c: 'good' })
  if (p.clickedAt) tags.push({ t: p.clicks > 1 ? `Clicked ${p.clicks}×` : 'Clicked', c: 'hot' })
  else if (p.openedAt) tags.push({ t: p.opens > 1 ? `Opened ${p.opens}×` : 'Opened', c: 'blue' })
  if (p.complainedAt) tags.push({ t: 'Marked as spam', c: 'bad' })
  else if (p.unsubscribedAt) tags.push({ t: 'Unsubscribed', c: 'warn' })
  if (p.status === 'failed') tags.push({ t: 'Didn’t send', c: 'bad' })
  else if (p.bouncedAt) tags.push({ t: 'Bounced', c: 'warn' })
  else if (!p.openedAt) tags.push({ t: 'Didn’t open', c: 'muted' })
  return {
    contactId: p.contactId, name: p.name || p.email.split('@')[0] || 'Customer',
    sub: <>{p.email}{p.links.length ? <> · <span className="rk-link">{shortUrl(p.links[0])}</span>{p.links.length > 1 ? ` +${p.links.length - 1}` : ''}</> : null}</>,
    tags, when: p.clickedAt || p.openedAt || p.unsubscribedAt || p.bouncedAt || p.sentAt,
  }
}
