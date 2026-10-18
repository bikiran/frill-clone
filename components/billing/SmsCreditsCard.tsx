'use client'

// Billing → SMS credits. Prepaid credit for texts beyond the plan's monthly
// allowance: the balance, this month's allowance, the rate (and volume tiers),
// top-up packs and a custom amount, auto top-up, and the ledger with CSV export.
// Reads /api/sms-credits; tops up through /api/sms-credits/topup (Stripe
// Checkout); settings through /api/sms-credits/settings. Money actions are
// owner / admin only (the API checks; the card just hides them).
// The company's SMS billing policy (d.policy, lib/sms-policy) decides what
// shows: unlimited texts, no SMS, an allowance with no credit, or the wallet
// with top-ups (hidden when Colvy manages them) and auto top-up (hidden when
// not allowed). The topup / settings routes enforce the same rules.

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { authFetch } from '@/lib/auth-fetch'
import { alertDialog, confirmDialog } from '@/components/ConfirmDialog'
import { showBillingUnavailable } from '@/components/BillingUnavailable'
import SmsLowBalanceBanner from '@/components/billing/SmsLowBalanceBanner'
import {
  fmtCents, fmtRate, fmtSignedCents, ledgerLabel, parseAudToCents, tierLines, validateTopUpCents,
  MIN_TOPUP_CENTS, SMS_CREDIT_PACKS_CENTS, type LedgerRow,
} from '@/lib/sms-credits-core'
import { COLVY_CONTACT } from '@/lib/colvy-contact'

const THRESHOLDS = [500, 1000, 2000, 5000]

const Ico = {
  sms: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/><line x1="8" y1="9" x2="16" y2="9"/><line x1="8" y1="13" x2="13" y2="13"/></svg>,
  download: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>,
  card: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="1" y="4" width="22" height="16" rx="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg>,
  check: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12"/></svg>,
  info: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>,
  lock: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>,
  refresh: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>,
}

const fmtDate = (d: string) => {
  const t = new Date(d)
  return Number.isFinite(t.getTime()) ? t.toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' }) : ''
}
const fmtTime = (d: string) => {
  const t = new Date(d)
  return Number.isFinite(t.getTime()) ? t.toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit' }) : ''
}
const nextMonthStart = () => {
  const d = new Date()
  return new Date(d.getFullYear(), d.getMonth() + 1, 1).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })
}
const brandName = (b?: string | null) => (b ? b.charAt(0).toUpperCase() + b.slice(1) : 'Card')

/** "Contact us" with Colvy's email and phone, for things Colvy manages. */
function ContactUs() {
  return <>Contact us at <a href={COLVY_CONTACT.mailHref} className="font-semibold hover:underline" style={{ color: 'var(--coral)' }}>{COLVY_CONTACT.email}</a> or <a href={COLVY_CONTACT.telHref} className="font-semibold hover:underline whitespace-nowrap" style={{ color: 'var(--coral)' }}>{COLVY_CONTACT.phoneDisplay}</a>.</>
}

function Note({ icon, children, tone = 'plain', className = '' }: { icon: React.ReactNode; children: React.ReactNode; tone?: 'plain' | 'good'; className?: string }) {
  const good = tone === 'good'
  return (
    <div className={`flex items-start gap-3 p-4 rounded-xl text-sm ${className}`} style={good ? { background: '#ecfdf3', border: '1px solid #abefc6', color: '#067647' } : { background: 'var(--canvas)', border: '1px solid var(--border)', color: 'var(--slate)' }}>
      <span className="shrink-0 mt-px">{icon}</span>
      <div style={{ margin: 0, lineHeight: 1.5, minWidth: 0 }}>{children}</div>
    </div>
  )
}

function Shell({ children, right }: { children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <section id="sms-credits" className="bg-white rounded-2xl border p-5 md:p-6 mb-6" style={{ borderColor: 'var(--border)', scrollMarginTop: 80 }}>
      <div className="flex items-start justify-between gap-3 flex-wrap mb-5">
        <div className="flex items-start gap-3" style={{ minWidth: 0 }}>
          <span className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ background: 'var(--peach)', color: 'var(--coral)' }}>{Ico.sms}</span>
          <div style={{ minWidth: 0 }}>
            <h2 className="font-bold" style={{ color: 'var(--ink)' }}>SMS credits</h2>
            <p className="text-sm mt-0.5" style={{ color: 'var(--slate)', lineHeight: 1.5 }}>Prepaid credit for texts beyond your plan’s monthly allowance. Top up when you need to: no bills after the fact, no surprises.</p>
          </div>
        </div>
        {right}
      </div>
      {children}
    </section>
  )
}

const tile: React.CSSProperties = { background: 'var(--canvas)', border: '1px solid var(--border)', borderRadius: 14, padding: 16, minWidth: 0 }
const tileLabel = 'text-xs font-semibold uppercase tracking-wide'

export default function SmsCreditsCard({ companyId, companyName, initial }: { companyId?: string | null; companyName?: string | null; initial?: any }) {
  const [d, setD] = useState<any>(initial || null)
  const [loading, setLoading] = useState(!initial)
  const [err, setErr] = useState('')
  const [pack, setPack] = useState<number | 'custom'>(SMS_CREDIT_PACKS_CENTS[0])
  const [custom, setCustom] = useState('')
  const [saveCard, setSaveCard] = useState(false)
  const [threshold, setThreshold] = useState(1000)
  const [autoAmount, setAutoAmount] = useState<number>(SMS_CREDIT_PACKS_CENTS[0])
  const [autoOn, setAutoOn] = useState(false)
  const [busy, setBusy] = useState('')
  const [notice, setNotice] = useState('')
  const [waiting, setWaiting] = useState(false)
  const topUpRef = useRef<HTMLDivElement>(null)

  const syncSettings = (data: any) => {
    const a = data?.wallet?.autoTopUp
    if (a) { setThreshold(a.thresholdCents || 1000); setAutoAmount(a.amountCents || SMS_CREDIT_PACKS_CENTS[0]); setAutoOn(!!a.enabled) }
  }
  const load = async (quiet = false) => {
    if (!companyId) return null
    if (!quiet) setLoading(true)
    try {
      const res = await authFetch(`/api/sms-credits?companyId=${encodeURIComponent(companyId)}`)
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { setErr(data.error || 'Couldn’t load SMS credits.'); return null }
      setErr(''); setD(data); syncSettings(data)
      return data
    } catch { setErr('Couldn’t load SMS credits. Check your connection and try again.'); return null }
    finally { if (!quiet) setLoading(false) }
  }

  useEffect(() => {
    if (initial) { syncSettings(initial); return }
    let stop = false
    ;(async () => {
      const first = await load()
      // Billing loads its parts one after another, so a #sms-credits link lands before this card exists.
      if (typeof window !== 'undefined' && window.location.hash === '#sms-credits') setTimeout(() => document.getElementById('sms-credits')?.scrollIntoView({ block: 'start' }), 60)
      // Back from Stripe Checkout: the webhook can land a few seconds after the redirect.
      if (typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('sms_credit') === '1') {
        setWaiting(true)
        const startBalance = first?.wallet?.balanceCents ?? 0
        const startRows = first?.ledger?.length ?? 0
        for (let i = 0; i < 10 && !stop; i++) {
          await new Promise(r => setTimeout(r, 3000))
          const next = await load(true)
          if (next && (next.wallet?.balanceCents !== startBalance || (next.ledger?.length ?? 0) !== startRows)) { setNotice('Payment received. Your SMS credit is ready to use.'); break }
        }
        setWaiting(false)
        try { window.history.replaceState(null, '', window.location.pathname + '#sms-credits') } catch {}
      }
    })()
    return () => { stop = true }
  }, [companyId])

  if (loading) {
    return <Shell><div className="grid gap-4 lg:grid-cols-3">{[0, 1, 2].map(i => <div key={i} className="h-28 rounded-xl animate-pulse" style={{ background: 'var(--canvas)' }} />)}</div></Shell>
  }
  if (err && !d) {
    return <Shell right={<button onClick={() => load()} className="flex items-center gap-1.5 px-3 py-2 rounded-xl border text-sm font-medium cursor-pointer hover:bg-gray-50" style={{ borderColor: 'var(--border)', color: 'var(--ink)' }}>{Ico.refresh}Try again</button>}><p className="text-sm" style={{ color: 'var(--slate)' }}>{err}</p></Shell>
  }
  if (!d) return null
  const policy = d.policy || {}
  const allowance = d.allowance || {}
  const mode: string = policy.mode || (allowance.unlimited ? 'unlimited' : allowance.entitled === false ? 'disabled' : 'allowance_then_credit')

  if (mode === 'disabled' || (d.ready && !allowance.entitled)) {
    return (
      <Shell>
        <Note icon={Ico.info}>
          {policy.blockReason === 'sms_disabled'
            ? <p style={{ margin: 0 }}><strong style={{ color: 'var(--ink)' }}>SMS isn’t included for your account.</strong> Texting has been switched off by Colvy. <ContactUs /></p>
            : <p style={{ margin: 0 }}><strong style={{ color: 'var(--ink)' }}>SMS isn’t included in your plan.</strong> The Inbox and Everything plans include 3,000 texts a month, and you can top up with SMS credits for more.</p>}
        </Note>
      </Shell>
    )
  }
  if (mode === 'unlimited') {
    return (
      <Shell>
        <Note icon={Ico.check} tone="good">
          <p style={{ margin: 0 }}><strong>Unlimited texts on your plan.</strong> Texts are included in your plan, so you don’t need SMS credits.</p>
        </Note>
      </Shell>
    )
  }
  if (!d.ready) {
    return (
      <Shell>
        <Note icon={Ico.info}><p style={{ margin: 0 }}>SMS credits aren’t set up yet. Texts within your plan’s monthly allowance work as usual.</p></Note>
      </Shell>
    )
  }

  const w = d.wallet
  const pricing = { price_per_part: d.pricing?.price_per_part ?? 0.15, volume_tiers: d.pricing?.volume_tiers || [], gst_rate: 0.1, gst_inclusive: true, carrier_cost: 0, carrier_currency: 'USD', fx_rate: 1 }
  const ledger: LedgerRow[] = d.ledger || []
  const campaigns: Record<string, string> = d.campaigns || {}
  const allowanceOnly = mode === 'allowance_only'
  const creditOnly = mode === 'credit_only'
  // Older answers (before policies) had no policy: top-ups were always on.
  const canTopUp = policy.canTopUp ?? !allowanceOnly
  const canAutoTopUp = policy.canAutoTopUp ?? canTopUp

  const limit = Number(allowance.limit) || 0
  const used = Number(allowance.used) || 0
  const left = Math.max(0, limit - used)
  const pct = limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 0
  const textsFor = (cents: number) => Math.floor((cents * 100) / Math.max(1, Math.round(pricing.price_per_part * 10000)))
  const customCents = parseAudToCents(custom)
  const amountCents = pack === 'custom' ? customCents : pack
  const amountCheck = validateTopUpCents(amountCents)
  const canManage = !!d.canManage
  const shopify = !!d.billedByShopify

  const scrollToTopUp = () => topUpRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })

  const topUp = async () => {
    if (!companyId || !amountCheck.ok) return
    setBusy('topup')
    try {
      const res = await authFetch('/api/sms-credits/topup', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ companyId, amountCents: amountCheck.cents, ...(saveCard && !w.card && canAutoTopUp ? { autoTopUp: { thresholdCents: threshold, amountCents: autoAmount } } : {}) }),
      })
      const data = await res.json().catch(() => ({}))
      if (data.setup) { setBusy(''); await showBillingUnavailable({ what: `SMS credit (${fmtCents(amountCheck.cents)})`, workspace: companyName || null }); return }
      if (data.url) { window.location.href = data.url; return }
      await alertDialog({ title: 'Couldn’t start the top-up', message: data.error || 'Please try again in a minute.' })
    } catch (e: any) { await alertDialog({ title: 'Couldn’t start the top-up', message: e?.message || 'Please try again in a minute.' }) }
    setBusy('')
  }

  const saveSettings = async (extra: any = {}) => {
    if (!companyId) return
    setBusy(extra.removeCard ? 'remove' : 'settings'); setNotice('')
    try {
      const res = await authFetch('/api/sms-credits/settings', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ companyId, enabled: autoOn, thresholdCents: threshold, amountCents: autoAmount, ...extra }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { await alertDialog({ title: 'Couldn’t save', message: data.error || 'Please try again in a minute.' }); return }
      setD((prev: any) => ({ ...prev, wallet: data.wallet })); syncSettings({ wallet: data.wallet })
      setNotice(extra.removeCard ? 'Card removed. Auto top-up is off.' : 'Auto top-up settings saved.')
    } catch (e: any) { await alertDialog({ title: 'Couldn’t save', message: e?.message || 'Please try again in a minute.' }) }
    finally { setBusy('') }
  }

  const removeCard = async () => {
    const go = await confirmDialog({ title: 'Remove the saved card?', message: 'Auto top-up switches off. You can save a card again with your next top-up.', confirmLabel: 'Remove card', cancelLabel: 'Keep it', tone: 'danger' })
    if (go) await saveSettings({ removeCard: true })
  }

  const exportCsv = async () => {
    if (!companyId) return
    setBusy('csv')
    try {
      const res = await authFetch(`/api/sms-credits?companyId=${encodeURIComponent(companyId)}&format=csv`)
      if (!res.ok) throw new Error('Couldn’t export the ledger.')
      const blob = await res.blob()
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      a.download = `sms-credits-${new Date().toISOString().slice(0, 10)}.csv`
      document.body.appendChild(a); a.click(); a.remove()
      setTimeout(() => URL.revokeObjectURL(a.href), 2000)
    } catch (e: any) { await alertDialog({ title: 'Couldn’t export', message: e?.message || 'Please try again.' }) }
    finally { setBusy('') }
  }

  const autoDirty = !!w.card && (autoOn !== !!w.autoTopUp?.enabled || threshold !== w.autoTopUp?.thresholdCents || autoAmount !== w.autoTopUp?.amountCents)
  const select: React.CSSProperties = { padding: '9px 12px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--card, #fff)', color: 'var(--ink)', fontSize: 14, width: '100%' }

  return (
    <Shell right={ledger.length > 0 ? (
      <button onClick={exportCsv} disabled={busy === 'csv'} className="flex items-center gap-1.5 px-3 py-2 rounded-xl border text-sm font-medium cursor-pointer hover:bg-gray-50 disabled:opacity-60" style={{ borderColor: 'var(--border)', color: 'var(--ink)' }}>
        {Ico.download}{busy === 'csv' ? 'Exporting…' : 'Export CSV'}
      </button>
    ) : undefined}>
      {waiting && (
        <div role="status" className="mb-4 flex items-center gap-2 p-3.5 rounded-xl text-sm" style={{ background: 'var(--canvas)', border: '1px solid var(--border)', color: 'var(--slate)' }}>
          <span className="w-3.5 h-3.5 rounded-full border-2 animate-spin shrink-0" style={{ borderColor: 'var(--coral)', borderTopColor: 'transparent' }} />
          Confirming your payment with Stripe…
        </div>
      )}
      {notice && (
        <div role="status" className="mb-4 flex items-center gap-2 p-3.5 rounded-xl text-sm" style={{ background: '#ecfdf3', border: '1px solid #abefc6', color: '#067647' }}>
          <span className="shrink-0">{Ico.check}</span>{notice}
        </div>
      )}
      {d.low && (
        <div className="mb-4">
          <SmsLowBalanceBanner balanceCents={w.balanceCents} pricePerPart={pricing.price_per_part} thresholdCents={w.autoTopUp?.enabled ? w.autoTopUp.thresholdCents : undefined} autoTopUp={!!w.autoTopUp?.enabled} onTopUp={canManage && !shopify && canTopUp ? scrollToTopUp : undefined} canTopUp={canTopUp} force />
        </div>
      )}

      {/* Balance · allowance · rate */}
      <div className={`grid gap-4 ${allowanceOnly ? '' : 'md:grid-cols-3'}`}>
        {!allowanceOnly && <div style={tile}>
          <p className={tileLabel} style={{ color: 'var(--slate)' }}>Balance</p>
          <p className="text-3xl font-black mt-1.5" style={{ color: 'var(--ink)' }}>{fmtCents(w.balanceCents)}</p>
          <p className="text-sm mt-1" style={{ color: 'var(--slate)' }}>About {textsFor(w.balanceCents).toLocaleString('en-AU')} texts at {fmtRate(pricing.price_per_part)}</p>
          {w.heldCents > 0 && <p className="text-xs mt-2" style={{ color: 'var(--slate)' }}>Plus {fmtCents(w.heldCents)} held for scheduled campaigns</p>}
        </div>}
        {creditOnly ? (
          <div style={tile}>
            <p className={tileLabel} style={{ color: 'var(--slate)' }}>This month’s allowance</p>
            <p className="text-3xl font-black mt-1.5" style={{ color: 'var(--ink)' }}>None</p>
            <p className="text-sm mt-2" style={{ color: 'var(--slate)' }}>Every text uses SMS credit. {used.toLocaleString('en-AU')} sent this month.</p>
          </div>
        ) : <div style={tile}>
          <p className={tileLabel} style={{ color: 'var(--slate)' }}>This month’s allowance</p>
          <p className="text-3xl font-black mt-1.5" style={{ color: 'var(--ink)' }}>{left.toLocaleString('en-AU')} <span className="text-sm font-semibold" style={{ color: 'var(--slate)' }}>left</span></p>
          <div className="mt-2.5 h-2 rounded-full overflow-hidden" style={{ background: 'var(--border)' }} role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Allowance used">
            <div className="h-full rounded-full" style={{ width: `${pct}%`, background: pct >= 100 ? '#d92d20' : pct >= 80 ? '#f59e0b' : 'var(--coral)' }} />
          </div>
          <p className="text-sm mt-2" style={{ color: 'var(--slate)' }}>{used.toLocaleString('en-AU')} of {limit.toLocaleString('en-AU')} used · resets {nextMonthStart()}</p>
        </div>}
        {!allowanceOnly && <div style={tile}>
          <p className={tileLabel} style={{ color: 'var(--slate)' }}>Rate per text</p>
          <p className="text-3xl font-black mt-1.5" style={{ color: 'var(--ink)' }}>{fmtRate(pricing.price_per_part)}</p>
          <ul className="mt-2 space-y-1">
            {tierLines(pricing as any).slice(1).map(t => (
              <li key={t.label} className="flex items-center justify-between gap-3 text-sm" style={{ color: 'var(--slate)' }}>
                <span>{t.label}</span><span className="font-semibold" style={{ color: 'var(--ink)' }}>{fmtRate(t.price)}</span>
              </li>
            ))}
          </ul>
        </div>}
      </div>
      {allowanceOnly ? (
        <Note icon={Ico.info} className="mt-4">
          <p style={{ margin: 0 }}>Your account includes {limit.toLocaleString('en-AU')} texts a month, without SMS credit: once they’re used, texts wait until the allowance resets on {nextMonthStart()}. A text over 160 characters (70 with emoji or special characters) counts as two or more. Need more? <ContactUs /></p>
        </Note>
      ) : (
        <p className="text-xs mt-3" style={{ color: 'var(--slate)', lineHeight: 1.55 }}>
          {creditOnly ? 'Every text is paid from SMS credit.' : 'Your monthly allowance is used first; only texts beyond it use credit.'} Bigger sends get a cheaper rate on every text in the send. A text over 160 characters (70 with emoji or special characters) counts as two or more. Prices include GST.
        </p>
      )}

      {/* Top up · auto top-up */}
      {allowanceOnly ? null : !canTopUp ? (
        <Note icon={Ico.lock} className="mt-5">
          <p style={{ margin: 0 }}><strong style={{ color: 'var(--ink)' }}>Top-ups are managed by Colvy for your account.</strong> We add SMS credit for you, so there’s nothing to buy here. <ContactUs /></p>
        </Note>
      ) : shopify ? (
        <div className="mt-5 flex items-start gap-3 p-4 rounded-xl text-sm" style={{ background: 'var(--canvas)', border: '1px solid var(--border)', color: 'var(--slate)' }}>
          <span className="shrink-0 mt-px">{Ico.info}</span>
          <p style={{ margin: 0, lineHeight: 1.5 }}>Your Colvy plan is billed through Shopify, so SMS credits can’t be bought by card here yet. Contact us and we’ll add credit for you.</p>
        </div>
      ) : !canManage ? (
        <div className="mt-5 flex items-start gap-3 p-4 rounded-xl text-sm" style={{ background: 'var(--canvas)', border: '1px solid var(--border)', color: 'var(--slate)' }}>
          <span className="shrink-0 mt-px">{Ico.lock}</span>
          <p style={{ margin: 0, lineHeight: 1.5 }}>Only the business owner or an admin can top up or change auto top-up.{w.autoTopUp?.enabled ? ` Auto top-up is on: ${fmtCents(w.autoTopUp.amountCents)} when the balance drops below ${fmtCents(w.autoTopUp.thresholdCents)}.` : ''}</p>
        </div>
      ) : (
        <div className="mt-5 grid gap-4 lg:grid-cols-2">
          <div ref={topUpRef} className="rounded-xl border p-4 md:p-5" style={{ borderColor: 'var(--border)', minWidth: 0 }}>
            <h3 className="font-bold" style={{ color: 'var(--ink)' }}>Top up</h3>
            <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-2" role="radiogroup" aria-label="Top-up amount">
              {SMS_CREDIT_PACKS_CENTS.map(c => {
                const on = pack === c
                return (
                  <button key={c} type="button" role="radio" aria-checked={on} onClick={() => setPack(c)}
                    className="rounded-xl border px-3 py-2.5 text-left cursor-pointer transition-colors"
                    style={{ borderColor: on ? 'var(--coral)' : 'var(--border)', background: on ? 'var(--peach)' : 'var(--card, #fff)', boxShadow: on ? '0 0 0 1px var(--coral)' : 'none' }}>
                    <span className="block font-bold" style={{ color: 'var(--ink)' }}>{fmtCents(c).replace('.00', '')}</span>
                    <span className="block text-xs mt-0.5" style={{ color: 'var(--slate)' }}>~{textsFor(c).toLocaleString('en-AU')} texts</span>
                  </button>
                )
              })}
            </div>
            <label className="mt-2 flex items-center gap-2 rounded-xl border px-3 py-2" style={{ borderColor: pack === 'custom' ? 'var(--coral)' : 'var(--border)', boxShadow: pack === 'custom' ? '0 0 0 1px var(--coral)' : 'none' }}>
              <span className="text-sm font-semibold shrink-0" style={{ color: 'var(--slate)' }}>Other amount A$</span>
              <input inputMode="decimal" value={custom} placeholder={`${MIN_TOPUP_CENTS / 100} or more`} aria-label="Other amount in dollars"
                onFocus={() => setPack('custom')} onChange={e => { setCustom(e.target.value); setPack('custom') }}
                className="flex-1 min-w-0 bg-transparent outline-none text-sm py-1" style={{ color: 'var(--ink)' }} />
            </label>
            {pack === 'custom' && custom && !amountCheck.ok && <p className="text-xs mt-1.5" style={{ color: '#b42318' }}>{amountCheck.error}</p>}

            {!w.card && canAutoTopUp && (
              <label className="mt-4 flex items-start gap-2.5 cursor-pointer text-sm" style={{ color: 'var(--ink)' }}>
                <input type="checkbox" checked={saveCard} onChange={e => setSaveCard(e.target.checked)} className="mt-0.5 w-4 h-4 accent-[var(--coral)]" />
                <span>Top up automatically when my balance runs low <span className="block text-xs mt-0.5" style={{ color: 'var(--slate)' }}>Saves this card with Stripe. Change or switch it off any time.</span></span>
              </label>
            )}
            {!w.card && saveCard && canAutoTopUp && (
              <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
                <label className="text-xs font-semibold" style={{ color: 'var(--slate)' }}>When the balance drops below
                  <select value={threshold} onChange={e => setThreshold(Number(e.target.value))} style={{ ...select, marginTop: 4 }}>{THRESHOLDS.map(t => <option key={t} value={t}>{fmtCents(t)}</option>)}</select>
                </label>
                <label className="text-xs font-semibold" style={{ color: 'var(--slate)' }}>Add
                  <select value={autoAmount} onChange={e => setAutoAmount(Number(e.target.value))} style={{ ...select, marginTop: 4 }}>{SMS_CREDIT_PACKS_CENTS.map(a => <option key={a} value={a}>{fmtCents(a)}</option>)}</select>
                </label>
              </div>
            )}

            <button onClick={topUp} disabled={!amountCheck.ok || busy === 'topup'}
              className="mt-4 w-full sm:w-auto px-5 py-2.5 rounded-xl text-sm font-bold text-white cursor-pointer transition-opacity hover:opacity-90 disabled:opacity-50 disabled:cursor-default"
              style={{ background: 'var(--coral)' }}>
              {busy === 'topup' ? 'Redirecting…' : amountCheck.ok ? `Pay ${fmtCents(amountCheck.cents)}` : 'Pay'}
            </button>
            <p className="text-xs mt-2" style={{ color: 'var(--slate)' }}>Paid securely by card through Stripe. Prices include GST.</p>
          </div>

          {!canAutoTopUp ? (
          <div className="rounded-xl border p-4 md:p-5" style={{ borderColor: 'var(--border)', minWidth: 0 }}>
            <h3 className="font-bold" style={{ color: 'var(--ink)' }}>Auto top-up</h3>
            <p className="mt-3 text-sm" style={{ color: 'var(--slate)', lineHeight: 1.5 }}>Auto top-up isn’t available for your account: Colvy manages it. Top up by hand when you need more. <ContactUs /></p>
          </div>
          ) : (
          <div className="rounded-xl border p-4 md:p-5" style={{ borderColor: 'var(--border)', minWidth: 0 }}>
            <div className="flex items-center justify-between gap-3">
              <h3 className="font-bold" style={{ color: 'var(--ink)' }}>Auto top-up</h3>
              <button type="button" role="switch" aria-checked={autoOn} aria-label="Auto top-up" disabled={!w.card}
                onClick={() => setAutoOn(v => !v)}
                className="relative inline-flex h-6 w-11 items-center rounded-full cursor-pointer transition-all disabled:cursor-not-allowed disabled:opacity-50"
                style={{ background: autoOn ? 'var(--coral)' : '#d1d5db' }}>
                <span className="inline-block h-4 w-4 rounded-full bg-white shadow transition-transform" style={{ transform: autoOn ? 'translateX(24px)' : 'translateX(4px)' }} />
              </button>
            </div>
            {w.card ? (
              <>
                <div className="mt-3 flex items-center justify-between gap-3 p-3 rounded-xl" style={{ background: 'var(--canvas)' }}>
                  <div className="flex items-center gap-2.5 text-sm" style={{ color: 'var(--ink)', minWidth: 0 }}>
                    <span style={{ color: 'var(--slate)' }}>{Ico.card}</span>
                    <span className="truncate">{brandName(w.card.brand)}{w.card.last4 ? ` ending ${w.card.last4}` : ''}</span>
                  </div>
                  <button onClick={removeCard} disabled={busy === 'remove'} className="text-sm font-medium cursor-pointer hover:underline shrink-0" style={{ color: 'var(--slate)' }}>{busy === 'remove' ? 'Removing…' : 'Remove'}</button>
                </div>
                <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <label className="text-xs font-semibold" style={{ color: 'var(--slate)' }}>When the balance drops below
                    <select value={threshold} onChange={e => setThreshold(Number(e.target.value))} style={{ ...select, marginTop: 4 }}>{(THRESHOLDS.includes(threshold) ? THRESHOLDS : [...THRESHOLDS, threshold].sort((a, b) => a - b)).map(t => <option key={t} value={t}>{fmtCents(t)}</option>)}</select>
                  </label>
                  <label className="text-xs font-semibold" style={{ color: 'var(--slate)' }}>Add
                    <select value={autoAmount} onChange={e => setAutoAmount(Number(e.target.value))} style={{ ...select, marginTop: 4 }}>{((SMS_CREDIT_PACKS_CENTS as readonly number[]).includes(autoAmount) ? [...SMS_CREDIT_PACKS_CENTS] : [...SMS_CREDIT_PACKS_CENTS, autoAmount].sort((a, b) => a - b)).map(a => <option key={a} value={a}>{fmtCents(a)}</option>)}</select>
                  </label>
                </div>
                {w.autoTopUp?.lastError && (
                  <p className="mt-3 text-sm p-3 rounded-xl" style={{ background: '#fef3f2', border: '1px solid #fecdca', color: '#b42318', lineHeight: 1.5 }}>
                    {w.autoTopUp.enabled ? 'The last automatic top-up failed: ' : 'Auto top-up was switched off after two failed payments: '}{w.autoTopUp.lastError}
                  </p>
                )}
                <div className="mt-4 flex items-center gap-3 flex-wrap">
                  <button onClick={() => saveSettings()} disabled={!autoDirty || busy === 'settings'}
                    className="px-4 py-2 rounded-xl text-sm font-bold cursor-pointer transition-opacity hover:opacity-90 disabled:opacity-50 disabled:cursor-default"
                    style={{ background: 'var(--ink)', color: 'var(--card, #fff)' }}>
                    {busy === 'settings' ? 'Saving…' : 'Save'}
                  </button>
                  <p className="text-xs" style={{ color: 'var(--slate)' }}>{autoOn ? `We’ll add ${fmtCents(autoAmount)} when your balance drops below ${fmtCents(threshold)}.` : 'Off: texts beyond your allowance stop when credit runs out.'}</p>
                </div>
              </>
            ) : (
              <p className="mt-3 text-sm" style={{ color: 'var(--slate)', lineHeight: 1.5 }}>
                Keep texts going without watching the balance: we charge your saved card when it drops below the amount you choose. To switch it on, tick <strong style={{ color: 'var(--ink)' }}>Top up automatically</strong> with your next top-up.
              </p>
            )}
          </div>
          )}
        </div>
      )}

      {/* Ledger */}
      <div className="mt-6">
        <h3 className="font-bold mb-3" style={{ color: 'var(--ink)' }}>Activity</h3>
        {ledger.length === 0 ? (
          <div className="text-center py-8 rounded-xl" style={{ background: 'var(--canvas)' }}>
            <p className="text-sm" style={{ color: 'var(--slate)' }}>No SMS credit activity yet</p>
            <p className="text-xs mt-1" style={{ color: 'var(--slate)' }}>Top-ups and texts beyond your allowance will appear here</p>
          </div>
        ) : (
          <>
          {/* Phones: one row per entry, no sideways scrolling. */}
          <ul className="md:hidden divide-y rounded-xl border" style={{ borderColor: 'var(--border)' }}>
            {ledger.map(r => (
              <li key={r.id} className="px-3.5 py-3" style={{ borderColor: 'var(--border)' }}>
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>{ledgerLabel(r)}</span>
                  <span className="text-sm font-semibold whitespace-nowrap" style={{ color: r.amount_cents > 0 ? '#067647' : 'var(--ink)' }}>{fmtSignedCents(r.amount_cents)}</span>
                </div>
                <div className="flex items-baseline justify-between gap-3 mt-0.5">
                  <span className="text-xs" style={{ color: 'var(--slate)', minWidth: 0 }}>
                    {fmtDate(r.created_at)} {fmtTime(r.created_at)}
                    {r.campaign_id
                      ? <> · <Link href={`/admin/campaigns/${r.campaign_id}`} className="font-medium hover:underline" style={{ color: 'var(--coral)' }}>{campaigns[r.campaign_id] || 'Campaign'}</Link></>
                      : r.note ? ` · ${r.note}` : ''}
                    {r.kind === 'spend' && r.parts != null ? ` · ${Number(r.parts).toLocaleString('en-AU')} beyond allowance` : ''}
                  </span>
                  <span className="text-xs whitespace-nowrap" style={{ color: 'var(--slate)' }}>Bal. {fmtCents(r.balance_after_cents)}</span>
                </div>
              </li>
            ))}
          </ul>
          <div className="hidden md:block overflow-x-auto -mx-1">
            <table className="w-full text-sm" style={{ minWidth: 560 }}>
              <thead>
                <tr className="border-b" style={{ borderColor: 'var(--border)' }}>
                  {['Date', 'Type', 'Details', 'Amount', 'Balance'].map((h, i) => (
                    <th key={h} className={`py-2 px-3 text-xs font-semibold uppercase ${i >= 3 ? 'text-right' : 'text-left'}`} style={{ color: 'var(--slate)' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {ledger.map(r => (
                  <tr key={r.id} className="border-b last:border-b-0" style={{ borderColor: 'var(--border)' }}>
                    <td className="py-3 px-3 whitespace-nowrap" style={{ color: 'var(--ink)' }}>{fmtDate(r.created_at)} <span className="text-xs" style={{ color: 'var(--slate)' }}>{fmtTime(r.created_at)}</span></td>
                    <td className="py-3 px-3 whitespace-nowrap" style={{ color: 'var(--ink)' }}>{ledgerLabel(r)}</td>
                    <td className="py-3 px-3" style={{ color: 'var(--slate)' }}>
                      {r.campaign_id
                        ? <Link href={`/admin/campaigns/${r.campaign_id}`} className="font-medium hover:underline" style={{ color: 'var(--coral)' }}>{campaigns[r.campaign_id] || 'Campaign'}</Link>
                        : (r.note || '')}
                      {r.kind === 'spend' && r.parts != null && <span className="text-xs"> · {Number(r.parts).toLocaleString('en-AU')} beyond allowance</span>}
                    </td>
                    <td className="py-3 px-3 text-right font-semibold whitespace-nowrap" style={{ color: r.amount_cents > 0 ? '#067647' : 'var(--ink)' }}>{fmtSignedCents(r.amount_cents)}</td>
                    <td className="py-3 px-3 text-right whitespace-nowrap" style={{ color: 'var(--slate)' }}>{fmtCents(r.balance_after_cents)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          </>
        )}
      </div>
    </Shell>
  )
}
