'use client'

import { useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { StatusMark } from '@/components/StatusMark'

// The page a customer lands on after a pay link (or saving a card): branded
// with the BUSINESS they paid — its logo, name and colour — not Colvy, and
// sitting near the top of the screen rather than floating in the middle.
// ?c=<companyId> (and ?session_id= from Stripe) come from the return URLs.

type Brand = { name: string | null; logo_url: string | null; accent_color: string | null }
type Payment = { paid: boolean; amount: number | null; currency: string; description: string | null; receipt_url: string | null; receipt_to: string | null; card_saved: boolean }
type Kind = 'success' | 'cancelled' | 'card-saved'

const money = (n: number, cur: string) => `$${n.toFixed(2)} ${cur}`
const Receipt = () => <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ display: 'inline-block' }}><path d="M4 2v20l3-2 3 2 3-2 3 2 3-2 1 .7V2l-1 .7-3-2-3 2-3-2-3 2-3-2z" /><line x1="8" y1="8" x2="16" y2="8" /><line x1="8" y1="12" x2="16" y2="12" /></svg>

export default function PayResult({ kind }: { kind: Kind }) {
  const params = useSearchParams()
  const c = params.get('c')
  const sessionId = params.get('session_id')
  const [brand, setBrand] = useState<Brand | null>(null)
  const [payment, setPayment] = useState<Payment | null>(null)
  const [loaded, setLoaded] = useState(!c && !sessionId)

  useEffect(() => {
    if (!c && !sessionId) return
    const q = [c ? `c=${encodeURIComponent(c)}` : '', sessionId && kind !== 'cancelled' ? `session_id=${encodeURIComponent(sessionId)}` : ''].filter(Boolean).join('&')
    fetch(`/api/pay/summary?${q}`)
      .then(r => r.json()).then(d => { setBrand(d.brand || null); setPayment(d.payment || null) })
      .catch(() => {}).finally(() => setLoaded(true))
  }, [c, sessionId, kind])

  const accent = brand?.accent_color || '#ff6b57'
  const name = brand?.name || null

  return (
    <div className="pr-page" style={{ ['--pr-accent' as any]: accent }}>
      <style>{CSS}</style>
      <div className={`pr-card ${loaded ? 'in' : ''}`}>
        {name && (
          <div className="pr-brand">
            {brand?.logo_url
              ? <img src={brand.logo_url} alt="" className="pr-logo" />
              : <span className="pr-logo pr-initial">{name[0]}</span>}
            <span className="pr-name">{name}</span>
          </div>
        )}
        <div className="pr-body">
          {kind === 'cancelled' ? (
            <>
              <h1 className="pr-h">Payment cancelled</h1>
              <p className="pr-p">No charge was made. You can go back to your messages{name ? ` with ${name}` : ''} and pay whenever you’re ready.</p>
            </>
          ) : kind === 'card-saved' ? (
            <>
              <div className="pr-mark"><StatusMark kind="success" size={76} celebrate /></div>
              <h1 className="pr-h rise" style={{ animationDelay: '.5s' }}>Card saved</h1>
              <p className="pr-p rise" style={{ animationDelay: '.6s' }}>{name ? `${name} can` : 'The business can'} now charge it when you ask them to — you won’t need to enter it again. Stripe keeps your card details safe; they’re never shared.</p>
              <p className="pr-close rise" style={{ animationDelay: '.7s' }}>You can close this window.</p>
            </>
          ) : (
            <>
              <div className="pr-mark"><StatusMark kind="success" size={76} celebrate /></div>
              <h1 className="pr-h rise" style={{ animationDelay: '.5s' }}>Thank you — payment received</h1>
              {payment?.amount != null && (
                <p className="pr-amount rise" style={{ animationDelay: '.58s' }}>
                  {money(payment.amount, payment.currency)}{name ? ` paid to ${name}` : ''}
                  {payment.description && <span className="pr-desc">{payment.description}</span>}
                </p>
              )}
              <p className="pr-p rise" style={{ animationDelay: '.66s' }}>
                {payment?.receipt_to ? <>Your payment has gone through. A receipt is on its way to <b>{payment.receipt_to}</b>.</> : 'Your payment has gone through.'}
              </p>
              {payment?.receipt_url && (
                <a className="pr-receipt rise" style={{ animationDelay: '.74s' }} href={payment.receipt_url} target="_blank" rel="noopener noreferrer"><Receipt /> View receipt</a>
              )}
              <p className="pr-close rise" style={{ animationDelay: '.82s' }}>You can now close this window.</p>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

const CSS = `
.pr-page{min-height:100vh;box-sizing:border-box;display:flex;justify-content:center;align-items:flex-start;padding:max(6vh,24px) 16px 40px;background:var(--canvas,#f6f7f9);font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif}
.pr-card{width:100%;max-width:440px;background:#fff;border-radius:22px;overflow:hidden;box-shadow:0 24px 60px -28px rgba(0,0,0,.25);opacity:0;transform:translate3d(0,14px,0) scale(.985)}
.pr-card.in{animation:prIn .6s cubic-bezier(.22,1,.36,1) forwards}
.pr-brand{display:flex;align-items:center;gap:12px;padding:18px 22px;border-bottom:1px solid #f0f0f2}
.pr-logo{width:40px;height:40px;border-radius:11px;object-fit:cover;flex-shrink:0}
.pr-initial{display:inline-flex;align-items:center;justify-content:center;background:var(--pr-accent);color:#fff;font-weight:800;font-size:17px}
.pr-name{font-size:15.5px;font-weight:700;color:#111827}
.pr-body{padding:30px 26px 28px;text-align:center}
.pr-mark{margin-bottom:16px}
.pr-h{margin:0 0 8px;font-size:22px;font-weight:800;color:#111827;line-height:1.25}
.pr-amount{margin:0 0 10px;font-size:15px;font-weight:700;color:#111827}
.pr-desc{display:block;margin-top:2px;font-size:13.5px;font-weight:500;color:#6b7280}
.pr-p{margin:0 0 10px;font-size:14px;color:#6b7280;line-height:1.55}
.pr-receipt{display:inline-flex;align-items:center;gap:6px;margin:4px 0 14px;padding:9px 14px;border-radius:11px;border:1px solid #e5e7eb;color:#111827;font-size:13.5px;font-weight:700;text-decoration:none;transition:border-color .2s ease,transform .15s cubic-bezier(.22,1,.36,1)}
.pr-receipt:hover{border-color:var(--pr-accent)}.pr-receipt:active{transform:scale(.97)}
.pr-close{margin:0;font-size:13.5px;font-weight:600;color:#111827}
.rise{animation:prRise .5s cubic-bezier(.22,1,.36,1) backwards}
@keyframes prIn{to{opacity:1;transform:none}}
@keyframes prRise{from{opacity:0;transform:translate3d(0,10px,0)}to{opacity:1;transform:none}}
@media (prefers-reduced-motion: reduce){.pr-card,.pr-card.in,.rise{animation:none;opacity:1;transform:none}}
`
