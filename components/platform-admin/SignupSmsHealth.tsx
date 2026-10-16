'use client'

// "Signup SMS health": sign-up code texts sent vs delivered in the last 24
// hours and 7 days, the most common reasons they didn't arrive, and whether
// texting and the "call me with the code" fallback are set up. Data comes from
// lib/signup-attempts signupSmsHealth (via /api/platform-admin/pulse or
// /api/platform-admin/signups). Uses the console's --sa-* theme variables.
//
// When no Twilio sender is set up it says so plainly, and "Send test SMS to
// me" texts the admin's own mobile from the same sender sign-up codes use
// (5 an hour), then checks with Twilio whether it was delivered.

import { useState } from 'react'
import { authFetch } from '@/lib/auth-fetch'

type Bucket = { sent: number; delivered: number; notDelivered: number; waiting: number; noReport: number; calls: number; callsAnswered: number }
export type SmsHealth = {
  day: Bucket; week: Bucket
  topErrors: { code: string | null; label: string; explain: string; count: number }[]
  missing?: boolean; configured?: boolean; voiceFallback?: boolean
  /** What's missing, in one line (null when texting is set up). */
  problem?: string | null
  /** "+61485059215" or "Messaging Service MG…" */
  sender?: string | null
  /** Daily caps on all sign-up texts / calls (toll-fraud backstop). */
  caps?: { sms: { used: number; cap: number; hit: boolean }; voice: { used: number; cap: number; hit: boolean } }
}

const MOBILE_KEY = 'colvy_sa_test_mobile'
function TestSms() {
  const [open, setOpen] = useState(false)
  const [phone, setPhone] = useState(() => { try { return localStorage.getItem(MOBILE_KEY) || '' } catch { return '' } })
  const [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState('')
  const [msg, setMsg] = useState<{ tone: 'ok' | 'err' | 'info'; text: string } | null>(null)
  const [sid, setSid] = useState('')
  const post = async (b: any) => {
    const res = await authFetch('/api/platform-admin/signups', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b) })
    const d = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(d.error || 'That didn’t work')
    return d
  }
  const send = async () => {
    setBusy('send'); setMsg(null); setSid('')
    try {
      try { localStorage.setItem(MOBILE_KEY, phone) } catch {}
      const d = await post({ action: 'test_sms', phone, confirm })
      setSid(d.sid)
      setMsg({ tone: 'info', text: `Twilio accepted it (from ${d.sender}). Check your phone, then “Check delivery” in a few seconds.` })
    } catch (e: any) { setMsg({ tone: 'err', text: e.message }) } finally { setBusy('') }
  }
  const check = async () => {
    setBusy('check')
    try {
      const d = await post({ action: 'test_sms_status', sid })
      const st = String(d.status || 'unknown')
      if (st === 'delivered') setMsg({ tone: 'ok', text: 'Delivered. Sign-up codes from this sender reach this phone.' })
      else if (st === 'undelivered' || st === 'failed') setMsg({ tone: 'err', text: `Not delivered — ${d.label || st}. ${d.explain || ''}` })
      else setMsg({ tone: 'info', text: `Twilio says “${st}”. Check again in a few seconds.` })
    } catch (e: any) { setMsg({ tone: 'err', text: e.message }) } finally { setBusy('') }
  }
  if (!open) return <button onClick={() => setOpen(true)} style={smallBtn}>Send test SMS to me</button>
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, width: '100%' }}>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <input value={phone} onChange={e => setPhone(e.target.value)} placeholder="Your mobile, e.g. 0412 345 678" aria-label="Your mobile" inputMode="tel" autoComplete="tel" style={testInput} />
        <input value={confirm} onChange={e => setConfirm(e.target.value)} placeholder="Type it again" aria-label="Your mobile again" inputMode="tel" autoComplete="off" style={testInput} />
        <button onClick={send} disabled={!!busy || !phone.trim() || !confirm.trim()} style={{ ...smallBtn, background: '#ff7a6b', color: '#fff', border: 'none', opacity: busy || !phone.trim() || !confirm.trim() ? 0.6 : 1 }}>{busy === 'send' ? 'Sending…' : 'Send test SMS'}</button>
        {sid && <button onClick={check} disabled={!!busy} style={smallBtn}>{busy === 'check' ? 'Checking…' : 'Check delivery'}</button>}
      </div>
      {msg && <div style={{ fontSize: 12.5, padding: '7px 10px', borderRadius: 9, background: msg.tone === 'ok' ? GREEN + '14' : msg.tone === 'err' ? '#fee2e2' : 'var(--sa-hover)', color: msg.tone === 'ok' ? GREEN : msg.tone === 'err' ? '#b91c1c' : 'var(--sa-text)' }}>{msg.text}</div>}
    </div>
  )
}
const testInput: React.CSSProperties = { flex: '1 1 160px', minWidth: 0, maxWidth: 220, padding: '7px 10px', borderRadius: 9, border: '1px solid var(--sa-border)', background: 'var(--sa-bg)', color: 'var(--sa-text)', fontSize: 13, fontFamily: 'inherit' }
const smallBtn: React.CSSProperties = { padding: '6px 11px', borderRadius: 8, border: '1px solid var(--sa-border)', background: 'transparent', color: 'var(--sa-text)', fontSize: 12, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }

const GREEN = '#059669', RED = '#dc2626', AMBER = '#d97706'
const msgIcon = <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg>

function rate(b: Bucket): number | null {
  const settled = b.delivered + b.notDelivered
  return settled ? Math.round((b.delivered / settled) * 100) : null
}

function Period({ label, b }: { label: string; b: Bucket }) {
  const r = rate(b)
  const color = r == null ? 'var(--sa-muted)' : r >= 90 ? GREEN : r >= 60 ? AMBER : RED
  return (
    <div style={{ minWidth: 0 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--sa-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label}</div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap', marginTop: 2 }}>
        <span style={{ fontSize: 20, fontWeight: 800, color }}>{r == null ? '—' : `${r}%`}</span>
        <span style={{ fontSize: 12, color: 'var(--sa-muted)' }}>delivered</span>
      </div>
      <div style={{ fontSize: 12.5, color: 'var(--sa-text)', marginTop: 2 }}>
        {b.sent} sent · <span style={{ color: GREEN, fontWeight: 600 }}>{b.delivered} delivered</span> · <span style={{ color: b.notDelivered ? RED : 'var(--sa-text)', fontWeight: b.notDelivered ? 700 : 400 }}>{b.notDelivered} not delivered</span>
        {b.waiting ? ` · ${b.waiting} waiting` : ''}{b.noReport ? ` · ${b.noReport} no report` : ''}
      </div>
      {b.calls > 0 && <div style={{ fontSize: 12, color: 'var(--sa-muted)', marginTop: 2 }}>{b.calls} call{b.calls === 1 ? '' : 's'} with the code · {b.callsAnswered} answered</div>}
    </div>
  )
}

export default function SignupSmsHealth({ sms, onOpen }: { sms: SmsHealth | null | undefined; onOpen?: () => void }) {
  if (!sms) return null
  const capHit = !!(sms.caps?.sms.hit || sms.caps?.voice.hit)
  const problems = sms.week.notDelivered > 0 || !!sms.problem || capHit
  return (
    <div style={{ background: 'var(--sa-card)', border: '1px solid var(--sa-border)', borderLeft: `3px solid ${problems ? RED : sms.week.sent ? GREEN : 'var(--sa-border)'}`, borderRadius: 14, padding: '14px 16px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
        <span style={{ color: problems ? RED : 'var(--sa-muted)', display: 'flex' }}>{msgIcon}</span>
        <span style={{ fontSize: 14, fontWeight: 800, color: 'var(--sa-text)' }}>Signup SMS health</span>
        <span style={{ fontSize: 12, color: 'var(--sa-muted)' }}>Verification codes texted at sign-up, and whether the phone company delivered them</span>
        <span style={{ flex: 1 }} />
        <span style={{ fontSize: 11.5, fontWeight: 700, padding: '3px 9px', borderRadius: 999, background: sms.configured ? GREEN + '18' : RED + '18', color: sms.configured ? GREEN : RED }}>{sms.configured ? 'Texting set up' : 'Texting not set up'}</span>
        <span title={sms.voiceFallback ? 'People who don’t get the text can ask for a call that reads the code out' : 'Set TWILIO_MASTER_VOICE_FROM (a voice number on Colvy’s Twilio account) to offer “Call me with the code”'} style={{ fontSize: 11.5, fontWeight: 700, padding: '3px 9px', borderRadius: 999, background: sms.voiceFallback ? GREEN + '18' : 'var(--sa-hover)', color: sms.voiceFallback ? GREEN : 'var(--sa-muted)' }}>{sms.voiceFallback ? 'Call-me fallback on' : 'Call-me fallback off'}</span>
        {onOpen && <button onClick={onOpen} style={{ padding: '5px 10px', borderRadius: 8, border: '1px solid var(--sa-border)', background: 'transparent', color: 'var(--sa-text)', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>Open Signups</button>}
      </div>
      {sms.problem && (
        <div role="alert" style={{ display: 'flex', gap: 8, alignItems: 'flex-start', padding: '10px 12px', borderRadius: 10, border: `1px solid ${RED}44`, background: RED + '0f', color: 'var(--sa-text)', fontSize: 13, marginBottom: 12 }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={RED} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: 2 }} aria-hidden="true"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" /></svg>
          <span style={{ minWidth: 0, overflowWrap: 'anywhere' }}><b>New sign-ups can’t verify their mobile.</b> {sms.problem}</span>
        </div>
      )}
      {capHit && (
        <div role="alert" style={{ display: 'flex', gap: 8, alignItems: 'flex-start', padding: '10px 12px', borderRadius: 10, border: `1px solid ${RED}44`, background: RED + '0f', color: 'var(--sa-text)', fontSize: 13, marginBottom: 12, overflowWrap: 'anywhere' }}>
          <span><b>Daily limit reached: sign-up codes are being refused.</b> {sms.caps?.sms.hit ? `${sms.caps.sms.cap} texts` : ''}{sms.caps?.sms.hit && sms.caps?.voice.hit ? ' and ' : ''}{sms.caps?.voice.hit ? `${sms.caps.voice.cap} calls` : ''} in 24 hours across all sign-ups. Check the sign-ups below for abuse (many numbers, overseas, throwaway emails). If it’s real demand, raise SIGNUP_SMS_DAILY_CAP / SIGNUP_VOICE_DAILY_CAP.</span>
        </div>
      )}
      {sms.missing ? (
        <p style={{ fontSize: 12.5, color: 'var(--sa-muted)', margin: 0 }}>Shows once COLVY_V390_SIGNUP_ATTEMPTS.sql has run.</p>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(240px, 100%), 1fr))', gap: 16 }}>
          <Period label="Last 24 hours" b={sms.day} />
          <Period label="Last 7 days" b={sms.week} />
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--sa-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Top problems · 7 days</div>
            {sms.topErrors.length === 0
              ? <p style={{ fontSize: 12.5, color: 'var(--sa-muted)', margin: '4px 0 0' }}>{sms.week.sent ? 'None reported.' : 'No codes texted yet.'}</p>
              : <ul style={{ margin: '4px 0 0', padding: 0, listStyle: 'none' }}>{sms.topErrors.map(e => (
                  <li key={e.code || 'none'} title={e.explain} style={{ fontSize: 12.5, color: 'var(--sa-text)', marginBottom: 3, display: 'flex', gap: 6, overflowWrap: 'anywhere' }}>
                    <span style={{ fontWeight: 800, color: RED, minWidth: 22 }}>{e.count}×</span><span style={{ minWidth: 0 }}>{e.label}</span>
                  </li>
                ))}</ul>}
          </div>
        </div>
      )}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginTop: 12, paddingTop: 10, borderTop: '1px solid var(--sa-border)' }}>
        <span style={{ fontSize: 12, color: 'var(--sa-muted)' }}>{sms.sender ? <>Codes are texted from <b style={{ color: 'var(--sa-text)' }}>{sms.sender}</b></> : 'No sender set'}{sms.caps ? ` · today ${sms.caps.sms.used}/${sms.caps.sms.cap} texts, ${sms.caps.voice.used}/${sms.caps.voice.cap} calls` : ''}</span>
        <span style={{ flex: 1 }} />
        <TestSms />
      </div>
    </div>
  )
}
