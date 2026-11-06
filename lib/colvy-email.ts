// The one layout for Colvy's own emails: the ones Colvy sends to business
// owners and their staff (codes, welcome, invites, trial reminders, mentions,
// assignments, new reviews, the agent summary, Colvy team alerts). Never for
// emails to a business's own customers: those carry the business's branding,
// not Colvy's (lib/booking-email has the same look in the business's colours).
//
// The look: a calm card on soft grey, the Colvy mark above it (and the
// workspace's name beside it), an optional status pill, a big headline, soft
// rounded panels, one wide coral button.
//
// Built to survive real mail clients:
//   • tables and inline styles only. Nothing relies on flexbox or SVG. The one
//     <style> block tightens padding on phones and gives clients that honour
//     prefers-color-scheme (Apple Mail, iOS Mail, Outlook for Mac) a proper dark
//     version; everything reads the same without it;
//   • a bulletproof button (a coloured table cell around the link), a hosted PNG
//     logo on a dark tile (readable whichever way a client inverts colours), a
//     hidden preheader, the system font stack;
//   • 560px wide, fluid below that;
//   • a plain-text version made from the same content.
//
// Every string you pass in is plain text and is escaped here. The only markup
// it understands is **bold**. Links must be https (mailto:/tel: for contacts).

import { escapeHtml } from '@/lib/safe-html'

export const COLVY_TAGLINE = 'The all-in-one customer platform for teams of every size'
// The mark sits on a dark tile with an empty alt: the "Colvy" wordmark beside it
// names it, so a mail app that blocks images shows a tidy tile, not a second
// "Colvy" link (Supabase's template preview blocks outside images too).
export const COLVY_LOGO_URL = 'https://colvy.com/icon-192.png'
export const COLVY_SITE = 'https://colvy.com'

const C = {
  ink: '#18181b',
  body: '#52525b',
  muted: '#71717a',
  coral: '#ff7a6b',
  /** Coral that reads as text on white (4.5:1). */
  coralInk: '#b3554b',
  coralTint: '#ffefed',
  coralLine: '#ffd7d3',
  canvas: '#f4f4f5',
  card: '#ffffff',
  line: '#ececef',
  panel: '#f7f7f8',
}
/** Dark mode (clients that support prefers-color-scheme). */
const D = {
  canvas: '#0f0f11', card: '#18181b', panel: '#212125', line: '#2d2d33',
  ink: '#fafafa', body: '#b4b4bc', muted: '#8e8e98',
  coralInk: '#ff7a6b', coralTint: '#382626', coralLine: '#743f3b',
}
const TONES = {
  good: { fg: '#067647', bg: '#ecfdf3', line: '#c6f1d9', dfg: '#75e0a7', dbg: '#0b2e1f', dline: '#14532d', mark: '✓' },
  warn: { fg: '#b54708', bg: '#fffaeb', line: '#fde7b0', dfg: '#fdb022', dbg: '#33240a', dline: '#5c3d0a', mark: '!' },
  bad: { fg: '#b42318', bg: '#fef3f2', line: '#fbd5d1', dfg: '#fda29b', dbg: '#3a1512', dline: '#5f1f19', mark: '✕' },
  accent: { fg: C.coralInk, bg: C.coralTint, line: C.coralLine, dfg: D.coralInk, dbg: D.coralTint, dline: D.coralLine, mark: '●' },
  neutral: { fg: '#3f3f46', bg: '#f4f4f5', line: '#e4e4e7', dfg: '#d4d4d8', dbg: '#27272a', dline: '#3f3f46', mark: '●' },
} as const
export type EmailPillTone = keyof typeof TONES

const GOLD = '#f5b301'
const STAR_OFF = '#d4d4d8'
/** ★★★★☆ as coloured text: works in every mail client, no images. */
const starsHtml = (n: number, size: number) => {
  const k = Math.max(0, Math.min(5, Math.round(n || 0)))
  return `<span style="font-family:Arial,Helvetica,sans-serif;font-size:${size}px;line-height:1;letter-spacing:${Math.round(size / 8)}px;color:${GOLD}">${'&#9733;'.repeat(k)}</span>${k < 5 ? `<span style="font-family:Arial,Helvetica,sans-serif;font-size:${size}px;line-height:1;letter-spacing:${Math.round(size / 8)}px;color:${STAR_OFF}">${'&#9733;'.repeat(5 - k)}</span>` : ''}`
}
const starsText = (n: number) => { const k = Math.max(0, Math.min(5, Math.round(n || 0))); return '★'.repeat(k) + '☆'.repeat(5 - k) }
const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif"
const MONO = "ui-monospace,SFMono-Regular,Menlo,Consolas,'Liberation Mono','Courier New',monospace"
/** Small coloured squares for list rows (the marketing site's palette). */
const DOTS = ['#ff7a6b', '#2b59ff', '#00c48c', '#ffcb45', '#7c5cff', '#0f1119']

export type EmailLink = { label: string; url: string }
export type EmailListItem = { title: string; detail?: string }
export type EmailStat = { label: string; value: string; note?: string }
/** A small status chip above the title ("Mentioned you", "Action needed"…). */
export type EmailPill = { tone: EmailPillTone; text: string; mark?: string }

export type EmailBlock =
  /** A paragraph. */
  | { type: 'text'; text: string; small?: boolean }
  /** A small heading inside the body. */
  | { type: 'heading'; text: string }
  /** A one-time code, big and on its own line so it's easy to copy. */
  | { type: 'code'; code: string; note?: string }
  /** Rows with a small coloured square (or a number) in front. */
  | { type: 'list'; items: EmailListItem[]; numbered?: boolean }
  /** Label and value pairs. */
  | { type: 'facts'; rows: [string, string][] }
  /** Quoted words, e.g. the message someone was mentioned in. */
  | { type: 'quote'; text: string }
  /** Number tiles, two to a row so they fit a phone. */
  | { type: 'stats'; tiles: EmailStat[] }
  /** Cards with a bold title and a line under it. */
  | { type: 'cards'; items: EmailListItem[] }
  /** "Button not working?" with the full link to copy. */
  | { type: 'link'; url: string; label?: string }
  /** A customer review: their name, gold stars and what they wrote. */
  | { type: 'review'; reviewer: string; rating: number; comment?: string | null }
  /** A boxed aside. */
  | { type: 'note'; text: string }
  | { type: 'divider' }

export type ColvyEmailInput = {
  /** The preview line inboxes show after the subject. Hidden in the email. */
  preheader: string
  title: string
  /** A status chip above the title. */
  pill?: EmailPill
  /** Big gold stars above everything else (a review's rating, 1–5). */
  stars?: number
  /** Centre the header, title, text and button (blocks keep their own layout inside). */
  center?: boolean
  /** Line under the title, e.g. "for Roxy Aquarium". */
  subtitle?: string
  /** The workspace it's about, e.g. the business name (beside the Colvy mark). */
  kicker?: string
  intro?: string | string[]
  blocks?: EmailBlock[]
  cta?: EmailLink
  /** Blocks after the button (e.g. the link to copy, a short "what Colvy does"). */
  more?: EmailBlock[]
  /** Short paragraphs after the button (e.g. "Didn't ask for this? Ignore it."). */
  secondary?: string | string[]
  /** Why they're getting this / how to switch it off. Shown in the footer. */
  footerNote?: string
  /** Defaults to the current year; false leaves it out (static templates go stale). */
  year?: number | false
}

export type ColvyEmail = { html: string; text: string }

const list = (v?: string | string[]) => (v == null ? [] : Array.isArray(v) ? v : [v]).filter(s => s != null && String(s).trim() !== '')

/** Escape, then turn **bold** into <b>. */
function inline(s: string): string {
  return escapeHtml(String(s ?? '')).replace(/\*\*(.+?)\*\*/g, '<b class="cv-ink" style="color:' + C.ink + ';font-weight:700">$1</b>')
}
/** The plain-text form: **bold** loses its stars. */
function plain(s: string): string {
  return String(s ?? '').replace(/\*\*(.+?)\*\*/g, '$1')
}

/** https only (mailto:/tel: allowed for contact links). Anything else becomes the site. */
export function safeEmailUrl(raw: string, allowContact = false): string {
  const s = String(raw || '').trim()
  if (/^https:\/\/[^\s"'<>]+$/i.test(s)) return s
  // Local development only (a local Supabase or dev server).
  if (/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?(\/[^\s"'<>]*)?$/i.test(s)) return s
  if (allowContact && /^(mailto|tel):[^\s"'<>]+$/i.test(s)) return s
  return COLVY_SITE
}
const attr = (url: string, allowContact = false) => escapeHtml(safeEmailUrl(url, allowContact))

const P = (html: string, opts: { size?: number; color?: string; cls?: string; margin?: string; center?: boolean } = {}) =>
  `<p class="${opts.cls || 'cv-sub'}" style="margin:${opts.margin || '0 0 16px'};font-family:${FONT};font-size:${opts.size || 15.5}px;line-height:1.6;color:${opts.color || C.body}${opts.center ? ';text-align:center' : ''}">${html}</p>`

/** A soft rounded panel (one table cell) around some HTML. */
const panel = (inner: string, o: { pad?: string; radius?: number; bg?: string; line?: string; cls?: string; margin?: string } = {}) =>
  `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:${o.margin || '4px 0 20px'}">
  <tr>
    <td class="${o.cls || 'cv-panel'}" bgcolor="${o.bg || C.panel}" style="background-color:${o.bg || C.panel};border:1px solid ${o.line || C.line};border-radius:${o.radius ?? 18}px;padding:${o.pad || '16px 18px'}">${inner}</td>
  </tr>
</table>`

/** A bulletproof button: the coloured cell is the button, so it shows even with images and CSS off. Full width, pill-shaped. */
export function emailButton(cta: EmailLink, _center = false): string {
  const href = attr(cta.url)
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 22px">
  <tr>
    <td align="center" bgcolor="${C.coral}" style="background-color:${C.coral};border-radius:999px">
      <a href="${href}" target="_blank" style="display:block;padding:15px 22px;font-family:${FONT};font-size:15.5px;font-weight:700;line-height:20px;color:#ffffff;text-decoration:none;border-radius:999px;text-align:center">${escapeHtml(cta.label)}</a>
    </td>
  </tr>
</table>`
}

function blockHtml(b: EmailBlock): string {
  switch (b.type) {
    case 'text':
      return b.small ? P(inline(b.text), { size: 13.5, color: C.muted, cls: 'cv-muted' }) : P(inline(b.text))
    case 'heading':
      return `<h2 class="cv-acc" style="margin:26px 0 10px;font-family:${FONT};font-size:12px;line-height:1.4;font-weight:800;letter-spacing:0.08em;text-transform:uppercase;color:${C.coralInk}">${inline(b.text)}</h2>`
    case 'code':
      // Just the code, big and coral, on a soft tint: nothing else in the box.
      return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:4px 0 20px">
  <tr>
    <td align="center" class="cv-note" bgcolor="${C.coralTint}" style="background-color:${C.coralTint};border-radius:20px;padding:26px 12px">
      <div class="cv-code cv-acc" style="font-family:${FONT};font-size:40px;line-height:46px;font-weight:800;letter-spacing:10px;color:${C.coralInk}">${escapeHtml(b.code)}</div>
    </td>
  </tr>
</table>${b.note ? `
${P(inline(b.note), { size: 13.5, color: C.muted, cls: 'cv-muted' })}` : ''}`
    case 'list':
      return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 16px">
${b.items.map((it, i) => `  <tr>
    <td width="28" valign="top" style="padding:${b.numbered ? '2px' : '7px'} 0 10px">${b.numbered
      ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td width="20" height="20" align="center" valign="middle" bgcolor="${C.coral}" style="width:20px;height:20px;background-color:${C.coral};border-radius:10px;font-family:${FONT};font-size:12px;font-weight:700;line-height:20px;color:#ffffff">${i + 1}</td></tr></table>`
      : `<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td width="10" height="10" bgcolor="${DOTS[i % DOTS.length]}" style="width:10px;height:10px;background-color:${DOTS[i % DOTS.length]};border-radius:3px;font-size:0;line-height:0">&nbsp;</td></tr></table>`}</td>
    <td valign="top" class="cv-sub" style="padding:0 0 10px;font-family:${FONT};font-size:15px;line-height:1.55;color:${C.body}">${it.detail ? `<b class="cv-ink" style="color:${C.ink};font-weight:700">${inline(it.title)}</b> <span class="cv-muted" style="color:${C.muted}">${inline(it.detail)}</span>` : inline(it.title)}</td>
  </tr>`).join('\n')}
</table>`
    case 'facts':
      return panel(`<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
${b.rows.map(([k, v], i) => `    <tr>
      <td valign="top" class="cv-muted cv-row" style="padding:9px 12px 9px 0;width:38%;font-family:${FONT};font-size:13.5px;line-height:1.45;color:${C.muted}${i ? `;border-top:1px solid ${C.line}` : ''}">${escapeHtml(k)}</td>
      <td valign="top" class="cv-ink cv-row" style="padding:9px 0;font-family:${FONT};font-size:14.5px;line-height:1.45;font-weight:600;color:${C.ink};word-break:break-word${i ? `;border-top:1px solid ${C.line}` : ''}">${escapeHtml(v)}</td>
    </tr>`).join('\n')}
  </table>`, { pad: '8px 18px', radius: 20 })
    case 'quote':
      return panel(`<div class="cv-ink" style="font-family:${FONT};font-size:15px;line-height:1.6;color:${C.ink};white-space:pre-wrap;word-break:break-word">${escapeHtml(b.text)}</div>`,
        { pad: '14px 18px', radius: 18 })
    case 'stats': {
      const rows: EmailStat[][] = []
      for (let i = 0; i < b.tiles.length; i += 2) rows.push(b.tiles.slice(i, i + 2))
      const cell = (t?: EmailStat) => t ? `<td width="50%" valign="top" style="padding:5px">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td class="cv-panel" bgcolor="${C.panel}" style="background-color:${C.panel};border:1px solid ${C.line};border-radius:16px;padding:14px 16px">
        <div class="cv-muted" style="font-family:${FONT};font-size:12.5px;line-height:1.4;color:${C.muted}">${escapeHtml(t.label)}</div>
        <div class="cv-ink" style="font-family:${FONT};font-size:24px;line-height:1.25;font-weight:800;letter-spacing:-0.02em;color:${C.ink};margin-top:3px">${escapeHtml(t.value)}</div>
        ${t.note ? `<div class="cv-muted" style="font-family:${FONT};font-size:12px;line-height:1.4;color:${C.muted};margin-top:2px">${escapeHtml(t.note)}</div>` : ''}
      </td></tr></table>
    </td>` : '<td width="50%" style="padding:5px">&nbsp;</td>'
      return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 14px;width:100%">
${rows.map(r => `  <tr>
    ${cell(r[0])}
    ${cell(r[1])}
  </tr>`).join('\n')}
</table>`
    }
    case 'cards':
      return b.items.map(it => panel(`<div class="cv-ink" style="font-family:${FONT};font-size:15px;line-height:1.4;font-weight:700;color:${C.ink}">${inline(it.title)}</div>
      ${it.detail ? `<div class="cv-muted" style="font-family:${FONT};font-size:14px;line-height:1.5;color:${C.muted};margin-top:3px">${inline(it.detail)}</div>` : ''}`,
        { pad: '13px 16px', radius: 16, bg: C.card, cls: 'cv-tile', margin: '0 0 8px' })).join('\n') + '<div style="height:10px;line-height:10px;font-size:0">&nbsp;</div>'
    case 'link': {
      const url = safeEmailUrl(b.url)
      return `${P(escapeHtml(b.label || 'Button not working? Copy this link into your browser:'), { size: 13, color: C.muted, cls: 'cv-muted', margin: '0 0 6px' })}
${panel(`<a href="${escapeHtml(url)}" target="_blank" class="cv-acc" style="font-family:${MONO};font-size:12px;line-height:1.5;word-break:break-all;color:${C.coralInk};text-decoration:underline">${escapeHtml(url)}</a>`, { pad: '10px 14px', radius: 12, margin: '0 0 20px' })}`
    }
    case 'review':
      return panel(`<div class="cv-ink" style="font-family:${FONT};font-size:16px;line-height:1.4;font-weight:700;color:${C.ink}">${escapeHtml(b.reviewer)}</div>
      ${b.rating ? `<div style="margin:6px 0 2px">${starsHtml(b.rating, 18)}</div>` : ''}
      <div class="${b.comment ? 'cv-ink' : 'cv-muted'}" style="margin-top:8px;font-family:${FONT};font-size:15px;line-height:1.6;color:${b.comment ? C.ink : C.muted};white-space:pre-wrap;word-break:break-word">${escapeHtml(b.comment || '(no written comment)')}</div>`,
        { pad: '16px 18px', radius: 20 })
    case 'note':
      return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 20px">
  <tr>
    <td class="cv-note cv-ink" bgcolor="${C.coralTint}" style="background-color:${C.coralTint};border-radius:18px;padding:14px 18px;font-family:${FONT};font-size:14.5px;line-height:1.55;color:${C.ink}">${inline(b.text)}</td>
  </tr>
</table>`
    case 'divider':
      return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 20px"><tr><td class="cv-line" height="1" bgcolor="${C.line}" style="height:1px;background-color:${C.line};font-size:0;line-height:0">&nbsp;</td></tr></table>`
  }
}

function blockText(b: EmailBlock): string {
  switch (b.type) {
    case 'text': return plain(b.text)
    case 'heading': return plain(b.text).toUpperCase()
    case 'code': return `    ${b.code}${b.note ? `\n${plain(b.note)}` : ''}`
    case 'list': return b.items.map((it, i) => `${b.numbered ? `${i + 1}.` : '-'} ${plain(it.title)}${it.detail ? ` ${plain(it.detail)}` : ''}`).join('\n')
    case 'facts': return b.rows.map(([k, v]) => `${k}: ${v}`).join('\n')
    case 'quote': return b.text.split('\n').map(l => `> ${l}`).join('\n')
    case 'stats': return b.tiles.map(t => `${t.label}: ${t.value}${t.note ? ` (${t.note})` : ''}`).join('\n')
    case 'cards': return b.items.map(it => `- ${plain(it.title)}${it.detail ? `: ${plain(it.detail)}` : ''}`).join('\n')
    case 'link': return `${b.label || 'Or copy this link into your browser:'}\n${safeEmailUrl(b.url)}`
    case 'review': return `${b.reviewer}${b.rating ? ` ${starsText(b.rating)}` : ''}\n${b.comment || '(no written comment)'}`
    case 'note': return plain(b.text)
    case 'divider': return '---'
  }
}

/** Render a Colvy email. Returns the HTML and the plain-text version. */
export function colvyEmail(input: ColvyEmailInput): ColvyEmail {
  const year = input.year === false ? null : (input.year || new Date().getFullYear())
  const copyright = year ? `${year} Colvy` : 'Colvy'
  const intro = list(input.intro)
  const secondary = list(input.secondary)
  const blocks = input.blocks || []
  const more = input.more || []
  const pad = ' &#847;&zwnj;&nbsp;'.repeat(40)

  const center = !!input.center
  const ta = center ? ';text-align:center' : ''
  const tone = input.pill ? TONES[input.pill.tone] || TONES.neutral : null
  const mark = input.pill ? (input.pill.mark ?? tone!.mark) : ''
  const dot = mark === '●'
  const body = [
    input.stars ? `<div style="margin:0 0 14px${ta}">${starsHtml(input.stars, center ? 34 : 30)}</div>` : '',
    input.pill && tone ? `<div style="margin:0 0 16px${ta}"><span class="cv-pill" style="display:inline-block;background-color:${tone.bg};color:${tone.fg};border:1px solid ${tone.line};border-radius:999px;padding:4px 12px 4px 10px;font-family:${FONT};font-size:12.5px;line-height:1.5;font-weight:700"><span style="font-size:${dot ? 9 : 12}px;vertical-align:${dot ? '1px' : '0'}">${escapeHtml(mark)}</span>&nbsp; ${escapeHtml(input.pill.text)}</span></div>` : '',
    // A centred email keeps the workspace's name above the title.
    center && input.kicker ? P(escapeHtml(input.kicker), { size: 13, color: C.muted, cls: 'cv-muted', margin: '0 0 6px', center }) : '',
    `<h1 class="cv-ink cv-h1" style="margin:0 0 ${input.subtitle ? '8px' : '12px'};font-family:${FONT};font-size:28px;line-height:1.15;font-weight:800;letter-spacing:-0.025em;color:${C.ink}${ta}">${escapeHtml(input.title)}</h1>`,
    input.subtitle ? P(escapeHtml(input.subtitle), { size: 16, color: C.muted, cls: 'cv-muted', margin: '0 0 22px', center }) : '',
    ...intro.map(t => P(inline(t), { center })),
    ...blocks.map(blockHtml),
    input.cta ? emailButton(input.cta, center) : '',
    ...more.map(blockHtml),
    ...secondary.map(t => P(inline(t), { size: 13.5, color: C.muted, cls: 'cv-muted', center })),
  ].filter(Boolean).join('\n')

  const brand = `<table role="presentation" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td valign="middle" style="padding-right:10px"><table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td width="34" height="34" bgcolor="#1a1a1a" style="width:34px;height:34px;background-color:#1a1a1a;border-radius:11px"><img src="${COLVY_LOGO_URL}" width="34" height="34" alt="" style="display:block;width:34px;height:34px;border:0;border-radius:11px"></td></tr></table></td>
                <td valign="middle" class="cv-ink" style="font-family:${FONT};font-size:17px;line-height:22px;font-weight:800;letter-spacing:-0.3px;color:${C.ink}">Colvy</td>
              </tr>
            </table>`

  const html = `<!doctype html>
<html lang="en-AU" xmlns="http://www.w3.org/1999/xhtml">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="x-apple-disable-message-reformatting">
<meta name="color-scheme" content="light dark">
<meta name="supported-color-schemes" content="light dark">
<title>${escapeHtml(input.title)}</title>
<style>
  @media only screen and (max-width:620px) {
    .cv-pad { padding-left:20px !important; padding-right:20px !important; }
    .cv-wrap { padding:20px 10px !important; }
    .cv-h1 { font-size:25px !important; }
    .cv-code { font-size:32px !important; letter-spacing:7px !important; }
  }
  @media (prefers-color-scheme:dark) {
    .cv-bg { background-color:${D.canvas} !important; }
    .cv-card { background-color:${D.card} !important; border-color:${D.line} !important; }
    .cv-panel { background-color:${D.panel} !important; border-color:${D.line} !important; }
    .cv-tile { background-color:${D.card} !important; border-color:${D.line} !important; }
    .cv-row { border-color:${D.line} !important; }
    .cv-line { background-color:${D.line} !important; border-color:${D.line} !important; }
    .cv-ink { color:${D.ink} !important; }
    .cv-sub { color:${D.body} !important; }
    .cv-muted { color:${D.muted} !important; }
    .cv-acc { color:${D.coralInk} !important; }
    .cv-note { background-color:${D.coralTint} !important; }
    ${tone ? `.cv-pill { background-color:${tone.dbg} !important; color:${tone.dfg} !important; border-color:${tone.dline} !important; }` : ''}
  }
</style>
</head>
<body class="cv-bg" style="margin:0;padding:0;background-color:${C.canvas};-webkit-text-size-adjust:100%">
<div style="display:none;max-height:0;max-width:0;overflow:hidden;opacity:0;mso-hide:all;font-size:1px;line-height:1px;color:${C.canvas}">${escapeHtml(input.preheader)}${pad}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="cv-bg" bgcolor="${C.canvas}" style="background-color:${C.canvas}">
  <tr>
    <td align="center" class="cv-wrap" style="padding:32px 14px">
      <!--[if mso]><table role="presentation" width="560" cellpadding="0" cellspacing="0" border="0"><tr><td><![endif]-->
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:560px">
        <tr>
          <td style="padding:0 6px 16px">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
              <td valign="middle"${center ? ' align="center"' : ''}>${center ? brand.replace('<table role="presentation" cellpadding="0" cellspacing="0" border="0">', '<table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center">') : brand}</td>
              ${!center && input.kicker ? `<td valign="middle" align="right" class="cv-muted" style="padding-left:12px;font-family:${FONT};font-size:13px;line-height:1.35;font-weight:600;color:${C.muted};text-align:right">${escapeHtml(input.kicker)}</td>` : ''}
            </tr></table>
          </td>
        </tr>
        <tr>
          <td class="cv-pad cv-card" bgcolor="${C.card}" style="background-color:${C.card};padding:32px 30px 12px;border:1px solid ${C.line};border-radius:24px">
${body}
          </td>
        </tr>
        <tr>
          <td class="cv-pad" align="center" style="padding:20px 30px 8px;font-family:${FONT};font-size:12px;line-height:1.6;color:#a1a1aa;text-align:center">
            ${input.footerNote ? `<p class="cv-muted" style="margin:0 0 10px;font-family:${FONT};font-size:12.5px;line-height:1.6;color:${C.muted}">${inline(input.footerNote)}</p>` : ''}
            <p class="cv-muted" style="margin:0;font-family:${FONT};font-size:12px;line-height:1.6;color:#a1a1aa">&copy; ${copyright} &middot; <a href="${COLVY_SITE}" target="_blank" style="color:#a1a1aa;text-decoration:underline">colvy.com</a> &middot; <a href="${COLVY_SITE}/privacy" target="_blank" style="color:#a1a1aa;text-decoration:underline">Privacy</a></p>
          </td>
        </tr>
      </table>
      <!--[if mso]></td></tr></table><![endif]-->
    </td>
  </tr>
</table>
</body>
</html>`

  const footer = [
    input.footerNote ? plain(input.footerNote) : '',
    `© ${copyright} · ${COLVY_SITE}`,
  ].filter(Boolean)
  const text = [
    input.stars ? starsText(input.stars) : '',
    input.kicker || '',
    input.title,
    input.subtitle || '',
    ...intro.map(plain),
    ...blocks.map(blockText),
    input.cta ? `${input.cta.label}: ${safeEmailUrl(input.cta.url)}` : '',
    ...more.map(blockText),
    ...secondary.map(plain),
    ['--', ...footer].join('\n'),
  ].filter(Boolean).join('\n\n')

  return { html, text }
}
