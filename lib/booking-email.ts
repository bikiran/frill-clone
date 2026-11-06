// The booking emails a customer gets (booked, moved, reminder, cancelled…):
// a calm card on soft grey, a status pill, a big headline, a ticket with a
// date tile and the details, one wide button and the calendar buttons.
//
// Email-safe on purpose: tables, inline styles, no images except the
// business's logo, text that still reads if images are off. Clients that
// honour prefers-color-scheme (Apple Mail, iOS Mail, Outlook for Mac) get a
// proper dark version; Gmail's own dark mode inverts the light one, so the
// logo sits on a white chip it doesn't invert.
//
// Pure: no database, so it can be rendered on its own.

export type BookingEmailKind = 'confirmed' | 'cancelled' | 'rescheduled' | 'conflict' | 'reminder' | 'noshow' | 'rebook'

export type BookingEmailInput = {
  kind: BookingEmailKind
  /** A table reservation (restaurant wording, start time only). */
  isTable: boolean
  business: string
  logoUrl?: string | null
  /** #rrggbb; anything else falls back to Colvy coral. */
  accent?: string | null
  /** Plain text; escaped here. */
  headline: string
  /** Already-escaped HTML. */
  intro: string
  /** Plain text label/value pairs ("When" is shown in the date tile instead). */
  rows: [string, string][]
  startMs: number
  endMs: number
  timezone: string
  /** The primary link: manage (live kinds) or book again. */
  primaryUrl: string
  primaryLabel: string
  /** Add-to-calendar buttons (booked / moved). */
  googleUrl?: string | null
  icsUrl?: string | null
  /** A note from the business (plain text, newlines kept). */
  note?: string | null
  /** Hidden preview line shown in the inbox list. */
  preheader?: string
  hideBadge?: boolean
  now?: number
}

const esc = (s: any) => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' } as any)[c])

// ── Colour helpers (the business accent, kept readable) ─────────────────────
type RGB = [number, number, number]
const hexRgb = (h: string): RGB => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16)) as RGB
const rgbHex = (c: RGB) => '#' + c.map(v => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('')
const mix = (a: string, b: string, t: number) => { const x = hexRgb(a), y = hexRgb(b); return rgbHex([0, 1, 2].map(i => x[i] + (y[i] - x[i]) * t) as RGB) }
const lum = (h: string) => {
  const [r, g, b] = hexRgb(h).map(v => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4 })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}
const contrast = (a: string, b: string) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05) }
/** Move `c` towards `to` until it reads on `bg` (WCAG 4.5:1). */
function readable(c: string, bg: string, to: string) {
  for (let t = 0; t <= 1.0001; t += 0.05) { const m = mix(c, to, t); if (contrast(m, bg) >= 4.5) return m }
  return to
}

const TONES = {
  good: { fg: '#067647', bg: '#ecfdf3', line: '#c6f1d9', dfg: '#75e0a7', dbg: '#0b2e1f', dline: '#14532d' },
  warn: { fg: '#b54708', bg: '#fffaeb', line: '#fde7b0', dfg: '#fdb022', dbg: '#33240a', dline: '#5c3d0a' },
  bad: { fg: '#b42318', bg: '#fef3f2', line: '#fbd5d1', dfg: '#fda29b', dbg: '#3a1512', dline: '#5f1f19' },
} as const

function parts(ms: number, tz: string) {
  const d = new Date(ms)
  const f = (o: Intl.DateTimeFormatOptions) => d.toLocaleString('en-AU', { timeZone: tz, ...o })
  const time = (x: number) => new Date(x).toLocaleTimeString('en-AU', { timeZone: tz, hour: 'numeric', minute: '2-digit' }).replace(/\s/g, '').toLowerCase()
  const zone = new Intl.DateTimeFormat('en-AU', { timeZone: tz, timeZoneName: 'short' }).formatToParts(d).find(p => p.type === 'timeZoneName')?.value || ''
  const ymd = (x: number) => new Date(x).toLocaleDateString('en-CA', { timeZone: tz })
  return { month: f({ month: 'short' }).toUpperCase().replace('.', ''), day: f({ day: 'numeric' }), weekday: f({ weekday: 'long' }), long: `${f({ weekday: 'long' })} ${f({ day: 'numeric' })} ${f({ month: 'long' })}`, time, zone, ymd }
}

/** "Today", "Tomorrow", "In 5 days" (within a fortnight), else null. */
function soonLabel(startMs: number, tz: string, now: number) {
  const p = parts(startMs, tz)
  const days = Math.round((Date.parse(p.ymd(startMs)) - Date.parse(p.ymd(now))) / 86_400_000)
  if (days < 0) return null
  return days === 0 ? 'Today' : days === 1 ? 'Tomorrow' : days < 14 ? `In ${days} days` : null
}

export function bookingEmailHtml(i: BookingEmailInput): string {
  const accent = /^#[0-9a-f]{6}$/i.test(i.accent || '') ? String(i.accent).toLowerCase() : '#ff7a6b'
  const now = i.now ?? Date.now()
  const ink = '#18181b', sub = '#52525b', muted = '#71717a', line = '#ececef', panel = '#f7f7f8'
  const dark = { bg: '#0f0f11', card: '#18181b', panel: '#212125', line: '#2d2d33', ink: '#fafafa', sub: '#b4b4bc', muted: '#8e8e98' }
  const accentInk = readable(accent, '#ffffff', '#000000')
  const accentInkDark = readable(accent, dark.panel, '#ffffff')
  const accentTint = mix(accent, '#ffffff', 0.88)
  const accentLine = mix(accent, '#ffffff', 0.7)
  const accentTintDark = mix(accent, dark.card, 0.86)
  const btnText = contrast('#ffffff', accent) >= 2.2 ? '#ffffff' : '#111111'

  const live = i.kind === 'confirmed' || i.kind === 'rescheduled' || i.kind === 'reminder'
  const off = i.kind === 'cancelled' || i.kind === 'conflict'
  const pill = ({
    confirmed: { tone: 'good', text: 'Confirmed', mark: '✓' },
    rescheduled: { tone: 'good', text: 'New time confirmed', mark: '✓' },
    reminder: { tone: 'accent', text: 'Coming up', mark: '●' },
    cancelled: { tone: 'bad', text: 'Cancelled', mark: '✕' },
    conflict: { tone: 'warn', text: 'Action needed', mark: '!' },
    noshow: { tone: 'accent', text: 'We missed you', mark: '●' },
    rebook: { tone: 'accent', text: 'Book again', mark: '●' },
  } as const)[i.kind]
  const tone = pill.tone === 'accent'
    ? { fg: accentInk, bg: accentTint, line: accentLine, dfg: accentInkDark, dbg: accentTintDark, dline: mix(accent, dark.card, 0.6) }
    : TONES[pill.tone]

  const font = `-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif`
  const p = parts(i.startMs, i.timezone)
  const showTicket = i.kind !== 'noshow' && i.kind !== 'rebook'
  const soon = live ? soonLabel(i.startMs, i.timezone, now) : null
  const timeText = i.isTable || !(i.endMs > i.startMs) ? p.time(i.startMs) : `${p.time(i.startMs)} – ${p.time(i.endMs)}`
  const details = i.rows.filter(([k]) => k !== 'When')

  const brand = i.logoUrl
    ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td class="cv-chip" style="background:#ffffff;background-image:linear-gradient(#ffffff,#ffffff);border:1px solid ${line};border-radius:14px;padding:7px 10px"><img src="${esc(i.logoUrl)}" alt="${esc(i.business)}" height="30" style="display:block;height:30px;width:auto;max-width:180px;border:0"></td></tr></table>`
    : `<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
        <td width="34" height="34" align="center" valign="middle" style="width:34px;height:34px;background:${accent};border-radius:11px;color:${btnText};font:800 16px/34px ${font}">${esc((i.business.trim()[0] || 'C').toUpperCase())}</td>
        <td class="cv-ink" style="padding-left:10px;font:800 16px/1.2 ${font};color:${ink};letter-spacing:-0.01em">${esc(i.business)}</td>
      </tr></table>`

  const ticket = showTicket ? `
          <tr><td style="padding-top:24px">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="cv-panel" style="background:${panel};border:1px solid ${line};border-radius:20px">
              <tr><td style="padding:18px 18px 16px">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
                  <td width="64" valign="top" style="width:64px">
                    <table role="presentation" width="64" cellpadding="0" cellspacing="0" border="0" class="cv-tile" style="width:64px;background:#ffffff;border:1px solid ${line};border-radius:16px">
                      <tr><td align="center" class="${off ? 'cv-muted' : 'cv-acc'}" style="padding:9px 0 0;font:800 11px/1 ${font};letter-spacing:0.12em;color:${off ? muted : accentInk}">${esc(p.month)}</td></tr>
                      <tr><td align="center" class="cv-ink" style="padding:4px 0 10px;font:800 26px/1 ${font};letter-spacing:-0.02em;color:${off ? muted : ink}">${esc(p.day)}</td></tr>
                    </table>
                  </td>
                  <td valign="middle" style="padding-left:14px">
                    <div class="cv-ink" style="font:800 21px/1.2 ${font};letter-spacing:-0.02em;color:${off ? muted : ink};${off ? 'text-decoration:line-through;' : ''}">${esc(timeText)}</div>
                    <div class="cv-sub" style="padding-top:3px;font:500 14px/1.4 ${font};color:${sub}">${esc(p.long)}${p.zone ? ` <span class="cv-muted" style="color:${muted}">· ${esc(p.zone)}</span>` : ''}</div>
                    ${soon ? `<div style="padding-top:8px"><span class="cv-soon" style="display:inline-block;background:${accentTint};color:${accentInk};border-radius:999px;padding:3px 10px;font:700 12px/1.5 ${font}">${esc(soon)}</span></div>` : ''}
                  </td>
                </tr></table>
              </td></tr>
              ${details.length ? `<tr><td style="padding:0 18px"><div class="cv-line" style="border-top:1px dashed #dcdce0;height:0;line-height:0;font-size:0">&nbsp;</div></td></tr>
              <tr><td style="padding:8px 18px 12px">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                  ${details.map(([k, v], n) => `<tr>
                    <td valign="top" class="cv-muted" style="padding:9px 12px 9px 0;width:96px;font:500 13.5px/1.45 ${font};color:${muted}${n ? `;border-top:1px solid ${line}` : ''}">${esc(k)}</td>
                    <td valign="top" class="cv-ink" style="padding:9px 0;font:600 14.5px/1.45 ${font};color:${ink}${n ? `;border-top:1px solid ${line}` : ''}">${esc(v)}</td>
                  </tr>`).join('')}
                </table>
              </td></tr>` : ''}
            </table>
          </td></tr>` : ''

  const button = (url: string, label: string) => `
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
              <td align="center" bgcolor="${accent}" style="background:${accent};border-radius:999px">
                <a href="${esc(url)}" style="display:block;padding:15px 22px;font:700 15.5px/1.2 ${font};color:${btnText};text-decoration:none;border-radius:999px">${esc(label)}</a>
              </td>
            </tr></table>`
  const ghost = (url: string, label: string) => `<a href="${esc(url)}" class="cv-ghost" style="display:block;padding:12px 10px;background:#ffffff;border:1px solid #e1e1e5;border-radius:999px;font:600 14px/1.2 ${font};color:${ink};text-decoration:none;text-align:center">${label}</a>`
  const cal = i.googleUrl || i.icsUrl ? `
          <tr><td style="padding-top:14px">
            <div class="cv-muted" style="padding:0 0 8px;font:600 12px/1.4 ${font};color:${muted};text-align:center;letter-spacing:0.02em">Add it to your calendar</div>
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
              ${i.googleUrl ? `<td width="${i.icsUrl ? '50%' : '100%'}" style="padding-right:${i.icsUrl ? 5 : 0}px">${ghost(i.googleUrl, 'Google Calendar')}</td>` : ''}
              ${i.icsUrl ? `<td width="${i.googleUrl ? '50%' : '100%'}" style="padding-left:${i.googleUrl ? 5 : 0}px">${ghost(i.icsUrl, 'Apple &amp; Outlook')}</td>` : ''}
            </tr></table>
          </td></tr>` : ''

  const note = i.note ? `
          <tr><td style="padding-top:22px">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="cv-note" style="background:${accentTint};border-radius:18px"><tr>
              <td style="padding:16px 18px">
                <div class="cv-acc" style="font:700 11.5px/1.4 ${font};letter-spacing:0.08em;text-transform:uppercase;color:${accentInk}">A note from ${esc(i.business)}</div>
                <div class="cv-ink" style="padding-top:6px;font:400 14.5px/1.6 ${font};color:#3f3f46">${esc(i.note).replace(/\r?\n/g, '<br>')}</div>
              </td>
            </tr></table>
          </td></tr>` : ''

  const pre = i.preheader ? `<div style="display:none;max-height:0;max-width:0;overflow:hidden;opacity:0;mso-hide:all;font-size:1px;line-height:1px;color:#f4f4f5">${esc(i.preheader)}${'&#8199;&#65279;&#847; '.repeat(40)}</div>` : ''

  return `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light dark"><meta name="supported-color-schemes" content="light dark">
<title>${esc(i.headline)}</title>
<style>
  @media (max-width:600px){ .cv-card-td{padding:26px 20px 24px!important} .cv-h1{font-size:25px!important} .cv-wrap{padding:20px 10px!important} }
  @media (prefers-color-scheme:dark){
    .cv-bg{background:${dark.bg}!important}
    .cv-card{background:${dark.card}!important;border-color:${dark.line}!important}
    .cv-panel{background:${dark.panel}!important;border-color:${dark.line}!important}
    .cv-tile{background:${dark.card}!important;border-color:${dark.line}!important}
    .cv-line{border-color:#3a3a42!important}
    .cv-ink{color:${dark.ink}!important}
    .cv-sub{color:${dark.sub}!important}
    .cv-muted{color:${dark.muted}!important}
    .cv-acc{color:${accentInkDark}!important}
    .cv-soon{background:${accentTintDark}!important;color:${accentInkDark}!important}
    .cv-note{background:${accentTintDark}!important}
    .cv-pill{background:${tone.dbg}!important;color:${tone.dfg}!important;border-color:${tone.dline}!important}
    .cv-ghost{background:${dark.panel}!important;border-color:#3a3a42!important;color:${dark.ink}!important}
    .cv-panel td,.cv-panel tr td{border-color:${dark.line}!important}
  }
</style>
</head>
<body style="margin:0;padding:0;background:#f4f4f5;-webkit-text-size-adjust:100%">
${pre}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="cv-bg" style="background:#f4f4f5">
  <tr><td align="center" class="cv-wrap" style="padding:32px 14px">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px">
      <tr><td style="padding:0 6px 16px">${brand}</td></tr>
      <tr><td>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="cv-card" style="background:#ffffff;border:1px solid ${line};border-radius:24px">
          <tr><td class="cv-card-td" style="padding:32px 30px 28px">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
              <tr><td><span class="cv-pill" style="display:inline-block;background:${tone.bg};color:${tone.fg};border:1px solid ${tone.line};border-radius:999px;padding:4px 12px 4px 10px;font:700 12.5px/1.5 ${font}"><span style="font-size:${pill.mark === '●' ? 9 : 12}px;vertical-align:${pill.mark === '●' ? '1px' : '0'}">${pill.mark}</span>&nbsp; ${esc(pill.text)}</span></td></tr>
              <tr><td class="cv-ink cv-h1" style="padding-top:16px;font:800 28px/1.15 ${font};letter-spacing:-0.025em;color:${ink}">${esc(i.headline)}</td></tr>
              <tr><td class="cv-sub" style="padding-top:10px;font:400 15.5px/1.6 ${font};color:${sub}">${i.intro}</td></tr>
              ${ticket}
              <tr><td style="padding-top:24px">${button(i.primaryUrl, i.primaryLabel)}</td></tr>
              ${cal}
              ${note}
            </table>
          </td></tr>
        </table>
      </td></tr>
      <tr><td align="center" style="padding:20px 10px 4px;font:500 12.5px/1.6 ${font};color:#a1a1aa" class="cv-muted">
        ${esc(i.business)}${i.hideBadge ? '' : ` &nbsp;·&nbsp; Powered by <a href="https://colvy.com" style="color:#a1a1aa;text-decoration:underline">Colvy</a>`}
      </td></tr>
    </table>
  </td></tr>
</table>
</body></html>`
}
