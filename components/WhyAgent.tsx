'use client'

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { authFetch } from '@/lib/auth-fetch'
import AgentFace from '@/components/agents/AgentFace'
import { useAgentTeam, roleFromName } from '@/components/agents/useAgentTeam'

// "Why?" — open the explanation of something an agent did (a reply, a hand-off,
// a task) without leaving the page: what the customer asked, what the agent
// checked and found, what it did, which permission allowed it, and who
// approved it. "See every step" opens the full run on the AI Agents page.

const EASE = 'cubic-bezier(.22,1,.36,1)'

type Step = { kind: string; action: string | null; label: string; decision: string | null; decisionReason: string | null; why: string | null; status: string | null; detail: string | null }
type Explanation = {
  run: { id: string; role: string; mode: string; status: string; outcome: string | null; intent: string | null; summary: string | null; message: string | null; createdAt: string; conversationId: string | null }
  steps: Step[]; knew: string[]
}
export type WhyRef = { runId?: string | null; entityType?: string | null; entityId?: string | null }

const DECISION: Record<string, { label: string; tone: string }> = {
  sent_alone: { label: 'Sent on its own', tone: 'ok' }, allowed: { label: 'Done', tone: 'ok' }, suggested: { label: 'Suggested only', tone: 'muted' },
  needs_approval: { label: 'Waited for approval', tone: 'warn' }, denied: { label: 'Blocked', tone: 'bad' },
}
const OUTCOME: Record<string, string> = { replied: 'Replied', escalated: 'Handed to the team', needs_info: 'Asked for more information', no_action: 'No action needed', incomplete: 'Didn’t finish', refused: 'Declined' }

const Spark = ({ size = 12 }: { size?: number }) => <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2l1.6 5.3L19 9l-5.4 1.7L12 16l-1.6-5.3L5 9l5.4-1.7z" /></svg>
const Check = () => <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12" /></svg>
const Close = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>

const when = (iso: string) => new Date(iso).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })

export function WhyLink({ companyId, children = 'Why?', className, style, ...ref }: WhyRef & { companyId: string | null; children?: React.ReactNode; className?: string; style?: React.CSSProperties }) {
  const [open, setOpen] = useState(false)
  if (!companyId || (!ref.runId && !(ref.entityType && ref.entityId))) return null
  return (
    <>
      <button type="button" className={className} onClick={e => { e.stopPropagation(); setOpen(true) }} aria-haspopup="dialog"
        style={{ border: 'none', background: 'none', padding: 0, font: 'inherit', fontWeight: 700, color: 'var(--coral, #e2553f)', cursor: 'pointer', textDecoration: 'underline', textUnderlineOffset: 2, textDecorationColor: 'color-mix(in srgb, currentColor 35%, transparent)', ...style }}>
        {children}
      </button>
      {open && <WhySheet companyId={companyId} refs={ref} onClose={() => setOpen(false)} />}
    </>
  )
}

export function WhySheet({ companyId, refs, onClose }: { companyId: string; refs: WhyRef; onClose: () => void }) {
  const { faceOf } = useAgentTeam(companyId)
  const [data, setData] = useState<Explanation | null>(null)
  const [error, setError] = useState('')
  const [closing, setClosing] = useState(false)
  const close = () => { setClosing(true); setTimeout(onClose, 220) }

  useEffect(() => {
    const q = new URLSearchParams({ companyId, ...(refs.runId ? { runId: refs.runId } : { entityType: String(refs.entityType), entityId: String(refs.entityId) }) })
    authFetch(`/api/agent/explain?${q}`).then(r => r.json().then(d => ({ ok: r.ok, d }))).then(({ ok, d }) => (ok && d.run ? setData(d) : setError(d.error || 'Couldn’t load this.'))).catch(() => setError('Couldn’t reach Colvy.'))
  }, [companyId, refs.runId, refs.entityType, refs.entityId])
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close() }
    window.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = prev }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  if (typeof document === 'undefined') return null
  const r = data?.run
  return createPortal(
    <div className={`why-wrap ${closing ? 'out' : ''}`} onClick={close} role="presentation">
      <style>{CSS}</style>
      <div className="why-sheet" role="dialog" aria-modal="true" aria-label="Why the agent did this" onClick={e => e.stopPropagation()}>
        <div className="why-grab" aria-hidden="true" />
        <div className="why-head">
          <span className="why-face">{r ? <AgentFace face={faceOf(roleFromName(r.role))} size={34} /> : <span className="why-orb"><Spark size={14} /></span>}</span>
          <div style={{ minWidth: 0, flex: 1 }}>
            <p className="why-t">Why {!r?.role ? 'the agent' : /^Colvy /.test(r.role) ? `the ${r.role.slice(6)}` : r.role} did this</p>
            {r && <p className="why-s">{when(r.createdAt)}{r.mode === 'sandbox' ? ' · Sandbox' : ''}{r.outcome ? ` · ${OUTCOME[r.outcome] || r.outcome}` : ''}</p>}
          </div>
          <button type="button" className="why-x" onClick={close} aria-label="Close">{Close()}</button>
        </div>

        <div className="why-body">
          {!data && !error && <div className="why-skel"><span /><span /><span /></div>}
          {error && <p className="why-err">{error}</p>}
          {r && (
            <>
              {r.message && <p className="why-quote">“{r.message}”</p>}
              {r.summary && <div className="why-sum"><p className="why-label">What happened</p><p>{r.summary}</p></div>}

              {data!.steps.length > 0 && (
                <>
                  <p className="why-label" style={{ marginTop: 16 }}>What it did</p>
                  <ol className="why-steps">
                    {data!.steps.map((s, i) => {
                      const d = s.decision ? DECISION[s.decision] : null
                      const bad = s.status === 'error' || s.decision === 'denied'
                      return (
                        <li key={i} className="why-step" style={{ animationDelay: `${Math.min(i, 8) * 40}ms` }}>
                          <span className={`why-dot ${bad ? 'bad' : s.decision === 'needs_approval' ? 'warn' : 'ok'}`}>{!bad && s.decision !== 'needs_approval' ? <Check /> : null}</span>
                          <div style={{ minWidth: 0, flex: 1 }}>
                            <div className="why-step-head">
                              <span className="why-step-t">{s.label}</span>
                              {d && s.kind === 'action' && !['allowed'].includes(s.decision || '') && <span className={`why-chip ${d.tone}`}>{d.label}</span>}
                            </div>
                            {s.detail && (['send_message', 'auto_reply', 'reply_to_review', 'reply_to_comment', 'send_cart_followup', 'send_order_update', 'send_sales_followup'].includes(s.action || '') ? <p className="why-bubble">{s.detail}</p> : <p className="why-detail">{s.detail}</p>)}
                            {s.why && <p className="why-why">Why: {s.why}</p>}
                            {s.decisionReason && (s.kind === 'approval' || s.decision !== 'allowed') && <p className="why-rule">{s.decisionReason}</p>}
                          </div>
                        </li>
                      )
                    })}
                  </ol>
                </>
              )}

              {data!.knew.length > 0 && (
                <>
                  <p className="why-label" style={{ marginTop: 14 }}>What it knew</p>
                  <div className="why-refs">{data!.knew.map((k, i) => <span key={i}>{k}</span>)}</div>
                </>
              )}
            </>
          )}
        </div>

        {r && (
          <div className="why-foot">
            <a href={`/admin/agents?run=${r.id}`} className="why-all">See every step</a>
          </div>
        )}
      </div>
    </div>,
    document.body,
  )
}

const CSS = `
.why-wrap{position:fixed;inset:0;z-index:2147483000;background:rgba(15,23,42,.32);display:flex;align-items:flex-end;justify-content:center;animation:whyBg .25s ease both;-webkit-backdrop-filter:blur(2px);backdrop-filter:blur(2px)}
.why-wrap.out{animation:whyBgOut .22s ease both}
@media (min-width:720px){.why-wrap{align-items:center;padding:24px}}
@keyframes whyBg{from{opacity:0}to{opacity:1}}@keyframes whyBgOut{to{opacity:0}}
.why-sheet{width:100%;max-width:560px;max-height:86vh;display:flex;flex-direction:column;background:#fff;border-radius:22px 22px 0 0;box-shadow:0 -12px 40px rgba(15,23,42,.18);animation:whyUp .42s ${EASE} both;overflow:hidden}
.why-wrap.out .why-sheet{animation:whyDown .22s ease both}
@media (min-width:720px){.why-sheet{border-radius:22px;box-shadow:0 24px 64px rgba(15,23,42,.22);animation-name:whyPop}}
@keyframes whyUp{from{transform:translateY(40px);opacity:0}to{transform:none;opacity:1}}
@keyframes whyPop{from{transform:translateY(10px) scale(.98);opacity:0}to{transform:none;opacity:1}}
@keyframes whyDown{to{transform:translateY(24px);opacity:0}}
@media (prefers-reduced-motion: reduce){.why-wrap,.why-sheet,.why-step{animation:none!important}}
.why-grab{width:38px;height:4px;border-radius:99px;background:#e4e4e7;margin:8px auto 0}
@media (min-width:720px){.why-grab{display:none}}
.why-head{display:flex;align-items:flex-start;gap:11px;padding:14px 16px 12px;border-bottom:1px solid #f1f1f3}
.why-face{display:inline-flex;flex-shrink:0}
.why-orb{width:30px;height:30px;flex-shrink:0;border-radius:10px;display:inline-flex;align-items:center;justify-content:center;color:#fff;background:linear-gradient(135deg,var(--coral,#e2553f),color-mix(in srgb,var(--coral,#e2553f) 55%,#a855f7))}
.why-t{margin:0;font-size:15px;font-weight:800;color:#0d0d0d}
.why-s{margin:2px 0 0;font-size:12.5px;color:#71717a}
.why-x{width:32px;height:32px;flex-shrink:0;border:none;border-radius:10px;background:#f4f4f5;color:#52525b;display:inline-flex;align-items:center;justify-content:center;cursor:pointer}
.why-body{padding:14px 16px 6px;overflow:auto}
.why-quote{margin:0;font-size:14px;color:#52525b;font-style:italic;line-height:1.5}
.why-sum{margin-top:12px;padding:12px 14px;border-radius:14px;background:#f6f7f9}
.why-sum p:last-child{margin:0;font-size:14px;line-height:1.55;color:#18181b}
.why-label{margin:0 0 6px;font-size:11px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:#71717a}
.why-steps{list-style:none;margin:0;padding:0}
.why-step{display:flex;gap:10px;padding:8px 0;position:relative;animation:whyStep .4s ${EASE} both}
.why-step:not(:last-child)::before{content:'';position:absolute;left:10px;top:30px;bottom:-4px;width:1.5px;background:#ececef}
@keyframes whyStep{from{opacity:0;transform:translateY(5px)}to{opacity:1;transform:none}}
.why-dot{width:21px;height:21px;flex-shrink:0;margin-top:1px;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;color:#fff;position:relative;z-index:1}
.why-dot.ok{background:#12b76a}.why-dot.warn{background:#f79009}.why-dot.bad{background:#f04438}
.why-step-head{display:flex;align-items:center;gap:7px;flex-wrap:wrap}
.why-step-t{font-size:14px;font-weight:700;color:#18181b}
.why-chip{display:inline-flex;padding:2px 8px;border-radius:99px;font-size:11px;font-weight:700;background:#f4f4f5;color:#52525b}
.why-chip.ok{background:#ecfdf3;color:#067647}.why-chip.warn{background:#fffaeb;color:#b54708}.why-chip.bad{background:#fef3f2;color:#b42318}
.why-detail{margin:3px 0 0;font-size:13px;color:#3f3f46;line-height:1.5}
.why-bubble{margin:6px 0 0;padding:9px 12px;border-radius:14px 14px 14px 4px;background:color-mix(in srgb,var(--coral,#e2553f) 8%,#fff);border:1px solid color-mix(in srgb,var(--coral,#e2553f) 18%,#e4e4e7);font-size:13.5px;line-height:1.5;color:#18181b;white-space:pre-wrap}
.why-why{margin:4px 0 0;font-size:12.5px;color:#18181b;line-height:1.45}
.why-rule{margin:2px 0 0;font-size:12px;color:#71717a;line-height:1.45}
.why-refs{display:flex;flex-wrap:wrap;gap:6px}
.why-refs span{padding:3px 9px;border-radius:99px;border:1px solid #e4e4e7;font-size:12px;font-weight:600;color:#3f3f46}
.why-foot{padding:12px 16px calc(14px + env(safe-area-inset-bottom));border-top:1px solid #f1f1f3;display:flex;justify-content:flex-end}
.why-all{display:inline-flex;align-items:center;height:36px;padding:0 15px;border-radius:12px;background:var(--coral,#e2553f);color:#fff;font-size:13.5px;font-weight:700;text-decoration:none}
.why-err{margin:6px 0 12px;font-size:13.5px;color:#b42318}
.why-skel{display:flex;flex-direction:column;gap:10px;padding:4px 0 14px}
.why-skel span{height:14px;border-radius:7px;background:linear-gradient(90deg,#f1f1f3,#e8e8eb,#f1f1f3);background-size:200% 100%;animation:whyShim 1.2s linear infinite}
.why-skel span:nth-child(2){width:80%}.why-skel span:nth-child(3){width:60%}
@keyframes whyShim{to{background-position:-200% 0}}
`
