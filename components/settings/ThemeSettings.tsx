'use client'

// Settings → Theme: how the board and help centre look. A live preview of the
// board up top (it follows every change, including the seasonal theme if your
// customers see it), then the logo and icons, brand colour, corners,
// appearance (light, dark, auto) and the seasonal theme. The page
// (app/admin/settings) owns the values and saves them.

import { useState, type ChangeEvent, type ReactNode } from 'react'
import SeasonalSettings from './SeasonalSettings'
import { activeSeason, type SeasonalConfig } from '@/lib/seasonal-themes'

type Mode = 'light' | 'dark' | 'auto'
type Radius = 'sharp' | 'soft' | 'rounded'

export type ThemeSettingsProps = {
  companyName: string
  host: string
  logoUrl: string
  faviconUrl: string
  ogImageUrl: string
  onLogoFile: (e: ChangeEvent<HTMLInputElement>) => void
  onFaviconFile: (e: ChangeEvent<HTMLInputElement>) => void
  onOgFile: (e: ChangeEvent<HTMLInputElement>) => void
  onLogoRemove: () => void
  onFaviconRemove: () => void
  onOgRemove: () => void
  accent: string
  setAccent: (c: string) => void
  /** A colour found in a newly uploaded logo. */
  suggested: string | null
  onSuggested: (use: boolean) => void
  onMatchLogo: () => void
  themeMode: Mode
  setThemeMode: (m: Mode) => void
  radius: Radius
  setRadius: (r: Radius) => void
  seasonal: SeasonalConfig
  setSeasonal: (s: SeasonalConfig) => void
}

const SWATCHES = ['#ff7a6b', '#f97316', '#eab308', '#84cc16', '#10b981', '#14b8a6', '#06b6d4', '#3b82f6', '#6366f1', '#7c3aed', '#ec4899', '#ef4444', '#18181b']
const CARD_R: Record<Radius, number> = { sharp: 4, soft: 12, rounded: 20 }
const BTN_R: Record<Radius, number> = { sharp: 6, soft: 10, rounded: 999 }
const isHex = (v: string) => /^#[0-9a-f]{6}$/i.test(v)
const luminance = (hex: string) => {
  const n = parseInt(hex.slice(1), 16)
  const ch = (v: number) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4 }
  return 0.2126 * ch((n >> 16) & 255) + 0.7152 * ch((n >> 8) & 255) + 0.0722 * ch(n & 255)
}
const Check = () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="m5 12.5 4.5 4.5L19 7.5" /></svg>

function Sec({ title, sub, children }: { title: string; sub: string; children: ReactNode }) {
  return (
    <div className="st-sec">
      <h2>{title}</h2>
      <p>{sub}</p>
      <div>{children}</div>
    </div>
  )
}

// ── The board, in miniature ─────────────────────────────────────────────────
function Board({ name, logo, accent, dark, radius, season }: { name: string; logo: string; accent: string; dark: boolean; radius: Radius; season: string | null }) {
  const ideas = [
    { t: 'Weekend delivery slots', v: 48, s: 'Planned' },
    { t: 'Loyalty points on every order', v: 31, s: 'In progress' },
    { t: 'Dark mode for the app', v: 22, s: 'Done' },
  ]
  return (
    <div className={`thp-board${dark ? ' dark' : ''}`} style={{ '--a': accent, '--cr': `${CARD_R[radius]}px`, '--br': `${BTN_R[radius]}px` } as React.CSSProperties}>
      <div className="thp-top">
        <span className="thp-logo">{logo ? <img src={logo} alt="" /> : (name || 'Y').charAt(0).toUpperCase()}</span>
        <b className="thp-name">{name || 'Your company'}</b>
        <span className="thp-nav"><i className="on">Ideas</i><i>Roadmap</i><i>Updates</i><i>Help</i></span>
        <span className="thp-btn ghost">Sign in</span>
      </div>
      <div className="thp-body">
        <div className="thp-hero">
          <div><b>Share your ideas</b><small>Vote on what we build next.</small></div>
          <span className="thp-btn">Submit an idea</span>
        </div>
        {ideas.map(i => (
          <div key={i.t} className="thp-idea">
            <span className="thp-vote"><svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor" aria-hidden><path d="M12 5l8 11H4z" /></svg>{i.v}</span>
            <span className="thp-idea-t">{i.t}<small>{i.s === 'Done' ? 'Shipped last week' : 'Requested by 12 customers'}</small></span>
            <span className={`thp-chip${i.s === 'Planned' ? ' a' : i.s === 'Done' ? ' g' : ''}`}>{i.s}</span>
          </div>
        ))}
      </div>
      {season === 'halloween' && (
        <>
          <span className="thp-moon" />
          <svg className="thp-bat" viewBox="0 0 64 32" aria-hidden><path d="M32 12c-6-7-16-9-28-5 4 2 5 5 4 8 4-2 7-1 8 2 3-3 7-2 8 1 2-3 6-3 8-1 2-2 6-2 8 1 1-3 5-4 8-1 1-3 4-4 8-2-1-3 0-6 4-8-12-4-22-2-28 5z" /></svg>
          <svg className="thp-pk" viewBox="0 0 100 90" aria-hidden><ellipse cx="30" cy="55" rx="24" ry="30" fill="#c2410c" /><ellipse cx="70" cy="55" rx="24" ry="30" fill="#c2410c" /><ellipse cx="50" cy="55" rx="27" ry="33" fill="#f97316" /><path d="M29 47 40 38l2 12zM71 47 60 38l-2 12zM27 64c8 11 38 11 46 0l-6 2-4-4-4 5-6-4-5 4-5-4-4 4z" fill="#ffd166" /><path d="M50 20c-4-8-2-14 6-17" stroke="#4d5b1f" strokeWidth="5" fill="none" strokeLinecap="round" /></svg>
        </>
      )}
    </div>
  )
}

function Preview(p: ThemeSettingsProps) {
  const season = activeSeason(p.seasonal, { path: '/' })
  const mode: Mode = season?.prefs.night ? 'dark' : p.themeMode
  const props = { name: p.companyName, logo: p.logoUrl, accent: isHex(p.accent) ? p.accent : '#ff7a6b', radius: p.radius, season: season?.def.id || null }
  return (
    <div className="thp" style={{ '--a': props.accent } as React.CSSProperties}>
      <div className="thp-bar">
        <span className="thp-live"><i />Live preview</span>
        <span className="thp-tags">
          <span>{mode === 'auto' ? 'Light + dark' : mode === 'dark' ? 'Dark' : 'Light'}</span>
          {season && <span className="thp-tag-s">{season.def.name} is on</span>}
        </span>
      </div>
      <div className="thp-window">
        <div className="thp-chrome"><i /><i /><i /><span className="thp-url">{p.host}</span></div>
        <div className="thp-stage">
          <Board {...props} dark={mode === 'dark'} />
          {mode === 'auto' && <div className="thp-split" aria-hidden><Board {...props} dark /></div>}
        </div>
      </div>
    </div>
  )
}

// ── Pieces ──────────────────────────────────────────────────────────────────
function Upload({ onFile, accept, children, className, label }: { onFile: (e: ChangeEvent<HTMLInputElement>) => void; accept: string; children: ReactNode; className: string; label: string }) {
  return (
    <label className={className} aria-label={label}>
      <input type="file" accept={accept} onChange={e => { onFile(e) }} hidden />
      {children}
    </label>
  )
}

function Assets(p: ThemeSettingsProps) {
  const letter = (p.companyName || 'Y').charAt(0).toUpperCase()
  return (
    <div className="ths-assets">
      <div className="ths-asset">
        <Upload onFile={p.onLogoFile} accept="image/*" className="ths-drop logo" label={p.logoUrl ? 'Replace logo' : 'Upload logo'}>
          {p.logoUrl ? <img src={p.logoUrl} alt="" /> : <span className="ths-letter">{letter}</span>}
          <span className="ths-drop-hint">{p.logoUrl ? 'Replace' : 'Upload'}</span>
        </Upload>
        <div className="ths-meta">
          <b>Logo</b>
          <small>Square, 256 × 256 or bigger. On your board, help centre and emails.</small>
          <span className="ths-acts">
            <Upload onFile={p.onLogoFile} accept="image/*" className="ths-pill" label={p.logoUrl ? 'Replace logo' : 'Upload logo'}>{p.logoUrl ? 'Replace' : 'Upload'}</Upload>
            {p.logoUrl && <button type="button" className="ths-link" onClick={p.onLogoRemove}>Remove</button>}
          </span>
        </div>
      </div>

      <div className="ths-asset">
        <Upload onFile={p.onFaviconFile} accept="image/png,image/x-icon,image/ico" className="ths-drop tab" label={p.faviconUrl ? 'Replace favicon' : 'Upload favicon'}>
          <span className="ths-tab">
            <span className="ths-fav">{p.faviconUrl ? <img src={p.faviconUrl} alt="" /> : p.logoUrl ? <img src={p.logoUrl} alt="" /> : letter}</span>
            <span className="ths-tab-t">{p.companyName || 'Your board'}</span>
            <span className="ths-tab-x">×</span>
          </span>
          <span className="ths-drop-hint">{p.faviconUrl ? 'Replace' : 'Upload'}</span>
        </Upload>
        <div className="ths-meta">
          <b>Favicon</b>
          <small>The little icon in the browser tab. PNG, 96 × 96. Without one, your logo is used.</small>
          <span className="ths-acts">
            <Upload onFile={p.onFaviconFile} accept="image/png,image/x-icon,image/ico" className="ths-pill" label={p.faviconUrl ? 'Replace favicon' : 'Upload favicon'}>{p.faviconUrl ? 'Replace' : 'Upload'}</Upload>
            {p.faviconUrl && <button type="button" className="ths-link" onClick={p.onFaviconRemove}>Remove</button>}
          </span>
        </div>
      </div>

      <div className="ths-asset wide">
        <Upload onFile={p.onOgFile} accept="image/*" className="ths-drop share" label={p.ogImageUrl ? 'Replace share image' : 'Upload share image'}>
          <span className="ths-share">
            <span className="ths-share-img" style={{ '--a': isHex(p.accent) ? p.accent : '#ff7a6b' } as React.CSSProperties}>
              {p.ogImageUrl ? <img src={p.ogImageUrl} alt="" /> : <span className="ths-share-ph"><span className="ths-letter sm">{p.logoUrl ? <img src={p.logoUrl} alt="" /> : letter}</span>{p.companyName || 'Your board'}</span>}
            </span>
            <span className="ths-share-txt"><small>{p.host}</small><b>{p.companyName || 'Your board'} · Ideas and roadmap</b></span>
          </span>
          <span className="ths-drop-hint">{p.ogImageUrl ? 'Replace' : 'Upload'}</span>
        </Upload>
        <div className="ths-meta">
          <b>Share image</b>
          <small>Shows when someone shares a link to your board, in messages and on social media. 1200 × 630.</small>
          <span className="ths-acts">
            <Upload onFile={p.onOgFile} accept="image/*" className="ths-pill" label={p.ogImageUrl ? 'Replace share image' : 'Upload share image'}>{p.ogImageUrl ? 'Replace' : 'Upload'}</Upload>
            {p.ogImageUrl && <button type="button" className="ths-link" onClick={p.onOgRemove}>Remove</button>}
          </span>
        </div>
      </div>
    </div>
  )
}

function Colour(p: ThemeSettingsProps) {
  const [draft, setDraft] = useState<string | null>(null)
  const shown = draft ?? p.accent
  const light = isHex(p.accent) && luminance(p.accent) > 0.45
  return (
    <div className="ths-colour">
      <div className="ths-swatches" role="radiogroup" aria-label="Brand colour">
        {SWATCHES.map(c => {
          const on = p.accent.toLowerCase() === c
          return (
            <button key={c} type="button" role="radio" aria-checked={on} aria-label={c} title={c} className={`ths-sw${on ? ' on' : ''}`} style={{ '--c': c } as React.CSSProperties} onClick={() => { setDraft(null); p.setAccent(c) }}>
              {on && <Check />}
            </button>
          )
        })}
      </div>
      <div className="ths-custom">
        <label className="ths-picker" style={{ '--c': isHex(p.accent) ? p.accent : '#ff7a6b' } as React.CSSProperties} title="Pick any colour">
          <input type="color" value={isHex(p.accent) ? p.accent : '#ff7a6b'} onChange={e => { setDraft(null); p.setAccent(e.target.value) }} aria-label="Pick any colour" />
        </label>
        <input className="ths-hex" value={shown} spellCheck={false} aria-label="Colour code" maxLength={7}
          onChange={e => { let v = e.target.value.trim(); if (v && !v.startsWith('#')) v = '#' + v; setDraft(v); if (isHex(v)) p.setAccent(v.toLowerCase()) }}
          onBlur={() => setDraft(null)} />
        {p.logoUrl && (
          <button type="button" className="ths-pill soft" onClick={p.onMatchLogo}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="m2 22 1-1h3l9-9M3 21v-3l9-9" /><path d="m15 6 3.4-3.4a2.1 2.1 0 1 1 3 3L18 9l.4.4a2.1 2.1 0 1 1-3 3l-3.8-3.8a2.1 2.1 0 1 1 3-3l.4.4z" /></svg>
            Match my logo
          </button>
        )}
      </div>
      {p.suggested && (
        <div className="ths-suggest">
          <span className="ths-suggest-sw" style={{ '--c': p.suggested } as React.CSSProperties} />
          <span>Your logo&rsquo;s colour is <b>{p.suggested}</b>.</span>
          <button type="button" className="ths-pill" onClick={() => p.onSuggested(true)}>Use it</button>
          <button type="button" className="ths-link" onClick={() => p.onSuggested(false)}>No thanks</button>
        </div>
      )}
      {light && <p className="ths-warn">White text can be hard to read on a colour this light. A darker shade works better for buttons.</p>}
    </div>
  )
}

function Appearance(p: ThemeSettingsProps) {
  const opts: { key: Mode; label: string; sub: string }[] = [
    { key: 'light', label: 'Light', sub: 'Bright and clean' },
    { key: 'dark', label: 'Dark', sub: 'Easy on the eyes' },
    { key: 'auto', label: 'Auto', sub: 'Follows each device' },
  ]
  return (
    <div className="ths-tiles" role="radiogroup" aria-label="Appearance">
      {opts.map(o => (
        <button key={o.key} type="button" role="radio" aria-checked={p.themeMode === o.key} className={`ths-tile${p.themeMode === o.key ? ' on' : ''}`} onClick={() => p.setThemeMode(o.key)}>
          <span className={`tha-win ${o.key}`} aria-hidden>
            <span className="tha-pane l"><i /><i /><i className="b" /></span>
            {o.key !== 'light' && <span className="tha-pane d"><i /><i /><i className="b" /></span>}
          </span>
          <span className="ths-tile-t"><b>{o.label}</b><small>{o.sub}</small></span>
          {p.themeMode === o.key && <span className="ths-tick"><Check /></span>}
        </button>
      ))}
    </div>
  )
}

function Corners(p: ThemeSettingsProps) {
  const opts: { key: Radius; label: string }[] = [{ key: 'sharp', label: 'Sharp' }, { key: 'soft', label: 'Soft' }, { key: 'rounded', label: 'Rounded' }]
  return (
    <div className="ths-tiles" role="radiogroup" aria-label="Corners">
      {opts.map(o => (
        <button key={o.key} type="button" role="radio" aria-checked={p.radius === o.key} className={`ths-tile${p.radius === o.key ? ' on' : ''}`} onClick={() => p.setRadius(o.key)}>
          <span className="thc-art" aria-hidden style={{ '--cr': `${CARD_R[o.key]}px`, '--br': `${BTN_R[o.key]}px`, '--a': isHex(p.accent) ? p.accent : '#ff7a6b' } as React.CSSProperties}>
            <span className="thc-card"><i /><i /><span className="thc-btn" /></span>
          </span>
          <span className="ths-tile-t"><b>{o.label}</b></span>
          {p.radius === o.key && <span className="ths-tick"><Check /></span>}
        </button>
      ))}
    </div>
  )
}

export default function ThemeSettings(p: ThemeSettingsProps) {
  return (
    <div className="ths">
      <Preview {...p} />
      <Sec title="Logo & icons" sub="Your brand on the board, the help centre, emails and browser tabs."><Assets {...p} /></Sec>
      <Sec title="Brand colour" sub="Buttons, links and highlights. Your team's Colvy uses it too."><Colour {...p} /></Sec>
      <Sec title="Corners" sub="How round buttons and cards are."><Corners {...p} /></Sec>
      <Sec title="Appearance" sub="Light, dark, or follow each person's device."><Appearance {...p} /></Sec>
      <Sec title="Seasonal theme" sub="Dress Colvy up for the holidays, for your team and, if you like, your customers."><SeasonalSettings value={p.seasonal} onChange={p.setSeasonal} /></Sec>
      <style>{UI_CSS}</style>
      <style data-colvy-dark="">{ART_CSS}</style>
    </div>
  )
}

// The page's own controls (mapped by components/DarkTheme like the rest).
const UI_CSS = `
.ths{display:flex;flex-direction:column}
.ths-assets{display:grid;grid-template-columns:1fr 1fr;gap:12px}
.ths-asset{display:flex;flex-direction:column;gap:12px;padding:14px;border-radius:18px;background:#f7f7f8}
.ths-asset.wide{grid-column:1/-1;flex-direction:row;align-items:center;gap:18px}
.ths-meta{display:flex;flex-direction:column;gap:3px;min-width:0}
.ths-meta b{font-size:14.5px;font-weight:700;color:#18181b}
.ths-meta small{font-size:12.5px;line-height:1.4;color:#71717a}
.ths-acts{display:flex;align-items:center;gap:10px;margin-top:8px}
.ths-pill{display:inline-flex;align-items:center;gap:6px;height:32px;padding:0 14px;border:none;border-radius:999px;background:#fff;box-shadow:0 0 0 1px rgba(0,0,0,.1);font-size:13px;font-weight:600;color:#18181b;cursor:pointer;white-space:nowrap;transition:box-shadow .15s ease,transform .15s ease}
.ths-pill::before,.ths-link::before,.ths-sw::before,.ths-tile::before{display:none}
.ths-pill:hover{box-shadow:0 0 0 1px rgba(0,0,0,.18),0 2px 6px rgba(0,0,0,.06)}
.ths-pill:active{transform:scale(.97)}
.ths-pill.soft{background:#f4f4f5;box-shadow:none}
.ths-pill.soft:hover{background:#ececee}
.ths-link{border:none;background:none;padding:0;font-size:13px;font-weight:600;color:#71717a;cursor:pointer}
.ths-link:hover{color:#dc2626}
.ths-drop{position:relative;display:flex;align-items:center;justify-content:center;overflow:hidden;cursor:pointer;border-radius:14px;background:#fff;box-shadow:0 0 0 1px rgba(0,0,0,.06);transition:box-shadow .15s ease}
.ths-drop:hover{box-shadow:0 0 0 2px var(--coral)}
.ths-drop.logo{width:96px;height:96px;border-radius:22px}
.ths-drop.logo img{width:100%;height:100%;object-fit:contain}
.ths-drop.tab{height:96px;padding:0 14px;align-items:flex-end;background:#ececef}
.ths-drop.share{width:300px;flex-shrink:0;padding:10px;background:#fff}
.ths-drop-hint{position:absolute;inset:auto 8px 8px auto;padding:3px 9px;border-radius:999px;background:rgba(17,17,19,.78);color:#fff;font-size:11px;font-weight:700;opacity:0;transform:translateY(4px);transition:opacity .15s ease,transform .15s ease;pointer-events:none}
.ths-drop:hover .ths-drop-hint{opacity:1;transform:none}
.ths-colour{display:flex;flex-direction:column;gap:14px}
.ths-swatches{display:flex;flex-wrap:wrap;gap:10px}
.ths-sw{width:36px;height:36px;border:none;border-radius:50%;background:var(--c);color:#fff;display:inline-flex;align-items:center;justify-content:center;cursor:pointer;box-shadow:inset 0 0 0 1px rgba(0,0,0,.08);transition:transform .15s cubic-bezier(.34,1.56,.64,1),box-shadow .15s ease}
.ths-sw:hover{transform:scale(1.12)}
.ths-sw.on{box-shadow:0 0 0 3px #fff,0 0 0 5px var(--c);transform:scale(1.04)}
.ths-custom{display:flex;align-items:center;flex-wrap:wrap;gap:10px}
.ths-picker{position:relative;width:40px;height:40px;border-radius:12px;background:var(--c);cursor:pointer;box-shadow:inset 0 0 0 1px rgba(0,0,0,.1);overflow:hidden}
.ths-picker::after{content:'';position:absolute;right:3px;bottom:3px;width:12px;height:12px;border-radius:50%;background:conic-gradient(#f43f5e,#f59e0b,#84cc16,#06b6d4,#6366f1,#d946ef,#f43f5e);box-shadow:0 0 0 2px #fff}
.ths-picker input{position:absolute;inset:0;opacity:0;cursor:pointer;width:100%;height:100%}
.ths .ths-hex{width:112px;height:40px;padding:0 12px;font:600 14px ui-monospace,SFMono-Regular,Menlo,monospace;text-transform:uppercase}
.ths-suggest{display:flex;align-items:center;flex-wrap:wrap;gap:10px;padding:10px 12px;border-radius:14px;background:#f7f7f8;font-size:13px;color:#3f3f46}
.ths-suggest-sw{width:22px;height:22px;border-radius:7px;background:var(--c);box-shadow:inset 0 0 0 1px rgba(0,0,0,.1)}
.ths-warn{margin:0;font-size:12.5px;color:#b45309}
.ths-tiles{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}
.ths-tile{position:relative;display:flex;flex-direction:column;gap:10px;padding:10px 10px 12px;border:none;border-radius:18px;background:#f7f7f8;cursor:pointer;text-align:left;transition:box-shadow .15s ease,background .15s ease}
.ths-tile:hover{background:#f1f1f3}
.ths-tile.on{background:#fff;box-shadow:0 0 0 2px var(--coral),0 8px 20px -12px rgba(0,0,0,.25)}
.ths-tile-t{display:flex;flex-direction:column;gap:1px;padding:0 4px}
.ths-tile-t b{font-size:14px;font-weight:700;color:#18181b}
.ths-tile-t small{font-size:12px;color:#71717a}
.ths-tick{position:absolute;top:16px;right:16px;width:22px;height:22px;border-radius:50%;background:var(--coral);color:#fff;display:inline-flex;align-items:center;justify-content:center;box-shadow:0 2px 6px rgba(0,0,0,.18)}
[data-theme="dark"] .ths-asset,[data-theme="dark"] .ths-tile,[data-theme="dark"] .ths-suggest{background:#232326}
[data-theme="dark"] .ths-tile:hover{background:#29292d}
[data-theme="dark"] .ths-tile.on{background:#29292d}
[data-theme="dark"] .ths-sw{box-shadow:inset 0 0 0 1px rgba(255,255,255,.14)}
[data-theme="dark"] .ths-meta b,[data-theme="dark"] .ths-tile-t b{color:#ededf0}
[data-theme="dark"] .ths-meta small,[data-theme="dark"] .ths-tile-t small{color:#a1a1aa}
[data-theme="dark"] .ths-pill{background:#27272a;color:#ededf0;box-shadow:0 0 0 1px rgba(255,255,255,.1)}
[data-theme="dark"] .ths-pill.soft{background:#27272a;box-shadow:none}
[data-theme="dark"] .ths-drop{background:#27272a;box-shadow:0 0 0 1px rgba(255,255,255,.06)}
[data-theme="dark"] .ths-drop.tab{background:#202023}
[data-theme="dark"] .ths-sw.on{box-shadow:0 0 0 3px #111113,0 0 0 5px var(--c)}
[data-theme="dark"] .ths-suggest{color:#d4d4d8}
@container (max-width:620px){.ths-assets{grid-template-columns:1fr}.ths-asset.wide{flex-direction:column;align-items:stretch}.ths-drop.share{width:100%}}
@media (max-width:640px){.ths-assets{grid-template-columns:1fr}.ths-asset.wide{flex-direction:column;align-items:stretch}.ths-drop.share{width:100%}.ths-tiles{gap:8px}.ths-tile{padding:8px 8px 10px;gap:8px}.ths-tile-t small{display:none}.ths-tick{top:12px;right:12px;width:20px;height:20px}}
@media (max-width:640px){.tha-win,.thc-art{height:60px}.thc-card{width:76%;padding:7px}}
`

// Pictures of light and dark, which keep their own colours (DarkTheme skips this sheet).
const ART_CSS = `
.thp{contain:inline-size;margin:4px 0 8px;padding:16px;border-radius:24px;background:radial-gradient(120% 90% at 0% 0%,color-mix(in srgb,var(--a) 22%,#fff),transparent 60%),radial-gradient(90% 90% at 100% 100%,color-mix(in srgb,var(--a) 14%,#fff),transparent 60%),#f4f4f6;transition:background .3s ease}
[data-theme="dark"] .thp{background:radial-gradient(120% 90% at 0% 0%,color-mix(in srgb,var(--a) 26%,#111113),transparent 60%),radial-gradient(90% 90% at 100% 100%,color-mix(in srgb,var(--a) 16%,#111113),transparent 60%),#18181b}
.thp-bar{display:flex;align-items:center;justify-content:space-between;gap:10px;margin:0 4px 12px}
.thp-live{display:inline-flex;align-items:center;gap:7px;font-size:12.5px;font-weight:700;color:#3f3f46}
[data-theme="dark"] .thp-live{color:#d4d4d8}
.thp-live i{width:8px;height:8px;border-radius:50%;background:#22c55e;box-shadow:0 0 0 3px rgba(34,197,94,.2);animation:thp-pulse 2s ease-in-out infinite}
.thp-tags{display:flex;gap:6px}
.thp-tags span{padding:3px 10px;border-radius:999px;background:rgba(255,255,255,.75);font-size:11.5px;font-weight:700;color:#52525b}
[data-theme="dark"] .thp-tags span{background:rgba(255,255,255,.08);color:#d4d4d8}
.thp-tags .thp-tag-s{background:#1f1430;color:#fdba74}
.thp-window{border-radius:16px;overflow:hidden;background:#fff;box-shadow:0 0 0 1px rgba(0,0,0,.06),0 24px 48px -24px rgba(24,24,27,.35)}
.thp-chrome{display:flex;align-items:center;gap:6px;height:34px;padding:0 12px;background:#f4f4f5;border-bottom:1px solid #ececef}
[data-theme="dark"] .thp-chrome{background:#232326;border-color:#2c2c31}
.thp-chrome>i{width:10px;height:10px;border-radius:50%;background:#e4e4e7}
.thp-chrome>i:nth-child(1){background:#ff5f57}.thp-chrome>i:nth-child(2){background:#febc2e}.thp-chrome>i:nth-child(3){background:#28c840}
.thp-url{margin:0 auto;padding:3px 14px;border-radius:8px;background:#fff;font-size:11.5px;color:#71717a;max-width:60%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
[data-theme="dark"] .thp-url{background:#18181b;color:#a1a1aa}
.thp-stage{position:relative}
.thp-split{position:absolute;inset:0;clip-path:polygon(62% 0,100% 0,100% 100%,38% 100%)}
.thp-board{--bg:#fafafa;--card:#fff;--ink:#18181b;--mut:#71717a;--line:#ececef;--soft:#f4f4f5;position:relative;overflow:hidden;background:var(--bg);color:var(--ink);font-size:12px;transition:background .25s ease,color .25s ease}
.thp-board.dark{--bg:#111113;--card:#1c1c1f;--ink:#ededf0;--mut:#a1a1aa;--line:#2c2c31;--soft:#27272a}
.thp-top{display:flex;align-items:center;gap:10px;height:48px;padding:0 16px;background:var(--card);border-bottom:1px solid var(--line)}
.thp-logo{width:26px;height:26px;flex-shrink:0;border-radius:8px;background:var(--a);color:#fff;display:inline-flex;align-items:center;justify-content:center;font-size:13px;font-weight:800;overflow:hidden;transition:background .25s ease}
.thp-logo img{width:100%;height:100%;object-fit:contain;background:#fff}
.thp-name{font-size:13px;font-weight:750;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:150px}
.thp-nav{display:flex;gap:4px;margin-left:8px}
.thp-nav i{font-style:normal;padding:5px 10px;border-radius:999px;color:var(--mut);font-weight:600}
.thp-nav i.on{background:color-mix(in srgb,var(--a) 14%,transparent);color:var(--a)}
.thp-btn{display:inline-flex;align-items:center;height:30px;padding:0 14px;border-radius:var(--br);background:var(--a);color:#fff;font-weight:700;white-space:nowrap;transition:background .25s ease,border-radius .25s ease}
.thp-btn.ghost{margin-left:auto;height:28px;background:transparent;color:var(--ink);box-shadow:inset 0 0 0 1px var(--line)}
.thp-body{display:flex;flex-direction:column;gap:8px;padding:16px}
.thp-hero{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:4px}
.thp-hero b{display:block;font-size:17px;font-weight:800;letter-spacing:-.01em}
.thp-hero small{color:var(--mut);font-size:12px}
.thp-idea{display:flex;align-items:center;gap:12px;padding:10px 12px;border-radius:var(--cr);background:var(--card);box-shadow:0 0 0 1px var(--line);transition:border-radius .25s ease,background .25s ease}
.thp-vote{display:inline-flex;flex-direction:column;align-items:center;justify-content:center;gap:1px;width:38px;height:38px;flex-shrink:0;border-radius:calc(var(--cr) * .8);background:color-mix(in srgb,var(--a) 12%,transparent);color:var(--a);font-weight:800;font-size:11.5px;transition:border-radius .25s ease}
.thp-idea-t{flex:1;width:0;min-width:0;display:flex;flex-direction:column;gap:1px;font-weight:650;font-size:12.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.thp-idea-t small{font-weight:500;font-size:11px;color:var(--mut)}
.thp-chip{padding:3px 9px;border-radius:999px;background:var(--soft);color:var(--mut);font-size:10.5px;font-weight:700;white-space:nowrap}
.thp-chip.a{background:color-mix(in srgb,var(--a) 14%,transparent);color:var(--a)}
.thp-chip.g{background:rgba(34,197,94,.14);color:#16a34a}
.thp-moon{position:absolute;top:58px;right:22px;width:34px;height:34px;border-radius:50%;background:radial-gradient(circle at 38% 36%,#fffdf4,#f6ecd2 60%,#e6d6ad);box-shadow:0 0 18px 6px rgba(255,236,190,.3);opacity:.9}
.thp-board:not(.dark) .thp-moon{display:none}
.thp-bat{position:absolute;top:66px;right:68px;width:30px;fill:#120c1a;animation:thp-bat 3s ease-in-out infinite alternate}
.thp-board:not(.dark) .thp-bat{fill:#2a1d38}
.thp-pk{position:absolute;right:14px;bottom:8px;width:34px}
.tha-win{position:relative;display:block;height:78px;border-radius:12px;overflow:hidden;box-shadow:0 0 0 1px rgba(0,0,0,.08)}
.tha-pane{position:absolute;inset:0;display:flex;flex-direction:column;gap:6px;padding:22px 12px 0;background:#fff}
.tha-pane::before{content:'';position:absolute;left:0;right:0;top:0;height:14px;background:#f4f4f5}
.tha-pane i{display:block;height:8px;border-radius:4px;background:#ececef}
.tha-pane i:nth-child(2){width:70%}
.tha-pane i.b{width:44%;height:12px;border-radius:6px;background:var(--coral)}
.tha-pane.d{background:#18181b}
.tha-pane.d::before{background:#27272a}
.tha-pane.d i{background:#2f2f34}
.tha-pane.d i.b{background:var(--coral)}
.tha-win.auto .tha-pane.d{clip-path:polygon(60% 0,100% 0,100% 100%,40% 100%)}
.thc-art{display:flex;align-items:center;justify-content:center;height:78px;border-radius:12px;background:#ececef}
[data-theme="dark"] .thc-art{background:#27272a}
.thc-card{display:flex;flex-direction:column;gap:6px;width:64%;padding:10px;border-radius:var(--cr);background:#fff;box-shadow:0 4px 10px -6px rgba(0,0,0,.25)}
[data-theme="dark"] .thc-card{background:#3a3a40}
.thc-card i{display:block;height:6px;border-radius:3px;background:#e4e4e7}
[data-theme="dark"] .thc-card i{background:#52525b}
.thc-card i:nth-child(2){width:60%}
.thc-btn{align-self:flex-start;width:46%;height:14px;margin-top:2px;border-radius:var(--br);background:var(--a)}
/* The logo tile, a browser tab with the favicon, and a shared-link card. */
.ths-letter{width:100%;height:100%;display:inline-flex;align-items:center;justify-content:center;background:var(--coral);color:#fff;font-size:40px;font-weight:800;transition:background .25s ease}
.ths-letter.sm{width:36px;height:36px;flex-shrink:0;border-radius:10px;overflow:hidden;background:rgba(255,255,255,.22);font-size:17px}
.ths-letter img{width:100%;height:100%;object-fit:contain;background:#fff}
.ths-tab{display:flex;align-items:center;gap:8px;width:100%;max-width:250px;height:40px;padding:0 10px 0 12px;border-radius:12px 12px 0 0;background:#fff;font-size:12.5px;color:#3f3f46}
[data-theme="dark"] .ths-tab{background:#2f2f34;color:#d4d4d8}
.ths-fav{width:18px;height:18px;flex-shrink:0;border-radius:5px;overflow:hidden;display:inline-flex;align-items:center;justify-content:center;background:var(--coral);color:#fff;font-size:10px;font-weight:800}
.ths-fav img{width:100%;height:100%;object-fit:contain;background:#fff}
.ths-tab-t{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:600;text-align:left}
.ths-tab-x{color:#a1a1aa;font-size:15px;line-height:1}
.ths-share{display:flex;flex-direction:column;width:100%;border-radius:12px;overflow:hidden;box-shadow:0 0 0 1px rgba(0,0,0,.08)}
.ths-share-img{display:flex;aspect-ratio:1200/630;background:linear-gradient(135deg,var(--a),color-mix(in srgb,var(--a) 55%,#000));transition:background .25s ease}
.ths-share-img>img{width:100%;height:100%;object-fit:cover}
.ths-share-ph{margin:auto;display:flex;align-items:center;gap:10px;color:#fff;font-size:16px;font-weight:800;letter-spacing:-.01em}
.ths-share-txt{display:flex;flex-direction:column;gap:2px;padding:8px 11px 9px;background:#f4f4f5;text-align:left}
.ths-share-txt small{font-size:11px;color:#71717a}
.ths-share-txt b{font-size:12.5px;font-weight:700;color:#18181b;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
[data-theme="dark"] .ths-share{box-shadow:0 0 0 1px rgba(255,255,255,.08)}
[data-theme="dark"] .ths-share-txt{background:#27272a}
[data-theme="dark"] .ths-share-txt small{color:#a1a1aa}
[data-theme="dark"] .ths-share-txt b{color:#ededf0}
@keyframes thp-pulse{50%{box-shadow:0 0 0 6px rgba(34,197,94,0)}}
@keyframes thp-bat{from{transform:translate(0,0)}to{transform:translate(-14px,6px)}}
@media (max-width:640px){.thp{padding:10px;border-radius:18px}.thp-nav{display:none}.thp-name{max-width:110px}.thp-hero small{display:none}}
@media (prefers-reduced-motion:reduce){.thp *{animation:none !important;transition:none !important}}
`
