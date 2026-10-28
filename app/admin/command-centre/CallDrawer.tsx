'use client'

// One call, start to finish: who it was, the recording, transcript and AI
// summary (the same call card as the inbox), what the AI receptionist did,
// what happened next (the automatic text, replies, call-backs), and the tasks
// and waiting-list entries it led to. Call back and text back from here.

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { authFetch } from '@/lib/auth-fetch'
import CallCard from '@/components/CallCard'
import { WhyLink } from '@/components/WhyAgent'
import { callerDisplay, outcomeLabel, aiOutcomeOf, AI_OUTCOME_LABEL, fmtDur, formatPhone, otherNumber, type CcCall } from '@/lib/command-centre'
import { Icon, Chip, C, btn, kicker, label, Spinner, tint, iconBtn, OUTCOME_COLOR } from './ui'

type Detail = {
  call: CcCall
  hasTranscript: boolean
  contact: { id: string; name: string | null; phone: string | null; email: string | null } | null
  conversation: { id: string; subject: string | null; channel: string | null; status: string | null } | null
  tasks: { id: string; title: string; status: string; priority: string | null; due: string | null; at: string; source: string | null; by: string | null }[]
  waitlist: { id: string; item: string; status: string; at: string; runId: string | null; by: string | null }[]
  followUps: { kind: string; at: string; label: string; by?: string | null }[]
  phoneAgent: { reason: string | null; realtime: boolean; messageTaken: boolean; about: string | null; texts: number; bookingLinks: number; turns: { who: string; text: string }[] } | null
  textable: boolean
  textableReason: string | null
}

const REASON: Record<string, string> = { test: 'a test call from one of your test numbers', after_hours: 'it came in outside opening hours', no_answer: 'nobody on the team picked up', always: 'it answers every call' }
const NO_TEXT: Record<string, string> = { withheld: 'Hidden number', short_code: 'Can’t get texts', international: 'Overseas number', not_mobile: 'Landline' }

export default function CallDrawer({ companyId, call, tz, hour12, locationName, onClose, onCallBack, onTextBack }: {
  companyId: string; call: CcCall; tz: string; hour12: boolean; locationName: string | null
  onClose: () => void; onCallBack: (c: CcCall) => void; onTextBack: (c: CcCall) => void
}) {
  const [d, setD] = useState<Detail | null>(null)
  const [error, setError] = useState('')
  const [showTurns, setShowTurns] = useState(false)
  const [closing, setClosing] = useState(false)
  const close = () => { setClosing(true); setTimeout(onClose, 180) }

  useEffect(() => {
    let live = true
    setD(null); setError('')
    authFetch(`/api/command-centre/call?companyId=${encodeURIComponent(companyId)}&callId=${encodeURIComponent(call.id)}`)
      .then(r => r.json().then(x => ({ ok: r.ok, x })))
      .then(({ ok, x }) => { if (live) ok ? setD(x) : setError(x.error || 'Couldn’t load this call.') })
      .catch(() => live && setError('Couldn’t reach Colvy.'))
    return () => { live = false }
  }, [companyId, call.id])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close() }
    window.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = prev }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const c = d?.call || call
  const disp = callerDisplay(c, locationName)
  const out = outcomeLabel(c)
  const ao = aiOutcomeOf(c)
  const when = new Date(c.created_at).toLocaleString('en-AU', { timeZone: tz, weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', hour12 })
  const theirs = otherNumber(c)
  const canCall = !!theirs && !/[a-z]/i.test(theirs)
  const unanswered = c.direction === 'inbound' && (out.key === 'missed' || out.key === 'voicemail')
  const fmtT = (v: string) => new Date(v).toLocaleString('en-AU', { timeZone: tz, day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', hour12 })

  const col = OUTCOME_COLOR[out.key] || C.blue
  const sect: React.CSSProperties = { background: '#fff', borderRadius: 18, padding: '14px 16px' }
  const sectH: React.CSSProperties = { ...kicker, fontSize: 14.5, marginBottom: 10 }
  const rowBox: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 14, background: '#f4f4f5' }

  if (typeof document === 'undefined') return null
  return createPortal(
    <div onClick={close} style={{ position: 'fixed', inset: 0, zIndex: 900, background: 'rgba(15,15,20,0.3)', opacity: closing ? 0 : 1, transition: 'opacity .18s ease' }}>
      <style>{`@keyframes ccdrawer{from{transform:translateX(28px);opacity:0}to{transform:none;opacity:1}}
        .cc-drawer{position:absolute;top:8px;right:8px;bottom:8px;width:min(560px,calc(100vw - 16px))}
        .cc-drawer button::before{display:none}
        @media (max-width:700px){.cc-drawer{top:6px;right:6px;bottom:6px;left:6px;width:auto;border-radius:22px!important}}
        @media (prefers-reduced-motion: reduce){.cc-drawer{animation:none!important}}`}</style>
      <aside className="cc-drawer" role="dialog" aria-modal="true" aria-label="Call details" onClick={e => e.stopPropagation()}
        style={{ background: '#f4f4f5', borderRadius: 24, overflow: 'hidden', boxShadow: '0 24px 64px rgba(0,0,0,0.22), 0 0 0 1px rgba(0,0,0,0.05)', display: 'flex', flexDirection: 'column', animation: 'ccdrawer .32s cubic-bezier(.22,1,.36,1)', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif', color: 'var(--ink)' }}>
        {/* Header */}
        <div style={{ flexShrink: 0, background: '#fff', borderBottom: '1px solid #ececef', padding: '16px 18px' }}>
          <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
            <span style={{ width: 46, height: 46, borderRadius: 999, flexShrink: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: tint(col, 12), color: col }}>
              {out.key === 'voicemail' ? Icon.vm(20) : out.key === 'missed' ? Icon.phoneMissed(20) : c.direction === 'outbound' ? Icon.phoneOut(20) : Icon.phoneIn(20)}
            </span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ margin: 0, fontSize: 22, fontWeight: 800, letterSpacing: '-0.02em', lineHeight: 1.2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{disp.title}</p>
              <p style={{ margin: '3px 0 0', fontSize: 13.5, color: '#71717a' }}>{disp.subtitle}{disp.known && locationName ? ` · ${locationName}` : ''}</p>
            </div>
            <button type="button" onClick={close} aria-label="Close" title="Close" style={{ ...iconBtn, width: 34, height: 34 }}>{Icon.x(16)}</button>
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 12 }}>
            <Chip color={col}>{out.label}</Chip>
            {ao && <Chip color={C.violet}>{Icon.spark(11)} {AI_OUTCOME_LABEL[ao]}</Chip>}
            {c.ai?.test && <Chip color="#71717a">Test call</Chip>}
            <Chip color="#71717a">{c.direction === 'inbound' ? 'Incoming' : 'Outgoing'}</Chip>
          </div>
          {/* Actions */}
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 14 }}>
            {canCall && <button type="button" onClick={() => onCallBack(c)} style={{ ...btn('primary'), minHeight: 36 }}>{Icon.phone(14)} Call {c.direction === 'outbound' ? 'again' : 'back'}</button>}
            {d && (d.textable
              ? <button type="button" onClick={() => onTextBack(c)} style={{ ...btn('soft'), minHeight: 36 }}>{Icon.spark(13)} Text back</button>
              : d.textableReason && <span style={{ ...btn('ghost'), minHeight: 36, cursor: 'default', color: '#71717a' }} title="This number can’t get texts">{Icon.chat(14)} {NO_TEXT[d.textableReason] || 'Can’t text'}</span>)}
            {(d?.conversation?.id || c.conversation_id) && <a href={`/admin/inbox?conversation=${d?.conversation?.id || c.conversation_id}`} style={{ ...btn('ghost'), minHeight: 36 }}>{Icon.chat(14)} Conversation</a>}
            {(d?.contact?.id || c.contact_id) && <a href={`/admin/customers/profile?id=${d?.contact?.id || c.contact_id}`} style={{ ...btn('ghost'), minHeight: 36 }}>{Icon.user(14)} Contact</a>}
          </div>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: 10, display: 'flex', flexDirection: 'column', gap: 10 }}>
          {/* Facts */}
          <section style={sect}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 8 }}>
              {([
                ['When', when],
                ['Duration', c.duration_seconds ? fmtDur(c.duration_seconds) : out.key === 'answered' || out.key === 'connected' ? 'Not recorded' : '—'],
                [c.direction === 'outbound' ? 'Called by' : 'Answered by', c.agent_name ? (c.agent_name === 'AI phone agent' ? 'AI receptionist' : c.agent_name) : unanswered ? 'Nobody' : '—'],
                [c.direction === 'outbound' ? 'From line' : 'Line rung', formatPhone(c.direction === 'outbound' ? c.from_number : c.to_number)],
              ] as [string, string][]).map(([k, v]) => (
                <div key={k} style={{ padding: '10px 12px', borderRadius: 14, background: '#f4f4f5', minWidth: 0 }}>
                  <p style={label}>{k}</p>
                  <p style={{ margin: '3px 0 0', fontSize: 14, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{v}</p>
                </div>
              ))}
            </div>
          </section>

          {error && <p style={{ ...sect, margin: 0, color: C.red, fontSize: 13.5, fontWeight: 600 }}>{error}</p>}
          {!d && !error && <p style={{ ...sect, display: 'flex', alignItems: 'center', gap: 8, margin: 0, fontSize: 13.5, color: '#71717a' }}><Spinner /> Loading the call…</p>}

          {/* AI receptionist */}
          {d?.phoneAgent && (
            <section style={sect}>
              <p style={{ ...sectH, display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ width: 26, height: 26, borderRadius: 8, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: tint(C.violet, 12), color: C.violet }}>{Icon.spark(13)}</span>
                AI receptionist
              </p>
              <p style={{ margin: 0, fontSize: 13.5, color: '#3f3f46', lineHeight: 1.55 }}>
                Answered because {REASON[d.phoneAgent.reason || ''] || 'of your AI receptionist settings'}.
                {d.phoneAgent.messageTaken ? ` Took a message${d.phoneAgent.about ? `: “${d.phoneAgent.about}”` : ''}, and made a call-back task.` : ao === 'ai_missed' ? ' The caller hung up without saying anything, so it counts as missed.' : ao === 'ai_voicemail' ? ' The caller asked for voicemail.' : ' It dealt with the call without needing the team.'}
                {d.phoneAgent.bookingLinks ? ` Texted ${d.phoneAgent.bookingLinks} booking link${d.phoneAgent.bookingLinks === 1 ? '' : 's'}.` : ''}
                {d.phoneAgent.texts - d.phoneAgent.bookingLinks > 0 ? ` Sent ${d.phoneAgent.texts - d.phoneAgent.bookingLinks} other text${d.phoneAgent.texts - d.phoneAgent.bookingLinks === 1 ? '' : 's'}.` : ''}
              </p>
              {d.phoneAgent.turns.length > 0 && (
                <>
                  <button type="button" onClick={() => setShowTurns(v => !v)} aria-expanded={showTurns} style={{ ...btn('ghost'), minHeight: 30, marginTop: 10 }}>
                    {showTurns ? 'Hide' : 'Read'} the conversation ({d.phoneAgent.turns.length} turns)
                  </button>
                  {showTurns && (
                    <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {d.phoneAgent.turns.map((t, i) => (
                        <div key={i} style={{ alignSelf: t.who === 'agent' ? 'flex-start' : 'flex-end', maxWidth: '86%', padding: '8px 12px', borderRadius: 16, fontSize: 13, lineHeight: 1.45, background: t.who === 'agent' ? '#f4f4f5' : tint(C.blue, 12), color: 'var(--ink)' }}>
                          <span style={{ display: 'block', fontSize: 11.5, fontWeight: 600, color: '#71717a', marginBottom: 2 }}>{t.who === 'agent' ? 'AI' : 'Caller'}</span>
                          {t.text}
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}
            </section>
          )}

          {/* Recording, summary and transcript: the inbox's call card */}
          {(c.has_recording || d?.hasTranscript || c.ai_summary) && (
            <section style={sect}>
              <p style={sectH}>{c.has_recording ? 'Recording and notes' : 'Notes'}</p>
              <CallCard callId={c.id} meta={{ direction: c.direction, duration_seconds: c.duration_seconds, agent_name: c.agent_name }} timestamp={c.created_at} contactName={d?.contact?.name || null} />
            </section>
          )}

          {/* What happened next */}
          {d && (
            <section style={sect}>
              <p style={sectH}>What happened next</p>
              {d.followUps.length === 0 ? (
                <p style={{ margin: 0, fontSize: 13.5, color: unanswered ? C.red : '#71717a', fontWeight: unanswered ? 600 : 500 }}>
                  {unanswered ? 'Nobody has called or texted them back yet.' : 'Nothing else since this call.'}
                </p>
              ) : (
                <ol style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {d.followUps.map((f, i) => {
                    const fc = f.kind === 'auto_text' ? '#71717a' : f.kind === 'called_again' ? C.blue : C.green
                    return (
                      <li key={i} style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                        <span style={{ width: 30, height: 30, borderRadius: 999, flexShrink: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: tint(fc, 12), color: fc }}>
                          {f.kind === 'call_back' ? Icon.phoneOut(13) : f.kind === 'called_again' ? Icon.phoneIn(13) : Icon.chat(13)}
                        </span>
                        <span style={{ fontSize: 13.5, minWidth: 0 }}>
                          <strong style={{ fontWeight: 600 }}>{f.label}</strong><span style={{ color: '#71717a' }}>{f.by ? ` · ${f.by === 'AI phone agent' ? 'AI receptionist' : f.by}` : ''}</span>
                          <span style={{ display: 'block', fontSize: 12, color: '#a1a1aa', marginTop: 1 }}>{fmtT(f.at)}</span>
                        </span>
                      </li>
                    )
                  })}
                </ol>
              )}
            </section>
          )}

          {/* Tasks and waiting list made from it */}
          {d && (d.tasks.length > 0 || d.waitlist.length > 0) && (
            <section style={sect}>
              <p style={sectH}>Made from this call</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {d.tasks.map(t => (
                  <div key={t.id} style={rowBox}>
                    <span style={{ color: t.status === 'done' ? C.green : '#71717a', display: 'inline-flex' }}>{Icon.task(15)}</span>
                    <a href={`/admin/tasks?task=${t.id}`} style={{ flex: 1, minWidth: 0, fontSize: 13.5, fontWeight: 600, color: 'var(--ink)', textDecoration: 'none', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.title}</a>
                    <Chip color={t.status === 'done' ? C.green : t.priority === 'high' || t.priority === 'urgent' ? C.red : '#71717a'}>{t.status === 'done' ? 'Done' : t.priority === 'high' || t.priority === 'urgent' ? 'Urgent' : 'Task'}</Chip>
                    <WhyLink companyId={companyId} entityType="task" entityId={t.id} style={{ fontSize: 12 }} />
                  </div>
                ))}
                {d.waitlist.map(w => (
                  <div key={w.id} style={rowBox}>
                    <span style={{ color: '#71717a', display: 'inline-flex' }}>{Icon.list(15)}</span>
                    <a href="/admin/waitlists" style={{ flex: 1, minWidth: 0, fontSize: 13.5, fontWeight: 600, color: 'var(--ink)', textDecoration: 'none', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>Waiting list: {w.item}</a>
                    <Chip color="#71717a">{w.status}</Chip>
                    {w.runId && <WhyLink companyId={companyId} runId={w.runId} style={{ fontSize: 12 }} />}
                  </div>
                ))}
              </div>
            </section>
          )}

          {d?.contact && (
            <section style={sect}>
              <p style={sectH}>Contact</p>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <span style={{ width: 40, height: 40, borderRadius: 999, flexShrink: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: 'var(--peach)', color: 'var(--coral)', fontSize: 13.5, fontWeight: 700 }}>
                  {(d.contact.name || '?').split(' ').map(w => w[0]).filter(Boolean).join('').slice(0, 2).toUpperCase()}
                </span>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <p style={{ margin: 0, fontSize: 14.5, fontWeight: 700 }}>{d.contact.name || 'No name saved'}</p>
                  {(d.contact.phone || d.contact.email) && (
                    <p style={{ margin: '2px 0 0', fontSize: 13, color: '#71717a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {[d.contact.phone ? formatPhone(d.contact.phone) : '', d.contact.email || ''].filter(Boolean).join(' · ')}
                    </p>
                  )}
                </div>
              </div>
            </section>
          )}
        </div>
      </aside>
    </div>,
    document.body,
  )
}
