'use client'

import { useState, useEffect, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import CallBar from './CallBar'

// Coax-style dialer: a keypad for any number, a contact search, and a Recent
// Calls tab (which is where failed attempts belong — not in the chat timeline).

interface Props {
  companyId: string | null
  agentName?: string
  onClose: () => void
}

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '*', '0', '#']

// DTMF-ish key tone — each key gets its own pitch, like a real handset.
const KEY_TONE: Record<string, number> = {
  '1': 697, '2': 770, '3': 852, '4': 941, '5': 1209, '6': 1336,
  '7': 1477, '8': 1633, '9': 800, '*': 941, '0': 1336, '#': 1477,
}

export default function Dialer({ companyId, agentName, onClose }: Props) {
  const [tab, setTab] = useState<'dialer' | 'recent'>('dialer')
  const [digits, setDigits] = useState('')
  const [search, setSearch] = useState('')
  const [contacts, setContacts] = useState<any[]>([])
  const [recent, setRecent] = useState<any[]>([])
  const [dialing, setDialing] = useState<{ number: string; name?: string; contactId?: string } | null>(null)
  const ctxRef = useRef<any>(null)

  // Contact search (only once they've typed — no point loading everyone).
  useEffect(() => {
    if (!companyId || search.trim().length < 2) { setContacts([]); return }
    let cancelled = false
    const t = setTimeout(async () => {
      const q = search.trim()
      const { data } = await (supabase as any).from('contacts')
        .select('id, name, email, phone')
        .eq('company_id', companyId)
        .or(`name.ilike.%${q}%,phone.ilike.%${q}%,email.ilike.%${q}%`)
        .limit(8)
      if (!cancelled) setContacts((data || []).filter((c: any) => c.phone))
    }, 250)
    return () => { cancelled = true; clearTimeout(t) }
  }, [search, companyId])

  // Recent calls — including the failed ones, which is exactly where they belong.
  useEffect(() => {
    if (!companyId || tab !== 'recent') return
    ;(async () => {
      const { data } = await (supabase as any).from('calls')
        .select('*').eq('company_id', companyId)
        .order('created_at', { ascending: false }).limit(30)
      setRecent(data || [])
    })()
  }, [tab, companyId])

  const tone = (key: string) => {
    try {
      const Ctx = (window as any).AudioContext || (window as any).webkitAudioContext
      if (!Ctx) return
      if (!ctxRef.current) ctxRef.current = new Ctx()
      const ctx = ctxRef.current
      if (ctx.state === 'suspended') ctx.resume()
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.frequency.value = KEY_TONE[key] || 800
      gain.gain.setValueAtTime(0.07, ctx.currentTime)
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.09)
      osc.connect(gain); gain.connect(ctx.destination)
      osc.start(); osc.stop(ctx.currentTime + 0.09)
    } catch {}
  }

  const press = (k: string) => { tone(k); setDigits(d => (d + k).slice(0, 15)) }
  const backspace = () => setDigits(d => d.slice(0, -1))

  // Local AU number → E.164 for display; CallBar normalises again on dial.
  const dialTarget = digits.startsWith('+') ? digits : `+61${digits.replace(/^0/, '')}`

  const fmtWhen = (iso: string) => new Date(iso).toLocaleString('en-AU', { day: '2-digit', month: 'short', hour: 'numeric', minute: '2-digit' })
  const fmtDur = (s: number) => `${Math.floor((s || 0) / 60)}:${String((s || 0) % 60).padStart(2, '0')}`

  return (
    <div onClick={onClose}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 400, padding: 16 }}>
      <div onClick={e => e.stopPropagation()}
        style={{ width: 370, maxWidth: '95vw', maxHeight: '90vh', overflowY: 'auto', background: '#fff', borderRadius: 20, boxShadow: '0 24px 64px rgba(0,0,0,0.24)', padding: 18 }}>

        {/* Tabs */}
        <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', marginBottom: 16 }}>
          {(['dialer', 'recent'] as const).map(t => (
            <button key={t} type="button" onClick={() => setTab(t)}
              style={{ flex: 1, padding: '10px 0', background: 'none', border: 'none', borderBottom: tab === t ? '2px solid var(--coral)' : '2px solid transparent', color: tab === t ? 'var(--coral)' : 'var(--slate)', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>
              {t === 'dialer' ? 'Dialer' : 'Recent Calls'}
            </button>
          ))}
          <button type="button" onClick={onClose} title="Close"
            style={{ width: 34, background: 'none', border: 'none', color: 'var(--slate)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>

        {tab === 'dialer' ? (
          <>
            {/* Contact search */}
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search contact…"
              style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: '1px solid var(--border)', fontSize: 13.5, marginBottom: 10, boxSizing: 'border-box', outline: 'none' }} />

            {contacts.length > 0 && (
              <div style={{ marginBottom: 12, border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
                {contacts.map(c => (
                  <button key={c.id} type="button"
                    onClick={() => { setDigits(''); setSearch(''); setDialing({ number: c.phone, name: c.name, contactId: c.id }) }}
                    style={{ display: 'flex', alignItems: 'center', gap: 9, width: '100%', textAlign: 'left', padding: '9px 11px', border: 'none', borderBottom: '1px solid var(--border)', background: '#fff', cursor: 'pointer' }}>
                    <span style={{ width: 30, height: 30, borderRadius: '50%', background: 'var(--coral)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, flexShrink: 0 }}>
                      {(c.name || '?')[0].toUpperCase()}
                    </span>
                    <span style={{ minWidth: 0 }}>
                      <span style={{ display: 'block', fontSize: 13, fontWeight: 600, color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.name || 'Unnamed'}</span>
                      <span style={{ display: 'block', fontSize: 11.5, color: 'var(--slate)' }}>{c.phone}</span>
                    </span>
                  </button>
                ))}
              </div>
            )}

            {/* Number display */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--canvas)', borderRadius: 12, padding: '12px 14px', marginBottom: 14 }}>
              <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--slate)', flexShrink: 0 }}>+61</span>
              <input value={digits} onChange={e => setDigits(e.target.value.replace(/[^\d*#+]/g, ''))}
                placeholder="000-000-000"
                style={{ flex: 1, border: 'none', background: 'none', fontSize: 20, fontWeight: 600, color: 'var(--ink)', outline: 'none', minWidth: 0, letterSpacing: 0.5 }} />
            </div>

            {/* Keypad — round, green, and clearly separate keys */}
            <style>{`
              .colvy-key {
                width: 62px; height: 62px; margin: 0 auto;
                border-radius: 50%;
                border: 1.5px solid #bbf7d0;
                background: radial-gradient(circle at 50% 35%, #f0fdf4 0%, #dcfce7 100%);
                color: #065f46;
                font-size: 22px; font-weight: 700;
                cursor: pointer;
                display: flex; align-items: center; justify-content: center;
                box-shadow: 0 2px 4px rgba(6,95,70,0.10);
                transition: transform 0.06s ease, background 0.12s ease, box-shadow 0.12s ease;
                -webkit-tap-highlight-color: transparent;
              }
              .colvy-key:hover { background: #bbf7d0; box-shadow: 0 4px 10px rgba(6,95,70,0.18); }
              .colvy-key:active { transform: scale(0.93); background: #86efac; box-shadow: inset 0 2px 6px rgba(6,95,70,0.25); }
            `}</style>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 16, justifyItems: 'center' }}>
              {KEYS.map(k => (
                <button key={k} type="button" onClick={() => press(k)} className="colvy-key">{k}</button>
              ))}
            </div>

            {/* Call / backspace */}
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <div style={{ flex: 1 }}>
                {dialing ? (
                  <CallBar companyId={companyId} toNumber={dialing.number} contactName={dialing.name}
                    contactId={dialing.contactId} conversationId={null} agentName={agentName} />
                ) : (
                  <button type="button" disabled={digits.length < 6}
                    onClick={() => setDialing({ number: dialTarget })}
                    style={{ width: '100%', padding: '13px 0', borderRadius: 12, border: 'none', background: digits.length >= 6 ? '#dcfce7' : 'var(--canvas)', color: digits.length >= 6 ? '#059669' : '#c0c4cc', fontSize: 14, fontWeight: 700, cursor: digits.length >= 6 ? 'pointer' : 'not-allowed', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7 }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
                    Call
                  </button>
                )}
              </div>
              <button type="button" onClick={backspace} title="Delete"
                style={{ width: 48, height: 46, borderRadius: 12, border: '1px solid var(--border)', background: '#fff', color: 'var(--slate)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 4H8l-7 8 7 8h13a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2z"/><line x1="18" y1="9" x2="12" y2="15"/><line x1="12" y1="9" x2="18" y2="15"/></svg>
              </button>
            </div>
          </>
        ) : (
          /* ── Recent calls ─────────────────────────────────────────────── */
          <div>
            {recent.length === 0 && (
              <p style={{ fontSize: 13, color: 'var(--slate)', textAlign: 'center', padding: 24 }}>No calls yet.</p>
            )}
            {recent.map(c => {
              const failed = c.status === 'failed' || !c.duration_seconds
              return (
                <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 4px', borderBottom: '1px solid var(--border)' }}>
                  <span style={{ width: 28, height: 28, borderRadius: '50%', flexShrink: 0, background: failed ? '#fee2e2' : '#dcfce7', color: failed ? '#dc2626' : '#15803d', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" style={c.direction === 'inbound' ? undefined : { transform: 'rotate(0deg)' }}>
                      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/>
                    </svg>
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {c.direction === 'inbound' ? c.from_number : c.to_number}
                    </p>
                    <p style={{ margin: 0, fontSize: 11, color: 'var(--slate)' }}>
                      {fmtWhen(c.created_at)} · {failed ? (c.cause || 'Not connected') : fmtDur(c.duration_seconds)}
                    </p>
                  </div>
                  <button type="button" title="Call back"
                    onClick={() => { setTab('dialer'); setDialing({ number: c.direction === 'inbound' ? c.from_number : c.to_number, contactId: c.contact_id }) }}
                    style={{ width: 30, height: 30, borderRadius: 8, border: '1px solid var(--border)', background: '#fff', color: '#059669', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
                  </button>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
