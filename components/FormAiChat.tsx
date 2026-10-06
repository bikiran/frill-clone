'use client'

import { authFetch } from '@/lib/auth-fetch'
import { useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'

// Colvy AI chat for the form builder: describe a form, it builds it; keep
// chatting to change it. Every change can be undone from the chat.

export type FormSnapshot = { title: string; welcomeMessage: string; thankYouMessage: string; questions: any[] }
export type AiDraft = { title: string; welcome_message: string; thank_you_message: string; questions: any[] }

type Change = { before: FormSnapshot; after: FormSnapshot; titles: string[]; undone: boolean }
type Msg = { id: string; role: 'user' | 'assistant'; text: string; error?: boolean; change?: Change }

const CORAL = 'var(--coral, #ff7a6b)'
const GRAD = 'linear-gradient(135deg, #ff7a6b, #ff9d72)'

const NEW_FORM_IDEAS = ['Customer feedback survey', 'Booking enquiry form', 'Job application', 'Event RSVP', 'Product return request', 'Contact us form']
const EDIT_IDEAS = ['Make it shorter', 'Add a star rating question', 'Make the tone friendlier', 'Ask for their phone number too']

const uid = () => Math.random().toString(36).slice(2)

function Spark({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M12 3l1.9 4.6L18.5 9.5 13.9 11.4 12 16l-1.9-4.6L5.5 9.5l4.6-1.9L12 3z" />
      <path d="M19 14l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8.8-2z" />
    </svg>
  )
}

const Orb = ({ size = 28 }: { size?: number }) => (
  <span style={{ width: size, height: size, borderRadius: '50%', background: GRAD, color: '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, boxShadow: '0 6px 16px -6px rgba(255,122,107,.7)' }}>
    <Spark size={Math.round(size * 0.55)} />
  </span>
)

export default function FormAiChat({ open, onClose, formId, current, apply }: {
  open: boolean
  onClose: () => void
  formId: string
  current: FormSnapshot
  /** Put a snapshot into the builder (a new AI version, or an undo/redo). */
  apply: (s: FormSnapshot) => void
}) {
  const [msgs, setMsgs] = useState<Msg[]>([])
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const currentRef = useRef(current)
  currentRef.current = current

  useEffect(() => { if (open) setTimeout(() => inputRef.current?.focus(), 220) }, [open])
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])
  useEffect(() => {
    const el = scrollRef.current
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' })
  }, [msgs, busy])

  // Grow the box with the text, up to a few lines.
  const resize = () => {
    const el = inputRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = Math.min(el.scrollHeight, 140) + 'px'
  }

  const toSnapshot = (d: AiDraft, base: FormSnapshot): FormSnapshot => {
    const byId = new Map(base.questions.map((q: any) => [q.id, q]))
    const questions = d.questions.map((q: any) => {
      const prev = q.id ? byId.get(q.id) : null
      const listy = ['multiple_choice', 'dropdown', 'ranking'].includes(q.type)
      return {
        ...(prev || {}),
        id: prev ? prev.id : crypto.randomUUID(),
        type: q.type,
        title: q.title,
        description: q.description || '',
        required: !!q.required,
        options: listy ? (q.options?.length ? q.options : ['Option 1', 'Option 2']) : undefined,
        multiSelect: q.type === 'multiple_choice' ? !!q.multi_select : undefined,
        matrixRows: q.type === 'matrix' ? q.matrix_rows : undefined,
        matrixCols: q.type === 'matrix' ? q.matrix_cols : undefined,
      }
    })
    return { title: d.title, welcomeMessage: d.welcome_message, thankYouMessage: d.thank_you_message, questions }
  }

  const send = async (raw?: string) => {
    const t = (raw ?? text).trim()
    if (!t || busy) return
    const userMsg: Msg = { id: uid(), role: 'user', text: t }
    const history = [...msgs, userMsg]
    setMsgs(history); setText(''); setBusy(true)
    requestAnimationFrame(resize)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const base = currentRef.current
      const res = await authFetch('/api/ai/form', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}) },
        body: JSON.stringify({
          formId,
          messages: history.filter(m => !m.error).map(m => ({ role: m.role, text: m.text })),
          current: { title: base.title, welcome_message: base.welcomeMessage, thank_you_message: base.thankYouMessage, questions: base.questions },
        }),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(d.error || 'Colvy AI couldn’t reply. Please try again.')
      let change: Change | undefined
      if (d.form) {
        const before = currentRef.current
        const after = toSnapshot(d.form, before)
        apply(after)
        change = { before, after, titles: after.questions.map((q: any) => q.title), undone: false }
      }
      setMsgs(m => [...m, { id: uid(), role: 'assistant', text: d.reply || 'Done.', change }])
    } catch (e: any) {
      setMsgs(m => [...m, { id: uid(), role: 'assistant', text: e?.message || 'Something went wrong. Please try again.', error: true }])
    } finally {
      setBusy(false)
      setTimeout(() => inputRef.current?.focus(), 30)
    }
  }

  // Undo / redo the latest AI change (older ones would clobber what came after).
  const lastChangeId = [...msgs].reverse().find(m => m.change)?.id
  const toggleUndo = (id: string) => {
    const m = msgs.find(x => x.id === id)
    if (!m?.change || id !== lastChangeId) return
    apply(m.change.undone ? m.change.after : m.change.before)
    setMsgs(list => list.map(x => x.id === id && x.change ? { ...x, change: { ...x.change, undone: !x.change.undone } } : x))
  }

  const ideas = current.questions.length ? EDIT_IDEAS : NEW_FORM_IDEAS

  return (
    <>
      <style>{`
        .fai-scrim{position:fixed;inset:0;z-index:950;background:rgba(15,23,42,.28);opacity:0;pointer-events:none;transition:opacity .24s ease}
        .fai-panel{position:fixed;z-index:960;top:124px;right:16px;bottom:16px;width:min(420px,calc(100vw - 32px));background:#fff;border:1px solid #ececef;border-radius:22px;
          box-shadow:0 30px 70px -20px rgba(16,24,40,.35);display:flex;flex-direction:column;overflow:hidden;
          opacity:0;transform:translate3d(18px,0,0) scale(.985);pointer-events:none;transition:opacity .26s cubic-bezier(.22,1,.36,1),transform .32s cubic-bezier(.22,1,.36,1)}
        .fai-open .fai-panel{opacity:1;transform:none;pointer-events:auto}
        .fai-open .fai-scrim{opacity:1;pointer-events:auto}
        @media (min-width:1100px){.fai-scrim{display:none}}
        body:has(.fai-open) button[title="Send feedback"]{display:none!important}
        @media (max-width:640px){
          .fai-panel{top:auto;left:0;right:0;bottom:0;width:100%;height:calc(100dvh - 40px);border-radius:22px 22px 0 0;transform:translate3d(0,40px,0);padding-bottom:env(safe-area-inset-bottom)}
        }
        .fai-msg{animation:faiIn .32s cubic-bezier(.22,1,.36,1) both}
        @keyframes faiIn{from{opacity:0;transform:translate3d(0,8px,0)}to{opacity:1;transform:none}}
        .fai-dot{width:6px;height:6px;border-radius:50%;background:#c4c4cc;display:inline-block;animation:faiDot 1.1s ease-in-out infinite}
        .fai-dot:nth-child(2){animation-delay:.15s}.fai-dot:nth-child(3){animation-delay:.3s}
        @keyframes faiDot{0%,80%,100%{transform:translateY(0);opacity:.5}40%{transform:translateY(-4px);opacity:1}}
        .fai-chip{border:1px solid #ececef;background:#fff;border-radius:999px;padding:8px 13px;font-size:13px;font-weight:600;color:#3f3f46;cursor:pointer;font-family:inherit;transition:border-color .15s ease,background .15s ease,transform .15s ease}
        .fai-chip:hover{border-color:#ffc9bf;background:#fff7f5;transform:translateY(-1px)}
        .fai-box{border:1px solid #e4e4e7;border-radius:18px;background:#fff;transition:border-color .15s ease,box-shadow .15s ease}
        .fai-box:focus-within{border-color:#ffb4a6;box-shadow:0 0 0 4px rgba(255,122,107,.12)}
        .fai-input{border:none!important;outline:none!important;box-shadow:none!important;background:transparent!important;border-radius:0!important;min-height:0!important}
        .fai-chips{mask-image:linear-gradient(90deg,#000 85%,transparent);-webkit-mask-image:linear-gradient(90deg,#000 85%,transparent)}
        .fai-icon-btn{width:32px;height:32px;border-radius:10px;border:none;background:transparent;color:#6b7280;display:inline-flex;align-items:center;justify-content:center;cursor:pointer;transition:background .15s ease,color .15s ease}
        .fai-icon-btn:hover{background:#f4f4f5;color:#111827}
        @media (prefers-reduced-motion:reduce){.fai-panel,.fai-scrim{transition:none}.fai-msg,.fai-dot{animation:none}}
      `}</style>
      <div className={open ? 'fai-open' : ''} aria-hidden={!open}>
        <div className="fai-scrim" onClick={onClose} />
        <div className="fai-panel" role="dialog" aria-label="Colvy AI">
          {/* Header */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 14px 12px 16px', borderBottom: '1px solid #f1f1f3' }}>
            <Orb size={30} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ margin: 0, fontSize: 14.5, fontWeight: 800, color: '#0d0d0d', lineHeight: 1.15 }}>Colvy AI</p>
              <p style={{ margin: 0, fontSize: 12, color: '#8b8b94' }}>Build your form by chatting</p>
            </div>
            {msgs.length > 0 && (
              <button className="fai-icon-btn" title="New chat" aria-label="New chat" onClick={() => { setMsgs([]); setText('') }} disabled={busy}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9" /><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" /></svg>
              </button>
            )}
            <button className="fai-icon-btn" aria-label="Close Colvy AI" onClick={onClose}>
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
            </button>
          </div>

          {/* Conversation */}
          <div ref={scrollRef} style={{ flex: 1, overflowY: 'auto', padding: '18px 16px 8px', overscrollBehavior: 'contain' }}>
            {msgs.length === 0 ? (
              <div className="fai-msg" style={{ textAlign: 'center', padding: '28px 6px 8px' }}>
                <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 14 }}><Orb size={52} /></div>
                <h3 style={{ margin: 0, fontSize: 19, fontWeight: 800, color: '#0d0d0d', letterSpacing: '-.01em' }}>
                  {current.questions.length ? 'What should we change?' : 'What would you like to build?'}
                </h3>
                <p style={{ margin: '8px auto 0', maxWidth: 300, fontSize: 13.5, lineHeight: 1.55, color: '#6b7280' }}>
                  {current.questions.length
                    ? 'Ask for any change to this form and Colvy AI will update it.'
                    : 'Describe your form in a sentence and Colvy AI will write the questions. Keep chatting to change it.'}
                </p>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'center', marginTop: 20 }}>
                  {ideas.map(i => <button key={i} className="fai-chip" onClick={() => send(i)}>{i}</button>)}
                </div>
              </div>
            ) : msgs.map(m => m.role === 'user' ? (
              <div key={m.id} className="fai-msg" style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 14 }}>
                <div style={{ maxWidth: '82%', background: '#f4f4f5', color: '#0d0d0d', padding: '10px 14px', borderRadius: '18px 18px 6px 18px', fontSize: 14, lineHeight: 1.5, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{m.text}</div>
              </div>
            ) : (
              <div key={m.id} className="fai-msg" style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
                <Orb size={26} />
                <div style={{ flex: 1, minWidth: 0, paddingTop: 3 }}>
                  <p style={{ margin: 0, fontSize: 14, lineHeight: 1.55, color: m.error ? '#b42318' : '#1f2937', whiteSpace: 'pre-wrap' }}>{m.text}</p>
                  {m.change && (
                    <div style={{ marginTop: 10, border: '1px solid #ececef', borderRadius: 14, overflow: 'hidden', background: m.change.undone ? '#fafafa' : '#fff', transition: 'background .2s ease' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px', borderBottom: '1px solid #f1f1f3' }}>
                        <span style={{ width: 20, height: 20, borderRadius: '50%', background: m.change.undone ? '#e4e4e7' : '#ecfdf3', color: m.change.undone ? '#71717a' : '#067647', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                          {m.change.undone
                            ? <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round"><path d="M9 14 4 9l5-5" /><path d="M4 9h11a5 5 0 0 1 0 10h-4" /></svg>
                            : <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>}
                        </span>
                        <span style={{ flex: 1, fontSize: 12.5, fontWeight: 700, color: m.change.undone ? '#71717a' : '#0d0d0d' }}>
                          {m.change.undone ? 'Change undone' : `Form updated · ${m.change.titles.length} question${m.change.titles.length === 1 ? '' : 's'}`}
                        </span>
                        {m.id === lastChangeId && (
                          <button onClick={() => toggleUndo(m.id)} disabled={busy}
                            style={{ border: 'none', background: 'transparent', color: CORAL, fontSize: 12.5, fontWeight: 700, cursor: busy ? 'default' : 'pointer', padding: '2px 4px', fontFamily: 'inherit' }}>
                            {m.change.undone ? 'Redo' : 'Undo'}
                          </button>
                        )}
                      </div>
                      {!m.change.undone && (
                        <ol style={{ margin: 0, padding: '8px 12px 10px 32px', fontSize: 12.5, lineHeight: 1.7, color: '#4b5563' }}>
                          {m.change.titles.slice(0, 6).map((t, i) => <li key={i} style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t}</li>)}
                          {m.change.titles.length > 6 && <li style={{ listStyle: 'none', marginLeft: -18, color: '#9ca3af' }}>and {m.change.titles.length - 6} more</li>}
                        </ol>
                      )}
                    </div>
                  )}
                </div>
              </div>
            ))}
            {busy && (
              <div className="fai-msg" style={{ display: 'flex', gap: 10, marginBottom: 16, alignItems: 'center' }}>
                <Orb size={26} />
                <span style={{ display: 'inline-flex', gap: 4, padding: '8px 4px' }} aria-label="Colvy AI is writing">
                  <span className="fai-dot" /><span className="fai-dot" /><span className="fai-dot" />
                </span>
              </div>
            )}
          </div>

          {/* Composer */}
          <div style={{ padding: '8px 12px 12px' }}>
            {msgs.length > 0 && current.questions.length > 0 && !busy && (
              <div className="fai-chips" style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 8, scrollbarWidth: 'none' }}>
                {EDIT_IDEAS.slice(0, 3).map(i => <button key={i} className="fai-chip" style={{ padding: '6px 11px', fontSize: 12, whiteSpace: 'nowrap', flexShrink: 0 }} onClick={() => send(i)}>{i}</button>)}
              </div>
            )}
            <div className="fai-box" style={{ display: 'flex', alignItems: 'flex-end', gap: 8, padding: '8px 8px 8px 14px' }}>
              <textarea
                ref={inputRef}
                value={text}
                rows={1}
                onChange={e => { setText(e.target.value); resize() }}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); send() } }}
                placeholder={current.questions.length ? 'Ask for a change…' : 'Describe the form you need…'}
                aria-label="Message Colvy AI"
                className="fai-input"
                style={{ flex: 1, border: 'none', outline: 'none', resize: 'none', fontFamily: 'inherit', fontSize: 14.5, lineHeight: 1.45, padding: '6px 0', maxHeight: 140, background: 'transparent', color: '#0d0d0d' }}
              />
              <button onClick={() => send()} disabled={!text.trim() || busy} aria-label="Send"
                style={{ width: 34, height: 34, borderRadius: '50%', border: 'none', flexShrink: 0, cursor: text.trim() && !busy ? 'pointer' : 'default', background: text.trim() && !busy ? GRAD : '#ececef', color: text.trim() && !busy ? '#fff' : '#a1a1aa', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'background .2s ease, transform .15s ease' }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M12 19V5" /><path d="m5 12 7-7 7 7" /></svg>
              </button>
            </div>
            <p style={{ margin: '8px 4px 0', fontSize: 11, color: '#a1a1aa', textAlign: 'center' }}>Colvy AI can make mistakes. Check the form before you publish.</p>
          </div>
        </div>
      </div>
    </>
  )
}

export { Spark as AiSpark }
