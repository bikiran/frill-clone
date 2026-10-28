// Reading a website's branding (icon, colours, name) from its HTML and CSS.
// Pure functions; the fetching is done by app/api/site-brand with safeFetch.

import { decodeEntities } from './site-crawl'

export const attr = (tag: string, name: string) => {
  const m = tag.match(new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i'))
  return m ? decodeEntities(m[1] ?? m[2] ?? m[3] ?? '').trim() : ''
}

/** The best icon a page declares: apple-touch first, then the largest PNG/SVG, then any icon. */
export function pickIcon(html: string, base: string): string | null {
  const links = Array.from(html.matchAll(/<link\b[^>]*>/gi)).map(m => m[0])
  const cands: { href: string; score: number }[] = []
  for (const tag of links) {
    const rel = attr(tag, 'rel').toLowerCase()
    if (!/\bicon\b|apple-touch-icon/.test(rel) || /mask-icon/.test(rel)) continue
    const href = attr(tag, 'href')
    if (!href || href.startsWith('data:')) continue
    const size = Math.max(0, ...attr(tag, 'sizes').split(/\s+/).map(s => Number(s.split('x')[0]) || 0))
    const type = (attr(tag, 'type') + ' ' + href).toLowerCase()
    let score = size || 32
    if (rel.includes('apple-touch-icon')) score += 200
    if (/svg/.test(type)) score += 150
    else if (/png|webp/.test(type)) score += 60
    else if (/\.ico\b|x-icon/.test(type)) score -= 40
    try { cands.push({ href: new URL(href, base).toString(), score }) } catch {}
  }
  cands.sort((a, b) => b.score - a.score)
  if (cands[0]) return cands[0].href.replace(/^http:\/\//i, 'https://')
  try { return new URL('/favicon.ico', base).toString().replace(/^http:\/\//i, 'https://') } catch { return null }
}

const hex2 = (n: number) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0')
function norm(c: string): string | null {
  c = c.trim().toLowerCase()
  let m = c.match(/^#([0-9a-f]{3})$/)
  if (m) return '#' + m[1].split('').map(x => x + x).join('')
  m = c.match(/^#([0-9a-f]{6})(?:[0-9a-f]{2})?$/)
  if (m) return '#' + m[1]
  m = c.match(/^rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)/)
  if (m) return '#' + hex2(+m[1]) + hex2(+m[2]) + hex2(+m[3])
  return null
}
function hsl(hex: string) {
  const r = parseInt(hex.slice(1, 3), 16) / 255, g = parseInt(hex.slice(3, 5), 16) / 255, b = parseInt(hex.slice(5, 7), 16) / 255
  const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2
  const s = max === min ? 0 : l > 0.5 ? (max - min) / (2 - max - min) : (max - min) / (max + min)
  return { s, l, rgb: [r * 255, g * 255, b * 255] }
}
const usable = (hex: string) => { const { s, l } = hsl(hex); return s >= 0.28 && l >= 0.18 && l <= 0.82 }
const far = (a: string, b: string) => { const x = hsl(a).rgb, y = hsl(b).rgb; return Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]) > 48 }

/** The site's colours, most used first: theme colours count extra. */
// Colours that come with a theme or builder rather than the brand: Elementor's
// starting palette and WordPress's block presets.
const STOCK = new Set(['#6ec1e4', '#54595f', '#7a7a7a', '#61ce70', '#cf2e2e', '#ff6900', '#fcb900', '#7bdcb5', '#00d084', '#8ed1fc', '#0693e3', '#9b51e0', '#f78da7', '#abb8c3'])

export function pickColors(texts: string[], themes: string[]): string[] {
  const count = new Map<string, number>()
  const add = (c: string | null, w = 1) => { if (c && usable(c)) count.set(c, (count.get(c) || 0) + w) }
  for (const t of themes) add(norm(t), 40)
  for (const text of texts) {
    // WordPress's built-in palette is on every WordPress site, whatever its brand.
    const own = text.replace(/--wp--preset--[a-z0-9-]+\s*:[^;}]+/gi, '')
    // "&#038;" is an HTML entity, not the colour #038.
    for (const m of own.matchAll(/(?<![&\w])#[0-9a-f]{3}(?:[0-9a-f]{3})?(?:[0-9a-f]{2})?\b|rgba?\(\s*\d+[\s,]+\d+[\s,]+\d+[^)]*\)/gi)) {
      const c = norm(m[0])
      if (c && !STOCK.has(c)) add(c)
    }
  }
  const out: string[] = []
  for (const [c] of [...count.entries()].sort((a, b) => b[1] - a[1])) {
    if (out.every(o => far(o, c))) out.push(c)
    if (out.length >= 4) break
  }
  return out
}

/** Up to two stylesheets most likely to hold the brand's colours: the theme's
 *  own before plugin, icon and font libraries (which carry none). */
export function pickSheets(html: string, base: string): string[] {
  const urls = Array.from(html.matchAll(/<link\b[^>]*>/gi)).map(m => m[0])
    .filter(t => /stylesheet/i.test(attr(t, 'rel')) && attr(t, 'href'))
    .map(t => { try { return new URL(attr(t, 'href'), base).toString() } catch { return '' } })
    .filter(u => u && !/fonts\.(googleapis|gstatic)|font-?awesome|eicons|icons?[-.]|\/lib\/|dashicons|swiper|animate(\.min)?\.css|jquery/i.test(u))
  const score = (u: string) => (/\/themes?\/|theme|style\.css|main|custom|global|kit|post-\d+|app\.css|brand|colors?/i.test(u) ? 2 : 0) + (/plugins?\//i.test(u) ? -1 : 0)
  return urls.map((u, i) => ({ u, s: score(u) - i * 0.01 })).sort((a, b) => b.s - a.s).slice(0, 2).map(x => x.u)
}
