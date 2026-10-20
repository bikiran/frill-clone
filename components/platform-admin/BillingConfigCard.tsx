'use client'

// Super admin → Billing: "Billing configuration". Whether Colvy's own Stripe
// billing (plans and the Remove "Powered by Colvy" add-on) is set up, and
// exactly which Vercel env vars are missing or wrong, with where to find each
// in Stripe. Env var names belong here (the platform admin), never in front of
// a customer. Data: lib/billing-config billingConfigStatus via
// /api/platform-admin/ops?view=billing. Uses the console's --sa-* variables.

import type { BillingStatus, BillingCheck } from '@/lib/billing-config'

const GREEN = '#059669', RED = '#dc2626', AMBER = '#d97706'

const ok = <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12" /></svg>
const bad = <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12" /></svg>
const warn = <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M10.3 3.9 2.4 17.5A2 2 0 0 0 4.1 20.5h15.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" /><path d="M12 9.5v4M12 17h.01" /></svg>

const tone = (c: BillingCheck) => c.state === 'ok' ? GREEN : c.state === 'warn' || !c.required ? AMBER : RED
const icon = (c: BillingCheck) => c.state === 'ok' ? ok : c.state === 'warn' || !c.required ? warn : bad
const stateLabel = (c: BillingCheck) => c.state === 'ok' ? 'Set' : c.state === 'missing' ? (c.group === 'tax' && c.envVar !== 'COLVY_ABN' ? 'Recommended' : 'Missing') : c.state === 'invalid' ? 'Wrong value' : !c.required ? 'Optional' : c.envVar === 'STRIPE_SECRET_KEY' ? 'Test mode' : 'Check'

const GROUPS: [BillingCheck['group'], string][] = [['keys', 'Keys'], ['plans', 'Plan prices'], ['addons', 'Add-ons'], ['tax', 'Tax invoices (Colvy’s details)']]

export default function BillingConfigCard({ status, lastAlert }: { status: BillingStatus | null; lastAlert?: { day?: string; at?: string; tier?: string } | null }) {
  if (!status) return null
  const ready = status.checkoutReady && status.webhookReady
  const headTone = ready ? GREEN : RED
  return (
    <div style={{ background: 'var(--sa-card)', border: '1px solid var(--sa-border)', borderRadius: 16, padding: 20, marginBottom: 20 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap', justifyContent: 'space-between' }}>
        <div style={{ minWidth: 0, flex: '1 1 320px' }}>
          <p style={{ margin: 0, fontSize: 15, fontWeight: 700, color: 'var(--sa-text)', display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ width: 9, height: 9, borderRadius: '50%', background: headTone, flexShrink: 0 }} />
            Billing configuration
          </p>
          <p style={{ margin: '4px 0 0', fontSize: 12.5, color: 'var(--sa-muted)', lineHeight: 1.55 }}>
            {ready
              ? `Customers can upgrade and buy add-ons online${status.mode === 'test' ? ' (test mode: no real charges)' : ''}.`
              : !status.checkoutReady
                ? `Customers can’t upgrade online: they see “Online upgrades aren’t available just yet” and your contact details. Add the ${status.missing.length} missing value${status.missing.length === 1 ? '' : 's'} below in Vercel → Settings → Environment Variables (Production), then redeploy.`
                : 'Checkout works, but without the webhook secret a paid plan won’t switch on. Add it in Vercel, then redeploy.'}
          </p>
          {(() => {
            const abn = status.checks.find(c => c.envVar === 'COLVY_ABN')
            return abn && abn.state !== 'ok' ? (
              <p style={{ margin: '6px 0 0', fontSize: 12.5, color: AMBER, lineHeight: 1.5, display: 'flex', gap: 6, alignItems: 'flex-start' }}>
                <span style={{ flexShrink: 0, marginTop: 1 }}>{warn}</span>
                <span>{abn.state === 'missing' ? 'Colvy’s ABN isn’t set' : 'Colvy’s ABN isn’t valid'} (COLVY_ABN): payment documents say “Receipt”, not “Tax Invoice”, so customers can’t claim the GST.</span>
              </p>
            ) : null
          })()}
          {lastAlert?.at && (
            <p style={{ margin: '6px 0 0', fontSize: 12, color: 'var(--sa-muted)' }}>
              Last customer blocked: {new Date(lastAlert.at).toLocaleString('en-AU', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}{lastAlert.tier ? ` (${lastAlert.tier})` : ''}. You’re alerted at most once a day.
            </p>
          )}
        </div>
        {status.mode && (
          <span style={{ fontSize: 11.5, fontWeight: 800, padding: '4px 10px', borderRadius: 999, background: (status.mode === 'live' ? GREEN : AMBER) + '1f', color: status.mode === 'live' ? GREEN : AMBER, textTransform: 'uppercase', letterSpacing: 0.4 }}>
            {status.mode === 'live' ? 'Live mode' : 'Test mode'}
          </span>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 340px), 1fr))', gap: 14, marginTop: 16 }}>
        {GROUPS.map(([g, title]) => {
          const rows = status.checks.filter(c => c.group === g)
          if (!rows.length) return null
          return (
            <div key={g} style={{ border: '1px solid var(--sa-border)', borderRadius: 12, overflow: 'hidden', minWidth: 0 }}>
              <p style={{ margin: 0, padding: '9px 12px', fontSize: 11, fontWeight: 700, color: 'var(--sa-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', borderBottom: '1px solid var(--sa-border)' }}>{title}</p>
              {rows.map((c, i) => (
                <div key={c.envVar + c.label} style={{ padding: '10px 12px', borderTop: i ? '1px solid var(--sa-border)' : 'none', display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                  <span style={{ color: tone(c), marginTop: 2, flexShrink: 0 }}>{icon(c)}</span>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap', justifyContent: 'space-between' }}>
                      <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--sa-text)' }}>{c.label}</span>
                      <span style={{ fontSize: 11.5, fontWeight: 700, color: tone(c) }}>{stateLabel(c)}</span>
                    </div>
                    <code style={{ display: 'block', fontSize: 11.5, color: 'var(--sa-muted)', wordBreak: 'break-all', marginTop: 2 }}>{c.envVar}</code>
                    {c.problem && <p style={{ margin: '4px 0 0', fontSize: 12, color: c.state === 'ok' ? 'var(--sa-muted)' : tone(c), lineHeight: 1.45 }}>{c.problem}</p>}
                    {c.state !== 'ok' && <p style={{ margin: '3px 0 0', fontSize: 11.5, color: 'var(--sa-muted)', lineHeight: 1.45 }}>{c.where}</p>}
                  </div>
                </div>
              ))}
            </div>
          )
        })}
      </div>
    </div>
  )
}
