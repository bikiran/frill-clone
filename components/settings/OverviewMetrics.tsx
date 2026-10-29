'use client'

import CountUp from '@/components/agents/CountUp'

// The Settings → Overview numbers in the Sellio style: range pills, white
// tiles with a coloured icon, a revenue card with the share of all store
// sales that came through chat, and a breakdown of how each order was won.
// Every figure comes from /api/company/overview (real rows, no estimates).

type Overview = {
  error?: string
  conversations?: number; customersServed?: number; newCustomers?: number; returningCustomers?: number
  messagesReceived?: number; conversationsReplied?: number; resolved?: number
  salesConverted?: number; salesAmount?: number; totalOrders?: number; totalOrderAmount?: number
  byAttribution?: Record<string, { count: number; amount: number }>
  cartsRecovered?: number; cartsRecoveredAmount?: number; cartsCaptured?: number; cartsCapturedAmount?: number
}

const money = (n?: number) => new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD', currencyDisplay: 'narrowSymbol', maximumFractionDigits: 0 }).format(n || 0)
const num = (n?: number) => n == null ? '—' : n.toLocaleString('en-AU')
const pct = (a?: number, b?: number) => (b && a != null) ? Math.round((a / b) * 100) : null

const ATTRIBUTION: Record<string, { label: string; hint: string; tone: string }> = {
  chat_order: { label: 'Order created from chat', hint: 'Your team or AI made the order in the conversation', tone: '#6366f1' },
  cart_recovered: { label: 'Recovered abandoned cart', hint: 'They came back to a cart Colvy captured', tone: '#16a34a' },
  chat_assisted: { label: 'Chatted before ordering', hint: 'They talked to you, then bought', tone: '#f59e0b' },
}

export default function OverviewMetrics({ overview, days, onDays, loading }: {
  overview: Overview | null
  days: number
  onDays: (d: number) => void
  loading: boolean
}) {
  const o = overview && !overview.error ? overview : null
  const share = pct(o?.salesAmount, o?.totalOrderAmount)
  const recoveryRate = pct(o?.cartsRecovered, o?.cartsCaptured)
  const breakdown = Object.entries(o?.byAttribution || {}).sort((a, b) => b[1].amount - a[1].amount)
  const topAmount = Math.max(1, ...breakdown.map(([, v]) => v.amount))

  return (
    <div className="ov">
      <style>{OV_CSS}</style>
      <div className="ov-pills" role="radiogroup" aria-label="Date range">
        {[7, 30, 90].map(d => (
          <button key={d} type="button" role="radio" aria-checked={days === d} className={days === d ? 'on' : ''} onClick={() => onDays(d)}>
            Last {d} days
          </button>
        ))}
      </div>

      {loading && !o ? (
        <div className="ov-skel" aria-label="Loading">
          <div className="ov-tiles">{[0, 1, 2, 3].map(i => <span key={i} className="sk" />)}</div>
          <span className="sk tall" />
        </div>
      ) : !o ? (
        <p className="ov-err">Couldn’t load these numbers. Try again in a moment.</p>
      ) : (
        <div className={`ov-body${loading ? ' stale' : ''}`}>
          {/* ── Sales converted through chat ── */}
          <section className="ov-sales">
            <div className="ov-rev">
              <span className="ov-ic" style={{ '--t': '#16a34a' } as React.CSSProperties}>{IC.money}</span>
              <p className="ov-l">Revenue converted through chat</p>
              <p className="ov-big"><CountUp value={money(o.salesAmount)} /></p>
              {share != null ? (
                <>
                  <div className="ov-share" role="img" aria-label={`${share}% of all store sales`}>
                    <i style={{ width: `${Math.max(2, Math.min(100, share))}%` }} />
                  </div>
                  <p className="ov-s"><b>{share}%</b> of {money(o.totalOrderAmount)} in store sales over the last {days} days</p>
                </>
              ) : <p className="ov-s">From orders Colvy can tie to a chat</p>}
            </div>
            <div className="ov-tiles three">
              <Tile icon="bag" tone="#6366f1" label="Orders converted" value={num(o.salesConverted)}
                sub={o.totalOrders ? `of ${num(o.totalOrders)} orders` : 'Tied to a chat'} />
              <Tile icon="cart" tone="#16a34a" label="Carts recovered" value={num(o.cartsRecovered)}
                sub={`${money(o.cartsRecoveredAmount)} back${recoveryRate != null ? ` · ${recoveryRate}% of carts` : ''}`} />
              <Tile icon="cartOff" tone="#f59e0b" label="Carts captured" value={num(o.cartsCaptured)}
                sub={`${money(o.cartsCapturedAmount)} left in carts`} />
            </div>
          </section>

          {breakdown.length > 0 && (
            <section className="ov-card">
              <h2>How the sales were won</h2>
              <ul className="ov-attr">
                {breakdown.map(([key, v]) => {
                  const a = ATTRIBUTION[key] || { label: key.replace(/_/g, ' '), hint: '', tone: '#71717a' }
                  return (
                    <li key={key}>
                      <span className="ov-dot" style={{ background: a.tone }} />
                      <span className="ov-attr-t">
                        <span className="ov-attr-top">
                          <b>{a.label}</b>
                          <span><b>{money(v.amount)}</b> · {num(v.count)} order{v.count === 1 ? '' : 's'}</span>
                        </span>
                        <span className="ov-track"><i style={{ width: `${(v.amount / topAmount) * 100}%`, background: a.tone }} /></span>
                        {a.hint && <small>{a.hint}</small>}
                      </span>
                    </li>
                  )
                })}
              </ul>
            </section>
          )}

          {/* ── Conversations ── */}
          <h2 className="ov-h">Conversations</h2>
          <div className="ov-tiles">
            <Tile icon="people" tone="#6366f1" label="Customers served" value={num(o.customersServed)} sub="People you chatted with" />
            <Tile icon="inbox" tone="#0ea5e9" label="Messages received" value={num(o.messagesReceived)} sub="Sent by customers" />
            <Tile icon="reply" tone="#d946ef" label="Conversations replied" value={num(o.conversationsReplied)}
              sub={o.conversations ? `${pct(o.conversationsReplied, o.conversations)}% answered by your team or AI` : 'Answered by your team or AI'} />
            <Tile icon="check" tone="#16a34a" label="Resolved" value={num(o.resolved)} sub="Marked resolved or closed" />
          </div>

          {/* ── Customers ── */}
          <h2 className="ov-h">Customers</h2>
          <div className="ov-tiles three">
            <Tile icon="spark" tone="#ff6a4d" label="New customers" value={num(o.newCustomers)} sub="First chat with you" />
            <Tile icon="repeat" tone="#14b8a6" label="Returning customers" value={num(o.returningCustomers)} sub="Had chatted with you before" />
            <Tile icon="chat" tone="#71717a" label="Conversations started" value={num(o.conversations)} sub={`In the last ${days} days`} />
          </div>

          <p className="ov-note">
            <span aria-hidden>{IC.info}</span>
            <span>An order counts as converted only when Colvy can prove it: it was made in the chat, it came from a cart Colvy captured, or the customer chatted before ordering. Cancelled, failed and refunded orders are left out. These are real order totals from your store, not estimates.</span>
          </p>
        </div>
      )}
    </div>
  )
}

function Tile({ icon, tone, label, value, sub }: { icon: keyof typeof IC; tone: string; label: string; value: string; sub?: string }) {
  return (
    <div className="ov-tile">
      <span className="ov-ic" style={{ '--t': tone } as React.CSSProperties}>{IC[icon]}</span>
      <span className="ov-l">{label}</span>
      <span className="ov-v"><CountUp value={value} /></span>
      {sub && <span className="ov-s">{sub}</span>}
    </div>
  )
}

const g = (d: React.ReactNode) => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>{d}</svg>
const IC = {
  money: g(<><line x1="12" y1="1" x2="12" y2="23" /><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" /></>),
  bag: g(<><path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z" /><line x1="3" y1="6" x2="21" y2="6" /><path d="M16 10a4 4 0 0 1-8 0" /></>),
  cart: g(<><circle cx="9" cy="21" r="1" /><circle cx="20" cy="21" r="1" /><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" /></>),
  cartOff: g(<><circle cx="9" cy="21" r="1" /><circle cx="20" cy="21" r="1" /><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" /><path d="M12 9v3M12 14.5h.01" /></>),
  people: g(<><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" /></>),
  inbox: g(<><polyline points="22 12 16 12 14 15 10 15 8 12 2 12" /><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z" /></>),
  reply: g(<><polyline points="9 17 4 12 9 7" /><path d="M20 18v-2a4 4 0 0 0-4-4H4" /></>),
  check: g(<><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" /></>),
  spark: g(<path d="M12 3l1.9 5.6L19.5 10l-5.6 1.9L12 17.5l-1.9-5.6L4.5 10l5.6-1.4z" />),
  repeat: g(<><polyline points="17 1 21 5 17 9" /><path d="M3 11V9a4 4 0 0 1 4-4h14" /><polyline points="7 23 3 19 7 15" /><path d="M21 13v2a4 4 0 0 1-4 4H3" /></>),
  chat: g(<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />),
  info: g(<><circle cx="12" cy="12" r="10" /><line x1="12" y1="16" x2="12" y2="12" /><line x1="12" y1="8" x2="12.01" y2="8" /></>),
}

const OV_CSS = `
.ov{--f:#f4f4f5;--f2:#ececef;--mut:#71717a;--soft:#8e8e93;--line:#ececee;--fd:var(--font-display),-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif}
[data-theme="dark"] .ov{--f:#2a2a2e;--f2:#333337;--mut:#a1a1aa;--soft:#8b8b90;--line:#2e2e33}
.ov button::before{display:none!important}
.ov-pills{display:flex;gap:6px;flex-wrap:wrap;margin:0 0 18px}
.ov-pills button{height:36px;padding:0 15px;border:none;border-radius:999px;background:var(--f);color:var(--ink);font:inherit;font-size:13.5px;font-weight:600;cursor:pointer;transition:background .15s,color .15s}
.ov-pills button:hover{background:var(--f2)}
.ov-pills button.on{background:var(--ink);color:var(--card,#fff)}
.ov-body{transition:opacity .2s}
.ov-body.stale{opacity:.55;pointer-events:none}
.ov-h{margin:26px 0 10px;font-family:var(--fd);font-size:18px;font-weight:700;letter-spacing:-.025em;color:var(--ink)}
.ov-tiles{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px}
.ov-tiles.three{grid-template-columns:repeat(3,minmax(0,1fr))}
@media (max-width:1100px){.ov-tiles{grid-template-columns:repeat(2,minmax(0,1fr))}.ov-tiles.three{grid-template-columns:repeat(3,minmax(0,1fr))}}
@media (max-width:640px){.ov-tiles,.ov-tiles.three{grid-template-columns:repeat(2,minmax(0,1fr))}}
.ov-tile,.ov-rev,.ov-card{background:var(--card,#fff);box-shadow:0 0 0 1px rgba(0,0,0,.05),0 1px 2px rgba(16,24,40,.04);animation:ovIn .45s cubic-bezier(.22,1,.36,1) both}
.ov-tile{display:flex;flex-direction:column;gap:3px;min-width:0;padding:16px 16px 15px;border-radius:20px}
.ov-ic{width:30px;height:30px;margin-bottom:8px;border-radius:10px;display:inline-flex;align-items:center;justify-content:center;background:color-mix(in srgb,var(--t) 14%,var(--card,#fff));color:var(--t)}
.ov-l{margin:0;font-size:13px;font-weight:600;color:var(--mut)}
.ov-v{font-family:var(--fd);font-size:28px;font-weight:700;letter-spacing:-.035em;line-height:1.15;color:var(--ink);font-variant-numeric:tabular-nums;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.ov-s{margin:0;font-size:12px;color:var(--soft);overflow:hidden;text-overflow:ellipsis}
.ov-tile .ov-s{white-space:nowrap}
.ov-s b{color:var(--ink);font-weight:700}
.ov-sales{display:grid;grid-template-columns:minmax(0,1.1fr) minmax(0,1.9fr);gap:10px;align-items:stretch}
.ov-sales .ov-tiles{align-content:stretch}
@media (max-width:1100px){.ov-sales{grid-template-columns:minmax(0,1fr)}}
.ov-rev{display:flex;flex-direction:column;min-width:0;padding:18px 20px;border-radius:22px;background:linear-gradient(160deg,color-mix(in srgb,#16a34a 7%,var(--card,#fff)),var(--card,#fff) 60%)}
.ov-big{margin:2px 0 12px;font-family:var(--fd);font-size:clamp(32px,3.6vw,42px);font-weight:700;letter-spacing:-.045em;line-height:1.05;color:var(--ink);font-variant-numeric:tabular-nums}
.ov-share{height:8px;border-radius:999px;background:var(--f);overflow:hidden;margin:auto 0 8px}
.ov-share i{display:block;height:100%;border-radius:999px;background:linear-gradient(90deg,#22c55e,#16a34a);transform-origin:left;animation:ovGrow .8s cubic-bezier(.22,1,.36,1) both}
.ov-card{margin-top:10px;padding:18px 20px;border-radius:22px}
.ov-card h2{margin:0 0 14px;font-family:var(--fd);font-size:17px;font-weight:700;letter-spacing:-.025em;color:var(--ink)}
.ov-attr{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:14px}
.ov-attr li{display:flex;gap:11px;align-items:flex-start}
.ov-dot{width:10px;height:10px;margin-top:5px;border-radius:3px;flex-shrink:0}
.ov-attr-t{flex:1;min-width:0;display:flex;flex-direction:column;gap:6px}
.ov-attr-top{display:flex;justify-content:space-between;align-items:baseline;gap:12px;flex-wrap:wrap;font-size:14px;color:var(--mut)}
.ov-attr-top>b{font-weight:600;color:var(--ink)}
.ov-attr-top span b{color:var(--ink);font-variant-numeric:tabular-nums}
.ov-track{height:6px;border-radius:999px;background:var(--f);overflow:hidden}
.ov-track i{display:block;height:100%;border-radius:999px;transform-origin:left;animation:ovGrow .7s cubic-bezier(.22,1,.36,1) both}
.ov-attr small{font-size:12px;color:var(--soft)}
.ov-note{display:flex;gap:10px;align-items:flex-start;margin:22px 0 0;padding:13px 15px;border-radius:16px;background:var(--f);font-size:12.5px;line-height:1.55;color:var(--mut)}
.ov-note>span:first-child{flex-shrink:0;margin-top:1px;color:var(--soft)}
.ov-err{margin:0;padding:12px 14px;border-radius:14px;background:#fef2f2;color:#b91c1c;font-size:13.5px}
.ov-skel .sk{display:block;min-height:118px;border-radius:20px;background:linear-gradient(90deg,var(--f) 25%,var(--f2) 37%,var(--f) 63%);background-size:400% 100%;animation:ovSk 1.2s ease infinite}
.ov-skel .sk.tall{min-height:200px;margin-top:10px}
@keyframes ovIn{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}
@keyframes ovGrow{from{transform:scaleX(0)}to{transform:none}}
@keyframes ovSk{0%{background-position:100% 50%}100%{background-position:0 50%}}
@media (prefers-reduced-motion:reduce){.ov-tile,.ov-rev,.ov-card,.ov-share i,.ov-track i,.ov-skel .sk{animation:none}}
.ov :focus-visible{outline:2px solid var(--coral);outline-offset:2px}
`
