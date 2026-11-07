'use client'

// The main landing's look, as building blocks for the other marketing pages
// (feature, channel, solution and industry pages and the hubs): two-tone
// headlines, a bento feature grid that never leaves empty cells, saturated
// story bands with floating cards, a dark numbered "how it works" band, an
// instrument-panel stats strip, the gradient closing band, and a compact
// "explore every feature" block grouped by job. Render <SellioStyles /> once
// on a page that uses them. Product-level copy only: no customer stories, no
// numbers that aren't true.

import { ReactNode, useEffect, useRef, useState, CSSProperties } from 'react'
import FeatureIcon from '@/components/FeatureIcon'
import { FEATURE_GROUPS } from '@/lib/feature-groups'

export const S_INK = '#0f1119'
export const S_MONO = 'ui-monospace, "SF Mono", SFMono-Regular, Menlo, Consolas, monospace'
const PINK = '#ff4d8d', PURPLE = '#7c5cff'

/** Blend two hex colours (t = 0 → a, t = 1 → b). */
export function mix(a: string, b: string, t: number): string {
  const p = (h: string) => { const x = h.replace('#', ''); const f = x.length === 3 ? x.split('').map(c => c + c).join('') : x.slice(0, 6); return [0, 2, 4].map(i => parseInt(f.slice(i, i + 2), 16)) }
  const [r1, g1, b1] = p(a), [r2, g2, b2] = p(b)
  const h = (n: number) => Math.round(n).toString(16).padStart(2, '0')
  return `#${h(r1 + (r2 - r1) * t)}${h(g1 + (g2 - g1) * t)}${h(b1 + (b2 - b1) * t)}`
}

/** A headline that ends like the landing's: with a full stop (unless it already has punctuation). */
export function withStop(s: string) { return /[.!?…”"’)]$/.test(s.trim()) ? s : `${s.trim()}.` }

const lum = (hex: string) => {
  const n = parseInt(hex.slice(1), 16)
  const [r, g, b] = [n >> 16, (n >> 8) & 255, n & 255].map(v => { const c = v / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4 })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}
const contrast = (a: string, b: string) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05) }
/**
 * The accent as text: as is on light pages; on dark ones lifted towards white
 * until it reads (5:1 on the page, so still 4.5:1 on a tinted card or chip),
 * so a blue or indigo eyebrow isn't lost on near-black.
 */
export function accentText(accent: string, dark: boolean) {
  if (!dark || !/^#[0-9a-f]{6}$/i.test(accent)) return accent
  for (let t = 0; t <= 1.0001; t += 0.05) { const c = mix(accent, '#ffffff', t); if (contrast(c, '#0d0e17') >= 5) return c }
  return '#ffffff'
}

function vars(dark: boolean, accent: string): CSSProperties {
  return {
    ['--a' as any]: accent,
    ['--at' as any]: accentText(accent, dark),
    ['--ona' as any]: onAccent(accent),
    ['--ontext' as any]: dark ? '#0b0c13' : '#ffffff',
    ['--bad' as any]: dark ? '#ff8a8d' : '#e5484d',
    ['--a2' as any]: mix(accent, PURPLE, 0.35),
    ['--text' as any]: dark ? '#f4f5fb' : S_INK,
    ['--muted' as any]: dark ? 'rgba(244,245,251,0.62)' : 'rgba(15,17,25,0.6)',
    ['--grey' as any]: dark ? 'rgba(244,245,251,0.42)' : 'rgba(15,17,25,0.34)',
    ['--card' as any]: dark ? 'rgba(255,255,255,0.045)' : '#ffffff',
    ['--line' as any]: dark ? 'rgba(255,255,255,0.09)' : 'rgba(15,17,25,0.08)',
    ['--line2' as any]: dark ? 'rgba(255,255,255,0.16)' : 'rgba(15,17,25,0.14)',
    ['--bg2' as any]: dark ? '#0d0e17' : '#f7f7f9',
  }
}

function useSeen(threshold = 0.14) {
  const ref = useRef<HTMLDivElement>(null)
  const [v, setV] = useState(false)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const o = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setV(true); o.disconnect() } }, { threshold })
    o.observe(el)
    return () => o.disconnect()
  }, [threshold])
  return { ref, v }
}

export function SReveal({ children, delay = 0, y = 26, style, className }: { children: ReactNode; delay?: number; y?: number; style?: CSSProperties; className?: string }) {
  const { ref, v } = useSeen()
  return <div ref={ref} className={className} style={{ ...style, opacity: v ? 1 : 0, transform: v ? 'none' : `translateY(${y}px)`, transition: `opacity .7s cubic-bezier(.16,1,.3,1) ${delay}s, transform .7s cubic-bezier(.16,1,.3,1) ${delay}s` }}>{children}</div>
}

const Arrow = ({ s = 17 }: { s?: number }) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden><line x1="5" y1="12" x2="19" y2="12" /><polyline points="12 5 19 12 12 19" /></svg>
const Tick = ({ s = 12 }: { s?: number }) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden><polyline points="20 6 9 17 4 12" /></svg>

// ── Buttons and the hero's trust line ────────────────────────────────────────

/** Text on an accent fill: white, unless the accent is too light for it (then ink). */
export const onAccent = (accent: string) => (!/^#[0-9a-f]{6}$/i.test(accent) || contrast('#ffffff', accent) >= 2.6 ? '#ffffff' : S_INK)

/** The landing's primary pill: label, then an arrow in a circle. */
export function SPill({ children, onClick, href, accent, cta }: { children: ReactNode; onClick?: () => void; href?: string; accent: string; cta?: string }) {
  const style = { ['--a' as any]: accent, color: onAccent(accent) } as CSSProperties
  const inner = <>{children}<span className="ar"><Arrow /></span></>
  return href
    ? <a href={href} className="sl-pill" style={style} data-cta={cta}>{inner}</a>
    : <button type="button" onClick={onClick} className="sl-pill" style={style} data-cta={cta}>{inner}</button>
}
export function SGhost({ children, href, onClick }: { children: ReactNode; href?: string; onClick?: () => void }) {
  return href ? <a href={href} className="sl-ghost">{children}</a> : <button type="button" onClick={onClick} className="sl-ghost">{children}</button>
}
/** Mono line under the hero buttons, as on the landing. */
export function STrust({ accent, items = ['Free plan', 'No card needed', 'Set up in about 45 minutes'] }: { accent: string; items?: string[] }) {
  return <div className="sl-trust" style={{ ['--a' as any]: accent } as CSSProperties}>{items.map(i => <span key={i}>{i}</span>)}</div>
}

/**
 * Where you are: a round back pill to the hub ("Phones") and the current
 * page's chip, on one line, instead of a bare "← Phones" link above it.
 */
export function SCrumb({ back, current, icon, accent, extra, dark = false }: { back?: { label: string; href: string }; current: string; icon: string; accent: string; extra?: ReactNode; dark?: boolean }) {
  return (
    <nav className="sl-crumb" aria-label="Breadcrumb" style={{ ['--a' as any]: accent, ['--at' as any]: accentText(accent, dark) } as CSSProperties}>
      {back && <a href={back.href} className="sl-crumb-back"><span className="ar" aria-hidden><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><line x1="19" y1="12" x2="5" y2="12" /><polyline points="12 19 5 12 12 5" /></svg></span>{back.label}</a>}
      {back && <span className="sl-crumb-sep" aria-hidden>/</span>}
      <span className="sl-crumb-now" aria-current="page"><FeatureIcon name={icon} color={accentText(accent, dark)} size={14} />{current}</span>
      {extra}
    </nav>
  )
}

// ── Section heading ──────────────────────────────────────────────────────────

/** Eyebrow in mono, a big two-tone headline (the grey part continues it). */
export function SHead({ eyebrow, title, grey, sub, accent, dark = false, center = true, onDark = false }: { eyebrow?: string; title: string; grey?: string; sub?: string; accent: string; dark?: boolean; center?: boolean; onDark?: boolean }) {
  return (
    <SReveal className={`sl-head${center ? ' c' : ''}${onDark ? ' ondark' : ''}`} style={vars(dark, accent)}>
      {eyebrow && <span className="sl-eyebrow">{eyebrow}</span>}
      <h2 className="sl-h2">{withStop(title)}{grey && <> <span className="g">{withStop(grey)}</span></>}</h2>
      {sub && <p className="sl-sub">{sub}</p>}
    </SReveal>
  )
}

// ── Bento feature grid ───────────────────────────────────────────────────────

/** Column spans on a 6-column grid so every row is full, whatever the count. */
export function bentoSpans(n: number): number[] {
  const out: number[] = []
  const rows = [[4, 2], [2, 2, 2], [2, 4], [2, 2, 2]]
  let p = 0
  while (n - out.length > 3) { out.push(...rows[p % rows.length]); p++ }
  const r = n - out.length
  out.push(...(r === 1 ? [6] : r === 2 ? [3, 3] : r === 3 ? [2, 2, 2] : []))
  return out
}

export function SBento({ items, accent, dark = false }: { items: { icon: string; title: string; desc: string }[]; accent: string; dark?: boolean }) {
  const spans = bentoSpans(items.length)
  return (
    <div className="sl-bento" style={vars(dark, accent)}>
      {items.map((f, i) => {
        const span = spans[i] || 2
        const kind = i === 0 ? 'hero' : span >= 6 ? 'wide' : span >= 4 ? 'tint' : ''
        return (
          <SReveal key={f.title} delay={(i % 3) * 0.05} className={`sl-bcell ${kind}`} style={{ gridColumn: `span ${span}` }}>
            <div className={`sl-cell ${kind}`}>
              <span className="sl-ix">{String(i + 1).padStart(2, '0')}</span>
              <span className="sl-ic"><FeatureIcon name={f.icon} color={i === 0 ? onAccent(accent) : accentText(accent, dark)} size={i === 0 ? 28 : 24} /></span>
              <span className="sl-tx">
                <h3>{f.title}</h3>
                <p>{f.desc}</p>
              </span>
            </div>
          </SReveal>
        )
      })}
    </div>
  )
}

// ── Story band (saturated colour, floating cards) ────────────────────────────

/**
 * A full-bleed band like the landing's "Turn questions into sales.": a deep
 * colour (or a soft tint) with a big headline, the copy and ticks on one side,
 * and the ticks again as floating cards on the other.
 */
export function SStory({ tag, title, body, bullets, icons = [], accent, tone = 'deep', flip = false, dark = false }: {
  tag: string; title: string; body: string; bullets: string[]; icons?: string[]; accent: string; tone?: 'deep' | 'soft'; flip?: boolean; dark?: boolean
}) {
  const deep = tone === 'deep'
  const bg = deep ? mix(accent, '#0b0c13', 0.58) : dark ? mix(accent, '#0a0b12', 0.86) : mix(accent, '#ffffff', 0.9)
  const head = deep ? mix(accent, '#ffffff', 0.55) : dark ? '#f4f5fb' : S_INK
  const style = { ...vars(dark, accent), ['--bg' as any]: bg, ['--head' as any]: head, ['--body' as any]: deep ? 'rgba(255,255,255,0.78)' : dark ? 'rgba(244,245,251,0.7)' : 'rgba(15,17,25,0.66)', ['--tickbg' as any]: deep ? mix(accent, '#ffffff', 0.55) : accent, ['--tickfg' as any]: deep ? mix(accent, '#0b0c13', 0.58) : '#fff', ['--fg' as any]: deep || dark ? '#fff' : S_INK } as CSSProperties
  return (
    <section className={`sl-story${flip ? ' flip' : ''}${deep ? ' deep' : ' soft'}`} style={style}>
      <div className="sl-story-in">
        <SReveal className="sl-story-copy">
          <span className="sl-tag">{tag}</span>
          <h2>{withStop(title)}</h2>
          <p>{body}</p>
          <ul className="sl-ticks">{bullets.map(b => <li key={b}><i><Tick /></i>{b}</li>)}</ul>
        </SReveal>
        <div className="sl-stack" aria-hidden>
          {bullets.slice(0, 3).map((b, i) => (
            <div key={b} className={`sl-float f${i}`}>
              <span className="sl-fic"><FeatureIcon name={icons[i] || ['sparkle', 'bolt', 'chat'][i]} color="#fff" size={19} /></span>
              <span className="sl-fx"><b>{b}</b><span className="sl-line" /><span className="sl-line s" /></span>
              <span className="sl-ok"><Tick s={11} /></span>
            </div>
          ))}
          <span className="sl-blob" />
        </div>
      </div>
    </section>
  )
}

// ── How it works (dark, numbered) ────────────────────────────────────────────

export function SSteps({ eyebrow = 'How it works', title, grey, steps, accent, onGo, cta = 'Get started free', after }: {
  eyebrow?: string; title: string; grey?: string; steps: { title: string; desc: string }[]; accent: string; onGo?: () => void; cta?: string; after?: ReactNode
}) {
  const n = String(steps.length).padStart(2, '0')
  return (
    <section className="sl-steps" style={vars(true, accent)}>
      <div className="sl-steps-in">
        <SReveal className="sl-steps-copy">
          <span className="sl-eyebrow">{eyebrow} · 01 / {n}</span>
          <h2 className="sl-h2">{withStop(title)}{grey && <> <span className="g">{withStop(grey)}</span></>}</h2>
          {onGo && <div style={{ marginTop: 30 }}><SPill accent={accent} onClick={onGo} cta="steps_start_free">{cta}</SPill><span className="sl-steps-fine">Free to start · No card</span></div>}
        </SReveal>
        <ol className="sl-step-list">
          {steps.map((s, i) => (
            <SReveal key={s.title} delay={i * 0.06}>
              <li className="sl-step">
                <span className="n">{String(i + 1).padStart(2, '0')}</span>
                <span><h3>{s.title}</h3><p>{s.desc}</p></span>
              </li>
            </SReveal>
          ))}
          {after && <SReveal delay={0.1}><div className="sl-steps-after">{after}</div></SReveal>}
        </ol>
      </div>
    </section>
  )
}

/** Small pill links (e.g. "Goes well with") for a dark band. */
export function SLinkRow({ label, links }: { label: string; links: { label: string; href: string }[] }) {
  return (
    <div className="sl-linkrow">
      <span>{label}</span>
      {links.map(l => <a key={l.href} href={l.href}>{l.label} <Arrow s={13} /></a>)}
    </div>
  )
}

// ── Stats strip ──────────────────────────────────────────────────────────────

export function SStats({ stats, accent, dark = false }: { stats: { big: string; label: string }[]; accent: string; dark?: boolean }) {
  return (
    <SReveal>
      <div className="sl-stats" style={{ ...vars(dark, accent), gridTemplateColumns: `repeat(${stats.length}, 1fr)` }}>
        {stats.map(s => <div key={s.label} className="sl-stat"><b>{s.big}{/[A-Za-z]$/.test(s.big) && !/\d/.test(s.big) && <i>.</i>}</b><span>{s.label}</span></div>)}
      </div>
    </SReveal>
  )
}

// ── More in this area (compact link tiles) ───────────────────────────────────

/** The other pages in an area (e.g. every phone feature): compact tiles, two across on phones. */
export function SMore({ eyebrow, title, grey, items, accent, dark = false }: { eyebrow?: string; title: string; grey?: string; items: { href: string; title: string; icon: string; soon?: boolean; here?: boolean }[]; accent: string; dark?: boolean }) {
  return (
    <section className="sl-more" style={vars(dark, accent)}>
      <div className="sl-wrap">
        <SHead eyebrow={eyebrow} title={title} grey={grey} accent={accent} dark={dark} />
        <div className="sl-more-grid">
          {items.map((it, i) => (
            <SReveal key={it.href} delay={(i % 4) * 0.04} className="sl-more-cell">
              <a href={it.href} className={`sl-more-a${it.here ? ' here' : ''}`} aria-current={it.here ? 'page' : undefined}>
                <i><FeatureIcon name={it.icon} color={accentText(accent, dark)} size={17} /></i>
                <span>{it.title}{it.soon && <em>Soon</em>}{it.here && <em className="here">You’re here</em>}</span>
                <b aria-hidden><Arrow s={14} /></b>
              </a>
            </SReveal>
          ))}
        </div>
      </div>
    </section>
  )
}

// ── Hub link cards ───────────────────────────────────────────────────────────

/** Colourful cards for a hub page (channels, industries, integrations): a gradient art panel, then the copy. */
export function SLinkCards({ items, dark = false }: { items: { icon: string; title: string; desc: string; href: string; color: string; badge?: string }[]; dark?: boolean }) {
  return (
    <div className={`sl-links n${items.length}`} style={vars(dark, items[0]?.color || '#ff6a4d')}>
      {items.map((c, i) => (
        <SReveal key={c.href} delay={(i % 3) * 0.05} className="sl-lcell">
          <a href={c.href} className="sl-lcard" style={{ ['--c' as any]: c.color, ['--ct' as any]: accentText(c.color, dark) } as CSSProperties}>
            <span className="sl-lart" aria-hidden>
              <span className="sl-lo one" /><span className="sl-lo two" />
              <span className="sl-lic"><FeatureIcon name={c.icon} color="#fff" size={28} /></span>
              {c.badge && <em>{c.badge}</em>}
            </span>
            <span className="sl-lbody">
              <h3>{c.title}</h3>
              <p>{c.desc}</p>
              <span className="sl-lgo">Explore <Arrow s={15} /></span>
            </span>
          </a>
        </SReveal>
      ))}
    </div>
  )
}

// ── "Sound familiar?" ────────────────────────────────────────────────────────

/** The everyday problems a page answers, as cards on a soft band (no quotes, no names). */
export function SPains({ title = 'Sound familiar', grey, items, accent, dark = false }: { title?: string; grey?: string; items: { title: string; desc: string }[]; accent: string; dark?: boolean }) {
  return (
    <section className="sl-pains" style={vars(dark, accent)}>
      <div className="sl-wrap">
        <SHead eyebrow="Before Colvy" title={title} grey={grey} accent={accent} dark={dark} />
        <div className="sl-pain-grid">
          {items.map((p, i) => (
            <SReveal key={p.title} delay={(i % 3) * 0.06} className="sl-pain">
              <span className="sl-pain-dot" aria-hidden><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg></span>
              <h3>{p.title}</h3>
              <p>{p.desc}</p>
            </SReveal>
          ))}
        </div>
      </div>
    </section>
  )
}

// ── Every channel, one thread ────────────────────────────────────────────────

export function SChannels({ channels, note, accent, dark = false }: { channels: string[]; note: string; accent: string; dark?: boolean }) {
  return (
    <section className="sl-chans" style={vars(dark, accent)}>
      <div className="sl-wrap">
        <SHead eyebrow="Every channel" title="Every channel" grey="One thread per customer" sub={note} accent={accent} dark={dark} />
        <SReveal className="sl-chips">{channels.map((c, i) => <span key={c} style={{ ['--d' as any]: `${i * 0.4}s` } as CSSProperties}>{c}</span>)}</SReveal>
      </div>
    </section>
  )
}

// ── Closing band ─────────────────────────────────────────────────────────────

export function SCta({ title, sub = 'Free forever for small teams. Upgrade as you grow.', accent, onGo, user, secondary = { label: 'See all plans', href: '/pricing' } }: {
  title: string; sub?: string; accent: string; onGo: () => void; user?: any; secondary?: { label: string; href: string } | null
}) {
  return (
    <section className="sl-cta" style={{ ['--a' as any]: accent, ['--b' as any]: PINK, ['--c' as any]: PURPLE } as CSSProperties}>
      <span className="sl-cta-o one" aria-hidden /><span className="sl-cta-o two" aria-hidden />
      <SReveal style={{ position: 'relative' }}>
        <h2>{withStop(title)}</h2>
        <p>{sub}</p>
        <div className="sl-cta-btns">
          <button type="button" onClick={onGo} className="sl-cta-w cv-shine tint" data-cta="cta_band_start_free" data-cta-location="cta_band">{user ? 'Go to your dashboard' : 'Get started — it’s free'} <Arrow /></button>
          {secondary && <a href={secondary.href} className="sl-cta-o2">{secondary.label}</a>}
        </div>
        <div className="sl-fine">No credit card · Set up in about 45 minutes · Cancel anytime</div>
      </SReveal>
    </section>
  )
}

// ── Explore every feature (grouped, compact) ─────────────────────────────────

export function SExplore({ current, accent, dark = false, title = 'Explore every feature', grey = 'Grouped by the job it does' }: { current?: string; accent: string; dark?: boolean; title?: string; grey?: string }) {
  return (
    <section className="sl-ex" style={vars(dark, accent)}>
      <div className="sl-wrap">
        <SHead eyebrow="The whole suite" title={title} grey={grey} accent={accent} dark={dark} />
        <div className="sl-ex-grid">
          {FEATURE_GROUPS.map((g, gi) => (
            <SReveal key={g.title} delay={gi * 0.05} className="sl-ex-col">
              <h3>{g.title}</h3>
              <div className="sl-ex-list">
                {g.items.map(f => {
                  const here = !!current && f.href === current
                  return (
                    <a key={f.href} href={f.href} className={`sl-ex-a${here ? ' here' : ''}`} aria-current={here ? 'page' : undefined} style={{ ['--c' as any]: f.color } as CSSProperties}>
                      <i><FeatureIcon name={f.icon} color={accentText(f.color, dark)} size={16} /></i>
                      <span>{f.title}</span>
                      {here ? <em className="sl-here">You’re here</em> : f.isNew ? <em className="sl-new">New</em> : null}
                    </a>
                  )
                })}
              </div>
            </SReveal>
          ))}
        </div>
        <p className="sl-ex-swipe" aria-hidden>Swipe for more <Arrow s={13} /></p>
      </div>
    </section>
  )
}

// ── Styles ───────────────────────────────────────────────────────────────────

export function SellioStyles() {
  return <style>{SELLIO_CSS}</style>
}

const SELLIO_CSS = `
@keyframes slFloat { 0%,100% { translate: 0 0 } 50% { translate: 0 -10px } }
.sl-wrap { max-width: 1200px; margin: 0 auto }
.sl-head { max-width: 820px; margin: 0 0 44px }
.sl-head.c { text-align: center; margin: 0 auto 48px }
.sl-eyebrow { display: inline-block; font-family: ${S_MONO}; font-size: 12px; font-weight: 700; letter-spacing: .14em; text-transform: uppercase; color: var(--at, var(--a)) }
.sl-h2 { font-size: clamp(32px, 4.8vw, 58px); font-weight: 900; letter-spacing: -.04em; line-height: 1.02; margin: 14px 0 0; color: var(--text) }
.sl-h2 .g { color: var(--grey) }
.sl-head.ondark .sl-h2 { color: #fff } .sl-head.ondark .sl-h2 .g { color: rgba(255,255,255,.4) }
.sl-sub { font-size: clamp(16px, 1.6vw, 19px); line-height: 1.6; color: var(--muted); margin: 16px auto 0; max-width: 620px }
.sl-head:not(.c) .sl-sub { margin-left: 0 }

.sl-pill { display: inline-flex; align-items: center; gap: 14px; padding: 7px 7px 7px 24px; min-height: 54px; box-sizing: border-box; border-radius: 999px; border: 0; background: var(--a); color: #fff; font: inherit; font-size: 16px; font-weight: 800; cursor: pointer; text-decoration: none; box-shadow: 0 16px 34px -14px var(--a); transition: transform .2s cubic-bezier(.16,1,.3,1), box-shadow .2s }
.sl-pill:hover { transform: translateY(-2px); box-shadow: 0 20px 40px -14px var(--a) }
.sl-pill .ar { width: 40px; height: 40px; border-radius: 50%; background: color-mix(in srgb, currentColor 20%, transparent); display: inline-flex; align-items: center; justify-content: center; flex-shrink: 0; transition: transform .25s cubic-bezier(.16,1,.3,1) }
.sl-pill:hover .ar { transform: translateX(3px) }
.sl-ghost { display: inline-flex; align-items: center; justify-content: center; gap: 8px; min-height: 54px; box-sizing: border-box; padding: 0 24px; border-radius: 999px; border: 1.5px solid var(--line2, color-mix(in srgb, currentColor 18%, transparent)); background: transparent; color: inherit; font: inherit; font-weight: 700; font-size: 15px; text-decoration: none; cursor: pointer; transition: border-color .2s, transform .2s }
.sl-ghost:hover { transform: translateY(-2px); border-color: currentColor }
.sl-ctas { display: flex; flex-wrap: wrap; gap: 12px; align-items: center }
.sl-trust { display: flex; flex-wrap: wrap; gap: 8px 18px; margin-top: 22px; font-family: ${S_MONO}; font-size: 11.5px; font-weight: 600; letter-spacing: .1em; text-transform: uppercase; opacity: .62 }
.sl-trust span { display: inline-flex; align-items: center; gap: 8px }
.sl-trust span::before { content: ''; width: 6px; height: 6px; border-radius: 50%; background: var(--a) }
@media (max-width: 560px) {
  .sl-ctas > * { flex: 1 1 100%; justify-content: space-between }
  .sl-ctas > .sl-ghost { justify-content: center }
  .sl-trust { font-size: 10.5px; gap: 6px 14px }
}

/* Bento */
.sl-bento { display: grid; grid-template-columns: repeat(6, 1fr); gap: 16px }
.sl-bcell { display: flex; min-width: 0 }
.sl-cell { flex: 1; min-width: 0; position: relative; box-sizing: border-box; border-radius: 26px; padding: 28px; background: var(--card); border: 1px solid var(--line); overflow: hidden; color: var(--text); transition: transform .3s cubic-bezier(.16,1,.3,1), box-shadow .3s }
.sl-cell:hover { transform: translateY(-4px); box-shadow: 0 24px 50px -28px color-mix(in srgb, var(--a) 45%, rgba(15,17,25,.5)) }
.sl-cell .sl-ix { position: absolute; top: 24px; right: 26px; font-family: ${S_MONO}; font-size: 12px; font-weight: 600; color: var(--grey) }
.sl-cell .sl-ic { width: 50px; height: 50px; border-radius: 15px; display: flex; align-items: center; justify-content: center; background: color-mix(in srgb, var(--a) 13%, transparent); margin-bottom: 20px }
.sl-cell h3 { font-size: 19px; font-weight: 850; letter-spacing: -.015em; line-height: 1.25; margin: 0 0 8px }
.sl-cell p { font-size: 15px; line-height: 1.6; color: var(--muted); margin: 0 }
.sl-cell.hero { background: linear-gradient(140deg, var(--a), var(--a2)); border-color: transparent; color: var(--ona, #fff); min-height: 250px; display: flex; flex-direction: column; justify-content: flex-end }
.sl-cell.hero::after { content: ''; position: absolute; width: 320px; height: 320px; border-radius: 50%; background: rgba(255,255,255,.12); top: -140px; right: -90px; pointer-events: none }
.sl-cell.hero .sl-ix { color: color-mix(in srgb, currentColor 70%, transparent) }
.sl-cell.hero .sl-ic { width: 60px; height: 60px; border-radius: 18px; background: color-mix(in srgb, currentColor 20%, transparent); margin-bottom: auto }
.sl-cell.hero h3 { font-size: clamp(24px, 2.6vw, 32px); letter-spacing: -.03em; margin-top: 28px }
.sl-cell.hero p { color: color-mix(in srgb, currentColor 88%, transparent); font-size: 16px; max-width: 460px }
.sl-cell.tint { background: color-mix(in srgb, var(--a) 7%, var(--card)) }
.sl-cell.wide { display: flex; align-items: center; gap: 22px }
.sl-cell.wide .sl-ic { margin: 0; flex-shrink: 0 }
@media (max-width: 900px) {
  .sl-bento { grid-template-columns: 1fr 1fr }
  .sl-bcell { grid-column: span 1 !important }
  .sl-bcell.hero, .sl-bcell.wide { grid-column: span 2 !important }
}
@media (max-width: 560px) {
  .sl-bento { grid-template-columns: 1fr; gap: 10px }
  .sl-bcell, .sl-bcell.hero, .sl-bcell.wide { grid-column: auto !important }
  .sl-cell { padding: 18px; border-radius: 20px; display: flex; align-items: flex-start; gap: 14px }
  .sl-cell .sl-ic { width: 44px; height: 44px; border-radius: 13px; margin: 0; flex-shrink: 0 }
  .sl-cell h3 { font-size: 16.5px; margin: 1px 0 4px }
  .sl-cell p { font-size: 14px; line-height: 1.55 }
  .sl-cell .sl-ix { display: none }
  .sl-cell.hero { flex-direction: column; min-height: 0; padding: 24px; gap: 0 }
  .sl-cell.hero .sl-ic { margin-bottom: 0 }
  .sl-cell.hero h3 { font-size: 23px; margin-top: 18px }
  .sl-cell.hero p { font-size: 15px }
}

/* Story band */
.sl-story { position: relative; overflow: hidden; padding: clamp(72px, 10vw, 130px) 24px; background: var(--bg); color: var(--fg) }
.sl-story-in { position: relative; max-width: 1200px; margin: 0 auto; display: grid; grid-template-columns: 1fr 1fr; gap: 64px; align-items: center }
.sl-story.flip .sl-story-copy { order: 2 }
.sl-tag { display: inline-block; font-family: ${S_MONO}; font-size: 12px; font-weight: 700; letter-spacing: .14em; text-transform: uppercase; color: var(--head) }
.sl-story.soft .sl-tag { color: var(--at, var(--a)); background: color-mix(in srgb, var(--a) 14%, transparent); padding: 6px 12px; border-radius: 999px; letter-spacing: .1em }
.sl-story h2 { font-size: clamp(36px, 5.2vw, 64px); font-weight: 900; letter-spacing: -.045em; line-height: .98; margin: 16px 0 20px; color: var(--head) }
.sl-story p { font-size: clamp(16px, 1.6vw, 19px); line-height: 1.6; max-width: 500px; margin: 0 0 26px; color: var(--body) }
.sl-ticks { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 13px }
.sl-ticks li { display: flex; align-items: center; gap: 12px; font-size: 16px; font-weight: 700 }
.sl-ticks i { width: 24px; height: 24px; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center; flex-shrink: 0; background: var(--tickbg); color: var(--tickfg) }
.sl-stack { position: relative; height: 380px }
.sl-blob { position: absolute; z-index: 0; width: 360px; height: 360px; border-radius: 50%; left: 50%; top: 50%; translate: -50% -50%; background: radial-gradient(circle, color-mix(in srgb, var(--a) 55%, transparent), transparent 70%); opacity: .55 }
.sl-story.soft .sl-blob { opacity: .35 }
.sl-float { position: absolute; z-index: 1; width: min(340px, 86%); box-sizing: border-box; display: flex; align-items: center; gap: 13px; padding: 16px 16px 16px 16px; border-radius: 20px; background: #fff; color: ${S_INK}; box-shadow: 0 30px 60px -26px rgba(0,0,0,.55), 0 0 0 1px rgba(15,17,25,.04); animation: slFloat 7s ease-in-out infinite }
.sl-float.f0 { top: 2%; left: 0; rotate: -4deg }
.sl-float.f1 { top: 36%; right: 0; rotate: 3deg; animation-delay: -2.3s }
.sl-float.f2 { top: 70%; left: 9%; rotate: -2deg; animation-delay: -4.6s }
.sl-fic { width: 42px; height: 42px; border-radius: 13px; background: var(--a); display: inline-flex; align-items: center; justify-content: center; flex-shrink: 0 }
.sl-fx { flex: 1; min-width: 0 }
.sl-fx b { display: block; font-size: 15px; font-weight: 800; line-height: 1.3 }
.sl-line { display: block; height: 7px; border-radius: 4px; background: #eef0f4; margin-top: 8px; width: 88% }
.sl-line.s { width: 56% }
.sl-ok { width: 26px; height: 26px; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center; flex-shrink: 0; background: color-mix(in srgb, var(--a) 15%, #fff); color: var(--a) }
@media (max-width: 900px) {
  .sl-story-in { grid-template-columns: 1fr; gap: 40px }
  .sl-story.flip .sl-story-copy { order: 0 }
  .sl-stack { height: 300px; max-width: 460px; width: 100%; margin: 0 auto }
}
@media (prefers-reduced-motion: reduce) { .sl-float { animation: none } }

/* Steps */
.sl-steps { background: #0b0c13; color: #f4f5fb; padding: clamp(72px, 10vw, 128px) 24px }
.sl-steps-in { max-width: 1200px; margin: 0 auto; display: grid; grid-template-columns: .92fr 1.08fr; gap: 72px; align-items: start }
.sl-steps-copy { position: sticky; top: 110px }
.sl-steps .sl-h2 { color: #fff } .sl-steps .sl-h2 .g { color: rgba(255,255,255,.38) }
.sl-steps-fine { display: block; margin-top: 16px; font-family: ${S_MONO}; font-size: 11.5px; letter-spacing: .1em; text-transform: uppercase; color: rgba(244,245,251,.5) }
.sl-step-list { list-style: none; margin: 0; padding: 0 }
.sl-step { display: grid; grid-template-columns: 56px 1fr; gap: 16px; padding: 26px 0; border-top: 1px solid rgba(255,255,255,.1) }
.sl-step-list > div:last-child .sl-step { border-bottom: 1px solid rgba(255,255,255,.1) }
.sl-step .n { font-family: ${S_MONO}; font-size: 13px; font-weight: 700; color: var(--at, var(--a)); padding-top: 5px }
.sl-step h3 { font-size: clamp(19px, 2vw, 24px); font-weight: 850; letter-spacing: -.02em; margin: 0 0 8px; color: #fff }
.sl-step p { font-size: 15.5px; line-height: 1.6; color: rgba(244,245,251,.62); margin: 0 }
.sl-steps-after { padding-top: 26px }
.sl-linkrow { display: flex; flex-wrap: wrap; align-items: center; gap: 10px }
.sl-linkrow span { font-family: ${S_MONO}; font-size: 11.5px; font-weight: 700; letter-spacing: .1em; text-transform: uppercase; color: rgba(244,245,251,.5); margin-right: 4px }
.sl-linkrow a { display: inline-flex; align-items: center; gap: 6px; padding: 9px 15px; border-radius: 999px; border: 1px solid rgba(255,255,255,.16); color: #fff; font-size: 13.5px; font-weight: 700; text-decoration: none; transition: background .2s, border-color .2s }
.sl-linkrow a:hover { background: rgba(255,255,255,.08); border-color: rgba(255,255,255,.3) }
@media (max-width: 900px) {
  .sl-steps-in { grid-template-columns: 1fr; gap: 26px }
  .sl-steps-copy { position: static }
  .sl-step { grid-template-columns: 40px 1fr; padding: 20px 0 }
}

/* Stats */
.sl-stats { max-width: 1000px; margin: 0 auto; display: grid; border-radius: 26px; background: var(--card); border: 1px solid var(--line); overflow: hidden }
.sl-stat { padding: 30px 16px; text-align: center; border-left: 1px solid var(--line); min-width: 0 }
.sl-stat:first-child { border-left: 0 }
.sl-stat b { display: block; font-size: clamp(24px, 4.2vw, 46px); font-weight: 900; letter-spacing: -.04em; line-height: 1; color: var(--text); overflow-wrap: anywhere }
.sl-stat b i { font-style: normal; color: var(--at, var(--a)) }
.sl-stat span { display: block; margin-top: 12px; font-family: ${S_MONO}; font-size: 11px; font-weight: 600; letter-spacing: .1em; text-transform: uppercase; color: var(--muted) }
@media (max-width: 560px) {
  .sl-stats { grid-template-columns: 1fr !important; border-radius: 22px }
  .sl-stat { display: flex; align-items: center; gap: 16px; text-align: left; padding: 18px 20px; border-left: 0; border-top: 1px solid var(--line) }
  .sl-stat:first-child { border-top: 0 }
  .sl-stat b { flex: 0 0 auto; max-width: 52%; font-size: 30px }
  .sl-stat span { margin: 0; font-size: 11px; letter-spacing: .08em; line-height: 1.45 }
}

/* Breadcrumb */
.sl-crumb { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin: 0 0 22px }
.sl-crumb-back { display: inline-flex; align-items: center; gap: 8px; height: 34px; padding: 0 14px 0 4px; border-radius: 999px; border: 1px solid var(--line2, color-mix(in srgb, currentColor 18%, transparent)); color: inherit; font-size: 13.5px; font-weight: 750; text-decoration: none; transition: border-color .2s, background .2s }
.sl-crumb-back .ar { width: 26px; height: 26px; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center; background: color-mix(in srgb, var(--a) 14%, transparent); color: var(--at, var(--a)); transition: transform .2s }
.sl-crumb-back:hover { border-color: var(--at, var(--a)) }
.sl-crumb-back:hover .ar { transform: translateX(-2px) }
.sl-crumb-sep { opacity: .3; font-weight: 700 }
.sl-crumb-now { display: inline-flex; align-items: center; gap: 7px; height: 34px; padding: 0 14px; border-radius: 999px; background: color-mix(in srgb, var(--a) 13%, transparent); color: var(--at, var(--a)); font-family: ${S_MONO}; font-size: 11.5px; font-weight: 700; letter-spacing: .1em; text-transform: uppercase }

/* More in this area */
.sl-more { padding: clamp(64px, 9vw, 110px) 24px; background: var(--bg2) }
.sl-more-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 10px }
.sl-more-cell { display: flex; min-width: 0 }
.sl-more-a { flex: 1; min-width: 0; display: flex; align-items: center; gap: 12px; padding: 12px 14px 12px 12px; border-radius: 18px; background: var(--card); border: 1px solid var(--line); color: var(--text); text-decoration: none; font-size: 14.5px; font-weight: 750; line-height: 1.3; transition: transform .25s cubic-bezier(.16,1,.3,1), border-color .2s, box-shadow .25s }
.sl-more-a:hover { transform: translateY(-3px); border-color: color-mix(in srgb, var(--a) 40%, transparent); box-shadow: 0 18px 34px -24px color-mix(in srgb, var(--a) 70%, transparent) }
.sl-more-a i { width: 36px; height: 36px; border-radius: 11px; flex-shrink: 0; display: inline-flex; align-items: center; justify-content: center; background: color-mix(in srgb, var(--a) 12%, transparent) }
.sl-more-a span { flex: 1; min-width: 0 }
.sl-more-a em { display: inline-block; margin-left: 6px; font-style: normal; font-size: 10px; font-weight: 800; padding: 2px 7px; border-radius: 999px; background: color-mix(in srgb, var(--a) 14%, transparent); color: var(--at, var(--a)); vertical-align: 2px }
.sl-more-a em.here { background: var(--text); color: var(--ontext) }
.sl-more-a b { color: var(--grey); display: inline-flex; transition: transform .2s, color .2s }
.sl-more-a:hover b { color: var(--at, var(--a)); transform: translateX(3px) }
.sl-more-a.here { border-color: color-mix(in srgb, var(--a) 45%, transparent) }
@media (max-width: 1000px) { .sl-more-grid { grid-template-columns: repeat(3, minmax(0, 1fr)) } }
@media (max-width: 720px) { .sl-more-grid { grid-template-columns: repeat(2, minmax(0, 1fr)) } }
@media (max-width: 560px) {
  .sl-more-a { flex-direction: column; align-items: flex-start; gap: 10px; padding: 14px; font-size: 14px }
  .sl-more-a b { display: none }
  .sl-more-a em { margin: 6px 0 0; display: table }
}

/* Hub link cards */
.sl-links { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 18px }
.sl-links.n4 { grid-template-columns: repeat(2, minmax(0, 1fr)) }
.sl-lcell { display: flex; min-width: 0 }
.sl-lcard { flex: 1; display: flex; flex-direction: column; border-radius: 26px; overflow: hidden; background: var(--card); border: 1px solid var(--line); text-decoration: none; color: var(--text); transition: transform .3s cubic-bezier(.16,1,.3,1), box-shadow .3s }
.sl-lcard:hover { transform: translateY(-5px); box-shadow: 0 28px 50px -30px color-mix(in srgb, var(--c) 70%, transparent) }
.sl-lart { position: relative; height: 150px; display: flex; align-items: flex-end; padding: 20px; overflow: hidden; background: linear-gradient(135deg, var(--c), color-mix(in srgb, var(--c) 55%, #7c5cff)) }
.sl-lic { position: relative; z-index: 1; width: 58px; height: 58px; border-radius: 18px; display: flex; align-items: center; justify-content: center; background: rgba(255,255,255,.2); border: 1px solid rgba(255,255,255,.32); transition: transform .35s cubic-bezier(.16,1,.3,1) }
.sl-lcard:hover .sl-lic { transform: translateY(-4px) rotate(-4deg) }
.sl-lo { position: absolute; border-radius: 50%; background: rgba(255,255,255,.14) }
.sl-lo.one { width: 190px; height: 190px; top: -80px; right: -50px }
.sl-lo.two { width: 90px; height: 90px; bottom: -36px; right: 96px }
.sl-lart em { position: absolute; top: 16px; right: 16px; z-index: 1; font-style: normal; font-size: 11px; font-weight: 800; color: #fff; background: rgba(15,17,25,.28); padding: 4px 10px; border-radius: 999px }
.sl-lbody { display: flex; flex-direction: column; flex: 1; padding: 22px }
.sl-lbody h3 { font-size: 20px; font-weight: 900; letter-spacing: -.02em; margin: 0 0 6px }
.sl-lbody p { flex: 1; font-size: 14.5px; line-height: 1.55; color: var(--muted); margin: 0 0 16px }
.sl-lgo { display: inline-flex; align-items: center; gap: 6px; font-size: 14px; font-weight: 800; color: var(--ct, var(--c)); transition: gap .2s }
.sl-lcard:hover .sl-lgo { gap: 10px }
@media (max-width: 900px) { .sl-links { grid-template-columns: repeat(2, minmax(0, 1fr)) } }
@media (max-width: 560px) {
  .sl-links, .sl-links.n4 { grid-template-columns: 1fr; gap: 12px }
  .sl-lcard { flex-direction: row; border-radius: 22px }
  .sl-lart { width: 92px; height: auto; flex-shrink: 0; padding: 0; align-items: center; justify-content: center }
  .sl-lic { width: 50px; height: 50px; border-radius: 15px }
  .sl-lo.two, .sl-lart em { display: none }
  .sl-lbody { padding: 16px 16px 16px 18px }
  .sl-lbody h3 { font-size: 17px }
  .sl-lbody p { font-size: 13.5px; margin-bottom: 8px }
}

/* Sound familiar */
.sl-pains { padding: clamp(64px, 9vw, 110px) 24px; background: var(--bg2) }
.sl-pain-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(300px, 100%), 1fr)); gap: 16px }
.sl-pain { position: relative; box-sizing: border-box; border-radius: 24px 24px 24px 8px; padding: 26px 24px 24px; background: var(--card); border: 1px solid var(--line); color: var(--text) }
.sl-pain-dot { width: 30px; height: 30px; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center; background: color-mix(in srgb, #e5484d 13%, transparent); color: var(--bad); margin-bottom: 16px }
.sl-pain h3 { font-size: 18px; font-weight: 850; letter-spacing: -.015em; margin: 0 0 8px }
.sl-pain p { font-size: 15px; line-height: 1.6; color: var(--muted); margin: 0 }

/* Every channel */
.sl-chans { padding: clamp(64px, 9vw, 110px) 24px }
.sl-chips { display: flex; flex-wrap: wrap; gap: 10px; justify-content: center; max-width: 900px; margin: 0 auto }
.sl-chips span { display: inline-flex; align-items: center; gap: 9px; padding: 11px 18px; border-radius: 999px; background: var(--card); border: 1px solid var(--line); color: var(--text); font-size: 15px; font-weight: 750 }
.sl-chips span::before { content: ''; width: 8px; height: 8px; border-radius: 50%; background: var(--a); animation: slPulse 2.4s ease-in-out var(--d, 0s) infinite }
@keyframes slPulse { 0%,100% { opacity: 1 } 50% { opacity: .35 } }

/* Closing band */
.sl-cta { position: relative; overflow: hidden; padding: clamp(84px, 11vw, 140px) 24px; text-align: center; color: #fff; background: linear-gradient(120deg, var(--a) 0%, var(--b) 58%, var(--c) 100%) }
.sl-cta-o { position: absolute; border-radius: 50%; background: rgba(255,255,255,.12); pointer-events: none }
.sl-cta-o.one { width: 380px; height: 380px; top: -170px; left: -90px }
.sl-cta-o.two { width: 300px; height: 300px; bottom: -150px; right: 6% }
.sl-cta h2 { font-size: clamp(36px, 6vw, 74px); font-weight: 900; letter-spacing: -.045em; line-height: 1; max-width: 920px; margin: 0 auto 18px }
.sl-cta p { font-size: clamp(16px, 1.7vw, 20px); opacity: .92; max-width: 620px; margin: 0 auto 32px; line-height: 1.55 }
.sl-cta-btns { display: flex; gap: 12px; justify-content: center; flex-wrap: wrap }
.sl-cta-w { display: inline-flex; align-items: center; gap: 10px; padding: 0 30px; height: 56px; border-radius: 999px; border: 0; background: #fff; color: ${S_INK}; font: inherit; font-size: 17px; font-weight: 900; cursor: pointer; box-shadow: 0 18px 40px -16px rgba(0,0,0,.35); transition: transform .2s }
.sl-cta-w:hover { transform: translateY(-2px) }
.sl-cta-o2 { display: inline-flex; align-items: center; padding: 0 26px; height: 56px; border-radius: 999px; border: 2px solid rgba(255,255,255,.6); color: #fff; font-size: 16px; font-weight: 800; text-decoration: none; transition: background .2s }
.sl-cta-o2:hover { background: rgba(255,255,255,.12) }
.sl-fine { margin-top: 24px; font-family: ${S_MONO}; font-size: 11.5px; font-weight: 600; letter-spacing: .1em; text-transform: uppercase; opacity: .82 }
@media (max-width: 560px) { .sl-cta-btns > * { flex: 1 1 100%; justify-content: center } .sl-fine { font-size: 10px; letter-spacing: .06em } }

/* Explore every feature */
.sl-ex { padding: clamp(64px, 9vw, 110px) 24px; background: var(--bg2); border-top: 1px solid var(--line) }
.sl-ex-grid { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 14px; align-items: start }
.sl-ex-col { box-sizing: border-box; border-radius: 24px; padding: 18px 12px 12px; background: var(--card); border: 1px solid var(--line) }
.sl-ex-col h3 { font-family: ${S_MONO}; font-size: 11px; font-weight: 700; letter-spacing: .12em; text-transform: uppercase; color: var(--muted); margin: 0 8px 10px }
.sl-ex-list { display: flex; flex-direction: column; gap: 2px }
.sl-ex-a { display: flex; align-items: center; gap: 10px; padding: 8px; border-radius: 12px; text-decoration: none; color: var(--text); font-size: 14px; font-weight: 700; line-height: 1.25; transition: background .18s }
.sl-ex-a:hover { background: color-mix(in srgb, var(--c) 9%, transparent) }
.sl-ex-a i { width: 30px; height: 30px; border-radius: 9px; display: inline-flex; align-items: center; justify-content: center; flex-shrink: 0; background: color-mix(in srgb, var(--c) 13%, transparent) }
.sl-ex-a span { flex: 1; min-width: 0 }
.sl-ex-a.here { background: color-mix(in srgb, var(--c) 11%, transparent) }
.sl-ex-a em { font-style: normal; flex-shrink: 0; font-size: 10px; font-weight: 800; padding: 3px 7px; border-radius: 999px }
.sl-new { background: var(--a); color: var(--ona, #fff) }
.sl-here { background: var(--text); color: var(--ontext) }
.sl-ex-swipe { display: none }
@media (max-width: 1100px) { .sl-ex-grid { grid-template-columns: repeat(3, minmax(0, 1fr)) } }
@media (max-width: 760px) {
  .sl-ex-grid { display: flex; overflow-x: auto; scroll-snap-type: x mandatory; gap: 12px; margin: 0 -24px; padding: 0 24px 6px; scroll-padding: 0 24px; scrollbar-width: none }
  .sl-ex-grid::-webkit-scrollbar { display: none }
  .sl-ex-grid > * { flex: 0 0 80%; scroll-snap-align: start }
  .sl-ex-swipe { display: flex; align-items: center; justify-content: center; gap: 6px; margin: 16px 0 0; font-family: ${S_MONO}; font-size: 11px; letter-spacing: .1em; text-transform: uppercase; color: var(--muted) }
}
`
