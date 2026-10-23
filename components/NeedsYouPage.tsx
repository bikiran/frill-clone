'use client'

import { useEffect, useMemo, useState } from 'react'
import { authFetch } from '@/lib/auth-fetch'
import { supabase } from '@/lib/supabase'
import { SuggestionCard } from '@/components/AgentSuggestion'
import { useNeedsYou, ICON, Check, Bell, Target, Arrow, ico, EASE, NY_CSS, type Item, type Payload } from '@/components/NeedsYou'

// Agents → Needs you. Everything waiting on a person, in one place:
//   • four numbers up top: how much is waiting, the longest a customer has
//     waited, how often replies met the goal, and the money at stake;
//   • filter chips and a sort;
//   • one collapsible section per kind of work (customer replies, agent
//     approvals, orders and payments, reviews, problems), five rows each;
//   • a detail panel for the selected row: the customer's own words, the
//     agent's draft to send / edit / dismiss, or the next step, and who it is.
// On narrow screens the detail opens under its row instead.

type GroupKey = 'replies' | 'approvals' | 'sales' | 'reviews' | 'problems'
type Sort = 'priority' | 'oldest' | 'newest'

const GROUPS: { key: GroupKey; kinds: Item['kind'][]; title: string; sub: string; icon: Item['kind'] }[] = [
  { key: 'replies', kinds: ['reply', 'handover'], title: 'Customer replies', sub: 'Customers waiting for you or your team.', icon: 'reply' },
  { key: 'approvals', kinds: ['approval'], title: 'Agent approvals', sub: 'Drafts and actions your agents prepared for your OK.', icon: 'approval' },
  { key: 'sales', kinds: ['order', 'quote'], title: 'Orders & payments', sub: 'Orders nobody has updated the customer on, and unpaid payment requests.', icon: 'order' },
  { key: 'reviews', kinds: ['review'], title: 'Reviews', sub: 'Reviews still waiting for a reply.', icon: 'review' },
  { key: 'problems', kinds: ['failed'], title: 'Problems', sub: 'Agent runs that went wrong in the last two days.', icon: 'failed' },
]
const groupOf = (i: Item): GroupKey => GROUPS.find(g => g.kinds.includes(i.kind))?.key || 'replies'
const OPEN: Record<Item['kind'], string> = { approval: 'Open conversation', reply: 'Reply', review: 'Reply to review', order: 'Open order', quote: 'Follow up', handover: 'Take over', failed: 'See what happened' }
const RANK = { now: 0, soon: 1, fyi: 2 } as const
const PRIORITY = { now: 'High', soon: 'Medium', fyi: 'Low' } as const
const ROWS = 5

const CHANNEL: Record<string, string> = { sms: 'SMS', mms: 'SMS', email: 'Email', gmail: 'Email', widget: 'Website', chat: 'Website', website: 'Website', web: 'Website', instagram: 'Instagram', messenger: 'Messenger', facebook: 'Facebook', whatsapp: 'WhatsApp', google: 'Google', phone: 'Phone', voice: 'Phone' }
const channelName = (c?: string | null) => (c ? CHANNEL[c.toLowerCase()] || c.charAt(0).toUpperCase() + c.slice(1) : null)
const CH_ICON: Record<string, React.ReactNode> = {
  SMS: ico(<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />, 14),
  Email: ico(<><rect x="3" y="5" width="18" height="14" rx="2" /><polyline points="3 7 12 13 21 7" /></>, 14),
  Website: ico(<><rect x="3" y="4" width="18" height="16" rx="2" /><line x1="3" y1="9" x2="21" y2="9" /></>, 14),
  Instagram: ico(<><rect x="3" y="3" width="18" height="18" rx="5" /><circle cx="12" cy="12" r="4" /></>, 14),
  Messenger: ico(<path d="M12 3C7 3 3 6.7 3 11.3c0 2.6 1.3 4.9 3.3 6.4V21l3-1.7c.9.3 1.8.4 2.7.4 5 0 9-3.7 9-8.3S17 3 12 3z" />, 14),
  Facebook: ico(<path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z" />, 14),
  Google: ico(<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />, 14),
}
const Chevron = ({ open }: { open?: boolean }) => <span style={{ display: 'inline-flex', transition: `transform .3s ${EASE}`, transform: open ? 'rotate(180deg)' : 'none' }}>{ico(<polyline points="6 9 12 15 18 9" />, 16)}</span>
const Right = () => ico(<polyline points="9 18 15 12 9 6" />, 16)

const minutes = (iso: string, now: number) => Math.max(0, Math.round((now - Date.parse(iso)) / 60000))
const span = (m: number) => m < 60 ? `${Math.max(1, m)} min` : m < 48 * 60 ? `${Math.round(m / 60)} h` : `${Math.round(m / 1440)} days`
const ago = (iso: string, now: number) => { const m = minutes(iso, now); return m < 1 ? 'just now' : m < 60 ? `${m} min ago` : m < 48 * 60 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} days ago` }
const money = (n: number) => `$${n.toLocaleString('en-AU', { maximumFractionDigits: n < 100 ? 2 : 0 })}`

// The person (or thing) a row is about.
const who = (i: Item) => i.customer?.name || i.title
const initials = (s: string) => { const w = s.replace(/[^\p{L}\p{N}+ ]/gu, '').trim().split(/\s+/).filter(Boolean); return (w.length > 1 ? w[0][0] + w[1][0] : (w[0] || '?').slice(0, 2)).toUpperCase() }
const HUES = [12, 28, 200, 160, 262, 330, 45, 220]
const hue = (s: string) => { let h = 0; for (const c of s) h = (h * 31 + c.charCodeAt(0)) >>> 0; return HUES[h % HUES.length] }
const badge = (i: Item) => i.urgency === 'now' ? (['reply', 'review', 'order', 'quote'].includes(i.kind) ? 'Overdue' : 'Urgent') : i.urgency === 'soon' ? 'Waiting' : 'FYI'

function useWide() {
  const [wide, setWide] = useState(true)
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1080px)')
    const on = () => setWide(mq.matches)
    on(); mq.addEventListener?.('change', on)
    return () => mq.removeEventListener?.('change', on)
  }, [])
  return wide
}

function Avatar({ name, size = 40 }: { name: string; size?: number }) {
  const h = hue(name)
  const phone = /^[+\d(]/.test(name.trim())
  return <span className="nyp-av" style={{ width: size, height: size, fontSize: size * 0.36, background: `hsl(${h} 85% 95%)`, color: `hsl(${h} 55% 38%)` }} aria-hidden="true">
    {phone ? ico(<path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.5 2.1L8 9.8a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.7.7a2 2 0 0 1 1.7 2z" />, Math.round(size * 0.42)) : initials(name)}
  </span>
}

function Stat({ icon, tone, value, label, chip, chipTone, bar }: { icon: React.ReactNode; tone: string; value: string; label: string; chip?: string; chipTone?: 'good' | 'bad' | 'warn' | 'plain'; bar?: React.ReactNode }) {
  return (
    <div className="nyp-stat" style={{ ['--tone' as any]: tone }}>
      <span className="nyp-stat-ic">{icon}</span>
      <div style={{ minWidth: 0, flex: 1 }}>
        <div className="nyp-stat-v">{value}</div>
        <div className="nyp-stat-l">{label}</div>
        {bar}
      </div>
      {chip && <span className={`nyp-chip-s ${chipTone || 'plain'}`}>{chip}</span>}
    </div>
  )
}

// "No reply needed": closes the enquiry, as Close does in the inbox. A new
// message from the customer opens it again, and it comes back here if unanswered.
async function closeNoReply(companyId: string, conversationId: string) {
  const { data: { session } } = await supabase.auth.getSession()
  const actor = session?.user?.user_metadata?.display_name || session?.user?.email?.split('@')[0] || 'Your team'
  const { error } = await (supabase as any).from('conversations').update({ status: 'closed' }).eq('id', conversationId).eq('company_id', companyId)
  if (error) throw error
  await (supabase as any).from('conversation_events').insert({ conversation_id: conversationId, company_id: companyId, event_type: 'closed', actor_name: actor, detail: 'Closed from Needs you: no reply needed.' })
}

function Detail({ item, companyId, now, onDone, inline }: { item: Item; companyId: string; now: number; onDone: () => void; inline?: boolean }) {
  const [tab, setTab] = useState<'next' | 'customer'>('next')
  const [closing, setClosing] = useState<'' | 'busy' | 'error'>('')
  useEffect(() => { setTab('next'); setClosing('') }, [item.key])
  const canClose = !!item.conversationId && (item.kind === 'reply' || item.kind === 'handover')
  const close = async () => {
    if (!item.conversationId) return
    setClosing('busy')
    try { await closeNoReply(companyId, item.conversationId); onDone() } catch { setClosing('error') }
  }
  const ch = channelName(item.channel)
  const name = who(item)
  return (
    <div className={`nyp-detail ${inline ? 'inline' : ''}`} aria-live="polite">
      <div className="nyp-d-head">
        <Avatar name={name} size={44} />
        <div style={{ minWidth: 0, flex: 1 }}>
          <p className="nyp-d-name">{name}</p>
          <p className="nyp-d-meta">{ago(item.previewAt || item.at, now)}{ch ? ` · ${ch}` : ''}</p>
        </div>
        <span className={`nyp-badge ${item.urgency}`}>{badge(item)}</span>
      </div>
      {item.preview && <blockquote className="nyp-quote">“{item.preview}”</blockquote>}

      <div className="nyp-tabs" role="tablist">
        <button type="button" role="tab" aria-selected={tab === 'next'} className={tab === 'next' ? 'on' : ''} onClick={() => setTab('next')}>{item.kind === 'approval' ? 'Agent’s draft' : 'Next step'}</button>
        <button type="button" role="tab" aria-selected={tab === 'customer'} className={tab === 'customer' ? 'on' : ''} onClick={() => setTab('customer')}>Customer</button>
      </div>

      {tab === 'next' && (
        <div className="nyp-d-body">
          {item.kind === 'approval' && item.approval ? (
            <>
              <p className="nyp-d-text" style={{ marginTop: 0 }}>{item.detail}{item.value ? <b style={{ color: 'var(--ink)' }}> · {money(item.value)} waiting on this</b> : null}</p>
              <div style={{ marginTop: 12 }}><SuggestionCard s={item.approval} companyId={companyId} onDone={onDone} /></div>
            </>
          ) : (
            <>
              <p className="nyp-d-title"><span className={`ny-ic ${item.kind}`}>{ICON[item.kind]}</span>{item.title}</p>
              <p className="nyp-d-text">{item.detail}</p>
              {item.value ? <p className="nyp-d-value">{money(item.value)} waiting on this</p> : null}
              <div className="nyp-actions">
                <a className="nyp-primary" href={item.href}>{OPEN[item.kind]} <Arrow /></a>
                {canClose && <button type="button" className="nyp-secondary" onClick={close} disabled={closing === 'busy'} title="Closes the enquiry. If they write again, it comes back.">{closing === 'busy' ? 'Closing…' : 'No reply needed'}</button>}
              </div>
              {closing === 'error' && <p className="nyp-d-text" style={{ color: '#b42318' }} role="alert">Couldn’t close it. Try again, or close it from the inbox.</p>}
            </>
          )}
        </div>
      )}
      {tab === 'customer' && (
        <div className="nyp-d-body">
          {item.customer ? (
            <dl className="nyp-facts">
              <div><dt>Name</dt><dd>{item.customer.name || '—'}</dd></div>
              {item.customer.phone && <div><dt>Phone</dt><dd><a href={`tel:${item.customer.phone}`}>{item.customer.phone}</a></dd></div>}
              {item.customer.email && <div><dt>Email</dt><dd><a href={`mailto:${item.customer.email}`}>{item.customer.email}</a></dd></div>}
              {ch && <div><dt>Channel</dt><dd>{ch}</dd></div>}
            </dl>
          ) : <p className="nyp-d-text">This one isn’t about a single customer.</p>}
        </div>
      )}

      <div className="nyp-d-foot">
        {item.conversationId && <a href={`/admin/inbox?conversation=${item.conversationId}`}>Open conversation <Arrow /></a>}
        {item.runId && item.kind !== 'approval' && <a href={`/admin/agents?run=${item.runId}`} className="muted">Why? See what the agent did</a>}
      </div>
    </div>
  )
}

/** The full "Needs you" page. */
export function NeedsYouView({ companyId }: { companyId: string | null }) {
  const { data, reload, setData } = useNeedsYou(companyId)
  const wide = useWide()
  const [filter, setFilter] = useState<GroupKey | 'all'>('all')
  const [sort, setSort] = useState<Sort>('priority')
  const [closed, setClosed] = useState<Record<string, boolean>>({})
  const [more, setMore] = useState<Record<string, boolean>>({})
  const [sel, setSel] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 60_000); return () => clearInterval(t) }, [])

  const items = data?.items || []
  const sorted = useMemo(() => [...items].sort((a, b) =>
    sort === 'newest' ? b.at.localeCompare(a.at)
      : sort === 'oldest' ? a.at.localeCompare(b.at)
        : RANK[a.urgency] - RANK[b.urgency] || a.at.localeCompare(b.at)), [items, sort])
  const byGroup = useMemo(() => {
    const m = new Map<GroupKey, Item[]>()
    for (const i of sorted) { const g = groupOf(i); (m.get(g) || m.set(g, []).get(g)!).push(i) }
    return m
  }, [sorted])
  const visible = GROUPS.filter(g => (byGroup.get(g.key) || []).length && (filter === 'all' || filter === g.key))
  // Keep a row selected on wide screens: the chosen one, else the first visible.
  const flat = visible.flatMap(g => byGroup.get(g.key) || [])
  const selected = flat.find(i => i.key === sel) || (wide ? flat[0] : null) || null

  const remove = (key: string) => {
    if (!data) return
    const idx = flat.findIndex(i => i.key === key)
    const next = flat[idx + 1] || flat[idx - 1]
    setSel(next ? next.key : null)
    setData({ ...data, items: data.items.filter(i => i.key !== key) } as Payload)
    setTimeout(reload, 900)
  }
  const toggleAlerts = async () => {
    if (!data || !companyId) return
    const enabled = !data.alerts.enabled
    setSaving(true)
    try { const r = await authFetch('/api/agent/needs-you', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ companyId, action: 'alerts', enabled }) }); if (r.ok) setData({ ...data, alerts: { enabled } }) } finally { setSaving(false) }
  }

  // ── The four numbers
  const counts = data?.counts || { now: 0, soon: 0, fyi: 0 }
  const waiting = items.filter(i => i.conversationId && ['reply', 'handover', 'approval'].includes(i.kind))
  const longest = waiting.reduce((m, i) => Math.max(m, minutes(i.previewAt || i.at, now)), 0)
  const goal = data?.goals?.find(g => g.key === 'reply_time') || data?.goals?.[0] || null
  const goalPct = goal?.rate == null ? null : Math.round(goal.rate * 100)
  const value = items.reduce((s, i) => s + (i.value || 0), 0)
  const drafts = items.filter(i => i.kind === 'approval').length
  const total = items.length

  return (
    <div className="ny nyp" style={{ minHeight: '100%', background: 'var(--canvas, #f6f7f9)' }}>
      <style>{NY_CSS + CSS}</style>
      <div className="nyp-page">
        <nav className="ny-crumbs" aria-label="Breadcrumb"><a href="/admin/agents">AI Agents</a><span aria-hidden="true">›</span><span>Needs you</span></nav>
        <h1 className="nyp-title">Needs you</h1>
        <p className="nyp-sub">Review, approve and act on what matters most. Your agents sorted it for you, most urgent first.</p>

        {!data && <div className="nyp-stats" aria-busy="true">{[0, 1, 2, 3].map(n => <div key={n} className="nyp-stat nyp-skel" />)}</div>}

        {data && (
          <>
            <div className="nyp-stats">
              <Stat icon={ICON.reply} tone="#e5484d" value={String(total)} label={total === 1 ? 'Item needs your attention' : 'Items need your attention'}
                chip={counts.now ? `${counts.now} urgent` : total ? 'Nothing urgent' : 'All clear'} chipTone={counts.now ? 'bad' : 'good'}
                bar={total ? <span className="nyp-bar" aria-hidden="true">{(['now', 'soon', 'fyi'] as const).map(u => counts[u] ? <span key={u} className={u} style={{ flex: counts[u] }} /> : null)}</span> : null} />
              <Stat icon={ico(<><circle cx="12" cy="12" r="9" /><polyline points="12 7 12 12 15 14" /></>)} tone="#d97706"
                value={longest ? span(longest) : '—'} label={longest ? 'Longest a customer has waited' : 'No customer is waiting'}
                chip={waiting.length ? `${waiting.length} waiting` : undefined} chipTone={counts.now ? 'warn' : 'plain'} />
              <Stat icon={<Target />} tone="#00a676" value={goalPct == null ? '—' : `${goalPct}%`}
                label={goal ? `${goal.label} · last 2 weeks` : 'No goals set yet'}
                chip={goalPct == null ? undefined : goalPct >= 90 ? 'On track' : 'Behind'} chipTone={goalPct == null ? 'plain' : goalPct >= 90 ? 'good' : 'bad'} />
              {value > 0
                ? <Stat icon={ico(<><path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z" /><line x1="3" y1="6" x2="21" y2="6" /><path d="M16 10a4 4 0 0 1-8 0" /></>)} tone="#ff6a4d" value={money(value)} label="In carts and unpaid requests" chip="At stake" chipTone="warn" />
                : <Stat icon={ICON.approval} tone="#ff6a4d" value={String(drafts)} label={drafts === 1 ? 'Draft from your agents' : 'Drafts from your agents'} chip={drafts ? 'To approve' : undefined} chipTone="plain" />}
            </div>

            {total > 0 && (
              <div className="nyp-bar-row">
                <div className="nyp-chips" role="tablist" aria-label="Show">
                  <button type="button" role="tab" aria-selected={filter === 'all'} className={filter === 'all' ? 'on' : ''} onClick={() => setFilter('all')}>All <b>{total}</b></button>
                  {GROUPS.filter(g => (byGroup.get(g.key) || []).length).map(g => (
                    <button key={g.key} type="button" role="tab" aria-selected={filter === g.key} className={filter === g.key ? 'on' : ''} onClick={() => setFilter(g.key)}>{g.title} <b>{byGroup.get(g.key)!.length}</b></button>
                  ))}
                </div>
                <label className="nyp-sort">Sort by
                  <select value={sort} onChange={e => setSort(e.target.value as Sort)}>
                    <option value="priority">Priority</option>
                    <option value="oldest">Oldest first</option>
                    <option value="newest">Newest first</option>
                  </select>
                </label>
              </div>
            )}

            <div className="nyp-cols">
              <div className="nyp-main">
                {total === 0 && (
                  <div className="nyp-empty">
                    <span className="ny-ok"><Check /></span>
                    <div><p className="nyp-d-name">Nothing needs you right now</p><p className="nyp-d-text">Your agents are on it and every goal is on track.</p></div>
                  </div>
                )}
                {visible.map(g => {
                  const list = byGroup.get(g.key) || []
                  const isOpen = !closed[g.key]
                  const shown = more[g.key] ? list : list.slice(0, ROWS)
                  const urgent = list.some(i => i.urgency === 'now')
                  const groupValue = list.reduce((s, i) => s + (i.value || 0), 0)
                  const oldest = list.reduce((m, i) => Math.max(m, minutes(i.previewAt || i.at, now)), 0)
                  const stat = g.key === 'replies' ? `Longest wait ${span(oldest)}`
                    : groupValue > 0 ? `${money(groupValue)} waiting`
                      : g.key === 'approvals' ? `Oldest ${span(oldest)}`
                        : g.key === 'reviews' ? `${list.length} unanswered` : 'Last 2 days'
                  return (
                    <section key={g.key} className={`nyp-group ${urgent ? 'urgent' : ''}`}>
                      <button type="button" className="nyp-g-head" aria-expanded={isOpen} onClick={() => setClosed(c => ({ ...c, [g.key]: isOpen }))}>
                        <span className={`nyp-g-ic ny-ic ${g.icon}`}>{ICON[g.icon]}</span>
                        <span style={{ minWidth: 0, flex: 1, textAlign: 'left' }}>
                          <span className="nyp-g-t">{g.title} <span className={`nyp-count ${urgent ? 'now' : ''}`}>{list.length}</span></span>
                          <span className="nyp-g-s">{g.sub}</span>
                        </span>
                        <span className={`nyp-chip-s ${urgent ? 'bad' : 'plain'} nyp-hide-sm`}>{stat}</span>
                        <Chevron open={isOpen} />
                      </button>
                      {isOpen && (
                        <ul className="nyp-rows">
                          {shown.map(i => {
                            const on = selected?.key === i.key
                            const ch = channelName(i.channel)
                            const name = who(i)
                            return (
                              <li key={i.key}>
                                <button type="button" className={`nyp-row ${on ? 'on' : ''}`} aria-expanded={!wide ? on : undefined} onClick={() => setSel(on && !wide ? null : i.key)}>
                                  <Avatar name={name} />
                                  <span className="nyp-r-main">
                                    <span className="nyp-r-top"><span className="nyp-r-name">{name}</span><span className={`nyp-badge ${i.urgency}`}>{badge(i)}</span></span>
                                    <span className="nyp-r-sn">{i.preview ? `“${i.preview}”` : i.customer?.name ? i.title : i.detail}</span>
                                  </span>
                                  <span className="nyp-r-meta">
                                    <span className="nyp-r-age">{ago(i.previewAt || i.at, now)}</span>
                                    {ch && <span className="nyp-r-ch">{CH_ICON[ch] || null}{ch}</span>}
                                    {i.value ? <span className="nyp-r-val">{money(i.value)}</span> : null}
                                    <span className={`nyp-prio ${i.urgency}`}>{PRIORITY[i.urgency]}</span>
                                  </span>
                                  <span className="nyp-r-go">{wide ? <Right /> : <Chevron open={on} />}</span>
                                </button>
                                {!wide && on && <Detail item={i} companyId={companyId!} now={now} onDone={() => remove(i.key)} inline />}
                              </li>
                            )
                          })}
                        </ul>
                      )}
                      {isOpen && list.length > ROWS && (
                        <button type="button" className="nyp-more" onClick={() => setMore(m => ({ ...m, [g.key]: !m[g.key] }))}>
                          {more[g.key] ? 'Show fewer' : `Show ${list.length - ROWS} more`} <Chevron open={!!more[g.key]} />
                        </button>
                      )}
                    </section>
                  )
                })}
              </div>

              <aside className="nyp-side">
                {wide && selected && <Detail item={selected} companyId={companyId!} now={now} onDone={() => remove(selected.key)} />}

                {!!data.goals?.length && (
                  <div className="ny-card">
                    <div className="ny-head"><p className="ny-t" style={{ display: 'flex', alignItems: 'center', gap: 8 }}><span className="ny-side-ic"><Target /></span>Goals · last 2 weeks</p></div>
                    <ul className="ny-goals">
                      {data.goals.map(gl => {
                        const pct = gl.rate == null ? null : Math.round(gl.rate * 100)
                        return (
                          <li key={gl.key}>
                            <div className="ny-goal-top"><span className="ny-goal-l">{gl.label}</span><span className={`ny-goal-p ${pct == null ? '' : pct >= 90 ? 'good' : pct >= 70 ? 'ok' : 'bad'}`}>{pct == null ? '—' : `${pct}%`}</span></div>
                            <span className="ny-goal-m" aria-hidden="true"><span style={{ width: `${pct ?? 0}%` }} /></span>
                            {gl.open > 0 && <span className="ny-goal-o">{gl.open} missing now</span>}
                          </li>
                        )
                      })}
                    </ul>
                    <a className="ny-link" href="/admin/agents/results">Change goals <Arrow /></a>
                  </div>
                )}

                <div className="ny-card ny-alerts">
                  <span className="ny-side-ic"><Bell /></span>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <p className="ny-t">Phone alerts</p>
                    <p className="ny-d">A notification on the Colvy app when something urgent lands here: once per item, a few at a time.</p>
                  </div>
                  <button type="button" role="switch" aria-checked={data.alerts.enabled} aria-label="Phone alerts" className={`ny-switch ${data.alerts.enabled ? 'on' : ''}`} onClick={toggleAlerts} disabled={saving}><span /></button>
                </div>
              </aside>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

const CSS = `
.nyp-page{max-width:1360px;margin:0 auto;padding:20px 16px 120px}
@media (min-width:900px){.nyp-page{padding:24px 28px 120px}}
.nyp-title{margin:0;font-size:clamp(26px,3.6vw,34px);font-weight:800;letter-spacing:-0.025em;color:var(--ink)}
.nyp-sub{margin:6px 0 22px;font-size:15px;color:var(--slate);line-height:1.5;max-width:720px}

.nyp-stats{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;margin-bottom:20px}
@media (min-width:1100px){.nyp-stats{grid-template-columns:repeat(4,minmax(0,1fr));gap:16px}}
.nyp-stat{position:relative;display:flex;align-items:flex-start;gap:14px;min-height:96px;padding:18px;border-radius:20px;background:#fff;border:1px solid var(--border);box-sizing:border-box;animation:nyIn .45s ${EASE} both}
.nyp-stat:first-child{background:color-mix(in srgb,var(--tone) 5%,#fff);border-color:color-mix(in srgb,var(--tone) 22%,var(--border))}
.nyp-stat-ic{width:42px;height:42px;flex-shrink:0;border-radius:13px;display:inline-flex;align-items:center;justify-content:center;background:color-mix(in srgb,var(--tone) 12%,#fff);color:var(--tone)}
.nyp-stat-ic svg{width:20px;height:20px}
.nyp-stat-v{font-size:28px;font-weight:800;letter-spacing:-0.03em;color:var(--ink);line-height:1.1;font-variant-numeric:tabular-nums}
.nyp-stat-l{margin-top:4px;font-size:13px;color:var(--slate);line-height:1.35}
.nyp-chip-s{flex-shrink:0;padding:4px 10px;border-radius:999px;font-size:12px;font-weight:700;white-space:nowrap;background:var(--canvas,#f3f4f6);color:var(--slate)}
.nyp-chip-s.good{background:#ecfdf3;color:#067647}.nyp-chip-s.bad{background:#fef3f2;color:#b42318}.nyp-chip-s.warn{background:#fffaeb;color:#b54708}
@media (max-width:560px){.nyp-stat{flex-direction:column;min-height:0;padding:14px;gap:10px}.nyp-stat .nyp-chip-s{position:absolute;top:18px;right:12px;font-size:11px;padding:3px 8px}.nyp-stat-v{font-size:24px}.nyp-stat-ic{width:36px;height:36px}.nyp-stat-ic svg{width:18px;height:18px}}
.nyp-bar{display:flex;gap:3px;height:6px;margin-top:10px;border-radius:999px;overflow:hidden;max-width:180px}
.nyp-bar span{border-radius:999px}.nyp-bar .now{background:#f04438}.nyp-bar .soon{background:#f79009}.nyp-bar .fyi{background:#98a2b3}
.nyp-skel{background:linear-gradient(90deg,#eef0f3 25%,#f6f7f9 50%,#eef0f3 75%);background-size:200% 100%;animation:nySk 1.2s ease-in-out infinite;border:none}

.nyp-bar-row{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;margin-bottom:16px}
.nyp-chips{display:flex;gap:8px;overflow-x:auto;scrollbar-width:none;padding:2px;margin:-2px;max-width:100%}
.nyp-chips::-webkit-scrollbar{display:none}
.nyp-chips button{flex-shrink:0;display:inline-flex;align-items:center;gap:6px;height:36px;padding:0 14px;border-radius:999px;border:1px solid var(--border);background:#fff;color:var(--ink);font:inherit;font-size:13.5px;font-weight:600;cursor:pointer;transition:all .2s ${EASE}}
.nyp-chips button::before{display:none}
.nyp-chips button b{font-weight:800;color:var(--slate)}
.nyp-chips button:hover{border-color:color-mix(in srgb,var(--coral) 50%,var(--border))}
.nyp-chips button.on{background:color-mix(in srgb,var(--coral) 10%,#fff);border-color:var(--coral);color:var(--coral)}
.nyp-chips button.on b{color:var(--coral)}
.nyp-sort{display:inline-flex;align-items:center;gap:8px;height:36px;padding:0 6px 0 12px;border-radius:12px;border:1px solid var(--border);background:#fff;font-size:13px;color:var(--slate)}
.nyp-sort select{border:none;background:transparent;font:inherit;font-weight:700;color:var(--ink);cursor:pointer;outline:none;padding:4px}

.nyp-cols{display:grid;grid-template-columns:minmax(0,1fr);gap:16px;align-items:start}
@media (min-width:1080px){.nyp-cols{grid-template-columns:minmax(0,1fr) 400px;gap:20px}.nyp-side{position:sticky;top:76px;max-height:calc(100vh - 96px);overflow-y:auto;scrollbar-width:thin}}
.nyp-main{display:flex;flex-direction:column;gap:14px;min-width:0}
.nyp-side{display:flex;flex-direction:column;gap:12px;min-width:0}

.nyp-group{background:#fff;border:1px solid var(--border);border-radius:20px;overflow:hidden;animation:nyIn .45s ${EASE} both}
.nyp-group.urgent{border-color:color-mix(in srgb,#f04438 28%,var(--border));box-shadow:0 0 0 3px color-mix(in srgb,#f04438 5%,transparent)}
.nyp-g-head{display:flex;align-items:center;gap:12px;width:100%;padding:16px 18px;border:none;background:transparent;cursor:pointer;font:inherit;color:var(--ink)}
.nyp-g-head::before{display:none}
.nyp-group.urgent .nyp-g-head{background:color-mix(in srgb,#f04438 3%,#fff)}
.nyp-g-ic{width:40px!important;height:40px!important;border-radius:12px!important}
.nyp-g-t{display:flex;align-items:center;gap:8px;font-size:15.5px;font-weight:800}
.nyp-g-s{display:block;margin-top:2px;font-size:13px;color:var(--slate);font-weight:500}
.nyp-count{min-width:22px;height:22px;padding:0 7px;border-radius:999px;display:inline-flex;align-items:center;justify-content:center;font-size:12px;font-weight:800;background:var(--canvas,#f3f4f6);color:var(--ink);box-sizing:border-box}
.nyp-count.now{background:#f04438;color:#fff}
@media (max-width:640px){.nyp-hide-sm{display:none}}

.nyp-rows{list-style:none;margin:0;padding:0 8px 8px}
.nyp-row{display:flex;align-items:center;gap:12px;width:100%;padding:12px;border:1px solid transparent;border-radius:14px;background:transparent;cursor:pointer;font:inherit;text-align:left;color:var(--ink);transition:background .2s ease,border-color .2s ease}
.nyp-row::before{display:none}
.nyp-rows li+li .nyp-row{margin-top:2px}
.nyp-row:hover{background:var(--canvas,#f6f7f9)}
.nyp-row.on{background:color-mix(in srgb,var(--coral) 6%,#fff);border-color:color-mix(in srgb,var(--coral) 45%,transparent)}
.nyp-av{flex-shrink:0;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;font-weight:800;letter-spacing:.02em}
.nyp-r-main{min-width:0;flex:1}
.nyp-r-top{display:flex;align-items:center;gap:8px;min-width:0}
.nyp-r-name{font-size:14.5px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;min-width:0}
.nyp-r-sn{display:block;margin-top:3px;font-size:13.5px;color:var(--slate);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.nyp-badge{flex-shrink:0;padding:2px 8px;border-radius:999px;font-size:11.5px;font-weight:700}
.nyp-badge.now{background:#fef3f2;color:#b42318}.nyp-badge.soon{background:#fffaeb;color:#b54708}.nyp-badge.fyi{background:var(--canvas,#f3f4f6);color:var(--slate)}
.nyp-r-meta{display:flex;align-items:center;gap:14px;flex-shrink:0;font-size:13px;color:var(--slate)}
.nyp-r-age{min-width:72px;text-align:right}
.nyp-r-ch{display:inline-flex;align-items:center;gap:5px;min-width:78px}
.nyp-r-val{font-weight:700;color:var(--ink)}
.nyp-prio{min-width:62px;text-align:center;padding:4px 10px;border-radius:999px;font-size:12px;font-weight:700;border:1px solid}
.nyp-prio.now{color:#b42318;background:#fef3f2;border-color:#fecdca}.nyp-prio.soon{color:#b54708;background:#fffaeb;border-color:#fedf89}.nyp-prio.fyi{color:var(--slate);background:#fff;border-color:var(--border)}
.nyp-r-go{color:var(--slate);display:inline-flex}
@media (max-width:1279px){.nyp-r-ch{display:none}}
@media (max-width:760px){
  .nyp-row{flex-wrap:wrap;align-items:flex-start}
  .nyp-r-main{flex-basis:calc(100% - 92px)}
  .nyp-r-meta{order:3;width:100%;padding-left:52px;gap:10px;flex-wrap:wrap}
  .nyp-r-age{min-width:0;text-align:left}
  .nyp-r-sn{white-space:normal;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical}
}
.nyp-more{display:flex;align-items:center;gap:6px;margin:0 0 10px 20px;padding:6px 0;border:none;background:none;font:inherit;font-size:13.5px;font-weight:700;color:var(--coral);cursor:pointer}
.nyp-more::before{display:none}

.nyp-detail{background:#fff;border:1px solid var(--border);border-radius:20px;padding:18px;animation:nyIn .35s ${EASE} both}
.nyp-detail.inline{margin:2px 0 12px;padding:14px 12px 4px;border:none;border-top:1px dashed var(--border);border-radius:0;background:transparent}
.nyp-d-head{display:flex;align-items:center;gap:12px}
.nyp-d-name{margin:0;font-size:16px;font-weight:800;color:var(--ink);line-height:1.3;overflow:hidden;text-overflow:ellipsis}
.nyp-d-meta{margin:2px 0 0;font-size:13px;color:var(--slate)}
.nyp-quote{margin:14px 0 0;padding:12px 14px;border-radius:14px;background:var(--canvas,#f6f7f9);font-size:14.5px;line-height:1.5;color:var(--ink)}
.nyp-tabs{display:flex;gap:4px;margin:16px 0 0;border-bottom:1px solid var(--border)}
.nyp-tabs button{padding:9px 12px;border:none;background:none;font:inherit;font-size:13.5px;font-weight:700;color:var(--slate);cursor:pointer;border-bottom:2px solid transparent;margin-bottom:-1px}
.nyp-tabs button::before{display:none}
.nyp-tabs button.on{color:var(--coral);border-bottom-color:var(--coral)}
.nyp-d-body{padding-top:14px}
.nyp-d-title{display:flex;align-items:center;gap:10px;margin:0;font-size:14.5px;font-weight:700;color:var(--ink);line-height:1.35}
.nyp-d-title .ny-ic{width:30px;height:30px;border-radius:10px}
.nyp-d-text{margin:8px 0 0;font-size:13.5px;color:var(--slate);line-height:1.5}
.nyp-d-value{margin:8px 0 0;font-size:13.5px;font-weight:800;color:var(--ink)}
.nyp-actions{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-top:14px}
.nyp-actions .nyp-primary{margin-top:0}
.nyp-secondary{display:inline-flex;align-items:center;height:40px;padding:0 14px;border-radius:12px;border:1px solid var(--border);background:#fff;color:var(--ink);font:inherit;font-size:14px;font-weight:700;cursor:pointer;transition:border-color .2s ease,transform .15s ${EASE}}
.nyp-secondary::before{display:none}
.nyp-secondary:hover{border-color:var(--slate)}.nyp-secondary:active{transform:scale(.97)}.nyp-secondary:disabled{opacity:.6;cursor:default}
.nyp-primary{display:inline-flex;align-items:center;gap:6px;margin-top:14px;height:40px;padding:0 16px;border-radius:12px;background:var(--coral);color:#fff;font-size:14px;font-weight:800;text-decoration:none;transition:transform .15s ${EASE}}
.nyp-primary:active{transform:scale(.97)}
.nyp-facts{margin:0;display:grid;gap:10px}
.nyp-facts div{display:grid;grid-template-columns:80px 1fr;gap:10px;font-size:13.5px}
.nyp-facts dt{color:var(--slate)}.nyp-facts dd{margin:0;color:var(--ink);font-weight:600;word-break:break-word}
.nyp-facts a{color:var(--ink)}
.nyp-d-foot{display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;margin-top:16px;padding-top:14px;border-top:1px solid var(--border);font-size:13.5px}
.nyp-d-foot a{display:inline-flex;align-items:center;gap:5px;font-weight:700;color:var(--coral);text-decoration:none}
.nyp-d-foot a.muted{color:var(--slate);font-weight:600}
.nyp-empty{display:flex;gap:12px;align-items:center;padding:20px;border-radius:20px;background:#fff;border:1px solid var(--border)}
@media (prefers-reduced-motion: reduce){.nyp-stat,.nyp-group,.nyp-detail{animation:none}}
`
