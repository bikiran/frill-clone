'use client'

// Unschedule / Reschedule / Stop sending for a campaign, the same for SMS and
// email, from the campaign page and the campaigns list. Each asks first (the
// in-app confirm dialog, never window.confirm), then calls
// /api/campaigns/control (owner or admin only) and says what happened.
//
//   const r = await stopSendingFlow(companyId, campaign)
//   if (r) { setMessage(r.message); if (r.ok) setCampaign(c => ({ ...c, ...r.patch })) }
//
// null means the person backed out.

import { useEffect, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { authFetch } from '@/lib/auth-fetch'
import { confirmDialog } from '@/components/ConfirmDialog'
import { fmtCents } from '@/lib/sms-credits-core'

export type CampaignLike = {
  id: string
  name?: string | null
  channel?: string | null
  status: string
  scheduled_at?: string | null
  quiet_hours?: boolean | null
  recipients_total?: number | null
  sent_count?: number | null
}

export type ActionOutcome = { ok: boolean; message: string; patch?: Record<string, any> }

const isEmail = (c: CampaignLike) => String(c.channel || 'sms') === 'email'
const when = (iso?: string | null) => {
  if (!iso) return ''
  const d = new Date(iso)
  return isNaN(d.getTime()) ? '' : d.toLocaleString('en-AU', { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })
}

/** Which of the three apply to a campaign in this state. */
export function campaignControls(c: CampaignLike | null | undefined) {
  const s = c?.status
  const midSend = s === 'sending' || (s === 'paused' && Number(c?.recipients_total) > 0)
  return { unschedule: s === 'scheduled', reschedule: s === 'scheduled', stop: midSend }
}

async function control(companyId: string, campaignId: string, action: 'unschedule' | 'reschedule' | 'stop', extra: Record<string, any> = {}) {
  try {
    const res = await authFetch('/api/campaigns/control', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ companyId, campaignId, action, ...extra }),
    })
    const d = await res.json().catch(() => ({}))
    return { ok: res.ok, d }
  } catch {
    return { ok: false, d: { error: 'Couldn’t reach the server. Check your connection and try again.' } }
  }
}

export async function unscheduleFlow(companyId: string, c: CampaignLike): Promise<ActionOutcome | null> {
  const at = when(c.scheduled_at)
  const ok = await confirmDialog({
    title: 'Unschedule this campaign?',
    message: `It goes back to a draft${at ? ` and won’t send on ${at}` : ''}. The ${isEmail(c) ? 'email' : 'message'} and audience are kept${isEmail(c) ? '' : ', and any SMS credit held for it is returned'}.`,
    confirmLabel: 'Unschedule', tone: 'danger',
  })
  if (!ok) return null
  const { ok: done, d } = await control(companyId, c.id, 'unschedule')
  if (!done) return { ok: false, message: 'Could not unschedule: ' + (d.error || 'something went wrong') }
  return {
    ok: true,
    message: d.releasedCents > 0 ? `Unscheduled · ${fmtCents(d.releasedCents)} of held credit returned` : 'Unscheduled · it’s a draft again',
    patch: { status: 'draft', status_reason: null },
  }
}

export async function rescheduleFlow(companyId: string, c: CampaignLike): Promise<ActionOutcome | null> {
  const picked = await pickSendTime({ current: c.scheduled_at || null, quietHours: c.quiet_hours !== false, name: c.name || '' })
  if (!picked) return null
  const { ok: done, d } = await control(companyId, c.id, 'reschedule', { scheduledAt: picked })
  if (!done) return { ok: false, message: 'Could not reschedule: ' + (d.error || 'something went wrong') }
  return {
    ok: true,
    message: `Rescheduled for ${when(d.scheduledAt)}${d.heldForSendingHours ? ' · held until 9am, outside sending hours' : ''}`,
    patch: { status: 'scheduled', scheduled_at: d.scheduledAt, status_reason: null },
  }
}

export async function stopSendingFlow(companyId: string, c: CampaignLike): Promise<ActionOutcome | null> {
  const sent = Number(c.sent_count) || 0
  const ok = await confirmDialog({
    title: 'Stop sending this campaign?',
    message: `Nobody else will get this ${isEmail(c) ? 'email' : 'text'}.${sent ? ` The ${sent.toLocaleString()} already sent stay sent;` : ' Anyone already sent to stays sent;'} everyone else is marked as not sent in the report. This can’t be undone.`,
    confirmLabel: 'Stop sending', cancelLabel: 'Keep sending', tone: 'danger',
  })
  if (!ok) return null
  const { ok: done, d } = await control(companyId, c.id, 'stop')
  if (!done) return { ok: false, message: 'Could not stop it: ' + (d.error || 'something went wrong') }
  const cancelled = Number(d.cancelled) || 0
  return {
    ok: true,
    message: `Stopped · ${Number(d.sent || 0).toLocaleString()} sent, ${cancelled.toLocaleString()} not sent${d.inFlight ? ` (${Number(d.inFlight).toLocaleString()} were already on their way)` : ''}`,
    patch: { status: 'cancelled', sent_count: Number(d.sent) || 0, failed_count: Number(d.failed) || 0 },
  }
}

// ── The date and time picker for Reschedule ──────────────────────────────────

const pad = (n: number) => String(n).padStart(2, '0')
const localParts = (iso: string | null) => {
  const d = iso ? new Date(iso) : new Date(Date.now() + 3600_000)
  if (isNaN(d.getTime())) return { date: '', time: '10:00' }
  return { date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`, time: `${pad(d.getHours())}:${pad(d.getMinutes())}` }
}

/** Ask for a new send time (the browser's local time, as the Schedule step does). The ISO time, or null. */
export function pickSendTime(o: { current: string | null; quietHours: boolean; name?: string }): Promise<string | null> {
  if (typeof document === 'undefined') return Promise.resolve(null)
  return new Promise(resolve => {
    const host = document.createElement('div')
    document.body.appendChild(host)
    const root = createRoot(host)
    const done = (v: string | null) => {
      resolve(v)
      setTimeout(() => { root.unmount(); host.remove() }, 220)
    }
    root.render(<PickTime {...o} onDone={done} />)
  })
}

function PickTime({ current, quietHours, name, onDone }: { current: string | null; quietHours: boolean; name?: string; onDone: (v: string | null) => void }) {
  const start = localParts(current)
  const [date, setDate] = useState(start.date)
  const [time, setTime] = useState(start.time)
  const [closing, setClosing] = useState(false)
  const dateRef = useRef<HTMLInputElement>(null)
  const at = date ? new Date(`${date}T${time || '10:00'}`) : null
  const valid = !!at && !isNaN(at.getTime())
  const past = valid && at!.getTime() < Date.now()
  const hour = parseInt((time || '10:00').split(':')[0], 10)
  const quiet = quietHours && (hour < 9 || hour >= 20)
  const close = (v: string | null) => { if (closing) return; setClosing(true); onDone(v) }
  const save = () => { if (valid && !past) close(at!.toISOString()) }

  useEffect(() => {
    dateRef.current?.focus()
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.preventDefault(); close(null) } }
    window.addEventListener('keydown', onKey, true)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { window.removeEventListener('keydown', onKey, true); document.body.style.overflow = prev }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const input: React.CSSProperties = { width: '100%', padding: '9px 12px', borderRadius: 9, border: '1px solid var(--border,#e5e7eb)', fontSize: 14, boxSizing: 'border-box', background: '#fff', fontFamily: 'inherit', minWidth: 0 }
  const label: React.CSSProperties = { fontSize: 11.5, fontWeight: 700, color: 'var(--slate,#6b7280)', textTransform: 'uppercase', letterSpacing: '0.03em', display: 'block', marginBottom: 6 }
  return (
    <div className={`crd-overlay${closing ? ' out' : ''}`} onMouseDown={e => { if (e.target === e.currentTarget) close(null) }} role="presentation">
      <style>{`
        .crd-overlay{position:fixed;inset:0;z-index:2147483600;background:rgba(17,17,20,.38);-webkit-backdrop-filter:blur(4px);backdrop-filter:blur(4px);display:flex;align-items:center;justify-content:center;padding:16px;animation:crdFade .18s ease both;font-family:inherit}
        .crd-overlay.out{animation:crdFadeOut .2s ease both}
        .crd-box{width:100%;max-width:400px;background:#fff;border-radius:18px;box-shadow:0 30px 70px -20px rgba(0,0,0,.4);padding:22px 22px 18px;animation:crdIn .32s cubic-bezier(.22,1,.36,1) both;box-sizing:border-box}
        .crd-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px}
        .crd-actions{display:flex;justify-content:flex-end;gap:8px;margin-top:20px}
        .crd-btn{min-height:40px;padding:0 18px;border-radius:11px;font:inherit;font-size:14px;font-weight:700;cursor:pointer}
        .crd-btn:disabled{opacity:.5;cursor:not-allowed}
        .crd-cancel{border:1px solid var(--border,#e5e7eb);background:#fff;color:var(--ink,#111)}
        .crd-ok{border:none;color:#fff;background:var(--coral,#ff7a6b)}
        @keyframes crdFade{from{opacity:0}to{opacity:1}}
        @keyframes crdFadeOut{from{opacity:1}to{opacity:0}}
        @keyframes crdIn{from{opacity:0;transform:translate3d(0,10px,0) scale(.96)}to{opacity:1;transform:none}}
        @media(max-width:560px){
          .crd-overlay{align-items:flex-end;padding:0}
          .crd-box{max-width:none;border-radius:20px 20px 0 0;padding:22px 16px calc(16px + env(safe-area-inset-bottom))}
          .crd-actions{flex-direction:column-reverse}
          .crd-btn{min-height:48px;width:100%;font-size:15px}
        }
        @media(max-width:360px){.crd-grid{grid-template-columns:1fr}}
        @media (prefers-reduced-motion: reduce){.crd-overlay,.crd-box{animation:none!important}}
      `}</style>
      <form className="crd-box" role="dialog" aria-modal="true" aria-labelledby="crd-title" onSubmit={e => { e.preventDefault(); save() }}>
        <div id="crd-title" style={{ fontSize: 16, fontWeight: 800, color: 'var(--ink,#111)', lineHeight: 1.35 }}>Reschedule{name ? ` “${name}”` : ''}</div>
        <p style={{ margin: '6px 0 16px', fontSize: 13.5, color: 'var(--slate,#6b7280)', lineHeight: 1.55 }}>
          {current ? `It’s set to send ${when(current)}. ` : ''}Pick the new date and time. The audience and the {quietHours ? 'quiet-hour protection' : 'delivery options'} stay as they are.
        </p>
        <div className="crd-grid">
          <div>
            <label style={label} htmlFor="crd-date">Date</label>
            <input id="crd-date" ref={dateRef} type="date" value={date} onChange={e => setDate(e.target.value)} style={input} required />
          </div>
          <div>
            <label style={label} htmlFor="crd-time">Time</label>
            <input id="crd-time" type="time" value={time} onChange={e => setTime(e.target.value)} style={input} required />
          </div>
        </div>
        {past && <p style={{ margin: '10px 0 0', fontSize: 12.5, color: '#dc2626' }}>That time is in the past. Pick a future date and time.</p>}
        {!past && quiet && (
          <div style={{ marginTop: 10, padding: '10px 12px', borderRadius: 9, background: '#fffbeb', border: '1px dashed #f59e0b', fontSize: 12.5, color: '#78350f', lineHeight: 1.5 }}>
            <strong>That&apos;s outside normal contact hours.</strong> With quiet-hour protection on, it&apos;s held until 9am.
          </div>
        )}
        <div className="crd-actions">
          <button type="button" className="crd-btn crd-cancel" onClick={() => close(null)}>Cancel</button>
          <button type="submit" className="crd-btn crd-ok" disabled={!valid || past}>Reschedule</button>
        </div>
      </form>
    </div>
  )
}
