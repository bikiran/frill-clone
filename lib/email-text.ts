// Pure email-text helpers (no server imports), shared by the inbound webhook,
// the Gmail sync, the body backfill and the inbox's email card.

import { sanitizeHtml } from '@/lib/safe-html'

/** A header's value from Resend's headers object, or a [{name,value}] list. */
export function headerValue(headers: any, name: string): string | null {
  if (!headers) return null
  const want = name.toLowerCase()
  if (Array.isArray(headers)) {
    const h = headers.find((x: any) => String(x?.name || x?.key || '').toLowerCase() === want)
    const v = h?.value ?? h?.val
    return v == null || v === '' ? null : String(Array.isArray(v) ? v[0] : v)
  }
  if (typeof headers === 'object') {
    for (const [k, v] of Object.entries(headers)) {
      if (k.toLowerCase() === want && v != null && v !== '') return String(Array.isArray(v) ? v[0] : v)
    }
  }
  return null
}

/** "<a@b> <c@d>" → ['<a@b>', '<c@d>']; bare ids get their angle brackets. */
export function parseMessageIds(...raw: (string | null | undefined)[]): string[] {
  const out: string[] = []
  for (const r of raw) {
    if (!r) continue
    const found = String(r).match(/<[^<>\s]+>/g)
    if (found?.length) out.push(...found)
    else for (const t of String(r).split(/[\s,]+/)) if (t.includes('@')) out.push(`<${t.replace(/^<|>$/g, '')}>`)
  }
  return Array.from(new Set(out))
}

/** Both spellings, so a stored id with or without <> still matches. */
export function idVariants(ids: string[]): string[] {
  const s = new Set<string>()
  for (const id of ids) { s.add(id); s.add(id.replace(/^<|>$/g, '')) }
  return Array.from(s).filter(Boolean)
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/**
 * Split a plain-text reply into what the customer wrote and the history their
 * mail app quoted below it. `quotedDate` is the "On <date> … wrote:" date when
 * one can be read, as "8 Oct" (shown as "Replying to your email from 8 Oct").
 */
export function splitQuoted(text: string | null | undefined): { reply: string; quoted: string; quotedDate: string | null } {
  const src = String(text || '').replace(/\r\n/g, '\n')
  if (!src.trim()) return { reply: '', quoted: '', quotedDate: null }
  const lines = src.split('\n')
  let cut = -1
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i]
    if (/^\s*(On\s.+wrote:\s*$|-{2,}\s*Original Message|_{5,}\s*$|From:\s)/i.test(l)) { cut = i; break }
    // "On Wed, 8 Oct 2025 at 10:00 pm, Roxy" + "Aquarium <x> wrote:" over two lines.
    if (/^\s*On\s.+/i.test(l) && /wrote:\s*$/i.test(lines[i + 1] || '') && !/^\s*>/.test(lines[i + 1] || '')) { cut = i; break }
    if (/^\s*>/.test(l) && lines.slice(i).every(x => /^\s*(>|$)/.test(x))) { cut = i; break }
  }
  const replyLines = cut < 0 ? lines : lines.slice(0, cut)
  const reply = replyLines.filter(l => !/^\s*>/.test(l)).join('\n').trim()
  const quoted = cut < 0 ? lines.filter(l => /^\s*>/.test(l)).join('\n').trim() : lines.slice(cut).join('\n').trim()
  return { reply: reply || (quoted ? '' : src.trim()), quoted, quotedDate: quotedDateOf(quoted) }
}

/** "On Wed, 8 Oct 2025 at 10:00" / "On Oct 8, 2025, at…" / "Sent: 8 October 2025" → "8 Oct". */
export function quotedDateOf(quoted: string | null | undefined): string | null {
  const q = String(quoted || '').split('\n').slice(0, 4).join(' ')
  if (!q) return null
  const mon = '(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*'
  let m = new RegExp(`(\\d{1,2})(?:st|nd|rd|th)?\\s+${mon}`, 'i').exec(q)
  if (m) return `${Number(m[1])} ${cap(m[2])}`
  m = new RegExp(`${mon}\\s+(\\d{1,2})\\b`, 'i').exec(q)
  if (m) return `${Number(m[2])} ${cap(m[1])}`
  m = /(\d{4})-(\d{2})-(\d{2})/.exec(q)
  if (m) return `${Number(m[3])} ${MONTHS[Number(m[2]) - 1] || ''}`.trim()
  m = /\bOn\s+(\d{1,2})\/(\d{1,2})\/(\d{2,4})/i.exec(q)
  if (m) return `${Number(m[1])} ${MONTHS[Number(m[2]) - 1] || ''}`.trim()
  return null
}
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1, 3).toLowerCase()

/** Plain text from an email's HTML, for the preview when there's no text part. */
export function htmlToPlain(html: string | null | undefined): string {
  return String(html || '')
    .replace(/<(style|script|head)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n').replace(/<\/(p|div|tr|li|h[1-6]|blockquote)>/gi, '\n')
    .replace(/<blockquote[\s\S]*$/i, '')            // quoted history in most clients
    .replace(/<div class="gmail_quote[\s\S]*$/i, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/[ \t]+/g, ' ').replace(/\n\s*\n\s*\n+/g, '\n\n').trim()
}

/** The thread list's preview for an email: its text, else its files, else its subject. */
export function emailPreview(content: string, attachmentCount: number, subject?: string | null): string {
  const p = (content || '').trim()
    || (attachmentCount === 1 ? 'Sent an attachment' : attachmentCount > 1 ? `Sent ${attachmentCount} attachments` : '')
    || (subject ? `Email: ${subject}` : 'Email received')
  return p.slice(0, 200)
}

/** Subject without any Re:/Fwd: prefixes, lower-cased, for matching a reply to its thread. */
export const normSubject = (v: unknown) =>
  String(v || '').replace(/^\s*((re|fwd?|fw|aw|sv)\s*:\s*)+/i, '').replace(/\s+/g, ' ').trim().toLowerCase()


// ── Showing a customer's email safely ───────────────────────────────────────
// The full formatted email is shown in an <iframe sandbox> (no scripts, no
// same-origin) built from this document. The HTML is sanitised again here, so
// rows stored before the allow-list sanitiser are made safe on display too, and
// a Content-Security-Policy inside the frame blocks anything that slipped
// through from loading or running. Links open in a new tab.
export function emailFrameDoc(html: string | null | undefined): string {
  const clean = sanitizeHtml(String(html || ''), { profile: 'email' })
  return '<!doctype html><html><head><meta charset="utf-8">'
    + `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src https: data:; media-src https:; style-src 'unsafe-inline'; font-src https: data:; form-action 'none'">`
    + '<base target="_blank">'
    + '<style>html,body{margin:0;padding:0}body{padding:2px;font:13.5px/1.55 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;color:#1a1a1a;overflow-wrap:anywhere}img,video{max-width:100%;height:auto}table{max-width:100%}a{color:#2563eb}blockquote{margin:8px 0;padding-left:10px;border-left:3px solid #e5e7eb;color:#6b6b70}</style>'
    + `</head><body>${clean}</body></html>`
}

/** Is there anything to see in this email's formatted copy (text, or an image that can load)? */
export function emailHtmlHasContent(html: string | null | undefined): boolean {
  const h = String(html || '')
  if (!h) return false
  if (/<img\b[^>]*\bsrc\s*=\s*["']?(https?:|data:image)/i.test(h)) return true
  const text = h.replace(/<(style|script|head)[\s\S]*?<\/\1>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/&nbsp;|&#160;|&zwnj;|&#8203;/gi, ' ')
  return /\S/.test(text)
}

/**
 * A starting height for the frame. The sandboxed frame can't be measured from
 * outside (that would need same-origin or scripts in it), so this estimates
 * from the content; the frame scrolls inside and can be dragged taller.
 */
export function estimateEmailHeight(html: string | null | undefined, width = 640): number {
  const h = sanitizeHtml(String(html || ''), { profile: 'email' })
  const text = h.replace(/<(style|script)[\s\S]*?<\/\1>/gi, '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
  const charsPerLine = Math.max(30, Math.floor(width / 7.2))
  const blocks = (h.match(/<(br|p|div|tr|li|h[1-6]|blockquote)\b/gi) || []).length
  let px = Math.ceil(text.length / charsPerLine) * 21 + Math.min(blocks, 400) * 11
  for (const m of h.matchAll(/<img\b[^>]*>/gi)) {
    const hh = /height\s*=\s*"?(\d{1,4})/i.exec(m[0])?.[1]
    px += hh ? Math.min(Number(hh), 600) : 180
  }
  return Math.max(140, Math.min(px + 24, 1100))
}

/**
 * Did the sender pass DKIM or DMARC? From Resend's `authentication` object
 * ({ dkim, dmarc, spf } as strings, objects or lists), or a Gmail
 * Authentication-Results header. 'unknown' when there's nothing to go on.
 */
export function authVerdict(a: any): 'pass' | 'fail' | 'unknown' {
  if (!a) return 'unknown'
  if (typeof a === 'string') {
    if (/\b(dkim|dmarc)=pass\b/i.test(a)) return 'pass'
    if (/\b(dkim|dmarc)=(fail|none|softfail|permerror)\b/i.test(a)) return 'fail'
    return 'unknown'
  }
  const results = (v: any): string[] => v == null ? [] : Array.isArray(v) ? v.flatMap(results)
    : typeof v === 'object' ? results(v.result ?? v.status ?? v.verdict ?? null) : [String(v).toLowerCase()]
  const got = [...results(a.dkim), ...results(a.dmarc)]
  if (!got.length) return 'unknown'
  return got.some(r => r === 'pass') ? 'pass' : 'fail'
}
