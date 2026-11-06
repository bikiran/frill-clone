// The emails a customer gets from a business through Colvy: about a booking
// (booked, moved, reminder, cancelled…, the "here's your booking" link, a
// regular booking, a waitlist offer), a quote, a sign-in code for their
// account, a back-in-stock alert. In the business's colours, not Colvy's
// (Colvy's own emails to a team are lib/colvy-email). One look for all of
// them: a calm card on soft grey, a status pill, a big headline, a ticket or
// summary panel, one wide button.
//
// Email-safe on purpose: tables, inline styles, no images except the
// business's logo (and a product's photo), text that still reads if images
// are off. Clients that honour prefers-color-scheme (Apple Mail, iOS Mail,
// Outlook for Mac) get a proper dark version; Gmail's own dark mode inverts
// the light one, so the logo sits on a white chip it doesn't invert.
//
// Pure: no database, so every email can be rendered on its own.

export type BookingEmailKind = 'confirmed' | 'cancelled' | 'rescheduled' | 'conflict' | 'reminder' | 'noshow' | 'rebook'

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
export type PillTone = keyof typeof TONES | 'accent'
export type Pill = { tone: PillTone; text: string; mark: string }

const FONT = `-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif`
const DARK = { bg: '#0f0f11', card: '#18181b', panel: '#212125', line: '#2d2d33', ink: '#fafafa', sub: '#b4b4bc', muted: '#8e8e98' }

/** The colours one email uses, from the business's accent. */
function kit(accentIn?: string | null) {
  const accent = /^#[0-9a-f]{6}$/i.test(accentIn || '') ? String(accentIn).toLowerCase() : '#ff7a6b'
  return {
    accent, font: FONT, dark: DARK,
    ink: '#18181b', sub: '#52525b', muted: '#71717a', line: '#ececef', panel: '#f7f7f8',
    accentInk: readable(accent, '#ffffff', '#000000'),
    accentInkDark: readable(accent, DARK.panel, '#ffffff'),
    accentTint: mix(accent, '#ffffff', 0.88),
    accentLine: mix(accent, '#ffffff', 0.7),
    accentTintDark: mix(accent, DARK.card, 0.86),
    accentLineDark: mix(accent, DARK.card, 0.6),
    btnText: contrast('#ffffff', accent) >= 2.2 ? '#ffffff' : '#111111',
  }
}
type Kit = ReturnType<typeof kit>

function parts(ms: number, tz: string) {
  const d = new Date(ms)
  const f = (o: Intl.DateTimeFormatOptions) => d.toLocaleString('en-AU', { timeZone: tz, ...o })
  const time = (x: number) => new Date(x).toLocaleTimeString('en-AU', { timeZone: tz, hour: 'numeric', minute: '2-digit' }).replace(/\s/g, '').toLowerCase()
  const zone = new Intl.DateTimeFormat('en-AU', { timeZone: tz, timeZoneName: 'short' }).formatToParts(d).find(p => p.type === 'timeZoneName')?.value || ''
  const ymd = (x: number) => new Date(x).toLocaleDateString('en-CA', { timeZone: tz })
  return { month: f({ month: 'short' }).toUpperCase().replace('.', ''), day: f({ day: 'numeric' }), weekday: f({ weekday: 'long' }), long: `${f({ weekday: 'long' })} ${f({ day: 'numeric' })} ${f({ month: 'long' })}`, mid: `${f({ weekday: 'short' }).replace('.', '')} ${f({ day: 'numeric' })} ${f({ month: 'long' })}`, time, zone, ymd }
}

/** "Today", "Tomorrow", "In 5 days" (within a fortnight), else null. */
function soonLabel(startMs: number, tz: string, now: number) {
  const p = parts(startMs, tz)
  const days = Math.round((Date.parse(p.ymd(startMs)) - Date.parse(p.ymd(now))) / 86_400_000)
  if (days < 0) return null
  return days === 0 ? 'Today' : days === 1 ? 'Tomorrow' : days < 14 ? `In ${days} days` : null
}

// ── Blocks (each a table row inside the card) ────────────────────────────────

function dateTile(k: Kit, ms: number, tz: string, o: { off?: boolean; size?: 'lg' | 'sm' } = {}) {
  const p = parts(ms, tz)
  const lg = o.size !== 'sm'
  const w = lg ? 64 : 46
  return `<table role="presentation" width="${w}" cellpadding="0" cellspacing="0" border="0" class="cv-tile" style="width:${w}px;background:#ffffff;border:1px solid ${k.line};border-radius:${lg ? 16 : 12}px">
                      <tr><td align="center" class="${o.off ? 'cv-muted' : 'cv-acc'}" style="padding:${lg ? '9px 0 0' : '6px 0 0'};font:800 ${lg ? 11 : 9.5}px/1 ${k.font};letter-spacing:0.12em;color:${o.off ? k.muted : k.accentInk}">${esc(p.month)}</td></tr>
                      <tr><td align="center" class="cv-ink" style="padding:${lg ? '4px 0 10px' : '3px 0 7px'};font:800 ${lg ? 26 : 19}px/1 ${k.font};letter-spacing:-0.02em;color:${o.off ? k.muted : k.ink}">${esc(p.day)}</td></tr>
                    </table>`
}

function detailRows(k: Kit, rows: [string, string][]) {
  return rows.map(([key, v], n) => `<tr>
                    <td valign="top" class="cv-muted" style="padding:9px 12px 9px 0;width:96px;font:500 13.5px/1.45 ${k.font};color:${k.muted}${n ? `;border-top:1px solid ${k.line}` : ''}">${esc(key)}</td>
                    <td valign="top" class="cv-ink" style="padding:9px 0;font:600 14.5px/1.45 ${k.font};color:${k.ink}${n ? `;border-top:1px solid ${k.line}` : ''}">${esc(v)}</td>
                  </tr>`).join('')
}

const dashed = () => `<tr><td style="padding:0 18px"><div class="cv-line" style="border-top:1px dashed #dcdce0;height:0;line-height:0;font-size:0">&nbsp;</div></td></tr>`

/** The date tile, the time, the long date, an optional chip, then label/value rows. */
function ticketBlock(k: Kit, o: { startMs: number; endMs?: number; timezone: string; showEnd?: boolean; off?: boolean; chip?: string | null; rows: [string, string][] }) {
  const p = parts(o.startMs, o.timezone)
  const timeText = o.showEnd && o.endMs && o.endMs > o.startMs ? `${p.time(o.startMs)} – ${p.time(o.endMs)}` : p.time(o.startMs)
  return `
          <tr><td style="padding-top:24px">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="cv-panel" style="background:${k.panel};border:1px solid ${k.line};border-radius:20px">
              <tr><td style="padding:18px 18px 16px">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
                  <td width="64" valign="top" style="width:64px">
                    ${dateTile(k, o.startMs, o.timezone, { off: o.off })}
                  </td>
                  <td valign="middle" style="padding-left:14px">
                    <div class="cv-ink" style="font:800 21px/1.2 ${k.font};letter-spacing:-0.02em;color:${o.off ? k.muted : k.ink};${o.off ? 'text-decoration:line-through;' : ''}">${esc(timeText)}</div>
                    <div class="cv-sub" style="padding-top:3px;font:500 14px/1.4 ${k.font};color:${k.sub}">${esc(p.long)}${p.zone ? ` <span class="cv-muted" style="color:${k.muted}">· ${esc(p.zone)}</span>` : ''}</div>
                    ${o.chip ? `<div style="padding-top:8px"><span class="cv-soon" style="display:inline-block;background:${k.accentTint};color:${k.accentInk};border-radius:999px;padding:3px 10px;font:700 12px/1.5 ${k.font}">${esc(o.chip)}</span></div>` : ''}
                  </td>
                </tr></table>
              </td></tr>
              ${o.rows.length ? `${dashed()}
              <tr><td style="padding:8px 18px 12px">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                  ${detailRows(k, o.rows)}
                </table>
              </td></tr>` : ''}
            </table>
          </td></tr>`
}

/** A schedule: a header line, then one row per visit (small date tile, day, time, a Change link). */
function visitsBlock(k: Kit, o: { header: string; visits: { startMs: number; endMs?: number; url?: string | null }[]; timezone: string; showEnd?: boolean; rows?: [string, string][] }) {
  const items = o.visits.map((v, n) => {
    const p = parts(v.startMs, o.timezone)
    const t = o.showEnd && v.endMs && v.endMs > v.startMs ? `${p.time(v.startMs)} – ${p.time(v.endMs)}` : p.time(v.startMs)
    const top = n ? `border-top:1px solid ${k.line};` : ''
    return `<tr>
                  <td width="46" valign="middle" style="width:46px;padding:10px 0;${top}">${dateTile(k, v.startMs, o.timezone, { size: 'sm' })}</td>
                  <td valign="middle" style="padding:10px 0 10px 12px;${top}">
                    <div class="cv-ink" style="font:700 14.5px/1.35 ${k.font};color:${k.ink}">${esc(p.mid)}</div>
                    <div class="cv-sub" style="font:500 13px/1.4 ${k.font};color:${k.sub}">${esc(t)}${p.zone ? ` <span class="cv-muted" style="color:${k.muted}">· ${esc(p.zone)}</span>` : ''}</div>
                  </td>
                  <td align="right" valign="middle" style="padding:10px 0 10px 8px;white-space:nowrap;${top}">${v.url ? `<a href="${esc(v.url)}" class="cv-acc" style="font:700 13px/1.4 ${k.font};color:${k.accentInk};text-decoration:none">Change ›</a>` : ''}</td>
                </tr>`
  }).join('')
  return `
          <tr><td style="padding-top:24px">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="cv-panel" style="background:${k.panel};border:1px solid ${k.line};border-radius:20px">
              <tr><td style="padding:16px 18px 6px">
                <div class="cv-acc" style="font:800 11.5px/1.4 ${k.font};letter-spacing:0.08em;text-transform:uppercase;color:${k.accentInk}">${esc(o.header)}</div>
              </td></tr>
              <tr><td style="padding:0 18px 6px">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${items}</table>
              </td></tr>
              ${o.rows?.length ? `${dashed()}
              <tr><td style="padding:8px 18px 12px">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                  ${detailRows(k, o.rows)}
                </table>
              </td></tr>` : ''}
            </table>
          </td></tr>`
}

function buttonBlock(k: Kit, url: string, label: string) {
  return `
          <tr><td style="padding-top:24px">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
              <td align="center" bgcolor="${k.accent}" style="background:${k.accent};border-radius:999px">
                <a href="${esc(url)}" style="display:block;padding:15px 22px;font:700 15.5px/1.2 ${k.font};color:${k.btnText};text-decoration:none;border-radius:999px">${esc(label)}</a>
              </td>
            </tr></table>
          </td></tr>`
}

function calendarBlock(k: Kit, googleUrl?: string | null, icsUrl?: string | null) {
  if (!googleUrl && !icsUrl) return ''
  const ghost = (url: string, label: string) => `<a href="${esc(url)}" class="cv-ghost" style="display:block;padding:12px 10px;background:#ffffff;border:1px solid #e1e1e5;border-radius:999px;font:600 14px/1.2 ${k.font};color:${k.ink};text-decoration:none;text-align:center">${label}</a>`
  return `
          <tr><td style="padding-top:14px">
            <div class="cv-muted" style="padding:0 0 8px;font:600 12px/1.4 ${k.font};color:${k.muted};text-align:center;letter-spacing:0.02em">Add it to your calendar</div>
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
              ${googleUrl ? `<td width="${icsUrl ? '50%' : '100%'}" style="padding-right:${icsUrl ? 5 : 0}px">${ghost(googleUrl, 'Google Calendar')}</td>` : ''}
              ${icsUrl ? `<td width="${googleUrl ? '50%' : '100%'}" style="padding-left:${googleUrl ? 5 : 0}px">${ghost(icsUrl, 'Apple &amp; Outlook')}</td>` : ''}
            </tr></table>
          </td></tr>`
}

/** A soft accent card: a small label, then the text (newlines kept). */
function noteBlock(k: Kit, label: string, text: string) {
  return `
          <tr><td style="padding-top:22px">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="cv-note" style="background:${k.accentTint};border-radius:18px"><tr>
              <td style="padding:16px 18px">
                <div class="cv-acc" style="font:700 11.5px/1.4 ${k.font};letter-spacing:0.08em;text-transform:uppercase;color:${k.accentInk}">${esc(label)}</div>
                <div class="cv-ink" style="padding-top:6px;font:400 14.5px/1.6 ${k.font};color:#3f3f46">${esc(text).replace(/\r?\n/g, '<br>')}</div>
              </td>
            </tr></table>
          </td></tr>`
}

/** Small print at the foot of the card ("You're getting this because…"). */
function finePrint(k: Kit, text: string) {
  return `
          <tr><td style="padding-top:22px">
            <div class="cv-line" style="border-top:1px solid ${k.line};height:0;line-height:0;font-size:0">&nbsp;</div>
            <div class="cv-muted" style="padding-top:14px;font:500 12.5px/1.55 ${k.font};color:${k.muted}">${esc(text)}</div>
          </td></tr>`
}

/** A summary panel: a small label line, a big figure (e.g. a total), then label/value rows. */
function summaryBlock(k: Kit, o: { label: string; big?: string | null; bigNote?: string | null; rows: [string, string][] }) {
  return `
          <tr><td style="padding-top:24px">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="cv-panel" style="background:${k.panel};border:1px solid ${k.line};border-radius:20px">
              <tr><td style="padding:18px 18px ${o.rows.length ? 14 : 18}px">
                <div class="cv-acc" style="font:800 11.5px/1.4 ${k.font};letter-spacing:0.08em;text-transform:uppercase;color:${k.accentInk}">${esc(o.label)}</div>
                ${o.big ? `<div class="cv-ink" style="padding-top:6px;font:800 30px/1.1 ${k.font};letter-spacing:-0.02em;color:${k.ink}">${esc(o.big)}</div>` : ''}
                ${o.bigNote ? `<div class="cv-muted" style="padding-top:4px;font:500 13px/1.4 ${k.font};color:${k.muted}">${esc(o.bigNote)}</div>` : ''}
              </td></tr>
              ${o.rows.length ? `${dashed()}
              <tr><td style="padding:8px 18px 12px">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                  ${detailRows(k, o.rows)}
                </table>
              </td></tr>` : ''}
            </table>
          </td></tr>`
}

/** A one-time code, big, on the business's tint. */
function codeBlock(k: Kit, code: string) {
  return `
          <tr><td style="padding-top:24px">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
              <td align="center" class="cv-note" bgcolor="${k.accentTint}" style="background:${k.accentTint};border-radius:20px;padding:26px 12px">
                <div class="cv-acc cv-code" style="font:800 40px/46px ${k.font};letter-spacing:10px;color:${k.accentInk}">${esc(code)}</div>
              </td>
            </tr></table>
          </td></tr>`
}

/** A product card: its photo (when there is one) and its name. */
function productBlock(k: Kit, o: { name: string; image?: string | null; note?: string | null }) {
  const img = /^https:\/\/[^\s"'<>]+$/i.test(String(o.image || '')) ? String(o.image) : null
  return `
          <tr><td style="padding-top:24px">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="cv-panel" style="background:${k.panel};border:1px solid ${k.line};border-radius:20px">
              <tr>
                ${img ? `<td width="88" valign="middle" style="width:88px;padding:14px 0 14px 14px"><img src="${esc(img)}" alt="" width="74" height="74" style="display:block;width:74px;height:74px;object-fit:cover;border-radius:14px;border:0;background:#ffffff"></td>` : ''}
                <td valign="middle" style="padding:16px 18px">
                  <div class="cv-ink" style="font:800 17px/1.3 ${k.font};letter-spacing:-0.01em;color:${k.ink}">${esc(o.name)}</div>
                  ${o.note ? `<div style="padding-top:8px"><span class="cv-soon" style="display:inline-block;background:${k.accentTint};color:${k.accentInk};border-radius:999px;padding:3px 10px;font:700 12px/1.5 ${k.font}">${esc(o.note)}</span></div>` : ''}
                </td>
              </tr>
            </table>
          </td></tr>`
}

/** The business's own words (plain text, newlines kept) as the opening paragraph. */
const paragraphs = (s: string) => esc(String(s || '').trim()).replace(/\r?\n/g, '<br>')

// ── The shell ────────────────────────────────────────────────────────────────

type Shell = {
  business: string; logoUrl?: string | null; hideBadge?: boolean
  pill?: Pill | null
  /** Plain text. */
  headline: string
  /** Already-escaped HTML. */
  intro: string
  /** Rows from the block helpers above. */
  blocks: string[]
  /** Hidden preview line shown in the inbox list. */
  preheader?: string
}

function shell(k: Kit, s: Shell): string {
  const tone = !s.pill ? null : s.pill.tone === 'accent'
    ? { fg: k.accentInk, bg: k.accentTint, line: k.accentLine, dfg: k.accentInkDark, dbg: k.accentTintDark, dline: k.accentLineDark }
    : TONES[s.pill.tone]
  const { font, line, ink, sub, dark } = k
  const brand = s.logoUrl
    ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td class="cv-chip" style="background:#ffffff;background-image:linear-gradient(#ffffff,#ffffff);border:1px solid ${line};border-radius:14px;padding:7px 10px"><img src="${esc(s.logoUrl)}" alt="${esc(s.business)}" height="30" style="display:block;height:30px;width:auto;max-width:180px;border:0"></td></tr></table>`
    : `<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
        <td width="34" height="34" align="center" valign="middle" style="width:34px;height:34px;background:${k.accent};border-radius:11px;color:${k.btnText};font:800 16px/34px ${font}">${esc((s.business.trim()[0] || 'C').toUpperCase())}</td>
        <td class="cv-ink" style="padding-left:10px;font:800 16px/1.2 ${font};color:${ink};letter-spacing:-0.01em">${esc(s.business)}</td>
      </tr></table>`
  const pill = s.pill && tone
    ? `<tr><td style="padding-bottom:16px"><span class="cv-pill" style="display:inline-block;background:${tone.bg};color:${tone.fg};border:1px solid ${tone.line};border-radius:999px;padding:4px 12px 4px 10px;font:700 12.5px/1.5 ${font}"><span style="font-size:${s.pill.mark === '●' ? 9 : 12}px;vertical-align:${s.pill.mark === '●' ? '1px' : '0'}">${esc(s.pill.mark)}</span>&nbsp; ${esc(s.pill.text)}</span></td></tr>`
    : ''
  const pre = s.preheader ? `<div style="display:none;max-height:0;max-width:0;overflow:hidden;opacity:0;mso-hide:all;font-size:1px;line-height:1px;color:#f4f4f5">${esc(s.preheader)}${'&#8199;&#65279;&#847; '.repeat(40)}</div>` : ''

  return `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light dark"><meta name="supported-color-schemes" content="light dark">
<title>${esc(s.headline)}</title>
<style>
  @media (max-width:600px){ .cv-card-td{padding:26px 20px 24px!important} .cv-h1{font-size:25px!important} .cv-wrap{padding:20px 10px!important} .cv-code{font-size:32px!important;letter-spacing:7px!important} }
  @media (prefers-color-scheme:dark){
    .cv-bg{background:${dark.bg}!important}
    .cv-card{background:${dark.card}!important;border-color:${dark.line}!important}
    .cv-panel{background:${dark.panel}!important;border-color:${dark.line}!important}
    .cv-tile{background:${dark.card}!important;border-color:${dark.line}!important}
    .cv-line{border-color:#3a3a42!important}
    .cv-ink{color:${dark.ink}!important}
    .cv-sub{color:${dark.sub}!important}
    .cv-muted{color:${dark.muted}!important}
    .cv-acc{color:${k.accentInkDark}!important}
    .cv-soon{background:${k.accentTintDark}!important;color:${k.accentInkDark}!important}
    .cv-note{background:${k.accentTintDark}!important}
    ${tone ? `.cv-pill{background:${tone.dbg}!important;color:${tone.dfg}!important;border-color:${tone.dline}!important}` : ''}
    .cv-ghost{background:${dark.panel}!important;border-color:#3a3a42!important;color:${dark.ink}!important}
    .cv-panel td,.cv-panel tr td{border-color:${dark.line}!important}
  }
</style>
</head>
<body class="cv-bg" style="margin:0;padding:0;background:#f4f4f5;-webkit-text-size-adjust:100%">
${pre}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="cv-bg" style="background:#f4f4f5">
  <tr><td align="center" class="cv-wrap" style="padding:32px 14px">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px">
      <tr><td style="padding:0 6px 16px">${brand}</td></tr>
      <tr><td>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="cv-card" style="background:#ffffff;border:1px solid ${line};border-radius:24px">
          <tr><td class="cv-card-td" style="padding:32px 30px 28px">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
              ${pill}
              <tr><td class="cv-ink cv-h1" style="font:800 28px/1.15 ${font};letter-spacing:-0.025em;color:${ink}">${esc(s.headline)}</td></tr>
              <tr><td class="cv-sub" style="padding-top:10px;font:400 15.5px/1.6 ${font};color:${sub}">${s.intro}</td></tr>
              ${s.blocks.join('')}
            </table>
          </td></tr>
        </table>
      </td></tr>
      <tr><td align="center" style="padding:20px 10px 4px;font:500 12.5px/1.6 ${font};color:#a1a1aa" class="cv-muted">
        ${esc(s.business)}${s.hideBadge ? '' : ` &nbsp;·&nbsp; Powered by <a href="https://colvy.com" style="color:#a1a1aa;text-decoration:underline">Colvy</a>`}
      </td></tr>
    </table>
  </td></tr>
</table>
</body></html>`
}

// ── Booked, moved, reminder, cancelled, missed, book again ──────────────────

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

const KIND_PILL: Record<BookingEmailKind, Pill> = {
  confirmed: { tone: 'good', text: 'Confirmed', mark: '✓' },
  rescheduled: { tone: 'good', text: 'New time confirmed', mark: '✓' },
  reminder: { tone: 'accent', text: 'Coming up', mark: '●' },
  cancelled: { tone: 'bad', text: 'Cancelled', mark: '✕' },
  conflict: { tone: 'warn', text: 'Action needed', mark: '!' },
  noshow: { tone: 'accent', text: 'We missed you', mark: '●' },
  rebook: { tone: 'accent', text: 'Book again', mark: '●' },
}

export function bookingEmailHtml(i: BookingEmailInput): string {
  const k = kit(i.accent)
  const live = i.kind === 'confirmed' || i.kind === 'rescheduled' || i.kind === 'reminder'
  const off = i.kind === 'cancelled' || i.kind === 'conflict'
  const showTicket = i.kind !== 'noshow' && i.kind !== 'rebook'
  const blocks = [
    showTicket ? ticketBlock(k, {
      startMs: i.startMs, endMs: i.endMs, timezone: i.timezone, showEnd: !i.isTable, off,
      chip: live ? soonLabel(i.startMs, i.timezone, i.now ?? Date.now()) : null,
      rows: i.rows.filter(([key]) => key !== 'When'),
    }) : '',
    buttonBlock(k, i.primaryUrl, i.primaryLabel),
    calendarBlock(k, i.googleUrl, i.icsUrl),
    i.note ? noteBlock(k, `A note from ${i.business}`, i.note) : '',
  ]
  return shell(k, { business: i.business, logoUrl: i.logoUrl, hideBadge: i.hideBadge, pill: KIND_PILL[i.kind], headline: i.headline, intro: i.intro, blocks, preheader: i.preheader })
}

// ── "Here's your booking" (the manage link, sent on request) ────────────────

export type ManageLinkEmailInput = {
  business: string; logoUrl?: string | null; accent?: string | null; hideBadge?: boolean
  first: string; serviceName: string
  rows: [string, string][]
  startMs: number; endMs: number; timezone: string; isTable?: boolean
  manageUrl: string
  googleUrl?: string | null; icsUrl?: string | null
  /** The booking is still on (not cancelled or finished). */
  live: boolean
  now?: number
}

export function manageLinkEmailHtml(i: ManageLinkEmailInput): string {
  const k = kit(i.accent)
  const blocks = [
    ticketBlock(k, { startMs: i.startMs, endMs: i.endMs, timezone: i.timezone, showEnd: !i.isTable, chip: i.live ? soonLabel(i.startMs, i.timezone, i.now ?? Date.now()) : null, rows: i.rows }),
    buttonBlock(k, i.manageUrl, i.live ? 'View or change' : 'View booking'),
    i.live ? calendarBlock(k, i.googleUrl, i.icsUrl) : '',
    finePrint(k, `You asked for this link, or ${i.business} sent it to you. Anyone with the link can view and change this booking, so keep it to yourself.`),
  ]
  return shell(k, {
    business: i.business, logoUrl: i.logoUrl, hideBadge: i.hideBadge,
    pill: i.live ? { tone: 'good', text: 'Confirmed', mark: '✓' } : null,
    headline: 'Here’s your booking',
    intro: `Hi ${esc(i.first)}, here’s the link to view, move or cancel your ${i.isTable ? 'table' : esc(i.serviceName)} booking with ${esc(i.business)}.`,
    blocks, preheader: `${i.isTable ? 'Your table' : i.serviceName} · ${parts(i.startMs, i.timezone).long}, ${parts(i.startMs, i.timezone).time(i.startMs)}`,
  })
}

// ── A regular booking (the same visit every N weeks) ────────────────────────

export type SeriesEmailInput = {
  business: string; logoUrl?: string | null; accent?: string | null; hideBadge?: boolean
  first: string; serviceName: string
  /** "every 2 weeks" */
  freq: string
  where?: string | null
  visits: { startMs: number; endMs?: number; url?: string | null }[]
  timezone: string
  /** The calendar file with every visit is attached. */
  withIcs: boolean
}

export function seriesEmailHtml(i: SeriesEmailInput): string {
  const k = kit(i.accent)
  const n = i.visits.length
  const blocks = [
    visitsBlock(k, {
      header: `${n} visit${n === 1 ? '' : 's'} booked`, visits: i.visits, timezone: i.timezone, showEnd: true,
      rows: [['What', i.serviceName], ['How often', i.freq.replace(/^./, c => c.toUpperCase())], ...(i.where ? [['Where', i.where] as [string, string]] : [])],
    }),
    noteBlock(k, 'Before each visit', `We’ll send a reminder with a link to move or cancel it.${i.withIcs ? ' Open the attached calendar file to add every visit to your calendar.' : ''}`),
  ]
  const p = n ? parts(i.visits[0].startMs, i.timezone) : null
  return shell(k, {
    business: i.business, logoUrl: i.logoUrl, hideBadge: i.hideBadge,
    pill: { tone: 'good', text: `Booked ${i.freq}`, mark: '✓' },
    headline: 'Your regular booking',
    // "at 12 Example St", but not "at Phone call" (the Where row says that).
    intro: `Hi ${esc(i.first)}, your ${esc(i.serviceName)} with ${esc(i.business)} is booked ${esc(i.freq)}${i.where && !/^(phone|video) call$/i.test(i.where) ? ` at ${esc(i.where)}` : ''}.`,
    blocks, preheader: p ? `${i.serviceName}, ${i.freq} · first visit ${p.long}, ${p.time(i.visits[0].startMs)}` : undefined,
  })
}

// ── A waitlist offer ("a spot opened up") ───────────────────────────────────

export type WaitlistOfferEmailInput = {
  business: string; logoUrl?: string | null; accent?: string | null; hideBadge?: boolean
  first: string; serviceName: string
  startMs: number; endMs?: number; timezone: string
  link: string
  /** 'order': held for this person for holdMins; 'first': whoever books first. */
  mode: 'first' | 'order'
  holdMins: number
}

export function waitlistOfferEmailHtml(i: WaitlistOfferEmailInput): string {
  const k = kit(i.accent)
  const held = i.mode === 'order'
  const blocks = [
    ticketBlock(k, { startMs: i.startMs, endMs: i.endMs, timezone: i.timezone, showEnd: true, chip: held ? `Held for you · ${i.holdMins} min` : 'First to book gets it', rows: [['What', i.serviceName]] }),
    buttonBlock(k, i.link, 'Book this time'),
    finePrint(k, `You’re getting this because you joined the waitlist at ${i.business}. The link also lets you leave the waitlist.`),
  ]
  return shell(k, {
    business: i.business, logoUrl: i.logoUrl, hideBadge: i.hideBadge,
    pill: { tone: 'accent', text: 'From the waitlist', mark: '●' },
    headline: 'A spot opened up',
    intro: `Hi ${esc(i.first || 'there')}, a time you were waiting for is free. ${held ? `It’s held for you for ${esc(i.holdMins)} minutes.` : 'It goes to whoever books first.'}`,
    blocks, preheader: `${i.serviceName} · ${parts(i.startMs, i.timezone).long}, ${parts(i.startMs, i.timezone).time(i.startMs)}`,
  })
}

// ── A quote (app/api/jobs/quotes/[id]/send) ─────────────────────────────────

export type QuoteEmailInput = {
  business: string; logoUrl?: string | null; accent?: string | null; hideBadge?: boolean
  /** The message the team wrote (plain text; the quote link is taken out of it). */
  message: string
  /** "Q-0007" */
  label: string
  /** What it's for (the job's title). */
  title?: string | null
  /** "$1,450.00" */
  total: string
  /** "14 November 2026" */
  validUntil?: string | null
  url: string
  /** Sent before (a new revision or a reminder). */
  resent?: boolean
}

export function quoteEmailHtml(i: QuoteEmailInput): string {
  const k = kit(i.accent)
  const blocks = [
    summaryBlock(k, {
      label: `Quote ${i.label}`, big: i.total, bigNote: 'Total',
      rows: [...(i.title ? [['For', i.title] as [string, string]] : []), ...(i.validUntil ? [['Valid until', i.validUntil] as [string, string]] : [])],
    }),
    buttonBlock(k, i.url, `View and accept quote ${i.label}`),
    finePrint(k, `Or open this link: ${i.url}`),
  ]
  return shell(k, {
    business: i.business, logoUrl: i.logoUrl, hideBadge: i.hideBadge,
    pill: { tone: 'accent', text: i.resent ? 'Updated quote' : 'New quote', mark: '●' },
    headline: `Your quote ${i.label}`,
    intro: paragraphs(i.message) || `Here’s your quote from ${esc(i.business)}.`,
    blocks, preheader: `${i.label}${i.title ? ` · ${i.title}` : ''} · ${i.total}`,
  })
}

// ── A sign-in code for the customer's account (app/api/portal) ──────────────

export type AccountCodeEmailInput = { business: string; logoUrl?: string | null; accent?: string | null; hideBadge?: boolean; code: string; mins: number }

export function accountCodeEmailHtml(i: AccountCodeEmailInput): string {
  const k = kit(i.accent)
  return shell(k, {
    business: i.business, logoUrl: i.logoUrl, hideBadge: i.hideBadge,
    pill: null,
    headline: 'Your sign-in code',
    intro: `Enter this code on your account page with ${esc(i.business)}.`,
    blocks: [codeBlock(k, i.code), finePrint(k, `It expires in ${i.mins} minutes. If you didn’t ask for it, you can ignore this email: nobody can sign in without the code.`)],
    preheader: `${i.code} is your sign-in code. It expires in ${i.mins} minutes.`,
  })
}

// ── Back in stock (lib/waitlist) ─────────────────────────────────────────────

export type BackInStockEmailInput = {
  business: string; logoUrl?: string | null; accent?: string | null; hideBadge?: boolean
  item: string; image?: string | null
  /** The product page (a tracked short link), when there is one. */
  link?: string | null
  /** The business's message (their template, filled in; the link is taken out of it). */
  message: string
}

export function backInStockEmailHtml(i: BackInStockEmailInput): string {
  const k = kit(i.accent)
  const blocks = [
    productBlock(k, { name: i.item, image: i.image }),
    i.link ? buttonBlock(k, i.link, 'View it now') : '',
    finePrint(k, `You asked ${i.business} to let you know when this was back. You won’t get another message about it.`),
  ]
  return shell(k, {
    business: i.business, logoUrl: i.logoUrl, hideBadge: i.hideBadge,
    pill: { tone: 'good', text: 'Back in stock', mark: '✓' },
    headline: `${i.item} is back`,
    intro: paragraphs(i.message),
    blocks, preheader: `${i.item} is back in stock at ${i.business}.`,
  })
}

// ── A receipt / tax invoice (Send receipt: app/api/orders/receipt) ──────────

export type ReceiptEmailInput = {
  business: string; logoUrl?: string | null; accent?: string | null; hideBadge?: boolean
  first?: string | null
  /** "Tax invoice" or "Receipt" */
  title: string
  number: string
  /** "$38.50" */
  total: string
  /** "$2.23" when there's GST. */
  gst?: string | null
  /** "3 November 2026" */
  date: string
  where?: string | null
  status: 'paid' | 'unpaid' | 'refunded' | 'cancelled'
  statusLabel: string
  url: string
}

export function receiptEmailHtml(i: ReceiptEmailInput): string {
  const k = kit(i.accent)
  const word = i.title.toLowerCase()
  const pill: Pill = i.status === 'paid' ? { tone: 'good', text: 'Paid', mark: '✓' }
    : i.status === 'unpaid' ? { tone: 'warn', text: i.statusLabel, mark: '!' }
    : { tone: 'bad', text: i.statusLabel, mark: '●' }
  const blocks = [
    summaryBlock(k, {
      label: `${i.title} ${i.number}`, big: i.total, bigNote: i.gst ? `Includes GST of ${i.gst}` : 'Total',
      rows: [['Date', i.date], ...(i.where ? [['Where', i.where] as [string, string]] : [])],
    }),
    buttonBlock(k, i.url, 'View, print or save as PDF'),
    finePrint(k, `Keep this email: the button always opens your ${word} from ${i.business}.`),
  ]
  return shell(k, {
    business: i.business, logoUrl: i.logoUrl, hideBadge: i.hideBadge,
    pill,
    headline: `Your ${word} ${i.number}`,
    intro: `Hi ${esc(i.first || 'there')}, here’s your ${esc(word)} from ${esc(i.business)}. You can view it, print it or save it as a PDF.`,
    blocks, preheader: `${i.title} ${i.number} · ${i.total}${i.gst ? ` incl. GST ${i.gst}` : ''}`,
  })
}
