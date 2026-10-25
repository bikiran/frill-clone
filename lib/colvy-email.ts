// The one layout for Colvy's own emails: the ones Colvy sends to business
// owners and their staff (codes, welcome, invites, trial reminders, mentions,
// the agent summary, Colvy team alerts). Never for emails to a business's own
// customers: those carry the business's branding, not Colvy's.
//
// Built to survive real mail clients:
//   • tables and inline styles only. Gmail and Outlook drop <style>, flexbox
//     and SVG, so nothing here relies on them. The one small <style> block only
//     tightens padding on phones; the email reads the same without it;
//   • a bulletproof button (a coloured table cell around the link), a hosted PNG
//     logo with alt text, a hidden preheader, the system font stack;
//   • 600px wide, fluid below that;
//   • solid backgrounds everywhere, so a client's dark mode either keeps them or
//     inverts them all together (the logo is a dark tile, readable either way);
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
  ink: '#1a1a1a',
  body: '#3f3f46',
  muted: '#5f5f68',
  faint: '#71717a',
  coral: '#ff7a6b',
  coralDark: '#d9503f',
  coralTint: '#fff4f1',
  coralLine: '#ffd5cd',
  canvas: '#f4f4f5',
  card: '#ffffff',
  border: '#e4e4e7',
  soft: '#fafafa',
}
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
  /** Big gold stars above everything else (a review's rating, 1–5). */
  stars?: number
  /** Centre the header, title, text and button (blocks keep their own layout inside). */
  center?: boolean
  /** Line under the title, e.g. "for Roxy Aquarium". */
  subtitle?: string
  /** Small line above the title, e.g. the business name. */
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
  return escapeHtml(String(s ?? '')).replace(/\*\*(.+?)\*\*/g, '<b style="color:' + C.ink + ';font-weight:700">$1</b>')
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

const P = (html: string, opts: { size?: number; color?: string; margin?: string; center?: boolean } = {}) =>
  `<p style="margin:${opts.margin || '0 0 16px'};font-family:${FONT};font-size:${opts.size || 16}px;line-height:1.6;color:${opts.color || C.body}${opts.center ? ';text-align:center' : ''}">${html}</p>`

/** A bulletproof button: the coloured cell is the button, so it shows even with images and CSS off. */
export function emailButton(cta: EmailLink, center = false): string {
  const href = attr(cta.url)
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0"${center ? ' align="center"' : ''} style="margin:8px ${center ? 'auto' : '0'} 24px">
  <tr>
    <td align="center" bgcolor="${C.coral}" style="background-color:${C.coral};border-radius:10px">
      <a href="${href}" target="_blank" style="display:inline-block;padding:14px 28px;font-family:${FONT};font-size:16px;font-weight:700;line-height:20px;color:#ffffff;text-decoration:none;border-radius:10px;border:1px solid ${C.coral}">${escapeHtml(cta.label)}</a>
    </td>
  </tr>
</table>`
}

function blockHtml(b: EmailBlock): string {
  switch (b.type) {
    case 'text':
      return b.small ? P(inline(b.text), { size: 14, color: C.muted }) : P(inline(b.text))
    case 'heading':
      return `<h2 style="margin:24px 0 10px;font-family:${FONT};font-size:17px;line-height:1.35;font-weight:700;color:${C.ink}">${inline(b.text)}</h2>`
    case 'code':
      // Just the code, big and coral, on a soft tint: nothing else in the box.
      return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:4px 0 20px">
  <tr>
    <td align="center" bgcolor="${C.coralTint}" style="background-color:${C.coralTint};border-radius:14px;padding:26px 12px">
      <div class="cv-code" style="font-family:${FONT};font-size:40px;line-height:46px;font-weight:800;letter-spacing:10px;color:${C.coral}">${escapeHtml(b.code)}</div>
    </td>
  </tr>
</table>${b.note ? `
<p style="margin:0 0 16px;font-family:${FONT};font-size:14px;line-height:1.6;color:${C.faint}">${inline(b.note)}</p>` : ''}`
    case 'list':
      return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 16px">
${b.items.map((it, i) => `  <tr>
    <td width="28" valign="top" style="padding:${b.numbered ? '2px' : '7px'} 0 10px">${b.numbered
      ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td width="20" height="20" align="center" valign="middle" bgcolor="${C.coral}" style="width:20px;height:20px;background-color:${C.coral};border-radius:10px;font-family:${FONT};font-size:12px;font-weight:700;line-height:20px;color:#ffffff">${i + 1}</td></tr></table>`
      : `<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td width="10" height="10" bgcolor="${DOTS[i % DOTS.length]}" style="width:10px;height:10px;background-color:${DOTS[i % DOTS.length]};border-radius:3px;font-size:0;line-height:0">&nbsp;</td></tr></table>`}</td>
    <td valign="top" style="padding:0 0 10px;font-family:${FONT};font-size:15px;line-height:1.55;color:${C.body}">${it.detail ? `<b style="color:${C.ink};font-weight:700">${inline(it.title)}</b> <span style="color:${C.muted}">${inline(it.detail)}</span>` : inline(it.title)}</td>
  </tr>`).join('\n')}
</table>`
    case 'facts':
      return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${C.soft}" style="margin:0 0 20px;background-color:${C.soft};border:1px solid ${C.border};border-radius:10px">
${b.rows.map(([k, v], i) => `  <tr>
    <td valign="top" style="padding:${i ? '0' : '12px'} 8px 10px 16px;width:34%;font-family:${FONT};font-size:13px;line-height:1.5;color:${C.muted}">${escapeHtml(k)}</td>
    <td valign="top" style="padding:${i ? '0' : '12px'} 16px 10px 8px;font-family:${FONT};font-size:15px;line-height:1.5;font-weight:600;color:${C.ink};word-break:break-word">${escapeHtml(v)}</td>
  </tr>`).join('\n')}
</table>`
    case 'quote':
      return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 20px">
  <tr>
    <td bgcolor="${C.soft}" style="background-color:${C.soft};border:1px solid ${C.border};border-radius:10px;padding:12px 16px;font-family:${FONT};font-size:15px;line-height:1.6;color:${C.ink};white-space:pre-wrap;word-break:break-word">${escapeHtml(b.text)}</td>
  </tr>
</table>`
    case 'stats': {
      const rows: EmailStat[][] = []
      for (let i = 0; i < b.tiles.length; i += 2) rows.push(b.tiles.slice(i, i + 2))
      const cell = (t?: EmailStat) => t ? `<td width="50%" valign="top" style="padding:5px">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td bgcolor="${C.card}" style="background-color:${C.card};border:1px solid ${C.border};border-radius:10px;padding:12px 14px">
        <div style="font-family:${FONT};font-size:13px;line-height:1.4;color:${C.muted}">${escapeHtml(t.label)}</div>
        <div style="font-family:${FONT};font-size:24px;line-height:1.25;font-weight:700;color:${C.ink};margin-top:2px">${escapeHtml(t.value)}</div>
        ${t.note ? `<div style="font-family:${FONT};font-size:12px;line-height:1.4;color:${C.muted};margin-top:2px">${escapeHtml(t.note)}</div>` : ''}
      </td></tr></table>
    </td>` : '<td width="50%" style="padding:5px">&nbsp;</td>'
      return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 16px;width:100%">
${rows.map(r => `  <tr>
    ${cell(r[0])}
    ${cell(r[1])}
  </tr>`).join('\n')}
</table>`
    }
    case 'cards':
      return b.items.map(it => `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 8px">
  <tr>
    <td bgcolor="${C.card}" style="background-color:${C.card};border:1px solid ${C.border};border-radius:10px;padding:12px 14px">
      <div style="font-family:${FONT};font-size:15px;line-height:1.4;font-weight:700;color:${C.ink}">${inline(it.title)}</div>
      ${it.detail ? `<div style="font-family:${FONT};font-size:14px;line-height:1.5;color:${C.muted};margin-top:3px">${inline(it.detail)}</div>` : ''}
    </td>
  </tr>
</table>`).join('\n') + '<div style="height:8px;line-height:8px;font-size:0">&nbsp;</div>'
    case 'link': {
      const url = safeEmailUrl(b.url)
      return `${P(escapeHtml(b.label || 'Button not working? Copy this link into your browser:'), { size: 13, color: C.muted, margin: '0 0 6px' })}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 20px">
  <tr>
    <td bgcolor="${C.soft}" style="background-color:${C.soft};border:1px solid ${C.border};border-radius:8px;padding:10px 12px;font-family:${MONO};font-size:12px;line-height:1.5;word-break:break-all"><a href="${escapeHtml(url)}" target="_blank" style="color:${C.coralDark};text-decoration:underline">${escapeHtml(url)}</a></td>
  </tr>
</table>`
    }
    case 'review':
      return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 20px">
  <tr>
    <td bgcolor="${C.soft}" style="background-color:${C.soft};border:1px solid ${C.border};border-radius:12px;padding:16px 18px">
      <div style="font-family:${FONT};font-size:16px;line-height:1.4;font-weight:700;color:${C.ink}">${escapeHtml(b.reviewer)}</div>
      ${b.rating ? `<div style="margin:6px 0 2px">${starsHtml(b.rating, 18)}</div>` : ''}
      <div style="margin-top:8px;font-family:${FONT};font-size:15px;line-height:1.6;color:${b.comment ? C.ink : C.muted};white-space:pre-wrap;word-break:break-word">${escapeHtml(b.comment || '(no written comment)')}</div>
    </td>
  </tr>
</table>`
    case 'note':
      return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 20px">
  <tr>
    <td bgcolor="${C.coralTint}" style="background-color:${C.coralTint};border:1px solid ${C.coralLine};border-radius:10px;padding:12px 16px;font-family:${FONT};font-size:14px;line-height:1.55;color:${C.ink}">${inline(b.text)}</td>
  </tr>
</table>`
    case 'divider':
      return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 20px"><tr><td height="1" bgcolor="${C.border}" style="height:1px;background-color:${C.border};font-size:0;line-height:0">&nbsp;</td></tr></table>`
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
  const body = [
    input.stars ? `<div style="margin:0 0 14px${ta}">${starsHtml(input.stars, center ? 34 : 30)}</div>` : '',
    input.kicker ? P(escapeHtml(input.kicker), { size: 13, color: C.muted, margin: '0 0 6px', center }) : '',
    `<h1 style="margin:0 0 ${input.subtitle ? '6px' : '14px'};font-family:${FONT};font-size:${center ? 26 : 24}px;line-height:1.3;font-weight:700;color:${C.ink}${ta}">${escapeHtml(input.title)}</h1>`,
    input.subtitle ? P(escapeHtml(input.subtitle), { size: 16, color: C.muted, margin: '0 0 22px', center }) : '',
    ...intro.map(t => P(inline(t), { center })),
    ...blocks.map(blockHtml),
    input.cta ? emailButton(input.cta, center) : '',
    ...more.map(blockHtml),
    ...secondary.map(t => P(inline(t), { size: 14, color: C.muted, center })),
  ].filter(Boolean).join('\n')

  const html = `<!doctype html>
<html lang="en-AU" xmlns="http://www.w3.org/1999/xhtml">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="x-apple-disable-message-reformatting">
<meta name="color-scheme" content="light">
<meta name="supported-color-schemes" content="light">
<title>${escapeHtml(input.title)}</title>
<style>
  @media only screen and (max-width:620px) {
    .cv-pad { padding-left:20px !important; padding-right:20px !important; }
    .cv-code { font-size:32px !important; letter-spacing:7px !important; }
  }
</style>
</head>
<body style="margin:0;padding:0;background-color:${C.canvas};-webkit-text-size-adjust:100%">
<div style="display:none;max-height:0;max-width:0;overflow:hidden;opacity:0;mso-hide:all;font-size:1px;line-height:1px;color:${C.canvas}">${escapeHtml(input.preheader)}${pad}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${C.canvas}" style="background-color:${C.canvas}">
  <tr>
    <td align="center" style="padding:24px 12px">
      <!--[if mso]><table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0"><tr><td><![endif]-->
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px">
        <tr>
          <td class="cv-pad" bgcolor="${C.card}" style="background-color:${C.card};padding:28px 36px 4px;border-top:1px solid ${C.border};border-left:1px solid ${C.border};border-right:1px solid ${C.border};border-radius:12px 12px 0 0">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0"${center ? ' align="center"' : ''}>
              <tr>
                <td valign="middle" style="padding-right:10px"><table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td width="36" height="36" bgcolor="#1a1a1a" style="width:36px;height:36px;background-color:#1a1a1a;border-radius:9px"><img src="${COLVY_LOGO_URL}" width="36" height="36" alt="" style="display:block;width:36px;height:36px;border:0;border-radius:9px"></td></tr></table></td>
                <td valign="middle" style="font-family:${FONT};font-size:20px;line-height:24px;font-weight:800;letter-spacing:-0.3px;color:${C.ink}">Colvy</td>
              </tr>
            </table>
          </td>
        </tr>
        <tr>
          <td class="cv-pad" bgcolor="${C.card}" style="background-color:${C.card};padding:20px 36px 16px;border-left:1px solid ${C.border};border-right:1px solid ${C.border};border-bottom:1px solid ${C.border};border-radius:0 0 12px 12px">
${body}
          </td>
        </tr>
        <tr>
          <td class="cv-pad"${center ? ' align="center"' : ''} style="padding:20px 36px 8px;font-family:${FONT};font-size:12px;line-height:1.6;color:${C.faint}${ta}">
            ${input.footerNote ? `<p style="margin:0 0 10px;font-family:${FONT};font-size:12px;line-height:1.6;color:${C.faint}">${inline(input.footerNote)}</p>` : ''}
            <p style="margin:0;font-family:${FONT};font-size:12px;line-height:1.6;color:${C.faint}">&copy; ${copyright} &middot; <a href="${COLVY_SITE}" target="_blank" style="color:${C.faint};text-decoration:underline">colvy.com</a> &middot; <a href="${COLVY_SITE}/privacy" target="_blank" style="color:${C.faint};text-decoration:underline">Privacy</a></p>
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
