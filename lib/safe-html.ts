// Allow-list HTML cleaning for content the public sees (announcements on the
// board, in the chat widget and in emails). No dependency, so it runs the same
// on the server and in the browser.
//
// Only known formatting tags survive; every attribute is rebuilt from an
// allow-list; links and images must be http(s) (links may also be mailto:,
// tel:, a path or an anchor); inline styles keep a few harmless properties.
// Scripts, styles, frames, forms, SVG and event handlers are dropped with
// their content. Anything that isn't a recognised tag is escaped as text.

const DROP_WITH_CONTENT = ['script', 'style', 'iframe', 'object', 'embed', 'noscript', 'template', 'svg', 'math', 'textarea', 'select', 'button', 'form', 'title', 'head', 'xmp', 'noembed', 'noframes', 'frameset']

const ALLOWED = new Set([
  'p', 'br', 'b', 'strong', 'i', 'em', 'u', 's', 'strike', 'del', 'ins', 'mark', 'sub', 'sup', 'small',
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'ul', 'ol', 'li', 'blockquote', 'pre', 'code', 'hr',
  'a', 'img', 'figure', 'figcaption', 'span', 'div', 'font',
  'table', 'thead', 'tbody', 'tfoot', 'tr', 'td', 'th', 'caption', 'colgroup', 'col',
  'video', 'source',
])
const VOID = new Set(['br', 'hr', 'img', 'col', 'source'])

const ATTRS: Record<string, string[]> = {
  a: ['href', 'title'],
  img: ['src', 'alt', 'title', 'width', 'height'],
  td: ['colspan', 'rowspan'], th: ['colspan', 'rowspan', 'scope'], col: ['span'], colgroup: ['span'],
  ol: ['start', 'type'], li: ['value'],
  font: ['color'],
  video: ['src', 'poster', 'controls', 'playsinline', 'muted', 'loop', 'width', 'height'],
  source: ['src', 'type'],
}
const STYLE_OK = new Set(['color', 'background-color', 'text-align', 'font-weight', 'font-style', 'text-decoration', 'text-decoration-line', 'font-size', 'border', 'padding', 'min-width', 'vertical-align', 'width'])

export function escapeHtml(s: string): string {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}

function decodeEntities(s: string): string {
  return s
    .replace(/&#x([0-9a-f]+);?/gi, (_m, h) => { const n = parseInt(h, 16); return n > 0 && n < 0x110000 ? String.fromCodePoint(n) : '' })
    .replace(/&#(\d+);?/g, (_m, d) => { const n = Number(d); return n > 0 && n < 0x110000 ? String.fromCodePoint(n) : '' })
    .replace(/&nbsp;/gi, '\u00a0').replace(/&colon;/gi, ':').replace(/&tab;/gi, '\t').replace(/&newline;/gi, '\n')
    .replace(/&quot;/gi, '"').replace(/&apos;/gi, "'").replace(/&lt;/gi, '<').replace(/&gt;/gi, '>').replace(/&amp;/gi, '&')
}

/** A URL that's safe to link to or load: http(s), and for links mailto:/tel:, a path or an anchor. */
export function safeUrl(raw: string | null | undefined, kind: 'link' | 'media' = 'link'): string | null {
  if (raw == null) return null
  // Browsers ignore control characters and whitespace inside a scheme, so do
  // the same before looking at it ("java\tscript:" is still javascript:).
  const v = decodeEntities(String(raw)).replace(/[\u0000- \u007f-\u009f]/g, '')
  if (!v) return null
  if (/^https?:\/\//i.test(v)) return v
  if (kind === 'link' && /^(mailto|tel):/i.test(v)) return v
  // A path on this site; never "//host" or "/\host", which browsers treat as another site.
  if (/^\/(?![\/\\])/.test(v) || (kind === 'link' && v.startsWith('#'))) return v
  return null
}

function cleanStyle(raw: string): string {
  const out: string[] = []
  for (const decl of decodeEntities(raw).split(';')) {
    const i = decl.indexOf(':')
    if (i < 0) continue
    const prop = decl.slice(0, i).trim().toLowerCase()
    const val = decl.slice(i + 1).trim()
    if (!STYLE_OK.has(prop) || !val || val.length > 80) continue
    // Colours, lengths, keywords. Nothing that can load or run anything.
    if (/[^#a-z0-9.,%()\s-]/i.test(val) || /url|expression|javascript|import|var\(/i.test(val)) continue
    if (!sizeOk(prop, val)) continue
    out.push(`${prop}: ${val}`)
  }
  return out.join('; ')
}

// Sizes stay within what a post needs: no 9999px text or page-wide boxes.
const SIZE_LIMIT: Record<string, { px: number; pct: number; em: number }> = {
  'font-size': { px: 48, pct: 300, em: 3 },
  width: { px: 1200, pct: 100, em: 60 }, 'min-width': { px: 400, pct: 100, em: 25 },
  padding: { px: 40, pct: 10, em: 3 }, border: { px: 4, pct: 0, em: 0.3 },
}
function sizeOk(prop: string, val: string): boolean {
  const lim = SIZE_LIMIT[prop]
  if (!lim) return true
  const re = /(-?\d*\.?\d+)\s*(px|%|r?em|pt|vw|vh|vmin|vmax|ch|ex|cm|mm|in)?/gi
  let m: RegExpExecArray | null
  while ((m = re.exec(val))) {
    const n = Math.abs(parseFloat(m[1])), u = (m[2] || '').toLowerCase()
    if (/^(vw|vh|vmin|vmax|cm|mm|in)$/.test(u)) return false
    const max = u === '%' ? lim.pct : u === 'em' || u === 'rem' || u === 'ch' || u === 'ex' ? lim.em : lim.px
    if (n > max) return false
  }
  return true
}

function cleanAttrs(tag: string, raw: string): string {
  const allowed = ATTRS[tag] || []
  const out: string[] = []
  const re = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g
  let m: RegExpExecArray | null
  const seen = new Set<string>()
  while ((m = re.exec(raw))) {
    const name = m[1].toLowerCase()
    if (seen.has(name)) continue
    seen.add(name)
    const value = m[2] ?? m[3] ?? m[4] ?? ''
    if (name === 'style') {
      const st = cleanStyle(value)
      if (st) out.push(`style="${escapeHtml(st)}"`)
      continue
    }
    if (!allowed.includes(name)) continue
    if (name === 'href') {
      const u = safeUrl(value, 'link')
      if (u) out.push(`href="${escapeHtml(u)}"`)
      continue
    }
    if (name === 'src' || name === 'poster') {
      const u = safeUrl(value, 'media')
      if (u) out.push(`${name}="${escapeHtml(u)}"`)
      continue
    }
    if (['controls', 'playsinline', 'muted', 'loop'].includes(name)) { out.push(name); continue }
    if (['width', 'height', 'colspan', 'rowspan', 'span', 'start', 'value'].includes(name)) {
      const n = decodeEntities(value).trim()
      if (/^\d{1,4}%?$/.test(n)) out.push(`${name}="${n}"`)
      continue
    }
    if (name === 'color') {
      const c = decodeEntities(value).trim()
      if (/^(#[0-9a-f]{3,8}|[a-z]{3,20})$/i.test(c)) out.push(`color="${c}"`)
      continue
    }
    out.push(`${name}="${escapeHtml(decodeEntities(value).slice(0, 300))}"`)
  }
  if (tag === 'a' && out.some(a => a.startsWith('href="http'))) out.push('target="_blank"', 'rel="noopener noreferrer nofollow"')
  if (tag === 'img') out.push('loading="lazy"')
  return out.length ? ' ' + out.join(' ') : ''
}

/** Clean HTML down to safe formatting. */
export function sanitizeHtml(input: string | null | undefined): string {
  if (!input) return ''
  let t = String(input).slice(0, 400_000)
  t = t.replace(/<!--[\s\S]*?(-->|$)/g, '').replace(/<!\[CDATA\[[\s\S]*?(\]\]>|$)/gi, '').replace(/<![^>]*>/g, '').replace(/<\?[\s\S]*?(\?>|$)/g, '')
  // Closed ones go with their content; an unclosed one loses only its tag, not
  // the rest of the post. (Safety doesn't rest on this: only ALLOWED tags
  // are ever written out below.)
  for (const tag of DROP_WITH_CONTENT) {
    t = t.replace(new RegExp(`<${tag}\\b[\\s\\S]*?<\\/${tag}\\s*>`, 'gi'), '')
    t = t.replace(new RegExp(`<\\/?${tag}\\b[^>]*>`, 'gi'), '')
  }
  const out: string[] = []
  const open: string[] = []   // tags written and not yet closed, so the output is balanced
  const re = /<(\/?)([a-zA-Z][a-zA-Z0-9]*)\b([^>]*)>/g
  let last = 0
  let m: RegExpExecArray | null
  while ((m = re.exec(t))) {
    out.push(escapeText(t.slice(last, m.index)))
    last = re.lastIndex
    const closing = m[1] === '/'
    let tag = m[2].toLowerCase()
    if (!ALLOWED.has(tag)) continue
    if (tag === 'font') tag = 'span'
    if (closing) {
      if (VOID.has(tag)) continue
      const at = open.lastIndexOf(tag)
      if (at < 0) continue                         // a close with no open: ignored
      while (open.length > at) out.push(`</${open.pop()}>`)
      continue
    }
    const attrs = m[2].toLowerCase() === 'font' ? fontAttrs(m[3]) : cleanAttrs(tag, m[3])
    // A picture or video file with no safe source is just dropped.
    if ((tag === 'img' || tag === 'source') && !/ src="/.test(attrs)) continue
    out.push(`<${tag}${attrs}>`)
    if (!VOID.has(tag)) open.push(tag)
  }
  out.push(escapeText(t.slice(last)))
  while (open.length) out.push(`</${open.pop()}>`)
  return out.join('')
}

// <font color="#f00"> (what execCommand writes) becomes a span with a colour.
function fontAttrs(raw: string): string {
  const c = /color\s*=\s*["']?\s*(#[0-9a-f]{3,8}|[a-z]{3,20})/i.exec(raw)?.[1]
  const st = /style\s*=\s*"([^"]*)"/i.exec(raw)?.[1] || ''
  const style = [c ? `color: ${c}` : '', cleanStyle(st)].filter(Boolean).join('; ')
  return style ? ` style="${escapeHtml(style)}"` : ''
}

// Text between tags: keep entities that are already escaped, escape the rest.
function escapeText(s: string): string {
  return s.replace(/&(?!(#\d{1,7}|#x[0-9a-f]{1,6}|[a-z][a-z0-9]{1,31});)/gi, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

export function looksLikeHtml(s: string | null | undefined): boolean {
  return /<\/?(p|br|div|h[1-6]|ul|ol|li|strong|b|em|i|u|a|img|span|blockquote|table|figure|video|hr|pre|code|font|s)\b[^>]*>/i.test(String(s || ''))
}

/**
 * Plain text (or light markdown, which older announcements and imports use)
 * to safe HTML: paragraphs, line breaks, "# " headings, "- " / "• " lists,
 * **bold** and bare links.
 */
export function textToHtml(text: string | null | undefined): string {
  // Decode first, then escape once: "Fish &amp; chips" shows as "Fish & chips",
  // never "Fish &amp;amp; chips".
  const src = decodeEntities(String(text || '')).replace(/\u00a0/g, ' ').replace(/\r\n?/g, '\n').trim()
  if (!src) return ''
  const inline = (s: string) => escapeHtml(s)
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[\s(])(https?:\/\/(?:(?!&quot;|&lt;|&gt;|&#39;|&amp;)[^\s<)]|&amp;)+)/g, (_m, pre, url) => `${pre}<a href="${url}" target="_blank" rel="noopener noreferrer nofollow">${url}</a>`)
  const blocks = src.split(/\n{2,}/)
  const html: string[] = []
  for (const block of blocks) {
    const lines = block.split('\n')
    if (lines.every(l => /^\s*([-*•]|\d+[.)])\s+/.test(l))) {
      const ordered = /^\s*\d/.test(lines[0])
      html.push(`<${ordered ? 'ol' : 'ul'}>${lines.map(l => `<li>${inline(l.replace(/^\s*([-*•]|\d+[.)])\s+/, ''))}</li>`).join('')}</${ordered ? 'ol' : 'ul'}>`)
      continue
    }
    const h = /^(#{1,3})\s+(.*)$/.exec(lines[0])
    if (h && lines.length === 1) { html.push(`<h${h[1].length + 1}>${inline(h[2])}</h${h[1].length + 1}>`); continue }
    // A heading line followed by more text, or a list after a lead-in line.
    const out: string[] = []
    let list: string[] = []
    const flush = () => { if (list.length) { out.push(`<ul>${list.map(l => `<li>${inline(l)}</li>`).join('')}</ul>`); list = [] } }
    let para: string[] = []
    const flushPara = () => { if (para.length) { out.push(`<p>${para.map(inline).join('<br>')}</p>`); para = [] } }
    for (const l of lines) {
      const hh = /^(#{1,3})\s+(.*)$/.exec(l)
      if (hh) { flushPara(); flush(); out.push(`<h${hh[1].length + 1}>${inline(hh[2])}</h${hh[1].length + 1}>`); continue }
      if (/^\s*[-*•]\s+/.test(l)) { flushPara(); list.push(l.replace(/^\s*[-*•]\s+/, '')); continue }
      flush(); para.push(l)
    }
    flushPara(); flush()
    html.push(out.join(''))
  }
  return html.join('')
}

/** Any stored body (HTML or plain text) as safe HTML. */
export function bodyToSafeHtml(body: string | null | undefined): string {
  return looksLikeHtml(body) ? sanitizeHtml(body) : textToHtml(body)
}

/** HTML to readable plain text (emails, SMS, excerpts, AI prompts). */
export function htmlToText(html: string | null | undefined): string {
  let t = String(html || '')
  if (!t) return ''
  t = t.replace(/<(script|style)\b[\s\S]*?<\/\1\s*>/gi, '')
  t = t.replace(/<br\s*\/?>/gi, '\n').replace(/<li\b[^>]*>/gi, '\n- ').replace(/<\/(p|div|h[1-6]|li|blockquote|tr|table|ul|ol|figure)>/gi, '\n')
  t = t.replace(/<[^>]+>/g, '')
  t = decodeEntities(t)
  return t.replace(/[ \t ]+/g, ' ').replace(/ ?\n ?/g, '\n').replace(/\n{3,}/g, '\n\n').trim()
}

export function excerpt(body: string | null | undefined, max = 180): string {
  const t = htmlToText(looksLikeHtml(body) ? body : String(body || '').replace(/^#{1,3}\s+/gm, '').replace(/\*\*/g, '')).replace(/\s+/g, ' ').trim()
  return t.length > max ? t.slice(0, max - 1).replace(/\s+\S*$/, '') + '…' : t
}
