'use client'

// "Build with Colvy AI": describe a campaign in a sentence, and Colvy AI picks
// who gets it, writes the text and/or the email, features real products and
// suggests when to send. Ask for changes in plain words, then make it a
// draft and land on the campaign's Review step. Nothing is sent from here.
// Plans come from /api/campaigns/ai-build (lib/ai-campaign).

import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { authFetch } from '@/lib/auth-fetch'
import { confirmDialog } from '@/components/ConfirmDialog'
import AiBuddy from '@/components/AiBuddy'
import { MessagesPhone, PhonePreview, DEVICES_CSS } from '@/components/EmailDesigner/Devices'
import { renderEmail, fillTemplate, sampleVars } from '@/components/EmailDesigner/render'
import { analyseSms, renderVariables, SMS_VARIABLES } from '@/lib/sms-segments'
import type { EmailBrand } from '@/components/EmailDesigner/types'
import type { AiChannel, AiPlan } from '@/lib/ai-campaign'

type Stage = 'ask' | 'building' | 'plan' | 'done'

const IDEAS: { title: string; text: string }[] = [
  { title: 'Weekend sale', text: '20% off everything this weekend, Friday to Sunday.' },
  { title: 'New stock is in', text: 'A new delivery just landed. Show customers what’s new and invite them in to see it.' },
  { title: 'We miss you', text: 'Win back customers who haven’t ordered in a few months with 10% off their next order.' },
  { title: 'VIP early access', text: 'Give our best customers early access to the sale a day before everyone else.' },
  { title: 'Event invite', text: 'Invite customers to our in-store event next Saturday at 2pm, with demos and free snacks.' },
  { title: 'Ask for a review', text: 'Thank customers who ordered recently and ask them to leave us a Google review.' },
]
const CHANGES = ['Make it shorter', 'More playful', 'Add some urgency', 'More personal', 'Try a different audience', 'Write another version']
const STATUS = ['Looking at how your last campaigns did', 'Choosing who should get it', 'Writing it in your voice', 'Picking products from your store', 'Finding a good time to send']
const TYPE_LABEL: Record<string, string> = { promotion: 'Promotion', new_arrivals: 'New arrivals', product_launch: 'Product launch', event: 'Event', review_request: 'Review request', follow_up: 'Follow-up', service_announcement: 'Service update', general_update: 'Update' }
const DAY_INDEX: Record<string, number> = { sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 }

/** The next time this day and time comes round, in this browser's time. */
export function nextSlot(day: string, time: string, now = new Date()): Date {
  const [h, m] = time.split(':').map(Number)
  const d = new Date(now); d.setHours(h || 0, m || 0, 0, 0)
  if (day === 'today') { if (d.getTime() < now.getTime() + 15 * 60_000) d.setDate(d.getDate() + 1) }
  else if (day === 'tomorrow') d.setDate(d.getDate() + 1)
  else if (day in DAY_INDEX) {
    let add = (DAY_INDEX[day] - now.getDay() + 7) % 7
    if (add === 0 && d.getTime() < now.getTime() + 15 * 60_000) add = 7
    d.setDate(d.getDate() + add)
  }
  return d
}
const whenText = (d: Date) => d.toLocaleString('en-AU', { weekday: 'long', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })

const Spark = ({ size = 16 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2.5l1.9 5.6 5.6 1.9-5.6 1.9L12 17.5l-1.9-5.6L4.5 10l5.6-1.9z" /><path d="M19 15l.9 2.1L22 18l-2.1.9L19 21l-.9-2.1L16 18l2.1-.9z" opacity=".7" /></svg>
)
const Icon = ({ d, size = 16 }: { d: React.ReactNode; size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{d}</svg>
)
const ICONS = {
  close: <><path d="M18 6 6 18" /><path d="m6 6 12 12" /></>,
  people: <><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></>,
  clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
  bag: <><path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z" /><path d="M3 6h18" /><path d="M16 10a4 4 0 0 1-8 0" /></>,
  bulb: <><path d="M9 18h6" /><path d="M10 22h4" /><path d="M12 2a7 7 0 0 0-4 12.7V17h8v-2.3A7 7 0 0 0 12 2Z" /></>,
  send: <><path d="m22 2-7 20-4-9-9-4Z" /><path d="M22 2 11 13" /></>,
  sms: <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />,
  mail: <><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m3 7 9 6 9-6" /></>,
  back: <path d="m15 18-6-6 6-6" />,
  undo: <><path d="M9 14 4 9l5-5" /><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11" /></>,
  check: <path d="M20 6 9 17l-5-5" />,
}

export default function AiCampaignBuilder({ companyId, initialChannel = 'sms', onClose }: { companyId: string; initialChannel?: AiChannel; onClose: () => void }) {
  const router = useRouter()
  const [stage, setStage] = useState<Stage>('ask')
  const [channel, setChannel] = useState<AiChannel>(initialChannel)
  const [prompt, setPrompt] = useState('')
  const [versions, setVersions] = useState<AiPlan[]>([])
  const plan = versions[versions.length - 1] || null
  const [name, setName] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [change, setChange] = useState('')
  const [statusIdx, setStatusIdx] = useState(0)
  const [brand, setBrand] = useState<EmailBrand | null>(null)
  const [counts, setCounts] = useState<{ sms?: number | null; email?: number | null } | null>(null)
  const [tab, setTab] = useState<'sms' | 'email'>('sms')
  const [creating, setCreating] = useState(false)
  const [created, setCreated] = useState<{ id: string; channel: string; name: string }[]>([])
  const box = useRef<HTMLTextAreaElement>(null)

  // The brand (name, logo, colours) for the previews.
  useEffect(() => {
    authFetch(`/api/email-campaigns/designs?companyId=${encodeURIComponent(companyId)}`)
      .then(r => r.json().catch(() => ({}))).then((j: any) => { if (j?.brand) setBrand(j.brand) }).catch(() => {})
  }, [companyId])
  // Full screen: no page scroll behind it; Escape closes.
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [])
  const close = async () => {
    if (plan && stage === 'plan' && !(await confirmDialog({ title: 'Close the builder?', message: 'This campaign hasn’t been made into a draft yet.', confirmLabel: 'Close', tone: 'danger' }))) return
    onClose()
  }
  useEffect(() => {
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape' && !creating) close() }
    document.addEventListener('keydown', key)
    return () => document.removeEventListener('keydown', key)
  })
  // While building, say what's happening.
  useEffect(() => {
    if (stage !== 'building' && !busy) return
    setStatusIdx(0)
    const t = setInterval(() => setStatusIdx(i => Math.min(STATUS.length - 1, i + 1)), 2200)
    return () => clearInterval(t)
  }, [stage, busy])

  // How many people the audience reaches, per channel.
  useEffect(() => {
    if (!plan) return
    let live = true
    setCounts(null)
    const chans = channel === 'both' ? ['sms', 'email'] : [channel]
    Promise.all(chans.map(ch => authFetch('/api/campaigns/audience', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ companyId, filter: plan.audience.filter, channel: ch }),
    }).then(r => r.json().catch(() => ({}))).then((d: any) => [ch, typeof d?.recipients === 'number' ? d.recipients : null] as const).catch(() => [ch, null] as const)))
      .then(rows => { if (live) setCounts(Object.fromEntries(rows)) })
    return () => { live = false }
  }, [plan, channel, companyId])

  const ask = async (opts: { change?: string } = {}) => {
    const text = prompt.trim()
    if (text.length < 3) { setError('Tell Colvy AI what the campaign is about.'); box.current?.focus(); return }
    setError('')
    if (opts.change) setBusy(true); else setStage('building')
    try {
      const r = await authFetch('/api/campaigns/ai-build', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ companyId, prompt: text, channel, ...(opts.change && plan ? { previous: plan, change: opts.change } : {}) }),
      })
      const j: any = await r.json().catch(() => ({}))
      if (!r.ok || !j.plan) throw new Error(j.error || 'Colvy AI couldn’t build that. Please try again.')
      setVersions(v => [...v, j.plan])
      setName(j.plan.name)
      setTab(channel === 'email' ? 'email' : 'sms')
      setChange('')
      setStage('plan')
    } catch (e: any) {
      setError(e.message)
      if (!opts.change) setStage(versions.length ? 'plan' : 'ask')
    } finally { setBusy(false) }
  }

  const when = plan ? nextSlot(plan.send.day, plan.send.time) : null
  const smsText = useMemo(() => {
    if (!plan?.sms) return ''
    const vars = Object.fromEntries(SMS_VARIABLES.map(v => [v.token, v.sample])) as Record<string, string>
    if (brand?.name) vars.store_name = brand.name
    if (brand?.slug) vars.short_link = `${brand.slug}.colvy.com/l/a7Kd93m`
    return renderVariables(plan.sms.message, vars)
  }, [plan, brand])
  const smsInfo = plan?.sms ? analyseSms(smsText) : null
  const email = useMemo(() => {
    if (!plan?.email || !brand) return null
    const vars = sampleVars(brand)
    const { html } = renderEmail(plan.email.design, brand, { subject: plan.email.subject, previewText: plan.email.previewText })
    return { html: fillTemplate(html, vars, { html: true }), subject: fillTemplate(plan.email.subject, vars, { html: false }) }
  }, [plan, brand])

  const createDrafts = async () => {
    if (!plan || creating) return
    setCreating(true); setError('')
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const who = session?.user?.user_metadata?.display_name || session?.user?.email?.split('@')[0] || null
      const chans: ('sms' | 'email')[] = channel === 'both' ? ['sms', 'email'] : [channel]
      const base = name.trim() || plan.name
      const out: { id: string; channel: string; name: string }[] = []
      for (const ch of chans) {
        const rowName = chans.length > 1 ? `${base} (${ch === 'sms' ? 'SMS' : 'Email'})` : base
        const row: any = {
          company_id: companyId, name: rowName, channel: ch, status: 'draft', campaign_type: plan.campaignType,
          audience_type: plan.audience.filter.type, audience_filter: plan.audience.filter,
          scheduled_at: when ? when.toISOString() : null,
          created_by: who, created_by_id: session?.user?.id || null,
          ...(ch === 'sms' && plan.sms
            ? { message: plan.sms.message, attachments: plan.sms.attachment ? [plan.sms.attachment] : [], segments: analyseSms(smsText).segments }
            : { quiet_hours: false }),
        }
        const { data, error: err } = await (supabase as any).from('campaigns').insert(row).select().maybeSingle()
        if (err || !data) throw new Error(err?.message || 'Couldn’t create the draft')
        // The audience through the server, so the draft shows the right count.
        await authFetch('/api/campaigns/audience', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ companyId, campaignId: data.id, filter: plan.audience.filter, save: true }) }).catch(() => null)
        if (ch === 'email' && plan.email) {
          const r = await authFetch('/api/email-campaigns/designs', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ companyId, campaignId: data.id, name: rowName, subject: plan.email.subject, previewText: plan.email.previewText, design: plan.email.design }),
          })
          if (!r.ok) { const j: any = await r.json().catch(() => ({})); throw new Error(j.error || 'Couldn’t save the email design') }
        }
        out.push({ id: data.id, channel: ch, name: rowName })
      }
      if (out.length === 1) { router.push(`/admin/campaigns/${out[0].id}?step=6`); return }
      setCreated(out); setStage('done')
    } catch (e: any) { setError(e.message) }
    finally { setCreating(false) }
  }

  const chanPill = (v: AiChannel, label: string, icon: React.ReactNode) => (
    <button key={v} type="button" role="radio" aria-checked={channel === v} className={channel === v ? 'on' : ''} onClick={() => setChannel(v)} disabled={busy}>
      {icon}{label}
    </button>
  )
  const countText = () => {
    if (!counts) return 'Counting…'
    const part = (n: number | null | undefined, what: string) => (n == null ? null : `${n.toLocaleString('en-AU')} ${n === 1 ? 'person' : 'people'}${what}`)
    return channel === 'both'
      ? [part(counts.sms, ' by text'), part(counts.email, ' by email')].filter(Boolean).join(' · ') || 'Couldn’t count yet'
      : part(counts[channel as 'sms' | 'email'], channel === 'sms' ? ' can get the text' : ' can get the email') || 'Couldn’t count yet'
  }
  const showTab = channel === 'both' ? tab : channel

  return (
    <div className="cab" role="dialog" aria-modal="true" aria-label="Build a campaign with Colvy AI">
      <style>{DEVICES_CSS}</style>
      <style>{AIB_CSS}</style>
      <header className="cab-top">
        <div className="cab-brand"><AiBuddy size={30} /><b>Colvy AI</b><span>Campaign builder</span></div>
        <button type="button" className="cab-x" onClick={close} aria-label="Close"><Icon d={ICONS.close} /></button>
      </header>

      {stage === 'ask' && (
        <main className="cab-ask">
          <div className="cab-hero"><AiBuddy size={64} /></div>
          <h1>What’s this campaign for?</h1>
          <p className="cab-lead">Say it like you’d tell a colleague. Colvy AI chooses who gets it, writes it, features products from your store and suggests when to send. Nothing goes out until you say so.</p>
          <div className="cab-seg" role="radiogroup" aria-label="Send it as">
            {chanPill('sms', 'Text', <Icon d={ICONS.sms} size={15} />)}
            {chanPill('email', 'Email', <Icon d={ICONS.mail} size={15} />)}
            {chanPill('both', 'Text + email', <Spark size={14} />)}
          </div>
          <div className={`cab-box${error ? ' bad' : ''}`}>
            <textarea ref={box} value={prompt} autoFocus rows={4} maxLength={2000} aria-label="Describe the campaign"
              placeholder="e.g. 20% off all tropical fish this weekend for customers who bought fish in the last few months"
              onChange={e => { setPrompt(e.target.value); setError('') }}
              onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); ask() } }} />
            <div className="cab-box-f">
              <span>{prompt.length > 1600 ? `${2000 - prompt.length} characters left` : 'Ctrl + Enter to build'}</span>
              <button type="button" className="cab-go" onClick={() => ask()} disabled={prompt.trim().length < 3}><Spark />Build campaign</button>
            </div>
          </div>
          {error && <p className="cab-err" role="alert">{error}</p>}
          <p className="cab-ideas-h">Need an idea?</p>
          <div className="cab-ideas">
            {IDEAS.map(i => (
              <button key={i.title} type="button" onClick={() => { setPrompt(i.text); setError(''); box.current?.focus() }}>
                <b>{i.title}</b><span>{i.text}</span>
              </button>
            ))}
          </div>
        </main>
      )}

      {stage === 'building' && (
        <main className="cab-building" aria-busy="true">
          <div className="cab-orb"><AiBuddy size={76} /></div>
          <h1>Building your campaign…</h1>
          <p className="cab-quote">“{prompt.trim().slice(0, 220)}{prompt.trim().length > 220 ? '…' : ''}”</p>
          <ul className="cab-steps" aria-live="polite">
            {STATUS.map((s, i) => (
              <li key={s} className={i < statusIdx ? 'done' : i === statusIdx ? 'now' : ''}>
                <span className="cab-dot">{i < statusIdx ? <Icon d={ICONS.check} size={12} /> : null}</span>{s}
              </li>
            ))}
          </ul>
        </main>
      )}

      {stage === 'plan' && plan && (
        <main className={`cab-plan${busy ? ' busy' : ''}`}>
          <div className="cab-left">
            <div className="cab-reply">
              <AiBuddy size={30} />
              <p aria-live="polite">{busy ? `${STATUS[Math.min(statusIdx + 2, STATUS.length - 1)]}…` : plan.reply}</p>
            </div>

            <section className="cab-card cab-name">
              <label htmlFor="cab-name">Campaign name</label>
              <input id="cab-name" value={name} onChange={e => setName(e.target.value)} maxLength={80} />
              <div className="cab-tags">
                <span>{TYPE_LABEL[plan.campaignType] || 'Promotion'}</span>
                {channel !== 'email' && <span><Icon d={ICONS.sms} size={12} />Text</span>}
                {channel !== 'sms' && <span><Icon d={ICONS.mail} size={12} />Email</span>}
              </div>
            </section>

            <div className="cab-row">
              <section className="cab-card">
                <h3><Icon d={ICONS.people} />Who gets it</h3>
                <b className="cab-big">{plan.audience.label}</b>
                <p className="cab-count">{countText()}</p>
                {plan.audience.why && <p className="cab-why">{plan.audience.why}</p>}
              </section>
              <section className="cab-card">
                <h3><Icon d={ICONS.clock} />When</h3>
                <b className="cab-big">{when ? whenText(when) : '—'}</b>
                {plan.send.why && <p className="cab-why">{plan.send.why}</p>}
                <p className="cab-note">A suggestion: you choose when it sends.</p>
              </section>
            </div>

            {plan.products.length > 0 && (
              <section className="cab-card">
                <h3><Icon d={ICONS.bag} />Featured from your store</h3>
                <ul className="cab-prods">
                  {plan.products.map(p => (
                    <li key={p.id}>
                      {p.image ? <img src={p.image} alt="" loading="lazy" /> : <span className="cab-noimg"><Icon d={ICONS.bag} size={18} /></span>}
                      <span><b>{p.name}</b>{p.price && <small>{p.price}</small>}</span>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {plan.tips.length > 0 && (
              <section className="cab-card">
                <h3><Icon d={ICONS.bulb} />Before you send</h3>
                <ul className="cab-tips">{plan.tips.map(t => <li key={t}><Icon d={ICONS.check} size={14} />{t}</li>)}</ul>
              </section>
            )}

            <section className="cab-card cab-refine">
              <h3><Spark />Ask for changes</h3>
              <div className="cab-chips">
                {CHANGES.map(c => <button key={c} type="button" onClick={() => ask({ change: c })} disabled={busy}>{c}</button>)}
              </div>
              <form className="cab-ask-row" onSubmit={e => { e.preventDefault(); if (change.trim()) ask({ change: change.trim() }) }}>
                <input value={change} onChange={e => setChange(e.target.value)} placeholder="e.g. mention free delivery over $80" aria-label="What should Colvy AI change?" disabled={busy} maxLength={600} />
                <button type="submit" disabled={busy || !change.trim()} aria-label="Ask Colvy AI"><Icon d={ICONS.send} /></button>
              </form>
              {versions.length > 1 && !busy && (
                <button type="button" className="cab-link" onClick={() => { setVersions(v => v.slice(0, -1)); setName(versions[versions.length - 2].name) }}>
                  <Icon d={ICONS.undo} size={14} />Back to the previous version
                </button>
              )}
            </section>

            {error && <p className="cab-err" role="alert">{error}</p>}
            <div className="cab-actions">
              <button type="button" className="cab-ghost" onClick={() => { setStage('ask'); setVersions([]); setError('') }} disabled={busy || creating}><Icon d={ICONS.back} size={15} />Start over</button>
              <button type="button" className="cab-go" onClick={createDrafts} disabled={busy || creating || !name.trim()}>
                {creating ? 'Creating…' : channel === 'both' ? 'Create 2 drafts' : 'Create draft'}
              </button>
            </div>
            <p className="cab-note center">Makes a draft you can change. Nothing is sent.</p>
          </div>

          <aside className="cab-right" aria-label="Preview">
            {channel === 'both' && (
              <div className="cab-seg small" role="tablist" aria-label="Preview">
                <button type="button" role="tab" aria-selected={tab === 'sms'} className={tab === 'sms' ? 'on' : ''} onClick={() => setTab('sms')}><Icon d={ICONS.sms} size={14} />Text</button>
                <button type="button" role="tab" aria-selected={tab === 'email'} className={tab === 'email' ? 'on' : ''} onClick={() => setTab('email')}><Icon d={ICONS.mail} size={14} />Email</button>
              </div>
            )}
            <div className="cab-phone">
              {showTab === 'sms' && plan.sms && <MessagesPhone name={brand?.name || 'Your business'} text={smsText} accent="var(--coral)" height={600} />}
              {showTab === 'email' && (email
                ? <PhonePreview html={email.html} from={brand?.name || 'Your business'} subject={email.subject} previewText={plan.email?.previewText || ''} accent={brand?.accent || '#ff7a6b'} />
                : <div className="cab-wait">Loading the preview…</div>)}
            </div>
            {showTab === 'sms' && smsInfo && (
              <p className="cab-meta">{smsInfo.segments === 1 ? 'Fits in one text' : `${smsInfo.segments} texts per person`} · {smsText.length} characters{smsInfo.encoding === 'UCS-2' ? ' · special characters' : ''}</p>
            )}
            {showTab === 'email' && plan.email && <p className="cab-meta">Subject: {plan.email.subject}</p>}
          </aside>
        </main>
      )}

      {stage === 'done' && (
        <main className="cab-ask">
          <div className="cab-hero"><AiBuddy size={64} /></div>
          <h1>Your drafts are ready</h1>
          <p className="cab-lead">Check each one, send yourself a test, then schedule it.</p>
          <div className="cab-done">
            {created.map(c => (
              <button key={c.id} type="button" onClick={() => router.push(`/admin/campaigns/${c.id}?step=6`)}>
                <span className="cab-done-ic"><Icon d={c.channel === 'sms' ? ICONS.sms : ICONS.mail} size={18} /></span>
                <span><b>{c.name}</b><small>Review the {c.channel === 'sms' ? 'text' : 'email'}</small></span>
                <Icon d={<path d="m9 18 6-6-6-6" />} />
              </button>
            ))}
          </div>
        </main>
      )}
    </div>
  )
}

const AIB_CSS = `
.cab{position:fixed;inset:0;z-index:1000;overflow-y:auto;background:var(--cab-bg);color:var(--ink);font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;
  --cab-bg:#fbfbfc;--cab-card:#fff;--cab-fill:#f4f4f5;--cab-fill2:#ececef;--cab-line:#f0f0f2;--cab-muted:#71717a;--cab-soft:#8e8e93;animation:cab-in .22s ease-out}
@keyframes cab-in{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}
.cab button::before{display:none!important}
.cab-top{position:sticky;top:0;z-index:2;display:flex;align-items:center;justify-content:space-between;gap:12px;padding:14px 22px;background:color-mix(in srgb,var(--cab-bg) 86%,transparent);backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px)}
.cab-brand{display:flex;align-items:center;gap:9px}.cab-brand b{font-size:15px;font-weight:750}.cab-brand span{font-size:13.5px;color:var(--cab-muted);padding-left:9px;border-left:1px solid var(--cab-fill2)}
.cab-x{width:40px;height:40px;display:flex;align-items:center;justify-content:center;border:none;border-radius:50%;background:var(--cab-fill);color:var(--ink);cursor:pointer}.cab-x:hover{background:var(--cab-fill2)}
.cab-ask,.cab-building{max-width:720px;margin:0 auto;padding:4vh 22px 64px;display:flex;flex-direction:column;align-items:center;text-align:center}
.cab-hero{margin-bottom:14px;animation:cab-float 3.2s ease-in-out infinite}
@keyframes cab-float{50%{transform:translateY(-5px)}}
.cab h1{margin:0;font-size:34px;font-weight:800;letter-spacing:-.03em;line-height:1.12}
.cab-lead{margin:10px 0 22px;font-size:15px;line-height:1.55;color:var(--cab-muted);max-width:560px}
.cab-seg{display:inline-flex;gap:2px;padding:4px;border-radius:999px;background:var(--cab-fill);margin-bottom:16px;max-width:100%;overflow-x:auto;scrollbar-width:none}
.cab-seg button{flex-shrink:0;display:inline-flex;align-items:center;gap:7px;height:36px;padding:0 16px;border:none;border-radius:999px;background:transparent;color:#52525b;font:inherit;font-size:13.5px;font-weight:650;cursor:pointer;white-space:nowrap}
.cab-seg button.on{background:var(--cab-card);color:var(--ink);box-shadow:0 1px 3px rgba(16,24,40,.1),0 0 0 1px rgba(0,0,0,.04)}
.cab-seg.small{margin:0 auto 12px;display:flex;width:fit-content}.cab-seg.small button{height:32px;padding:0 14px;font-size:13px}
.cab-box{width:100%;box-sizing:border-box;text-align:left;border-radius:24px;background:var(--cab-card);box-shadow:0 0 0 1.5px var(--cab-fill2),0 12px 32px -18px rgba(16,24,40,.25);transition:box-shadow .15s}
.cab-box:focus-within{box-shadow:0 0 0 2px color-mix(in srgb,var(--coral) 60%,transparent),0 0 0 6px color-mix(in srgb,var(--coral) 12%,transparent),0 12px 32px -18px rgba(16,24,40,.25)}
.cab-box.bad{box-shadow:0 0 0 2px #fca5a5}
.cab-box textarea{display:block;width:100%;box-sizing:border-box;min-height:130px;padding:20px 22px 8px;border:none!important;outline:none!important;box-shadow:none!important;background:transparent!important;resize:vertical;font:inherit;font-size:17px;line-height:1.5;color:var(--ink)}
.cab-box textarea::placeholder{color:#a1a1aa}
.cab-box-f{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:8px 10px 10px 22px}.cab-box-f>span{font-size:12px;color:var(--cab-soft)}
.cab-go{display:inline-flex;align-items:center;justify-content:center;gap:8px;height:46px;padding:0 22px;border:none;border-radius:999px;background:var(--coral);color:#fff;font:inherit;font-size:14.5px;font-weight:700;cursor:pointer;white-space:nowrap;box-shadow:0 8px 20px -10px color-mix(in srgb,var(--coral) 80%,transparent);transition:transform .12s,filter .15s}
.cab-go:hover:not(:disabled){filter:brightness(1.05);transform:translateY(-1px)}.cab-go:disabled{opacity:.45;cursor:default;box-shadow:none}
.cab-err{margin:12px 0 0;font-size:13px;color:#dc2626}
.cab-ideas-h{margin:30px 0 10px;font-size:12.5px;font-weight:700;letter-spacing:.02em;color:var(--cab-soft);text-transform:uppercase}
.cab-ideas{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;width:100%}
.cab-ideas button{display:flex;flex-direction:column;gap:4px;padding:14px 15px;border:none;border-radius:18px;background:var(--cab-card);box-shadow:0 0 0 1px rgba(0,0,0,.06);text-align:left;font:inherit;cursor:pointer;color:inherit;transition:box-shadow .15s,transform .15s}
.cab-ideas button:hover{box-shadow:0 0 0 1px rgba(0,0,0,.1),0 8px 20px -12px rgba(16,24,40,.25);transform:translateY(-1px)}
.cab-ideas b{font-size:14px;font-weight:700}.cab-ideas span{font-size:12.5px;line-height:1.45;color:var(--cab-muted)}
.cab-orb{position:relative;margin:4vh 0 18px}
.cab-orb::before,.cab-orb::after{content:'';position:absolute;inset:-14px;border-radius:50%;border:2px solid color-mix(in srgb,var(--coral) 35%,transparent);animation:cab-ring 1.8s ease-out infinite}
.cab-orb::after{animation-delay:.9s}
@keyframes cab-ring{from{transform:scale(.8);opacity:1}to{transform:scale(1.5);opacity:0}}
.cab-quote{margin:10px 0 26px;font-size:15px;line-height:1.5;color:var(--cab-muted);max-width:560px}
.cab-steps{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:12px;text-align:left}
.cab-steps li{display:flex;align-items:center;gap:10px;font-size:14.5px;color:#a1a1aa;transition:color .3s}
.cab-steps li.now{color:var(--ink);font-weight:650}.cab-steps li.done{color:var(--cab-muted)}
.cab-dot{width:20px;height:20px;flex-shrink:0;display:flex;align-items:center;justify-content:center;border-radius:50%;background:var(--cab-fill);color:#fff}
.cab-steps li.now .cab-dot{background:color-mix(in srgb,var(--coral) 18%,transparent);box-shadow:inset 0 0 0 2px var(--coral);animation:cab-pulse 1.2s ease-in-out infinite}
.cab-steps li.done .cab-dot{background:#22c55e}
@keyframes cab-pulse{50%{box-shadow:inset 0 0 0 5px var(--coral)}}
.cab-plan{max-width:1180px;margin:0 auto;padding:10px 22px 56px;display:grid;grid-template-columns:minmax(0,1fr) 400px;gap:24px;align-items:start}
.cab-left{display:flex;flex-direction:column;gap:12px;min-width:0;transition:opacity .2s}
.cab-plan.busy .cab-left>section,.cab-plan.busy .cab-right{opacity:.55;pointer-events:none}
.cab-plan.busy .cab-refine{opacity:1!important}
.cab-reply{display:flex;align-items:flex-start;gap:10px}
.cab-reply p{margin:0;padding:12px 16px;border-radius:4px 20px 20px 20px;background:color-mix(in srgb,var(--coral) 9%,var(--cab-card));box-shadow:0 0 0 1px color-mix(in srgb,var(--coral) 18%,transparent);font-size:14.5px;line-height:1.5}
.cab-card{padding:18px;border-radius:22px;background:var(--cab-card);box-shadow:0 0 0 1px rgba(0,0,0,.06),0 1px 2px rgba(16,24,40,.04);min-width:0}
.cab-card h3{display:flex;align-items:center;gap:7px;margin:0 0 10px;font-size:13px;font-weight:700;color:var(--cab-muted)}
.cab-name label{display:block;font-size:13px;font-weight:700;color:var(--cab-muted);margin-bottom:6px}
.cab-name input{width:100%;box-sizing:border-box;height:46px;padding:0 14px;border:1.5px solid transparent!important;border-radius:14px;background:var(--cab-fill)!important;font:inherit;font-size:20px;font-weight:750;letter-spacing:-.01em;color:var(--ink);outline:none!important;box-shadow:none!important}
.cab-name input:focus{background:var(--cab-card)!important;border-color:var(--cab-fill2)!important;box-shadow:0 0 0 3px color-mix(in srgb,var(--coral) 14%,transparent)!important}
.cab-tags{display:flex;flex-wrap:wrap;gap:6px;margin-top:10px}
.cab-tags span{display:inline-flex;align-items:center;gap:5px;height:26px;padding:0 10px;border-radius:999px;background:var(--cab-fill);font-size:12px;font-weight:650;color:#52525b}
.cab-row{display:grid;grid-template-columns:1fr 1fr;gap:12px}
.cab-big{display:block;font-size:18px;font-weight:750;letter-spacing:-.01em;line-height:1.3}
.cab-count{margin:4px 0 0;font-size:13px;font-weight:650;color:#15803d}
.cab-why{margin:8px 0 0;font-size:13px;line-height:1.5;color:var(--cab-muted)}
.cab-note{margin:8px 0 0;font-size:12px;color:var(--cab-soft)}.cab-note.center{text-align:center;margin:0}
.cab-prods{list-style:none;margin:0;padding:0;display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:8px}
.cab-prods li{display:flex;align-items:center;gap:10px;padding:8px;border-radius:14px;background:var(--cab-fill);min-width:0}
.cab-prods img,.cab-noimg{width:44px;height:44px;flex-shrink:0;border-radius:10px;object-fit:cover;background:var(--cab-card);display:flex;align-items:center;justify-content:center;color:#a1a1aa}
.cab-prods li>span:last-child{display:flex;flex-direction:column;min-width:0}.cab-prods b{font-size:13px;font-weight:650;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.cab-prods small{font-size:12px;color:var(--cab-muted)}
.cab-tips{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:8px}
.cab-tips li{display:flex;gap:8px;align-items:flex-start;font-size:13.5px;line-height:1.45}.cab-tips svg{flex-shrink:0;margin-top:2px;color:#16a34a}
.cab-refine h3{color:var(--ink)}.cab-refine h3 svg{color:var(--coral)}
.cab-chips{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:10px}
.cab-chips button{height:32px;padding:0 13px;border:none;border-radius:999px;background:var(--cab-fill);color:#3f3f46;font:inherit;font-size:13px;font-weight:600;cursor:pointer}
.cab-chips button:hover:not(:disabled){background:var(--cab-fill2);color:var(--ink)}.cab-chips button:disabled{opacity:.5;cursor:default}
.cab-ask-row{display:flex;gap:8px}
.cab-ask-row input{flex:1;min-width:0;height:44px;padding:0 16px;border:1.5px solid transparent!important;border-radius:999px;background:var(--cab-fill)!important;font:inherit;font-size:14px;color:var(--ink);outline:none!important;box-shadow:none!important}
.cab-ask-row input:focus{background:var(--cab-card)!important;border-color:var(--cab-fill2)!important;box-shadow:0 0 0 3px color-mix(in srgb,var(--coral) 14%,transparent)!important}
.cab-ask-row button{width:44px;height:44px;flex-shrink:0;display:flex;align-items:center;justify-content:center;border:none;border-radius:50%;background:var(--ink);color:#fff;cursor:pointer}.cab-ask-row button:disabled{opacity:.35;cursor:default}
.cab-link{display:inline-flex;align-items:center;gap:6px;margin-top:10px;padding:0;border:none;background:none;font:inherit;font-size:13px;font-weight:600;color:var(--cab-muted);cursor:pointer}.cab-link:hover{color:var(--ink)}
.cab-actions{display:flex;gap:10px;justify-content:space-between;margin-top:4px}
.cab-actions .cab-go{flex:1;max-width:320px;margin-left:auto}
.cab-ghost{display:inline-flex;align-items:center;gap:6px;height:46px;padding:0 18px;border:none;border-radius:999px;background:var(--cab-fill);color:var(--ink);font:inherit;font-size:14px;font-weight:650;cursor:pointer}.cab-ghost:hover{background:var(--cab-fill2)}
.cab-right{position:sticky;top:76px;min-width:0;transition:opacity .2s}
.cab-phone{height:620px;display:flex;flex-direction:column;min-width:0}
.cab-phone .dv-sms-wrap{height:620px!important}
.cab-wait{margin:auto;font-size:13px;color:var(--cab-muted)}
.cab-meta{margin:10px 0 0;text-align:center;font-size:12.5px;color:var(--cab-muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.cab-done{display:flex;flex-direction:column;gap:10px;width:100%;max-width:460px}
.cab-done button{display:flex;align-items:center;gap:12px;padding:16px;border:none;border-radius:20px;background:var(--cab-card);box-shadow:0 0 0 1px rgba(0,0,0,.06);font:inherit;text-align:left;color:inherit;cursor:pointer}
.cab-done button:hover{box-shadow:0 0 0 1px rgba(0,0,0,.1),0 8px 20px -12px rgba(16,24,40,.25)}
.cab-done button>span:nth-child(2){flex:1;display:flex;flex-direction:column}.cab-done b{font-size:15px}.cab-done small{font-size:13px;color:var(--cab-muted)}
.cab-done-ic{width:40px;height:40px;display:flex;align-items:center;justify-content:center;border-radius:12px;background:color-mix(in srgb,var(--coral) 12%,transparent);color:var(--coral)}
@media (max-width:980px){.cab-plan{grid-template-columns:1fr;gap:12px}.cab-left{display:contents}.cab-right{position:static;order:-1}.cab-reply{order:-2}}
@media (max-width:640px){
  .cab-top{padding:10px 14px}.cab-brand span{display:none}
  .cab-ask,.cab-building{padding:2vh 16px 48px}
  .cab h1{font-size:27px}
  .cab-ideas{grid-template-columns:1fr 1fr}
  .cab-box textarea{font-size:16px;min-height:120px;padding:16px 16px 6px}
  .cab-box-f{padding:6px 8px 8px 16px}.cab-box-f>span{display:none}.cab-box-f .cab-go{width:100%}
  .cab-plan{padding:6px 16px 40px;gap:14px}
  .cab-row{grid-template-columns:1fr}
  .cab-phone,.cab-phone .dv-sms-wrap{height:520px!important}
  .cab-actions{position:sticky;bottom:0;margin:0 -16px;padding:10px 16px calc(10px + env(safe-area-inset-bottom,0px));background:color-mix(in srgb,var(--cab-bg) 92%,transparent);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px)}
  .cab-actions .cab-go{max-width:none}
}
[data-theme="dark"] .cab{--cab-bg:#141416;--cab-card:#1c1c1f;--cab-fill:#2a2a2e;--cab-fill2:#3a3a40;--cab-line:#2c2c31;--cab-muted:#a1a1aa;--cab-soft:#8e8e93}
[data-theme="dark"] .cab-seg button{color:#a1a1aa}[data-theme="dark"] .cab-seg button.on{background:#3a3a40;color:#fafafa;box-shadow:none}
[data-theme="dark"] .cab-ideas button,[data-theme="dark"] .cab-card,[data-theme="dark"] .cab-done button{box-shadow:0 0 0 1px rgba(255,255,255,.07)}
[data-theme="dark"] .cab-tags span,[data-theme="dark"] .cab-chips button{color:#d4d4d8}
[data-theme="dark"] .cab-count{color:#4ade80}
[data-theme="dark"] .cab-ask-row button{background:#f4f4f5;color:#18181b}
[data-theme="dark"] .cab-steps li.done .cab-dot{background:#16a34a}
@media (prefers-reduced-motion:reduce){.cab,.cab-hero,.cab-orb::before,.cab-orb::after,.cab-steps li.now .cab-dot{animation:none!important}}
`
