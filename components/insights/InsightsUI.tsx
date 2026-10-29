'use client'

import CountUp from '@/components/agents/CountUp'
import { reportFonts } from '@/lib/fonts'

// The Sellio-style building blocks the Insights pages share: page head, range
// pills, number tiles, cards, bar lists, the "how often they buy" bar and a
// small weekly chart.

export const money = (n: number, cents = false) =>
  new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD', currencyDisplay: 'narrowSymbol', minimumFractionDigits: cents ? 2 : 0, maximumFractionDigits: cents ? 2 : 0 }).format(n || 0)

/** `accent` is the word set in the italic serif, e.g. Customer <em>insights</em>. */
export function InsightsPage({ title, accent, sub, controls, children }: { title: string; accent?: string; sub: string; controls?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className={`ins ${reportFonts}`}>
      <style>{INS_CSS}</style>
      <div className="ins-head">
        <h1>{title}{accent && <> <em>{accent}</em></>}</h1>
        <p>{sub}</p>
      </div>
      {controls && <div className="ins-controls">{controls}</div>}
      {children}
    </div>
  )
}

export function RangePills<T extends string>({ value, options, onChange }: { value: T; options: [T, string][]; onChange: (v: NoInfer<T>) => void }) {
  return (
    <div className="ins-pills" role="radiogroup" aria-label="Date range">
      {options.map(([v, label]) => (
        <button key={v} type="button" role="radio" aria-checked={value === v} className={value === v ? 'on' : ''} onClick={() => onChange(v)}>{label}</button>
      ))}
    </div>
  )
}

export type KpiIcon = 'people' | 'money' | 'heart' | 'bag' | 'repeat' | 'pin' | 'trophy' | 'basket' | 'bulb' | 'vote' | 'book' | 'ticket' | 'eye' | 'check' | 'megaphone'
export function Kpi({ label, value, sub, icon, tone = '#ff6a4d' }: { label: string; value: string; sub?: string; icon: KpiIcon; tone?: string }) {
  return (
    <div className="ins-kpi" style={{ ['--t' as any]: tone }}>
      <span className="ins-kpi-ic" aria-hidden>{ICON[icon]}</span>
      <span className="ins-kpi-l">{label}</span>
      <span className="ins-kpi-v" title={value}><CountUp value={value} /></span>
      {sub && <span className="ins-kpi-s">{sub}</span>}
    </div>
  )
}

export function Card({ title, sub, right, children, className }: { title: string; sub?: string; right?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <section className={`ins-card${className ? ' ' + className : ''}`}>
      <div className="ins-card-head">
        <div style={{ minWidth: 0 }}>
          <h2>{title}</h2>
          {sub && <p>{sub}</p>}
        </div>
        {right}
      </div>
      {children}
    </section>
  )
}

export function BarList({ rows, color, fmt, empty = 'Nothing in this period yet.' }: { rows: { name: string; value: number; meta?: string }[]; color: string; fmt: (n: number) => string; empty?: string }) {
  const max = Math.max(1, ...rows.map(r => r.value))
  if (!rows.length) return <p className="ins-empty">{empty}</p>
  return (
    <ol className="ins-bars" style={{ ['--b' as any]: color }}>
      {rows.map((r, i) => (
        <li key={r.name}>
          <span className="ins-bars-n">{i + 1}</span>
          <span className="ins-bars-t">
            <span className="ins-bars-top"><b title={r.name}>{r.name}</b><span>{fmt(r.value)}</span></span>
            <span className="ins-bars-track"><i style={{ width: `${Math.max(3, (r.value / max) * 100)}%`, animationDelay: `${i * 40}ms` }} /></span>
            {r.meta && <small>{r.meta}</small>}
          </span>
        </li>
      ))}
    </ol>
  )
}

export function FreqBar({ freq }: { freq: { one: number; two: number; threePlus: number } }) {
  const total = freq.one + freq.two + freq.threePlus
  const parts = [
    { k: 'Bought once', n: freq.one, c: '#d4d4d8' },
    { k: 'Twice', n: freq.two, c: '#818cf8' },
    { k: '3 or more times', n: freq.threePlus, c: '#16a34a' },
  ]
  if (!total) return <p className="ins-empty">No customers in this period yet.</p>
  return (
    <div className="ins-freq">
      <div className="ins-freq-bar" role="img" aria-label={parts.map(p => `${p.k}: ${p.n}`).join(', ')}>
        {parts.map(p => p.n > 0 && <i key={p.k} style={{ flexGrow: p.n, background: p.c }} />)}
      </div>
      <ul>
        {parts.map(p => (
          <li key={p.k}><span className="dot" style={{ background: p.c }} /><span className="k">{p.k}</span><b>{p.n.toLocaleString('en-AU')}</b><span className="pc">{Math.round((p.n / total) * 100)}%</span></li>
        ))}
      </ul>
    </div>
  )
}

export function WeekChart({ weeks }: { weeks: { start: number; revenue: number; orders: number }[] }) {
  const max = Math.max(1, ...weeks.map(w => w.revenue))
  if (!weeks.length || !weeks.some(w => w.revenue)) return <p className="ins-empty">No sales in this period yet.</p>
  return (
    <div className="ins-weeks">
      {weeks.map((w, i) => (
        <div key={w.start} className="ins-week" title={`Week of ${new Date(w.start).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })}: ${money(w.revenue)} from ${w.orders} orders`}>
          <i style={{ height: `${Math.max(2, (w.revenue / max) * 100)}%`, animationDelay: `${i * 35}ms` }} />
          <span>{new Date(w.start).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })}</span>
        </div>
      ))}
    </div>
  )
}

export function InsightsEmpty({ title, body, href, cta }: { title: string; body: string; href?: string; cta?: string }) {
  return (
    <div className="ins-none">
      <span className="ins-none-ic" aria-hidden>{ICON.bag}</span>
      <h2>{title}</h2>
      <p>{body}</p>
      {href && cta && <a href={href}>{cta}</a>}
    </div>
  )
}

export function InsightsSkeleton() {
  return (
    <div className="ins-skel" aria-hidden>
      <div className="ins-kpis">{[0, 1, 2, 3, 4, 5].map(i => <span key={i} className="ins-kpi sk" />)}</div>
      <div className="ins-grid2"><span className="ins-card sk" style={{ height: 260 }} /><span className="ins-card sk" style={{ height: 260 }} /></div>
    </div>
  )
}

const P = (d: React.ReactNode) => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">{d}</svg>
const ICON: Record<KpiIcon, React.ReactNode> = {
  people: P(<><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" /></>),
  money: P(<><line x1="12" y1="1" x2="12" y2="23" /><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" /></>),
  heart: P(<path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8l1 1.1L12 21l7.8-7.5 1-1.1a5.5 5.5 0 0 0 0-7.8z" />),
  bag: P(<><path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z" /><line x1="3" y1="6" x2="21" y2="6" /><path d="M16 10a4 4 0 0 1-8 0" /></>),
  repeat: P(<><polyline points="17 1 21 5 17 9" /><path d="M3 11V9a4 4 0 0 1 4-4h14" /><polyline points="7 23 3 19 7 15" /><path d="M21 13v2a4 4 0 0 1-4 4H3" /></>),
  pin: P(<><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0z" /><circle cx="12" cy="10" r="3" /></>),
  trophy: P(<><path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0z" /><path d="M17 5h3v2a3 3 0 0 1-3 3M7 5H4v2a3 3 0 0 0 3 3" /></>),
  bulb: P(<><path d="M9 18h6M10 22h4" /><path d="M12 2a7 7 0 0 0-4 12.7c.6.5 1 1.3 1 2.3h6c0-1 .4-1.8 1-2.3A7 7 0 0 0 12 2z" /></>),
  vote: P(<><path d="M7 10v12M15 5.9 14 10h5.8a2 2 0 0 1 2 2.3l-1.4 8a2 2 0 0 1-2 1.7H7V10l4.3-7.7A1.9 1.9 0 0 1 15 3.9z" /><path d="M3 10h4v12H3z" /></>),
  book: P(<><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20V3H6.5A2.5 2.5 0 0 0 4 5.5z" /><path d="M4 19.5A2.5 2.5 0 0 0 6.5 22H20v-5" /></>),
  ticket: P(<path d="M3 8a2 2 0 0 0 2-2h14a2 2 0 0 0 2 2v2a2 2 0 0 0 0 4v2a2 2 0 0 0-2 2H5a2 2 0 0 0-2-2v-2a2 2 0 0 0 0-4z" />),
  eye: P(<><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8S1 12 1 12z" /><circle cx="12" cy="12" r="3" /></>),
  check: P(<><path d="M22 11.1V12a10 10 0 1 1-5.9-9.1" /><polyline points="22 4 12 14 9 11" /></>),
  megaphone: P(<><path d="m3 11 18-5v12L3 14v-3z" /><path d="M11.6 16.8a3 3 0 1 1-5.8-1.6" /></>),
  basket: P(<><circle cx="9" cy="20" r="1.5" /><circle cx="18" cy="20" r="1.5" /><path d="M2 3h3l2.7 12.4a2 2 0 0 0 2 1.6h8.6a2 2 0 0 0 2-1.6L22 7H6" /></>),
}

const INS_CSS = `
.ins{max-width:1240px;margin:0 auto;padding:24px 16px 120px}
@media (min-width:900px){.ins{padding:28px 32px 120px}}
.ins button::before{display:none!important}
.ins{--fd:var(--font-display),-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif}
.ins-head h1{margin:0;font-family:var(--fd);font-size:clamp(30px,3.8vw,40px);font-weight:700;letter-spacing:-.04em;line-height:1.02;color:#0d0d0d;font-optical-sizing:auto}
.ins-head h1 em{font-family:var(--font-accent),Georgia,'Times New Roman',serif;font-style:italic;font-weight:400;font-size:1.12em;letter-spacing:-.015em;color:#ff5a3c}
.ins-head p{margin:8px 0 0;font-size:14.5px;line-height:1.5;color:#71717a;max-width:620px}
.ins-controls{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin:18px 0 18px}
.ins-pills{display:flex;gap:6px;flex-wrap:wrap}
.ins-pills button{height:36px;padding:0 15px;border:none;border-radius:999px;background:#efeff1;color:#3f3f46;font:inherit;font-size:13.5px;font-weight:600;cursor:pointer;transition:background .15s,color .15s}
.ins-pills button:hover{background:#e6e6e9}
.ins-pills button.on{background:#18181b;color:#fff}
.ins-field{height:36px;padding:0 14px;border:1px solid transparent;border-radius:999px;background:#efeff1;color:#111;font:inherit;font-size:13.5px;outline:none}
.ins-field:focus{background:#fff;border-color:#e4e4e7}
.ins-kpis{display:grid;grid-template-columns:repeat(auto-fill,minmax(178px,1fr));gap:10px;margin-bottom:14px}
.ins-kpi{position:relative;display:flex;flex-direction:column;gap:3px;min-width:0;padding:16px 16px 15px;border-radius:20px;background:#fff;box-shadow:0 0 0 1px rgba(0,0,0,.05),0 1px 2px rgba(16,24,40,.04);animation:insIn .45s cubic-bezier(.22,1,.36,1) both}
.ins-kpi-ic{width:30px;height:30px;border-radius:10px;display:inline-flex;align-items:center;justify-content:center;background:color-mix(in srgb,var(--t) 14%,#fff);color:var(--t);margin-bottom:8px}
.ins-kpi-l{font-size:13px;font-weight:600;color:#71717a}
.ins-kpi-v{font-family:var(--fd);font-size:28px;font-weight:700;letter-spacing:-.035em;line-height:1.15;color:#111;font-variant-numeric:tabular-nums;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.ins-kpi-s{font-size:12px;color:#8e8e93;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
@media (max-width:600px){.ins-kpis{grid-template-columns:repeat(2,minmax(0,1fr))}.ins-kpi{padding:14px 14px 13px}.ins-kpi-v{font-size:23px}.ins-kpi-ic{margin-bottom:6px}}
.ins-grid2{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px;margin-bottom:14px}
@media (max-width:900px){.ins-grid2{grid-template-columns:minmax(0,1fr)}}
.ins-grid-map{display:grid;grid-template-columns:minmax(0,3fr) minmax(0,2fr);gap:14px;margin-bottom:14px}
@media (max-width:1000px){.ins-grid-map{grid-template-columns:minmax(0,1fr)}}
.ins-card{display:block;background:#fff;border-radius:22px;padding:18px 20px 20px;box-shadow:0 0 0 1px rgba(0,0,0,.06),0 1px 2px rgba(16,24,40,.04);min-width:0;animation:insIn .45s cubic-bezier(.22,1,.36,1) both}
.ins-card-head{display:flex;align-items:flex-start;justify-content:space-between;gap:10px;margin-bottom:14px}
.ins-card h2{margin:0;font-family:var(--fd);font-size:18px;font-weight:650;letter-spacing:-.025em;color:#111}
.ins-card-head p{margin:3px 0 0;font-size:12.5px;color:#8e8e93}
.ins-empty{margin:0;font-size:13.5px;color:#8e8e93}
.ins-bars{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:12px}
.ins-bars li{display:flex;gap:10px;align-items:flex-start}
.ins-bars-n{width:22px;height:22px;flex-shrink:0;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;background:#f4f4f5;font-size:11.5px;font-weight:700;color:#71717a;margin-top:1px}
.ins-bars-t{flex:1;min-width:0;display:flex;flex-direction:column;gap:5px}
.ins-bars-top{display:flex;justify-content:space-between;gap:10px;font-size:13.5px}
.ins-bars-top b{font-weight:600;color:#18181b;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0}
.ins-bars-top span{flex-shrink:0;font-weight:700;color:#111;font-variant-numeric:tabular-nums}
.ins-bars-track{height:6px;border-radius:999px;background:#f4f4f5;overflow:hidden}
.ins-bars-track i{display:block;height:100%;border-radius:999px;background:var(--b);transform-origin:left;animation:insGrow .7s cubic-bezier(.22,1,.36,1) both}
.ins-bars small{font-size:11.5px;color:#8e8e93}
.ins-freq-bar{display:flex;gap:3px;height:14px;border-radius:999px;overflow:hidden}
.ins-freq-bar i{display:block;height:100%;border-radius:4px;transform-origin:left;animation:insGrow .7s cubic-bezier(.22,1,.36,1) both}
.ins-freq ul{list-style:none;margin:14px 0 0;padding:0;display:flex;flex-direction:column;gap:9px}
.ins-freq li{display:flex;align-items:center;gap:9px;font-size:13.5px}
.ins-freq .dot{width:10px;height:10px;border-radius:3px;flex-shrink:0}
.ins-freq .k{flex:1;color:#3f3f46}
.ins-freq b{font-weight:700;color:#111;font-variant-numeric:tabular-nums}
.ins-freq .pc{width:44px;text-align:right;color:#8e8e93;font-variant-numeric:tabular-nums}
.ins-weeks{display:flex;align-items:flex-end;gap:6px;height:180px;padding-top:6px}
.ins-week{flex:1;min-width:0;height:100%;display:flex;flex-direction:column;justify-content:flex-end;align-items:center;gap:6px}
.ins-week i{display:block;width:100%;max-width:34px;border-radius:8px 8px 4px 4px;background:linear-gradient(180deg,#ff8a70,#ff6a4d);transform-origin:bottom;animation:insRise .7s cubic-bezier(.22,1,.36,1) both}
.ins-week span{font-size:10.5px;color:#a1a1aa;white-space:nowrap}
.ins-week:hover i{filter:brightness(.92)}
@media (max-width:600px){.ins-weeks{gap:4px}.ins-week:nth-child(even) span{visibility:hidden}}
.ins-body{transition:opacity .2s}
.ins-body.stale{opacity:.55;pointer-events:none}
.ins-none{display:flex;flex-direction:column;align-items:center;text-align:center;gap:6px;padding:56px 20px;border-radius:22px;background:#fff;box-shadow:0 0 0 1px rgba(0,0,0,.05)}
.ins-none-ic{width:46px;height:46px;border-radius:15px;display:inline-flex;align-items:center;justify-content:center;background:#fff4f1;color:#ff6a4d;margin-bottom:6px}
.ins-none h2{margin:0;font-family:var(--fd);font-size:20px;font-weight:700;letter-spacing:-.03em;color:#111}
.ins-none p{margin:0;max-width:420px;font-size:14px;line-height:1.5;color:#71717a}
.ins-none a{margin-top:10px;display:inline-flex;align-items:center;height:38px;padding:0 18px;border-radius:999px;background:#0d0d0d;color:#fff;font-size:13.5px;font-weight:650;text-decoration:none}
.ins-err{margin:0 0 14px;padding:11px 14px;border-radius:14px;background:#fef2f2;color:#b91c1c;font-size:13.5px}
.ins-map{position:relative;isolation:isolate;z-index:0;border-radius:16px;overflow:hidden}
.ins-skel .sk{display:block;min-height:118px;background:linear-gradient(90deg,#f4f4f5 25%,#ececef 37%,#f4f4f5 63%);background-size:400% 100%;animation:insSk 1.2s ease infinite;box-shadow:none}
@keyframes insIn{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}
@keyframes insGrow{from{transform:scaleX(0)}to{transform:none}}
@keyframes insRise{from{transform:scaleY(0)}to{transform:none}}
@keyframes insSk{0%{background-position:100% 50%}100%{background-position:0 50%}}
@media (prefers-reduced-motion:reduce){.ins-kpi,.ins-card,.ins-bars-track i,.ins-freq-bar i,.ins-week i,.ins-skel .sk{animation:none}}
`
