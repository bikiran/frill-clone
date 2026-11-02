'use client'

import { authFetch } from '@/lib/auth-fetch'
import Link from 'next/link'
import { useCallback, useEffect, useState } from 'react'

// Business settings → Payments → Refund security. Who may refund (the Team
// page's "Issue refunds"), and the workspace's refund PIN, which only the
// owner sets, changes or turns off (lib/refund-guard, /api/refund-pin).

type State = { ready: boolean; pinSet: boolean; isOwner: boolean; locked: boolean; setAt: string | null }
const digits = (v: string) => v.replace(/\D/g, '').slice(0, 8)

export default function RefundSecurity({ companyId }: { companyId: string | null }) {
  const [st, setSt] = useState<State | null>(null)
  const [mode, setMode] = useState<'idle' | 'set' | 'change' | 'off'>('idle')
  const [cur, setCur] = useState('')
  const [pin, setPin] = useState('')
  const [pin2, setPin2] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [ok, setOk] = useState('')

  const load = useCallback(async () => {
    if (!companyId) return
    try {
      const r = await authFetch(`/api/refund-pin?companyId=${encodeURIComponent(companyId)}`)
      const d = await r.json().catch(() => null)
      if (r.ok && d) setSt({ ready: d.ready !== false, pinSet: !!d.pinSet, isOwner: !!d.isOwner, locked: !!d.locked, setAt: d.setAt || null })
    } catch {}
  }, [companyId])
  useEffect(() => { load() }, [load])

  const reset = () => { setMode('idle'); setCur(''); setPin(''); setPin2(''); setErr('') }

  const submit = async () => {
    setErr(''); setOk('')
    if (mode !== 'off') {
      if (pin.length < 4) { setErr('Use 4 to 8 digits.'); return }
      if (pin !== pin2) { setErr('The two PINs don’t match.'); return }
    }
    if ((mode === 'change' || mode === 'off') && cur.length < 4) { setErr('Enter the current PIN.'); return }
    setBusy(true)
    try {
      const r = await authFetch('/api/refund-pin', {
        method: mode === 'off' ? 'DELETE' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(mode === 'off' ? { companyId, currentPin: cur } : { companyId, pin, ...(mode === 'change' ? { currentPin: cur } : {}) }),
      })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) { setErr(d.error || 'Could not save.'); if (d.code === 'refund_pin_wrong') setCur(''); return }
      setOk(mode === 'off' ? 'Refund PIN turned off.' : mode === 'change' ? 'Refund PIN changed.' : 'Refund PIN turned on. Every refund now asks for it.')
      reset(); load()
      setTimeout(() => setOk(''), 5000)
    } finally { setBusy(false) }
  }

  if (!st) return null
  return (
    <div className="st-sec rsec">
      <style>{RSEC_CSS}</style>
      <h2 className="rsec-h">
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M12 3 4 6v6c0 4.5 3.4 8.3 8 9 4.6-.7 8-4.5 8-9V6l-8-3Z" /><path d="m9 12 2 2 4-4" /></svg>
        Refund security
      </h2>
      <p className="rsec-sub">Refunds send money back to the customer through your store or Stripe. Only the owner, admins and people you turn on <b>Issue refunds</b> for can issue them, on the web and in the app.</p>

      <div className="rsec-row">
        <span className="rsec-row-t"><b>Who can refund</b><small>Owners and admins always. Agents only when turned on for them.</small></span>
        <Link href="/admin/team" className="rsec-pill">Team</Link>
      </div>

      <div className="rsec-row">
        <span className="rsec-row-t">
          <b>Refund PIN</b>
          <small>{st.pinSet ? `On${st.setAt ? ` since ${new Date(st.setAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}` : ''}. Every refund asks for it.` : 'Off. Turn it on so every refund asks for a PIN only the people you tell know.'}</small>
        </span>
        <span className={`rsec-state${st.pinSet ? ' on' : ''}`}>{st.pinSet ? 'On' : 'Off'}</span>
      </div>
      {st.locked && <p className="rsec-warn">Refunds are locked for a few minutes after too many wrong PINs.</p>}

      {!st.ready ? (
        <p className="rsec-note">The refund PIN needs a database update first (migration COLVY_V423).</p>
      ) : !st.isOwner ? (
        <p className="rsec-note">Only the workspace owner can turn the refund PIN on, change it or turn it off.</p>
      ) : mode === 'idle' ? (
        <div className="rsec-acts">
          {st.pinSet ? <>
            <button type="button" className="rsec-btn" onClick={() => { reset(); setMode('change') }}>Change PIN</button>
            <button type="button" className="rsec-btn ghost" onClick={() => { reset(); setMode('off') }}>Turn off</button>
          </> : <button type="button" className="rsec-btn primary" onClick={() => { reset(); setMode('set') }}>Turn on refund PIN</button>}
        </div>
      ) : (
        <div className="rsec-form">
          {(mode === 'change' || mode === 'off') && (
            <label className="rsec-f"><span>Current PIN</span>
              <input type="password" inputMode="numeric" autoComplete="off" value={cur} onChange={e => setCur(digits(e.target.value))} placeholder="••••" autoFocus /></label>
          )}
          {mode !== 'off' && <>
            <label className="rsec-f"><span>{mode === 'change' ? 'New PIN' : 'PIN'}</span>
              <input type="password" inputMode="numeric" autoComplete="new-password" value={pin} onChange={e => setPin(digits(e.target.value))} placeholder="4 to 8 digits" autoFocus={mode === 'set'} /></label>
            <label className="rsec-f"><span>Type it again</span>
              <input type="password" inputMode="numeric" autoComplete="new-password" value={pin2} onChange={e => setPin2(digits(e.target.value))} placeholder="••••" /></label>
          </>}
          {mode !== 'off' && <p className="rsec-hint">Avoid 1111 or 1234. Tell only the people who should refund. Five wrong tries lock refunds for 15 minutes. Forgot it? Colvy support can clear it.</p>}
          {err && <p className="rsec-err" role="alert">{err}</p>}
          <div className="rsec-acts">
            <button type="button" className="rsec-btn ghost" onClick={reset} disabled={busy}>Cancel</button>
            <button type="button" className="rsec-btn primary" onClick={submit} disabled={busy}>
              {busy ? 'Saving…' : mode === 'off' ? 'Turn off PIN' : mode === 'change' ? 'Change PIN' : 'Turn on PIN'}
            </button>
          </div>
        </div>
      )}
      {ok && <p className="rsec-ok" role="status">{ok}</p>}
    </div>
  )
}

const RSEC_CSS = `
.rsec-h{display:flex;align-items:center;gap:8px;font-size:16px;font-weight:700;color:var(--ink);margin:0 0 6px}
.rsec-h svg{color:var(--coral,#ff7a6b)}
.rsec-sub{margin:0 0 6px;font-size:13.5px;line-height:1.5;color:var(--slate,#71717a)}
.rsec-row{display:flex;align-items:center;justify-content:space-between;gap:14px;padding:14px 0;border-bottom:1px solid var(--border)}
.rsec-row-t{display:flex;flex-direction:column;gap:3px;min-width:0}
.rsec-row-t b{font-size:14px;font-weight:600;color:var(--ink)}
.rsec-row-t small{font-size:12.5px;line-height:1.4;color:var(--slate,#71717a)}
.rsec-pill{flex-shrink:0;display:inline-flex;align-items:center;height:34px;padding:0 14px;border-radius:999px;background:#f4f4f5;color:var(--ink);font-size:13px;font-weight:650;text-decoration:none}
.rsec-state{flex-shrink:0;display:inline-flex;align-items:center;height:28px;padding:0 12px;border-radius:999px;background:#f4f4f5;color:var(--slate,#71717a);font-size:12.5px;font-weight:700}
.rsec-state.on{background:#dcfce7;color:#047857}
.rsec-acts{display:flex;gap:8px;flex-wrap:wrap;margin-top:14px}
.rsec-btn{height:40px;padding:0 18px;border-radius:999px;border:none;background:#f4f4f5;color:var(--ink);font:inherit;font-size:14px;font-weight:650;cursor:pointer}
.rsec-btn.primary{background:var(--coral,#ff7a6b);color:#fff;box-shadow:inset 0 1px 0 rgba(255,255,255,.22),0 1px 2px rgba(16,24,40,.12)}
.rsec-btn.ghost{background:transparent;box-shadow:inset 0 0 0 1.5px #e4e4e7}
.rsec-btn:disabled{opacity:.55;cursor:default}
.rsec-form{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:12px;margin-top:14px;max-width:560px}
.rsec-form>.rsec-hint,.rsec-form>.rsec-err,.rsec-form>.rsec-acts{grid-column:1/-1}
.rsec-f{display:flex;flex-direction:column;gap:6px;font-size:13px;font-weight:600;color:var(--ink)}
.rsec-f input{height:46px;padding:0 14px;border-radius:14px;border:1.5px solid transparent;background:#f4f4f5;font:inherit;font-size:18px;font-weight:700;letter-spacing:.3em;color:var(--ink);outline:none;box-sizing:border-box}
.rsec-f input::placeholder{font-size:14px;font-weight:500;letter-spacing:normal;color:#a1a1aa}
.rsec-f input:focus{background:var(--card,#fff);border-color:color-mix(in srgb,var(--coral,#ff7a6b) 55%,transparent)}
.rsec-hint,.rsec-note{margin:12px 0 0;font-size:12.5px;line-height:1.45;color:var(--slate,#71717a)}
.rsec-err{margin:0;padding:10px 13px;border-radius:14px;background:#fef2f2;color:#dc2626;font-size:13px;font-weight:600}
.rsec-warn{margin:10px 0 0;padding:10px 13px;border-radius:14px;background:#fff7ed;color:#9a3412;font-size:13px}
.rsec-ok{margin:12px 0 0;font-size:13px;font-weight:600;color:#059669}
[data-theme="dark"] .rsec-pill,[data-theme="dark"] .rsec-state,[data-theme="dark"] .rsec-btn:not(.primary):not(.ghost),[data-theme="dark"] .rsec-f input{background:#2a2a2e}
[data-theme="dark"] .rsec-state.on{background:rgba(16,185,129,.16);color:#6ee7b7}
[data-theme="dark"] .rsec-btn.ghost{box-shadow:inset 0 0 0 1.5px #3a3a3f}
`
