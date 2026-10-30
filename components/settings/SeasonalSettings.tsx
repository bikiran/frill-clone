'use client'

// Settings → Theme → Seasonal theme: turn on Halloween, Christmas or both,
// each always or between two dates every year (so October and December look
// after themselves), and preview them. The choice is saved with the workspace's look; "On this device" is each person's
// own (lib/seasonal-themes).

import { useState, useSyncExternalStore } from 'react'
import {
  SEASONS, deviceSeasonOff, inWindow, nextStart, previewSeason, runEnd, seasonPrefs, setDeviceSeasonOff, subscribeAppearance,
  type SeasonDef, type SeasonId, type SeasonPrefs, type SeasonalConfig,
} from '@/lib/seasonal-themes'

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const DAYS_IN = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
const pad = (n: number) => String(n).padStart(2, '0')
const label = (d: Date) => `${d.getDate()} ${MONTHS[d.getMonth()]}`

function status(p: SeasonPrefs): { text: string; live: boolean } {
  if (!p.on) return { text: 'Off', live: false }
  if (p.when === 'always') return { text: 'On', live: true }
  return inWindow(p.from, p.to)
    ? { text: `On now · until ${label(runEnd(p.to))}`, live: true }
    : { text: `Starts ${label(nextStart(p.from))}`, live: false }
}

function Switch({ on, onChange, label: aria, disabled }: { on: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean }) {
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={aria} className="sst-sw" disabled={disabled} onClick={() => onChange(!on)}>
      <span />
    </button>
  )
}

function DatePick({ value, onChange, aria }: { value: string; onChange: (v: string) => void; aria: string }) {
  const [m, d] = value.split('-').map(Number)
  return (
    <span className="sst-date">
      <select aria-label={`${aria} month`} value={m} onChange={e => { const nm = +e.target.value; onChange(`${pad(nm)}-${pad(Math.min(d, DAYS_IN[nm - 1]))}`) }}>
        {MONTHS.map((n, i) => <option key={n} value={i + 1}>{n}</option>)}
      </select>
      <select aria-label={`${aria} day`} value={d} onChange={e => onChange(`${pad(m)}-${pad(+e.target.value)}`)}>
        {Array.from({ length: DAYS_IN[m - 1] }, (_, i) => <option key={i} value={i + 1}>{i + 1}</option>)}
      </select>
    </span>
  )
}

// Little moving postcards of each theme.
function Postcard({ id }: { id: SeasonId }) {
  if (id === 'christmas') return (
    <svg className="sst-card-art" viewBox="0 0 320 96" preserveAspectRatio="xMidYMid slice" aria-hidden>
      <defs><linearGradient id="sst-xs" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#0f1f3d" /><stop offset="1" stopColor="#24467a" /></linearGradient></defs>
      <rect width="320" height="96" fill="url(#sst-xs)" />
      <path d="M0 74c60-14 120-12 180-4s100 6 140-2v28H0z" fill="#e8f0fb" />
      <path d="M232 76 252 30l20 46z" fill="#1f6f43" /><path d="M240 58 252 22l12 36z" fill="#2a8a55" />
      <circle cx="252" cy="20" r="3.4" fill="#ffd166" />
      {[[244, 52, '#ff5a5f'], [258, 60, '#ffd166'], [248, 68, '#6ee7ff'], [262, 44, '#ff9ff3']].map(([x, y, c], i) => <circle key={i} className={`sst-light l${i}`} cx={x as number} cy={y as number} r="2.2" fill={c as string} />)}
      <g className="sst-snow" fill="#fff">{Array.from({ length: 22 }, (_, i) => <circle key={i} cx={(i * 47) % 320} cy={(i * 29) % 96} r={i % 3 ? 1.3 : 2} opacity={0.85} />)}</g>
    </svg>
  )
  return (
    <svg className="sst-card-art" viewBox="0 0 320 96" preserveAspectRatio="xMidYMid slice" aria-hidden>
      <defs><linearGradient id="sst-hs" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#0d0a1c" /><stop offset=".6" stopColor="#24153d" /><stop offset="1" stopColor="#3a1b3c" /></linearGradient></defs>
      <rect width="320" height="96" fill="url(#sst-hs)" />
      {[[30, 14], [70, 30], [112, 10], [150, 26], [196, 12], [300, 40], [20, 44], [178, 40]].map(([x, y], i) => <circle key={i} cx={x} cy={y} r={i % 3 ? 0.9 : 1.3} fill="#fff" opacity={0.7} />)}
      <circle cx="262" cy="28" r="24" fill="rgba(255,236,190,.14)" />
      <circle cx="262" cy="28" r="15" fill="#f6ecd2" />
      <rect className="sst-flash" width="320" height="96" fill="#e3e8ff" />
      <path d="M0 70c40-10 80-14 130-8s90-6 130-10 50 4 60 6v38H0z" fill="#1d1431" />
      <path d="M26 66V44h-5l15-15 15 15h-5v22zM46 66V36h-4l18-18 18 18h-4v30z" fill="#1d1431" />
      <rect className="sst-win" x="56" y="44" width="5" height="7" rx="2.5" fill="#ffad42" /><rect x="32" y="50" width="4" height="6" fill="#ffad42" opacity=".8" />
      <path d="M0 84c70-8 140-4 200-6s90-4 120 0v18H0z" fill="#0c0816" />
      {[[204, 82, 1], [226, 85, 0.75]].map(([x, y, s], i) => (
        <g key={i} transform={`translate(${x} ${y}) scale(${s})`}>
          <ellipse cx="0" cy="0" rx="11" ry="9" fill="#f97316" /><ellipse cx="-5" cy="0" rx="6" ry="8.6" fill="#c2410c" opacity=".55" />
          <path className="sst-face" d="M-6-2-2-5l1 4zM6-2 2-5l-1 4zM-6 3c3 4 9 4 12 0l-3 1-1.5-2-1.5 2-1.5-2-1.5 2z" fill="#ffd166" />
          <path d="M0-9c-1-3 0-5 3-6" stroke="#4d5b1f" strokeWidth="2" fill="none" strokeLinecap="round" />
        </g>
      ))}
      <g className="sst-bats" fill="#0b0712">
        {[[0, 0, 1], [26, -10, 0.7], [44, 6, 0.55]].map(([x, y, s], i) => (
          <path key={i} transform={`translate(${x} ${y}) scale(${s})`} d="M0 0c-4-5-10-6-16-4 3 1 3 3 3 5 2-1 4-1 5 1 2-2 4-1 5 1 1-2 2-2 3-1 1-1 2-1 3 1 1-2 3-3 5-1 1-2 3-2 5-1 0-2 0-4 3-5C10-6 4-5 0 0z" />
        ))}
      </g>
    </svg>
  )
}

function ThemeCard({ def, prefs, onToggle, hiddenHere }: { def: SeasonDef; prefs: SeasonPrefs; onToggle: (on: boolean) => void; hiddenHere: boolean }) {
  let st = def.ready ? status(prefs) : null
  // Running, but switched off in this browser ("On this device"): say so, or it looks broken.
  if (st?.live && hiddenHere) st = { text: `${st.text} · hidden on this device`, live: false }
  return (
    <div className={`sst-card${prefs.on && def.ready ? ' on' : ''}${def.ready ? '' : ' soon'}`}>
      <Postcard id={def.id} />
      <div className="sst-card-body">
        <div className="sst-card-top">
          <b>{def.name}</b>
          {def.ready ? <Switch on={prefs.on} onChange={onToggle} label={`${def.name} theme`} /> : <span className="sst-chip">Coming soon</span>}
        </div>
        <p>{def.blurb}</p>
        {st && <span className={`sst-status${st.live ? ' live' : ''}`}><i />{st.text}</span>}
      </div>
    </div>
  )
}

export default function SeasonalSettings({ value, onChange }: { value: SeasonalConfig; onChange: (v: SeasonalConfig) => void }) {
  const deviceOff = useSyncExternalStore(subscribeAppearance, deviceSeasonOff, () => false)

  const [editing, setEditing] = useState<SeasonId | null>(null)
  const set = (id: SeasonId, patch: Partial<SeasonPrefs>) => onChange({ ...value, [id]: { ...seasonPrefs(value, id), ...patch } })
  const ready = SEASONS.filter(s => s.ready)
  const onList = ready.filter(s => seasonPrefs(value, s.id).on)
  // The options shown: the theme picked in the tabs, else the first one that's on.
  const open = onList.find(s => s.id === editing) || onList[0]
  const p = open ? seasonPrefs(value, open.id) : null

  return (
    <div className="sst">
      <div className="sst-cards">
        {SEASONS.map(def => (
          <ThemeCard key={def.id} def={def} prefs={seasonPrefs(value, def.id)} hiddenHere={deviceOff}
            onToggle={on => { set(def.id, { on }); if (on) setEditing(def.id) }} />
        ))}
      </div>

      {open && p && (
        <div className="sst-opts">
          {onList.length > 1 && (
            <div className="sst-row sst-which">
              <div className="sst-seg" role="tablist" aria-label="Theme options">
                {onList.map(s => <button key={s.id} type="button" role="tab" aria-selected={s.id === open.id} className={s.id === open.id ? 'on' : ''} onClick={() => setEditing(s.id)}>{s.name}</button>)}
              </div>
              <span className="sst-note">Each runs on its own dates. If they overlap, {onList[0].name} shows.</span>
            </div>
          )}
          <div className="sst-row">
            <span className="sst-k">When</span>
            <div className="sst-seg" role="radiogroup" aria-label="When it runs">
              <button type="button" role="radio" aria-checked={p.when === 'schedule'} className={p.when === 'schedule' ? 'on' : ''} onClick={() => set(open.id, { when: 'schedule' })}>On a schedule</button>
              <button type="button" role="radio" aria-checked={p.when === 'always'} className={p.when === 'always' ? 'on' : ''} onClick={() => set(open.id, { when: 'always' })}>Always on</button>
            </div>
          </div>
          {p.when === 'schedule' && (
            <div className="sst-row">
              <span className="sst-k">Dates</span>
              <div className="sst-dates">
                <DatePick value={p.from} aria="Starts" onChange={v => set(open.id, { from: v })} />
                <span className="sst-to">to</span>
                <DatePick value={p.to} aria="Ends" onChange={v => set(open.id, { to: v })} />
                <span className="sst-note">Every year</span>
              </div>
            </div>
          )}
          <div className="sst-row">
            <span className="sst-k">Night mode<small>{open.id === 'halloween' ? 'Switch to dark mode while it runs, for the full spooky look.' : 'Switch to dark mode while it runs: a snowy night with the northern lights.'}</small></span>
            <Switch on={p.night} onChange={v => set(open.id, { night: v })} label="Night mode" />
          </div>
          <div className="sst-row">
            <span className="sst-k">Customers see it too<small>Your public board and help centre get the theme as well. Your team always sees it.</small></span>
            <Switch on={p.customers} onChange={v => set(open.id, { customers: v })} label="Customers see it too" />
          </div>
          <div className="sst-row">
            <span className="sst-k">On this device<small>Just for you, on this browser. Teammates choose for themselves.</small></span>
            <Switch on={!deviceOff} onChange={v => setDeviceSeasonOff(!v)} label="Show the theme on this device" />
          </div>
        </div>
      )}

      <div className="sst-foot">
        {(open ? [open] : ready).map(s => (
          <button key={s.id} type="button" className="sst-preview" onClick={() => previewSeason(s.id)}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden><path d="M7 4.5v15a1 1 0 0 0 1.5.86l12-7.5a1 1 0 0 0 0-1.72l-12-7.5A1 1 0 0 0 7 4.5z" /></svg>
            Preview {s.name}
          </button>
        ))}
        <span>Plays the effects here for 20 seconds.</span>
      </div>

      <style>{CSS}</style>
    </div>
  )
}

const CSS = `
.sst{display:flex;flex-direction:column;gap:12px}
.sst-cards{display:grid;grid-template-columns:repeat(auto-fill,minmax(230px,1fr));gap:12px}
.sst-card{display:flex;flex-direction:column;border-radius:18px;overflow:hidden;background:var(--card,#fff);box-shadow:0 0 0 1px rgba(0,0,0,.08);transition:box-shadow .18s ease,transform .18s ease}
.sst-card.on{box-shadow:0 0 0 2px var(--coral),0 10px 24px -14px rgba(249,115,22,.55)}
.sst-card.soon .sst-card-art{filter:saturate(.55);opacity:.75}
.sst-card-art{display:block;width:100%;height:96px}
.sst-card-body{display:flex;flex-direction:column;gap:4px;padding:12px 14px 14px}
.sst-card-top{display:flex;align-items:center;justify-content:space-between;gap:10px}
.sst-card-top b{font-size:15px;font-weight:700;color:var(--ink)}
.sst-card-body p{margin:0;font-size:13px;line-height:1.4;color:var(--slate)}
.sst-chip{padding:3px 9px;border-radius:999px;background:#f4f4f5;color:#71717a;font-size:11.5px;font-weight:600;white-space:nowrap}
.sst-status{display:inline-flex;align-items:center;gap:6px;margin-top:4px;font-size:12px;font-weight:600;color:#71717a}
.sst-status i{width:7px;height:7px;border-radius:50%;background:#d4d4d8}
.sst-status.live{color:#c2410c}
.sst-status.live i{background:#f97316;box-shadow:0 0 0 3px rgba(249,115,22,.18)}
.sst-sw{position:relative;width:44px;height:26px;flex-shrink:0;border:none;border-radius:999px;background:#d4d4d8;cursor:pointer;transition:background .2s ease;padding:0}
.sst-sw::before{display:none}
.sst-sw span{position:absolute;top:3px;left:3px;width:20px;height:20px;border-radius:50%;background:#fff;box-shadow:0 1px 3px rgba(0,0,0,.2);transition:transform .22s cubic-bezier(.22,1,.36,1)}
.sst-sw[aria-checked="true"]{background:var(--coral)}
.sst-sw[aria-checked="true"] span{transform:translateX(18px)}
.sst-opts{display:flex;flex-direction:column;border-radius:16px;background:#f7f7f8;padding:4px 16px}
.sst-row{display:flex;align-items:center;justify-content:space-between;gap:16px;padding:12px 0;min-height:56px}
.sst-row+.sst-row{border-top:1px solid rgba(0,0,0,.06)}
.sst-which{justify-content:flex-start;flex-wrap:wrap;gap:10px 14px}
.sst-k{display:flex;flex-direction:column;gap:2px;font-size:14px;font-weight:600;color:var(--ink)}
.sst-k small{font-size:12.5px;font-weight:400;color:var(--slate);line-height:1.35}
.sst-seg{display:inline-flex;padding:3px;border-radius:999px;background:#ececee}
.sst-seg button{border:none;background:transparent;padding:6px 13px;border-radius:999px;font-size:13px;font-weight:600;color:#71717a;cursor:pointer;white-space:nowrap}
.sst-seg button::before{display:none}
.sst-seg button.on{background:#fff;color:var(--ink);box-shadow:0 1px 3px rgba(0,0,0,.12)}
.sst-dates{display:flex;align-items:center;flex-wrap:wrap;justify-content:flex-end;gap:8px}
.sst-date{display:inline-flex;gap:4px}
.sst-date select{appearance:none;-webkit-appearance:none;border:none;border-radius:10px;background:#fff;box-shadow:0 0 0 1px rgba(0,0,0,.08);padding:7px 10px;font-size:13.5px;font-weight:600;color:var(--ink);cursor:pointer}
.sst-to{font-size:13px;color:var(--slate)}
.sst-note{font-size:12px;color:var(--slate)}
.sst-foot{display:flex;align-items:center;gap:12px;flex-wrap:wrap}
.sst-foot>span{font-size:12.5px;color:var(--slate)}
.sst-preview{display:inline-flex;align-items:center;gap:7px;height:36px;padding:0 16px;border:none;border-radius:999px;background:#18181b;color:#fff;font-size:13.5px;font-weight:600;cursor:pointer;transition:transform .15s ease}
.sst-preview::before{display:none}
.sst-preview:hover{transform:translateY(-1px)}
.sst-preview:active{transform:scale(.97)}
.sst-bats{animation:sst-fly 6s linear infinite}
.sst-flash{opacity:0;animation:sst-flash 5s ease-out infinite 1s}
.sst-face,.sst-win{animation:sst-candle 2.4s infinite}
.sst-snow{animation:sst-snow 7s linear infinite}
.sst-light{animation:sst-twinkle 1.6s ease-in-out infinite alternate}
.sst-light.l1{animation-delay:-.4s}.sst-light.l2{animation-delay:-.8s}.sst-light.l3{animation-delay:-1.2s}
@keyframes sst-fly{from{transform:translate(-60px,44px)}to{transform:translate(360px,18px)}}
@keyframes sst-flash{0%,100%{opacity:0}2%{opacity:.55}4%{opacity:.1}6%{opacity:.4}14%{opacity:0}}
@keyframes sst-candle{0%,100%{opacity:1}30%{opacity:.75}33%{opacity:1}62%{opacity:.85}}
@keyframes sst-snow{from{transform:translateY(-96px)}to{transform:translateY(0)}}
@keyframes sst-twinkle{from{opacity:.35}to{opacity:1}}
[data-theme="dark"] .sst-card{box-shadow:0 0 0 1px rgba(255,255,255,.08)}
[data-theme="dark"] .sst-card.on{box-shadow:0 0 0 2px var(--coral),0 10px 24px -14px rgba(249,115,22,.55)}
[data-theme="dark"] .sst-opts{background:#1c1c1f}
[data-theme="dark"] .sst-row+.sst-row{border-top-color:rgba(255,255,255,.07)}
[data-theme="dark"] .sst-seg{background:#27272a}
[data-theme="dark"] .sst-seg button.on{background:#3f3f46;color:#fff}
[data-theme="dark"] .sst-date select{background:#27272a;box-shadow:0 0 0 1px rgba(255,255,255,.08);color:#ededf0}
[data-theme="dark"] .sst-preview{background:#ededf0;color:#18181b}
[data-theme="dark"] .sst-chip{background:#27272a;color:#a1a1aa}
[data-theme="dark"] .sst-status.live{color:#fb923c}
@media (max-width:560px){.sst-row{flex-wrap:wrap}.sst-dates{justify-content:flex-start}}
@media (prefers-reduced-motion:reduce){.sst *{animation:none !important}}
`
