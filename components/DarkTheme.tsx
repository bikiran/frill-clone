'use client'

// Dark mode for colours that are written into the code. The theme's variables
// (--card, --ink, --border…) only reach code that uses them, and much of the app
// sets light colours directly: #fff cards, #f4f4f5 fills, #1a1a1a text, in each
// component's own <style> and in inline styles. While data-theme="dark" is on,
// this reads the page's stylesheets (and each new one as components mount) and
// adds small stylesheets of dark overrides for those colours, using
// lib/dark-theme's mapping. Identical stylesheets (one per instance of a
// component) are read once. Inline styles are covered by [style*="…"] rules for
// the colour literals listed in lib/dark-inline-colors.
//
// A component's own [data-theme="dark"] rules still win: they're repeated after
// the generated ones. In light mode nothing here applies (every rule is scoped
// to [data-theme="dark"]) and nothing is generated.

import { useEffect } from 'react'
import { darkBg, darkLine, darkText, type RGBA } from '@/lib/dark-theme'
import { DARK_INLINE } from '@/lib/dark-inline-colors'

const SHEET_ID = 'colvy-dark-theme'
const D = '[data-theme="dark"]'

// Any CSS colour → RGBA, via a 1×1 canvas (handles hex, names, rgb, hsl, oklch…).
let ctx: CanvasRenderingContext2D | null = null
const cache = new Map<string, RGBA | null>()
function parse(v: string): RGBA | null {
  if (cache.has(v)) return cache.get(v)!
  let out: RGBA | null = null
  try {
    if (!ctx) { const c = document.createElement('canvas'); c.width = c.height = 1; ctx = c.getContext('2d', { willReadFrequently: true }) }
    if (ctx) {
      ctx.clearRect(0, 0, 1, 1)
      ctx.fillStyle = '#01020300'
      ctx.fillStyle = v
      if (ctx.fillStyle !== '#01020300' && ctx.fillStyle !== 'rgba(1, 2, 3, 0)') {
        ctx.fillRect(0, 0, 1, 1)
        const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data
        out = { r, g, b, a: a / 255 }
      }
    }
  } catch {}
  cache.set(v, out)
  return out
}

// Tailwind's palette lives in --color-* variables; resolve those, leave the
// theme's own variables (already dark-aware) alone.
let rootStyle: CSSStyleDeclaration | null = null
function resolve(v: string): string | null {
  if (!v) return null
  if (!v.includes('var(')) return v
  const m = v.match(/^var\((--color-[a-z0-9-]+)\)$/)
  if (!m) return null
  rootStyle = rootStyle || getComputedStyle(document.documentElement)
  return rootStyle.getPropertyValue(m[1]).trim() || null
}

function mapColor(v: string, fn: (c: RGBA) => string | null): string | null {
  const r = resolve(v)
  if (!r) return null
  const c = parse(r)
  return c ? fn(c) : null
}

// Colours inside a value (gradients, shadows), each mapped on its own.
const COLOR_IN = /(rgba?\([^)]*\)|#[0-9a-fA-F]{3,8}\b|\bwhite\b)/g
function mapColorsIn(v: string, fn: (c: RGBA) => string | null): string {
  return v.replace(COLOR_IN, m => { const c = parse(m); return (c && fn(c)) || m })
}
// Shadows: white rings become the card colour; faint black hairline rings
// (a light-mode "border") become faint white ones so they still show.
function mapShadow(v: string): string | null {
  if (!v || v === 'none' || v.includes('var(')) return null
  const parts = v.split(/,(?![^(]*\))/)
  let changed = false
  const out = parts.map(p => {
    const colorM = p.match(COLOR_IN)
    if (!colorM) return p
    const c = parse(colorM[0])
    if (!c) return p
    const nums = p.replace(COLOR_IN, '').trim().split(/\s+/).map(parseFloat)
    const ring = nums.length >= 4 && nums[2] === 0 && nums[3] > 0 && !p.includes('inset')
    if (c.a > 0.5 && c.r > 235 && c.g > 235 && c.b > 235) { changed = true; return p.replace(colorM[0], '#1c1c1f') }
    if (ring && c.r < 40 && c.g < 40 && c.b < 40 && c.a <= 0.16) { changed = true; return p.replace(colorM[0], `rgba(255, 255, 255, ${Math.min(0.16, c.a * 1.6 + 0.02).toFixed(3)})`) }
    return p
  })
  return changed ? out.join(',') : null
}

const px = (v: string) => { const m = v && v.match(/^(\d+(?:\.\d+)?)px$/); return m ? +m[1] : null }
// Toggle knobs: small, round and placed absolutely on their track; they stay as
// they are (small round buttons in the flow don't count).
function isKnob(st: CSSStyleDeclaration) {
  const w = px(st.getPropertyValue('width')), h = px(st.getPropertyValue('height'))
  const rad = st.getPropertyValue('border-top-left-radius') || st.getPropertyValue('border-radius')
  return w !== null && h !== null && w <= 28 && h <= 28 && /50%|999|9999/.test(rad) && st.getPropertyValue('position') === 'absolute'
}
// The colour part of a `background` shorthand, when that's all it is.
const shorthandColor = (v: string) => (!v || /url\(|gradient/.test(v) ? '' : v)
// Backgrounds mixed from a light colour (color-mix(in srgb, var(--acc) 8%, #fff)):
// the light part becomes the dark surface, so the tint stays.
function mapBgValue(v: string): string | null {
  if (!v) return null
  if (v.includes('color-mix(')) { const m = mapColorsIn(v, c => (c.a > 0.5 && c.r > 200 && c.g > 200 && c.b > 200 ? darkBg(c) : null)); return m !== v ? m : null }
  return mapColor(v, darkBg)
}

function scope(selector: string): string {
  // Split on top-level commas only (not inside :is(), :not()…).
  const parts: string[] = []
  let depth = 0, cur = ''
  for (const ch of selector) {
    if (ch === '(') depth++
    else if (ch === ')') depth--
    if (ch === ',' && depth === 0) { parts.push(cur); cur = '' } else cur += ch
  }
  parts.push(cur)
  return parts.map(p => {
    p = p.trim()
    if (/^(html|:root)\b/.test(p)) return p.replace(/^(html|:root)/, `html${D}`)
    return `${D} ${p}`
  }).join(',')
}

const SIDES = ['top', 'right', 'bottom', 'left']
function rulesFor(rule: CSSStyleRule): string | null {
  const st = rule.style
  const imp = (p: string) => (st.getPropertyPriority(p) ? ' !important' : '')
  const decl: string[] = []
  const add = (prop: string, v: string | null, from = prop) => { if (v) decl.push(`${prop}:${v}${imp(from)}`) }

  if (!isKnob(st)) add('background-color', mapBgValue(st.getPropertyValue('background-color') || shorthandColor(st.getPropertyValue('background'))), 'background-color')
  const bgi = st.getPropertyValue('background-image')
  if (bgi && bgi.includes('gradient') && !bgi.includes('var(')) { const m = mapColorsIn(bgi, c => darkBg(c)); if (m !== bgi) add('background-image', m) }
  add('color', mapColor(st.getPropertyValue('color'), darkText))
  for (const s of SIDES) add(`border-${s}-color`, mapColor(st.getPropertyValue(`border-${s}-color`), darkLine))
  add('outline-color', mapColor(st.getPropertyValue('outline-color'), darkLine))
  add('box-shadow', mapShadow(st.getPropertyValue('box-shadow')))
  add('fill', mapColor(st.getPropertyValue('fill'), darkText))
  add('caret-color', mapColor(st.getPropertyValue('caret-color'), darkText))
  // Colour variables a component defines for itself (--f: #f4f4f5…): light ones
  // as surfaces, dark ones as text.
  for (let i = 0; i < st.length; i++) {
    const p = st[i]
    if (!p.startsWith('--') || p.startsWith('--color-') || p.startsWith('--tw-')) continue
    const v = st.getPropertyValue(p).trim()
    if (!/^(#[0-9a-fA-F]{3,8}|rgba?\(|white$|black$)/.test(v)) continue
    const c = parse(v)
    if (c) add(p, darkBg(c) || darkText(c))
  }
  return decl.length ? `${scope(rule.selectorText)}{${decl.join(';')}}` : null
}

type Out = { gen: string[]; own: string[] }
// `wrap` holds the at-rules (@media, @supports) a rule sits inside, outermost first.
const wrapped = (wrap: string[], body: string) => wrap.map(w => `${w}{`).join('') + body + '}'.repeat(wrap.length)
function walk(list: CSSRuleList, out: Out, wrap: string[] = []) {
  for (const r of Array.from(list)) {
    if (r instanceof CSSStyleRule) {
      if (r.selectorText.includes('data-theme')) { out.own.push(wrapped(wrap, r.cssText)); continue }
      // One odd rule can't cost the rest of its stylesheet.
      let g: string | null = null
      try { g = rulesFor(r) } catch {}
      if (g) out.gen.push(wrapped(wrap, g))
    } else if (r instanceof CSSMediaRule) {
      walk(r.cssRules, out, [...wrap, `@media ${r.conditionText}`])
    } else if (typeof CSSSupportsRule !== 'undefined' && r instanceof CSSSupportsRule) {
      walk(r.cssRules, out, [...wrap, `@supports ${r.conditionText}`])
    } else if (!(r instanceof CSSKeyframesRule) && 'cssRules' in r) {
      // @layer blocks and the like: their rules, unwrapped (overrides sit outside layers)
      try { walk((r as CSSGroupingRule).cssRules, out, wrap) } catch {}
    }
  }
}

// [style*="…"] rules for inline colours, grouped by the colour they become.
function inlineRules(): string {
  const groups = new Map<string, string[]>()
  const put = (decl: string, sel: string) => { const g = groups.get(decl) || []; g.push(sel); groups.set(decl, g) }
  // Small round inline knobs keep their colour.
  const notKnob = ':not([style*="border-radius: 50%"][style*="position: absolute"])'
  const rgbOf = (h: string) => { const c = parse(h); return c ? `rgb(${c.r}, ${c.g}, ${c.b})` : null }
  // Client-rendered inline styles read "background: rgb(…)"; server-rendered
  // ones keep the source's "background:#fff".
  for (const h of DARK_INLINE.bg) {
    const c = parse(h), rgb = rgbOf(h), to = c && darkBg(c)
    if (to) for (const s of [`background: ${rgb}`, `background-color: ${rgb}`, `background:${h}`]) put(`background-color:${to} !important`, `${D} [style*="${s}"]${notKnob}`)
  }
  for (const h of DARK_INLINE.text) {
    const c = parse(h), rgb = rgbOf(h), to = c && darkText(c)
    if (to) for (const s of [`[style^="color: ${rgb}"]`, `[style*="; color: ${rgb}"]`]) put(`color:${to} !important`, `${D} ${s}`)
  }
  for (const h of DARK_INLINE.line) {
    const c = parse(h), rgb = rgbOf(h), to = c && darkLine(c)
    if (to) for (const s of [`solid ${rgb}`, `border-color: ${rgb}`]) put(`border-color:${to} !important`, `${D} [style*="${s}"]`)
  }
  put(`background-color:#1c1c1f !important`, `${D} [style*="background: white"]${notKnob}`)
  put(`background-color:#1c1c1f !important`, `${D} [style*="background-color: white"]${notKnob}`)
  return [...groups].map(([decl, sels]) => `${sels.join(',')}{${decl}}`).join('\n')
}

export default function DarkTheme() {
  useEffect(() => {
    const html = document.documentElement
    const seen = new WeakSet<CSSStyleSheet>()
    const seenText = new Set<string>()   // the same <style> rendered by many instances
    let inlineDone = false
    let timer: number | null = null

    const addSheet = (css: string, id?: string) => {
      const el = document.createElement('style')
      el.setAttribute('data-colvy-dark', '')
      if (id) el.id = id
      el.textContent = css
      document.head.appendChild(el)
    }

    const build = () => {
      if (timer !== null) { clearTimeout(timer); timer = null }
      if (html.getAttribute('data-theme') !== 'dark') return
      performance.mark('colvy-dark:start')
      rootStyle = null
      if (!inlineDone) { inlineDone = true; addSheet(inlineRules(), SHEET_ID) }
      // Each batch of new stylesheets gets its own small sheet, so earlier
      // batches aren't parsed again.
      const out: Out = { gen: [], own: [] }
      for (const sheet of Array.from(document.styleSheets)) {
        if (seen.has(sheet)) continue
        seen.add(sheet)
        const node = sheet.ownerNode as Element | null
        if (node?.hasAttribute('data-colvy-dark')) continue
        const key = node?.nodeName === 'STYLE' ? node.textContent || '' : (sheet.href || '')
        if (key && seenText.has(key)) continue
        let rules: CSSRuleList
        try { rules = sheet.cssRules } catch { continue }   // another origin's sheet (fonts)
        if (key) seenText.add(key)
        walk(rules, out)
      }
      // The components' own dark rules come after the generated ones, so they win.
      if (out.gen.length || out.own.length) addSheet(`${out.gen.join('\n')}\n${out.own.join('\n')}`)
      try { performance.measure('colvy-dark', 'colvy-dark:start') } catch {}
    }
    // Late stylesheets (a <link> finishing) are picked up on the next tick.
    const schedule = () => { if (timer === null) timer = window.setTimeout(build, 0) }

    // New stylesheets: components mount with their own <style>, routes add <link>s.
    // Mapped in the observer itself, before the browser paints: a modal that
    // opens with its own <style> never shows its light colours first.
    const mo = new MutationObserver(records => {
      for (const r of records) {
        if (r.type === 'attributes') { build(); return }
        for (const n of Array.from(r.addedNodes)) {
          if (n.nodeName === 'STYLE' || n.nodeName === 'LINK' || (n.nodeType === 1 && (n as Element).querySelector?.('style,link[rel="stylesheet"]'))) { build(); return }
        }
        // React swaps a <style>'s CSS by changing its text node in place.
        if (r.target.nodeName === 'STYLE' || r.target.parentNode?.nodeName === 'STYLE') { build(); return }
      }
    })
    mo.observe(document.head, { childList: true, subtree: true, characterData: true })
    mo.observe(document.body, { childList: true, subtree: true, characterData: true })
    mo.observe(html, { attributes: true, attributeFilter: ['data-theme'] })
    const onLoad = (e: Event) => { if ((e.target as Element)?.nodeName === 'LINK') schedule() }
    document.addEventListener('load', onLoad, true)
    build()
    return () => { mo.disconnect(); document.removeEventListener('load', onLoad, true); if (timer !== null) clearTimeout(timer) }
  }, [])
  return null
}
