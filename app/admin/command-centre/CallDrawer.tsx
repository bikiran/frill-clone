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
import { Icon, Chip, C, btn, kicker, Spinner, tint, OUTCOME_COLOR } from './ui'

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

  if (typeof document === 'undefined') return null
  return createPortal(
    <div onClick={close} style={{ position: 'fixed', inset: 0, zIndex: 900, background: 'rgba(15,15,20,0.36)', opacity: closing ? 0 : 1, transition: 'opacity .18s ease' }}>
      <style>{`@keyframes ccdrawer{from{transform:translateX(24px);opacity:.4}to{transform:none;opacity:1}}`}</style>
      <aside role="dialog" aria-modal="true" aria-label="Call details" onClick={e => e.stopPropagation()}
        style={{ position: 'absolute', top: 0, right: 0, bottom: 0, width: 'min(600px, 100vw)', background: 'var(--card, #fff)', borderLeft: '1px solid var(--border)', boxShadow: '-20px 0 60px rgba(0,0,0,0.18)', display: 'flex', flexDirection: 'column', animation: 'ccdrawer .2s ease' }}>
        {/* Header */}
        <div style={{ padding: '16px 18px 14px', borderBottom: '1px solid var(--border)', display: 'flex', gap: 12, alignItems: 'flex-start' }}>
          <span style={{ width: 42, height: 42, borderRadius: 12, flexShrink: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: tint(OUTCOME_COLOR[out.key] || C.blue), color: OUTCOME_COLOR[out.key] || C.blue }}>
            {out.key === 'voicemail' ? Icon.vm(19) : out.key === 'missed' ? Icon.phoneMissed(19) : c.direction === 'outbound' ? Icon.phoneOut(19) : Icon.phoneIn(19)}
          </span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ margin: 0, fontSize: 17, fontWeight: 800, color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{disp.title}</p>
            <p style={{ margin: '2px 0 0', fontSize: 12.5, color: 'var(--slate)' }}>{disp.subtitle}{disp.known && locationName ? ` · ${locationName}` : ''}</p>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
              <Chip color={OUTCOME_COLOR[out.key] || C.blue}>{out.label}</Chip>
              {ao && <Chip color={C.violet}>{Icon.spark(11)} {AI_OUTCOME_LABEL[ao]}</Chip>}
              {c.ai?.test && <Chip color="#6b6b70">Test call</Chip>}
              <Chip color="#6b6b70">{c.direction === 'inbound' ? 'Incoming' : 'Outgoing'}</Chip>
            </div>
          </div>
          <button type="button" onClick={close} aria-label="Close" style={{ border: 'none', background: 'none', color: 'var(--slate)', cursor: 'pointer', padding: 4 }}>{Icon.x(18)}</button>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: 18, display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Facts */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 10 }}>
            {([
              ['When', when],
              ['Duration', c.duration_seconds ? fmtDur(c.duration_seconds) : out.key === 'answered' || out.key === 'connected' ? 'Not recorded' : '—'],
              [c.direction === 'outbound' ? 'Called by' : 'Answered by', c.agent_name ? (c.agent_name === 'AI phone agent' ? 'AI receptionist' : c.agent_name) : unanswered ? 'Nobody' : '—'],
              [c.direction === 'outbound' ? 'From line' : 'Line rung', formatPhone(c.direction === 'outbound' ? c.from_number : c.to_number)],
            ] as [string, string][]).map(([k, v]) => (
              <div key={k} style={{ padding: '9px 11px', borderRadius: 10, background: 'var(--canvas)', border: '1px solid var(--border)', minWidth: 0 }}>
                <p style={kicker}>{k}</p>
                <p style={{ margin: '3px 0 0', fontSize: 13, fontWeight: 700, color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{v}</p>
              </div>
            ))}
          </div>

          {/* Actions */}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {canCall && <button type="button" onClick={() => onCallBack(c)} style={btn('primary')}>{Icon.phone(14)} Call {c.direction === 'outbound' ? 'again' : 'back'}</button>}
            {d && (d.textable
              ? <button type="button" onClick={() => onTextBack(c)} style={btn('soft')}>{Icon.spark(13)} Text back</button>
              : d.textableReason && <span style={{ ...btn('ghost'), cursor: 'default', color: 'var(--slate)' }} title="This number can’t get texts">{Icon.chat(14)} {NO_TEXT[d.textableReason] || 'Can’t text'}</span>)}
            {(d?.conversation?.id || c.conversation_id) && <a href={`/admin/inbox?conversation=${d?.conversation?.id || c.conversation_id}`} style={btn('ghost')}>{Icon.chat(14)} Conversation</a>}
            {(d?.contact?.id || c.contact_id) && <a href={`/admin/customers/profile?id=${d?.contact?.id || c.contact_id}`} style={btn('ghost')}>{Icon.user(14)} Contact</a>}
          </div>

          {error && <p style={{ margin: 0, color: C.red, fontSize: 13, fontWeight: 600 }}>{error}</p>}
          {!d && !error && <p style={{ display: 'flex', alignItems: 'center', gap: 8, margin: 0, fontSize: 13, color: 'var(--slate)' }}><Spinner /> Loading the call…</p>}

          {/* AI receptionist */}
          {d?.phoneAgent && (
            <section style={{ padding: 14, borderRadius: 12, border: `1px solid ${tint(C.violet, 30)}`, background: tint(C.violet, 6) }}>
              <p style={{ ...kicker, color: C.violet, display: 'flex', alignItems: 'center', gap: 6 }}>{Icon.spark(12)} AI receptionist</p>
              <p style={{ margin: '6px 0 0', fontSize: 13, color: 'var(--ink)', lineHeight: 1.5 }}>
                Answered because {REASON[d.phoneAgent.reason || ''] || 'of your AI receptionist settings'}.
                {d.phoneAgent.messageTaken ? ` Took a message${d.phoneAgent.about ? `: “${d.phoneAgent.about}”` : ''}, and made a call-back task.` : ao === 'ai_missed' ? ' The caller hung up without saying anything, so it counts as missed.' : ao === 'ai_voicemail' ? ' The caller asked for voicemail.' : ' It dealt with the call without needing the team.'}
                {d.phoneAgent.bookingLinks ? ` Texted ${d.phoneAgent.bookingLinks} booking link${d.phoneAgent.bookingLinks === 1 ? '' : 's'}.` : ''}
                {d.phoneAgent.texts - d.phoneAgent.bookingLinks > 0 ? ` Sent ${d.phoneAgent.texts - d.phoneAgent.bookingLinks} other text${d.phoneAgent.texts - d.phoneAgent.bookingLinks === 1 ? '' : 's'}.` : ''}
              </p>
              {d.phoneAgent.turns.length > 0 && (
                <>
                  <button type="button" onClick={() => setShowTurns(v => !v)} style={{ marginTop: 8, border: 'none', background: 'none', padding: 0, fontSize: 12, fontWeight: 700, color: C.violet, cursor: 'pointer' }}>
                    {showTurns ? 'Hide' : 'Read'} the conversation ({d.phoneAgent.turns.length} turns)
                  </button>
                  {showTurns && (
                    <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {d.phoneAgent.turns.map((t, i) => (
                        <div key={i} style={{ alignSelf: t.who === 'agent' ? 'flex-start' : 'flex-end', maxWidth: '86%', padding: '7px 10px', borderRadius: 10, fontSize: 12.5, lineHeight: 1.45, background: t.who === 'agent' ? 'var(--card, #fff)' : tint(C.blue, 12), border: '1px solid var(--border)', color: 'var(--ink)' }}>
                          <span style={{ display: 'block', fontSize: 10, fontWeight: 800, color: 'var(--slate)', textTransform: 'uppercase', marginBottom: 2 }}>{t.who === 'agent' ? 'AI' : 'Caller'}</span>
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
            <section>
              <p style={{ ...kicker, marginBottom: 8 }}>{c.has_recording ? 'Recording and notes' : 'Notes'}</p>
              <CallCard callId={c.id} meta={{ direction: c.direction, duration_seconds: c.duration_seconds, agent_name: c.agent_name }} timestamp={c.created_at} contactName={d?.contact?.name || null} />
            </section>
          )}

          {/* What happened next */}
          {d && (
            <section>
              <p style={{ ...kicker, marginBottom: 8 }}>What happened next</p>
              {d.followUps.length === 0 ? (
                <p style={{ margin: 0, fontSize: 13, color: unanswered ? C.red : 'var(--slate)', fontWeight: unanswered ? 600 : 500 }}>
                  {unanswered ? 'Nobody has called or texted them back yet.' : 'Nothing else since this call.'}
                </p>
              ) : (
                <ol style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {d.followUps.map((f, i) => {
                    const col = f.kind === 'auto_text' ? '#6b6b70' : f.kind === 'called_again' ? C.blue : C.green
                    return (
                      <li key={i} style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                        <span style={{ width: 26, height: 26, borderRadius: 8, flexShrink: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: tint(col), color: col }}>
                          {f.kind === 'call_back' ? Icon.phoneOut(13) : f.kind === 'called_again' ? Icon.phoneIn(13) : Icon.chat(13)}
                        </span>
                        <span style={{ fontSize: 13, color: 'var(--ink)', minWidth: 0 }}>
                          <strong style={{ fontWeight: 700 }}>{f.label}</strong>{f.by ? ` · ${f.by === 'AI phone agent' ? 'AI receptionist' : f.by}` : ''}
                          <span style={{ display: 'block', fontSize: 11, color: 'var(--slate)' }}>{fmtT(f.at)}</span>
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
            <section>
              <p style={{ ...kicker, marginBottom: 8 }}>Made from this call</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {d.tasks.map(t => (
                  <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 11px', borderRadius: 10, border: '1px solid var(--border)' }}>
                    <span style={{ color: t.status === 'done' ? C.green : 'var(--slate)' }}>{Icon.task(15)}</span>
                    <a href={`/admin/tasks?task=${t.id}`} style={{ flex: 1, minWidth: 0, fontSize: 13, fontWeight: 600, color: 'var(--ink)', textDecoration: 'none', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.title}</a>
                    <Chip color={t.status === 'done' ? C.green : t.priority === 'high' || t.priority === 'urgent' ? C.red : '#6b6b70'}>{t.status === 'done' ? 'Done' : t.priority === 'high' || t.priority === 'urgent' ? 'Urgent' : 'Task'}</Chip>
                    <WhyLink companyId={companyId} entityType="task" entityId={t.id} style={{ fontSize: 11.5 }} />
                  </div>
                ))}
                {d.waitlist.map(w => (
                  <div key={w.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 11px', borderRadius: 10, border: '1px solid var(--border)' }}>
                    <span style={{ color: 'var(--slate)' }}>{Icon.list(15)}</span>
                    <a href="/admin/waitlists" style={{ flex: 1, minWidth: 0, fontSize: 13, fontWeight: 600, color: 'var(--ink)', textDecoration: 'none', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>Waiting list: {w.item}</a>
                    <Chip color="#6b6b70">{w.status}</Chip>
                    {w.runId && <WhyLink companyId={companyId} runId={w.runId} style={{ fontSize: 11.5 }} />}
                  </div>
                ))}
              </div>
            </section>
          )}

          {d?.contact && (
            <section>
              <p style={{ ...kicker, marginBottom: 8 }}>Contact</p>
              <div style={{ fontSize: 13, color: 'var(--ink)', lineHeight: 1.6 }}>
                <strong>{d.contact.name || 'No name saved'}</strong>
                {d.contact.phone && <span style={{ color: 'var(--slate)' }}> · {formatPhone(d.contact.phone)}</span>}
                {d.contact.email && <span style={{ color: 'var(--slate)' }}> · {d.contact.email}</span>}
              </div>
            </section>
          )}
        </div>
      </aside>
    </div>,
    document.body,
  )
}
