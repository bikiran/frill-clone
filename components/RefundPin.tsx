'use client'

import { authFetch } from '@/lib/auth-fetch'
import { useEffect, useState } from 'react'

// The refund PIN in the refund windows (order refund, DOA refund / credit,
// payment-link refund). The server is what enforces it (lib/refund-guard); this
// only asks for it when the workspace has one, and says plainly when the person
// isn't allowed to refund at all.

export type RefundAccess = { loading: boolean; pinSet: boolean; canRefund: boolean; locked: boolean }

export function useRefundAccess(companyId: string | null | undefined): RefundAccess {
  const [s, setS] = useState<RefundAccess>({ loading: true, pinSet: false, canRefund: true, locked: false })
  useEffect(() => {
    if (!companyId) return
    let off = false
    authFetch(`/api/refund-pin?companyId=${encodeURIComponent(companyId)}`)
      .then(r => (r.ok ? r.json() : null))
      .then(d => { if (!off) setS({ loading: false, pinSet: !!d?.pinSet, canRefund: d ? d.canRefund !== false : true, locked: !!d?.locked }) })
      .catch(() => { if (!off) setS(v => ({ ...v, loading: false })) })
    return () => { off = true }
  }, [companyId])
  return s
}

/** A server answer that means "ask for the PIN (again)". */
export const isPinError = (code: unknown) => code === 'refund_pin_required' || code === 'refund_pin_wrong'

export function RefundPinField({ value, onChange, autoFocus, id = 'refund-pin' }: { value: string; onChange: (v: string) => void; autoFocus?: boolean; id?: string }) {
  return (
    <div className="rpin">
      <style>{RPIN_CSS}</style>
      <label className="rpin-l" htmlFor={id}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><rect x="4" y="11" width="16" height="10" rx="2.5" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></svg>
        Refund PIN
      </label>
      <input id={id} className="rpin-in" type="password" inputMode="numeric" pattern="[0-9]*" autoComplete="off" maxLength={8}
        placeholder="••••" value={value} autoFocus={autoFocus}
        onChange={e => onChange(e.target.value.replace(/\D/g, '').slice(0, 8))} aria-describedby={`${id}-h`} />
      <p className="rpin-h" id={`${id}-h`}>Your business asks for its refund PIN before any money goes back.</p>
    </div>
  )
}

export function RefundNotAllowed() {
  return (
    <>
      <style>{RPIN_CSS}</style>
      <p className="rpin-no" role="note">
        You don’t have permission to issue refunds. The owner can turn on <b>Issue refunds</b> for you on the Team page.
      </p>
    </>
  )
}

const RPIN_CSS = `
.rpin{margin-top:14px}
.rpin-l{display:inline-flex;align-items:center;gap:6px;margin-bottom:6px;font-size:13px;font-weight:700;color:var(--ink)}
.rpin-l svg{color:var(--coral,#ff7a6b)}
.rpin .rpin-in{width:100%;height:50px;padding:0 16px;border:1.5px solid transparent;border-radius:16px;background:var(--rpin-fill,#f4f4f5);color:var(--ink);font:inherit;font-size:20px;font-weight:700;letter-spacing:.35em;outline:none;box-sizing:border-box;box-shadow:none}
.rpin .rpin-in:focus{background:var(--card,#fff);border-color:color-mix(in srgb,var(--coral,#ff7a6b) 55%,transparent)}
.rpin .rpin-in::placeholder{letter-spacing:.35em;color:color-mix(in srgb,var(--slate,#71717a) 60%,transparent)}
.rpin-h{margin:6px 2px 0;font-size:12px;color:var(--slate,#71717a)}
.rpin-no{margin:14px 0 0;padding:11px 13px;border-radius:14px;background:#fff7ed;color:#9a3412;font-size:13px;line-height:1.45}
[data-theme="dark"] .rpin{--rpin-fill:#2a2a2e}
[data-theme="dark"] .rpin-no{background:rgba(234,88,12,.14);color:#fdba74}
`
