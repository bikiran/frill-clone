// Render an email design to email-safe HTML and a plain-text version.
// Shared by the designer's live preview (browser) and the campaign sender
// (server), so what the owner sees is what customers get.
//
// The techniques of lib/colvy-email.ts, with the BUSINESS's branding:
//   • tables and inline styles only: no flexbox, no grid, no SVG, no web
//     fonts, no background images. The one <style> block only stacks the
//     product columns and trims padding on phones; the email reads the same
//     without it (Gmail and Outlook drop it sometimes);
//   • bulletproof buttons (the coloured table cell is the button);
//   • 600px wide, fluid below; a hidden preheader (the preview text);
//   • every link and image is absolute https (mailto:/tel: allowed for
//     links); anything else is dropped, never passed through;
//   • everything the owner types is escaped. The only markup understood is
//     **bold**, _italic_ and [label](https://…).
//
// Merge tags ({{first_name}}, {{first_name|there}}) stay in the rendered
// template; fillTemplate() puts each recipient's values in, escaped. The
// sender also fills {{unsubscribe_url}}, {{preferences_url}} and
// {{open_pixel_url}}; every email has a footer with the business's name and
// address and a working unsubscribe link (Spam Act 2003), added if the
// design has none.

import { escapeHtml } from '@/lib/safe-html'
import type { Align, Block, ColumnItem, EmailBrand, EmailDesign, FontChoice, ProductItem, SocialLink } from './types'
import { SOCIAL, isNetwork, socialIconPath, socialLook, socialUrl } from './social'

const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif"
/** The Design tab's fonts: stacks every inbox already has (no web fonts). */
export const FONTS: Record<FontChoice, { label: string; stack: string }> = {
  modern: { label: 'Modern', stack: FONT },
  classic: { label: 'Classic', stack: "Georgia,'Times New Roman',Times,serif" },
  friendly: { label: 'Friendly', stack: "'Trebuchet MS','Lucida Grande','Lucida Sans Unicode',Verdana,sans-serif" },
  clean: { label: 'Clean', stack: 'Helvetica,Arial,sans-serif' },
}
const CORNER_PX = { sharp: 0, soft: 8, round: 16 } as const
const MONO = "ui-monospace,SFMono-Regular,Menlo,Consolas,'Courier New',monospace"
const C = { ink: '#18181b', body: '#3f3f46', muted: '#71717a', border: '#e4e4e7', canvas: '#f4f4f5', card: '#ffffff', soft: '#fafafa' }
const WIDTH = 600
const INNER = 520 // WIDTH less 40px padding each side

const HEX = /^#[0-9a-f]{6}$/i
export const DEFAULT_ACCENT = '#ff7a6b'

export type RenderOptions = {
  subject?: string
  previewText?: string
  /** Preview in the designer: empty pictures and products show a placeholder. */
  preview?: boolean
}

export type RenderedEmail = { html: string; text: string }

/** https only; mailto:/tel: when allowContact; '' for anything else. Merge tags may sit in the path or query. */
export function safeUrl(raw: unknown, allowContact = true): string {
  const s = String(raw ?? '').trim()
  if (/^https:\/\/[a-z0-9.-]+\.[a-z]{2,}(?::\d+)?(?:[/?#][^\s"'<>\\]*)?$/i.test(s)) return s
  if (allowContact && /^(mailto:[^\s"'<>\\@]+@[^\s"'<>\\]+|tel:\+?[0-9 ()-]{3,20})$/i.test(s)) return s
  return ''
}

/** An image URL: https only. */
export const safeImage = (raw: unknown) => safeUrl(raw, false)

const hex = (v: unknown, fallback: string) => (HEX.test(String(v || '')) ? String(v) : fallback)

/** Blend two #rrggbb colours: t = how much of `to` (0..1). Email can't use color-mix(). */
function mixHex(from: string, to: string, t: number): string {
  const p = (h: string) => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16))
  const x = p(hex(from, DEFAULT_ACCENT)), y = p(hex(to, '#ffffff'))
  return '#' + x.map((v, i) => Math.round(v + (y[i] - v) * t).toString(16).padStart(2, '0')).join('')
}

/** White or near-black text, whichever reads better on this colour. */
export function textOn(bg: string): string {
  const h = hex(bg, DEFAULT_ACCENT).slice(1)
  const [r, g, b] = [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16) / 255).map(c => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4))
  const L = 0.2126 * r + 0.7152 * g + 0.0722 * b
  return L > 0.45 ? '#111111' : '#ffffff'
}

// ── Inline markup ───────────────────────────────────────────────────────────

const LINK = /\[([^\]\n]{1,200})\]\(([^)\s]{1,2000})\)/g

function emphasis(escaped: string, accent: string, html: boolean): string {
  if (!html) return escaped.replace(/\*\*(.+?)\*\*/g, '$1').replace(/(^|[\s(])_([^_\n]+?)_(?=[\s.,!?;:)]|$)/g, '$1$2')
  return escaped
    .replace(/\*\*(.+?)\*\*/g, `<strong style="font-weight:700;color:${C.ink}">$1</strong>`)
    .replace(/(^|[\s(])_([^_\n]+?)_(?=[\s.,!?;:)]|$)/g, '$1<em>$2</em>')
}

/** One line or paragraph of owner text → HTML (escaped; links checked). */
export function inlineHtml(raw: string, accent: string): string {
  let out = '', last = 0
  const s = String(raw ?? '')
  for (const m of s.matchAll(LINK)) {
    out += emphasis(escapeHtml(s.slice(last, m.index)), accent, true)
    const url = safeUrl(m[2])
    const label = emphasis(escapeHtml(m[1]), accent, true)
    out += url ? `<a href="${escapeHtml(url)}" target="_blank" style="color:${accent};text-decoration:underline">${label}</a>` : label
    last = (m.index || 0) + m[0].length
  }
  return out + emphasis(escapeHtml(s.slice(last)), accent, true)
}

/** The same text for the plain-text version: links become "label (url)". */
export function inlineText(raw: string): string {
  return emphasis(String(raw ?? '').replace(LINK, (_w, label, url) => { const u = safeUrl(url); return u ? `${label} (${u})` : label }), '', false)
}

const paragraphs = (s: string) => String(s ?? '').replace(/\r\n?/g, '\n').split(/\n{2,}/).map(p => p.trim()).filter(Boolean)

// ── Blocks ──────────────────────────────────────────────────────────────────

const row = (inner: string, pad = '0 40px') => `<tr><td class="px" style="padding:${pad}">${inner}</td></tr>`
const alignOf = (a?: Align) => (a === 'center' ? 'center' : 'left')

function button(label: string, url: string, color: string, ctx: Ctx, align: Align = 'left', small = false): string {
  const href = safeUrl(url)
  if (!href || !String(label || '').trim()) return ''
  const outline = ctx.buttonStyle === 'outline'
  const fg = outline ? color : textOn(color)
  const pad = small ? '9px 16px' : '14px 28px'
  const size = small ? 14 : 16
  const r = ctx.buttonShape === 'pill' ? 999 : ctx.r
  const bg = outline ? '' : ` bgcolor="${color}"`
  const fill = outline ? 'background-color:transparent' : `background-color:${color}`
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" align="${alignOf(align)}" style="margin:${small ? '4px 0 0' : '6px 0 22px'}${align === 'center' ? ';margin-left:auto;margin-right:auto' : ''}">
<tr><td align="center"${bg} style="${fill};border-radius:${r}px">
<a href="${escapeHtml(href)}" target="_blank" style="display:inline-block;padding:${pad};font-family:${ctx.font};font-size:${size}px;font-weight:700;line-height:20px;color:${fg};text-decoration:none;border-radius:${r}px;border:${outline ? 2 : 1}px solid ${color}">${escapeHtml(label)}</a>
</td></tr></table>`
}

function placeholder(label: string, height: number): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td height="${height}" align="center" bgcolor="${C.soft}" style="height:${height}px;background-color:${C.soft};border:1px dashed #d4d4d8;border-radius:8px;font-family:${FONT};font-size:13px;color:${C.muted}">${escapeHtml(label)}</td></tr></table>`
}

function productCell(p: ProductItem, accent: string, buttonLabel: string, preview: boolean, ctx: Ctx): string {
  const img = safeImage(p.image)
  const url = safeUrl(p.url, false)
  const name = String(p.name || '').trim()
  if (!name && !img && !preview) return ''
  const pic = img
    ? `<img src="${escapeHtml(img)}" alt="${escapeHtml(name)}" width="240" style="display:block;width:100%;max-width:240px;height:auto;border:0;border-radius:${ctx.r}px;margin:0 0 10px">`
    : preview ? `<div style="margin:0 0 10px">${placeholder('Product picture', 150)}</div>` : ''
  const picLinked = pic && url ? `<a href="${escapeHtml(url)}" target="_blank" style="text-decoration:none">${pic}</a>` : pic
  const title = name ? `<p style="margin:0 0 4px;font-family:${ctx.font};font-size:15px;line-height:1.35;font-weight:700;color:${C.ink}">${url ? `<a href="${escapeHtml(url)}" target="_blank" style="color:${C.ink};text-decoration:none">${escapeHtml(name)}</a>` : escapeHtml(name)}</p>` : ''
  const price = p.price ? `<p style="margin:0 0 6px;font-family:${ctx.font};font-size:14px;color:${C.body}">${escapeHtml(String(p.price))}</p>` : ''
  return `${picLinked}${title}${price}${url ? button(buttonLabel, url, accent, ctx, 'left', true) : ''}`
}

function columnCell(c: ColumnItem, ctx: Ctx): string {
  const img = safeImage(c.image)
  const url = safeUrl(c.url, false)
  const title = String(c.title || '').trim()
  const pic = img
    ? `<img src="${escapeHtml(img)}" alt="${escapeHtml(c.alt || title)}" width="250" style="display:block;width:100%;max-width:250px;height:auto;border:0;border-radius:${ctx.r}px;margin:0 0 12px">`
    : ''
  const picLinked = pic && url ? `<a href="${escapeHtml(url)}" target="_blank" style="text-decoration:none">${pic}</a>` : pic
  const head = title ? `<p style="margin:0 0 6px;font-family:${ctx.font};font-size:17px;line-height:1.3;font-weight:800;color:${C.ink}">${inlineHtml(title, ctx.accent)}</p>` : ''
  const body = paragraphs(c.text || '').map(p => `<p style="margin:0 0 10px;font-family:${ctx.font};font-size:15px;line-height:1.55;color:${C.body}">${inlineHtml(p, ctx.accent).replace(/\n/g, '<br>')}</p>`).join('')
  return `${picLinked}${head}${body}${url ? button(String(c.label || 'Find out more'), url, ctx.accent, ctx, 'left', true) : ''}`
}

/** A YouTube link's thumbnail (https), or ''. */
export function videoThumb(raw: unknown): string {
  const s = String(raw ?? '')
  const m = s.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?(?:.*&)?v=|shorts\/|embed\/|live\/))([A-Za-z0-9_-]{11})/)
  return m ? `https://i.ytimg.com/vi/${m[1]}/hqdefault.jpg` : ''
}

/** A social block's links that can go out: each network's https link (handles turned into links). */
function socialLinks(b: { links?: SocialLink[] }) {
  return (Array.isArray(b.links) ? b.links : []).map(l => {
    const network = isNetwork(l?.network) ? l.network : 'website'
    return { network, label: SOCIAL[network].label, url: socialUrl(network, l?.url) }
  }).filter(l => l.url)
}

/**
 * Where the social icons are: this site in the designer's preview, Colvy's
 * site (always https) in an email that's sent.
 */
function assetBase(preview: boolean): string {
  if (preview && typeof window !== 'undefined') return window.location.origin
  const site = String(process.env.NEXT_PUBLIC_SITE_URL || '').trim().replace(/\/+$/, '')
  return /^https:\/\/[a-z0-9.-]+\.[a-z]{2,}$/i.test(site) ? site : 'https://colvy.com'
}

type Ctx = { brand: EmailBrand; accent: string; preview: boolean; font: string; r: number; buttonStyle: 'filled' | 'outline'; buttonShape: 'rounded' | 'pill' }

function blockHtml(b: Block, ctx: Ctx): string {
  const { brand, accent, preview } = ctx
  switch (b.type) {
    case 'header': {
      const logo = b.showLogo !== false ? safeImage(brand.logoUrl) : ''
      const align = alignOf(b.align || 'center')
      const showName = b.showName !== false || !logo
      const name = showName ? `<p style="margin:${logo ? '6px' : '0'} 0 0;font-family:${ctx.font};font-size:${logo ? 15 : 22}px;line-height:1.3;font-weight:800;color:${logo ? C.ink : accent}">${escapeHtml(brand.name)}</p>` : ''
      // The logo sits on a white tile. On the white card it can't be seen, but
      // when an inbox darkens the email (Gmail's app in dark mode turns light
      // backgrounds dark and leaves pictures alone) a dark logo would vanish
      // into the black. Gmail doesn't touch background images, so the tile is
      // painted white twice: the colour, and a white gradient over it.
      // The tile's padding comes out of the header's, so nothing moves.
      const img = logo ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0"${align === 'center' ? ' align="center"' : ''} style="${align === 'center' ? 'margin:0 auto' : 'margin-left:-12px'}"><tr><td bgcolor="#ffffff" style="background-color:#ffffff;background-image:linear-gradient(#ffffff,#ffffff);border-radius:14px;padding:8px 12px 6px;line-height:0;font-size:0">
<img src="${escapeHtml(logo)}" alt="${escapeHtml(brand.name)}" height="48" style="display:block;height:48px;width:auto;max-width:220px;border:0">
</td></tr></table>` : ''
      return row(`<div style="text-align:${align}">${img}${name}</div>`, logo ? '24px 40px 8px' : '32px 40px 8px')
    }
    case 'heading': {
      const size = b.size === 'md' ? 20 : 28
      return row(`<h${b.size === 'md' ? 2 : 1} style="margin:18px 0 12px;font-family:${ctx.font};font-size:${size}px;line-height:1.25;font-weight:800;color:${C.ink};text-align:${alignOf(b.align)}">${inlineHtml(b.text, accent)}</h${b.size === 'md' ? 2 : 1}>`)
    }
    case 'text': {
      const ps = paragraphs(b.text)
      if (!ps.length) return ''
      return row(ps.map(p => `<p style="margin:0 0 16px;font-family:${ctx.font};font-size:16px;line-height:1.6;color:${C.body};text-align:${alignOf(b.align)}">${inlineHtml(p, accent).replace(/\n/g, '<br>')}</p>`).join(''))
    }
    case 'image': {
      const src = safeImage(b.src)
      if (!src) return preview ? row(`<div style="margin:8px 0 18px">${placeholder('Add a picture', 200)}</div>`) : ''
      const w = Math.max(80, Math.min(INNER, Number(b.width) || INNER))
      const img = `<img src="${escapeHtml(src)}" alt="${escapeHtml(b.alt || '')}" width="${w}" style="display:block;width:100%;max-width:${w}px;height:auto;border:0;border-radius:${ctx.r}px;margin:0 auto">`
      const url = safeUrl(b.url, false)
      return row(`<div style="margin:8px 0 18px">${url ? `<a href="${escapeHtml(url)}" target="_blank" style="text-decoration:none">${img}</a>` : img}</div>`)
    }
    case 'button': {
      const color = hex(b.color, accent)
      const html = button(b.label, b.url, color, ctx, b.align || 'left')
      return html ? row(html) : (preview ? row(`<div style="margin:6px 0 22px">${placeholder('Add the button’s label and link', 48)}</div>`) : '')
    }
    case 'products': {
      const items = (b.items || []).filter(p => preview || String(p?.name || '').trim() || safeImage(p?.image))
      const list = items.length ? items : (preview ? [{ name: 'Product name', price: '$0.00' }, { name: 'Product name', price: '$0.00' }] : [])
      if (!list.length) return ''
      const label = String(b.buttonLabel || 'Shop now')
      let rows = ''
      for (let i = 0; i < list.length; i += 2) {
        const cells = [list[i], list[i + 1]].map((p, j) => `<td class="col" width="50%" valign="top" style="width:50%;padding:${j === 0 ? '0 10px 18px 0' : '0 0 18px 10px'}">${p ? productCell(p, accent, label, preview, ctx) : ''}</td>`).join('')
        rows += `<tr>${cells}</tr>`
      }
      return row(`<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:6px 0 4px">${rows}</table>`)
    }
    case 'coupon': {
      // A ticket, like the coupon in chat: the offer on a coloured top, notches
      // and a dashed tear line, then the code. Tables only: the notches are
      // quarter circles in the card's colour either side of the tear line.
      const code = String(b.code || '').trim()
      if (!code && !preview) return ''
      const offer = String(b.offer || '').trim()
      const label = offer ? String(b.title || '').trim() || 'Coupon' : 'Coupon'
      const headline = offer || String(b.title || '').trim() || 'Your code'
      const split = /^([$€£]?\d[\d.,]*%?)\s+(.{1,30})$/.exec(headline)
      const on = textOn(accent)
      const light = mixHex(accent, '#ffffff', 0.14), dark = mixHex(accent, '#000000', 0.2)
      const tint = mixHex(accent, '#ffffff', 0.92), dash = mixHex(accent, '#ffffff', 0.55)
      const R = Math.round(ctx.r * 1.25), N = 12
      const notch = (radius: string) => `<div style="width:${N}px;height:${N}px;background-color:${C.card};${radius};font-size:0;line-height:0">&nbsp;</div>`
      const cell = (inner: string) => `<td width="${N}" style="width:${N}px;padding:0;font-size:0;line-height:0">${inner}</td>`
      // The button: its own link, or the business's website when that's empty.
      // No text, no button.
      const shopLabel = String(b.label || '').trim()
      const shopUrl = safeUrl(b.url) || safeUrl(ctx.brand.website)
      const shop = !shopLabel ? ''
        : shopUrl ? `<div style="margin-top:12px;overflow:hidden">${button(shopLabel, shopUrl, accent, ctx, 'left', true)}</div>`
        : preview ? `<div style="margin-top:14px">${placeholder(`Add a link for “${shopLabel}”`, 38)}</div>` : ''
      const big = split
        ? `${escapeHtml(split[1])}<span style="font-size:16px;font-weight:600;letter-spacing:0;padding-left:6px">${escapeHtml(split[2])}</span>`
        : escapeHtml(headline)
      return row(`<table role="presentation" width="100%" align="center" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:340px;margin:8px auto 24px;border-collapse:separate">
<tr><td bgcolor="${accent}" style="background-color:${accent};background-image:linear-gradient(135deg,${light},${dark});border-radius:${R}px ${R}px 0 0;padding:0;color:${on}">
<div style="padding:18px 22px 10px">
<p style="margin:0;font-family:${ctx.font};font-size:12px;line-height:1.3;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:${on};opacity:.92">${escapeHtml(label)}</p>
<p style="margin:6px 0 0;font-family:${ctx.font};font-size:34px;line-height:1.05;font-weight:800;letter-spacing:-.5px;color:${on}">${big}</p>
</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>${cell(notch(`border-top-right-radius:${N}px`))}<td style="font-size:0;line-height:0">&nbsp;</td>${cell(notch(`border-top-left-radius:${N}px`))}</tr></table>
</td></tr>
<tr><td bgcolor="${tint}" style="background-color:${tint};border-radius:0 0 ${R}px ${R}px;padding:0">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>${cell(notch(`border-bottom-right-radius:${N}px`))}<td style="padding:0 6px;font-size:0;line-height:0;vertical-align:top"><div style="border-top:2px dashed ${dash};font-size:0;line-height:0;height:0">&nbsp;</div></td>${cell(notch(`border-bottom-left-radius:${N}px`))}</tr></table>
<div style="padding:4px 22px 18px">
<p style="margin:0;font-family:${MONO};font-size:24px;line-height:1.25;font-weight:800;letter-spacing:3px;color:${C.ink};word-break:break-all">${escapeHtml(code || 'CODE')}</p>
${b.note ? `<p style="margin:6px 0 0;font-family:${ctx.font};font-size:13px;line-height:1.45;color:${C.muted}">${escapeHtml(b.note)}</p>` : ''}
${shop}
</div>
</td></tr>
</table>`)
    }
    case 'divider':
      return row(`<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:12px 0 20px"><tr><td style="border-top:1px solid ${C.border};font-size:0;line-height:0;height:1px">&nbsp;</td></tr></table>`)
    case 'spacer': {
      const h = Math.max(8, Math.min(80, Number(b.height) || 24))
      return `<tr><td height="${h}" style="height:${h}px;font-size:0;line-height:0">&nbsp;</td></tr>`
    }
    case 'social': {
      const links = socialLinks(b)
      if (!links.length) return preview ? row(`<div style="margin:4px 0 18px">${placeholder('Add your social links', 40)}</div>`) : ''
      const look = socialLook(b.look)
      if (look === 'text') {
        const cells = links.map(l => `<td style="padding:0 4px 8px"><a href="${escapeHtml(l.url)}" target="_blank" style="display:inline-block;padding:7px 14px;border:1px solid ${C.border};border-radius:999px;font-family:${ctx.font};font-size:13px;font-weight:600;color:${C.ink};text-decoration:none">${escapeHtml(l.label)}</a></td>`).join('')
        return row(`<table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin:4px auto 14px"><tr>${cells}</tr></table>`)
      }
      // Logos: 32px pictures (email can't show SVG), in rows of up to six so
      // they fit a phone without wrapping (seven become four and three).
      // The network's name is the alt text, for inboxes that hide pictures.
      const base = assetBase(preview)
      const per = links.length <= 6 ? links.length : Math.ceil(links.length / Math.ceil(links.length / 6))
      const rows: string[] = []
      for (let i = 0; i < links.length; i += per) {
        const cells = links.slice(i, i + per).map(l => `<td style="padding:0 5px 10px"><a href="${escapeHtml(l.url)}" target="_blank" style="text-decoration:none"><img src="${escapeHtml(base + socialIconPath(l.network, look))}" width="32" height="32" alt="${escapeHtml(l.label)}" title="${escapeHtml(l.label)}" style="display:block;width:32px;height:32px;border:0;font-family:${ctx.font};font-size:11px;line-height:32px;color:${C.muted}"></a></td>`).join('')
        rows.push(`<table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin:0 auto"><tr>${cells}</tr></table>`)
      }
      return row(`<div style="margin:6px 0 10px">${rows.join('')}</div>`)
    }
    case 'columns': {
      const items = (b.items || []).slice(0, 2)
      const has = items.some(c => safeImage(c?.image) || String(c?.title || '').trim() || String(c?.text || '').trim())
      if (!has) return preview ? row(`<div style="margin:6px 0 18px">${placeholder('Add a picture, title or text to each column', 90)}</div>`) : ''
      const cells = [items[0] || {}, items[1] || {}].map((c, j) => `<td class="col" width="50%" valign="top" style="width:50%;padding:${j === 0 ? '0 12px 18px 0' : '0 0 18px 12px'}">${columnCell(c, ctx)}</td>`).join('')
      return row(`<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:6px 0 6px"><tr>${cells}</tr></table>`)
    }
    case 'video': {
      const url = safeUrl(b.url, false)
      const thumb = safeImage(b.thumbnail) || videoThumb(b.url)
      if (!url) return preview ? row(`<div style="margin:8px 0 18px">${placeholder('Add a video link (YouTube or any https link)', 180)}</div>`) : ''
      const pic = thumb
        ? `<a href="${escapeHtml(url)}" target="_blank" style="text-decoration:none"><img src="${escapeHtml(thumb)}" alt="${escapeHtml(b.label || 'Watch the video')}" width="${INNER}" style="display:block;width:100%;max-width:${INNER}px;height:auto;border:0;border-radius:${ctx.r}px;margin:0 auto"></a>`
        : ''
      return row(`<div style="margin:8px 0 6px">${pic}</div>${button(`\u25B6  ${String(b.label || 'Watch the video')}`, url, accent, ctx, 'center')}`)
    }
    case 'menu': {
      const links = (b.links || []).map(l => ({ label: String(l?.label || '').trim(), url: safeUrl(l?.url, false) })).filter(l => l.label && l.url)
      if (!links.length) return preview ? row(`<div style="margin:4px 0 14px">${placeholder('Add menu links', 40)}</div>`) : ''
      const items = links.map(l => `<a href="${escapeHtml(l.url)}" target="_blank" style="font-family:${ctx.font};font-size:14px;font-weight:700;color:${C.ink};text-decoration:none">${escapeHtml(l.label)}</a>`).join(`<span style="font-family:${ctx.font};font-size:14px;color:${C.muted}">&nbsp;&nbsp;&middot;&nbsp;&nbsp;</span>`)
      return row(`<p style="margin:6px 0 16px;text-align:center;line-height:1.8">${items}</p>`)
    }
    case 'footer':
      return footerHtml(b, ctx)
  }
  return ''
}

function footerHtml(b: Extract<Block, { type: 'footer' }> | null, ctx: Ctx): string {
  const { brand } = ctx
  const address = String(b?.address ?? brand.address ?? '').trim()
  const note = String(b?.note || '').trim() || `You’re getting this because you agreed to hear from ${brand.name}.`
  const small = `font-family:${ctx.font};font-size:12px;line-height:1.6;color:${C.muted}`
  return `<tr><td class="px" style="padding:22px 40px 30px;border-top:1px solid ${C.border}" align="center">
<p style="margin:0 0 4px;${small};font-weight:700;color:${C.body}">${escapeHtml(brand.name)}</p>
${address ? `<p style="margin:0 0 10px;${small}">${escapeHtml(address)}</p>` : ''}
<p style="margin:0 0 10px;${small}">${escapeHtml(note)}</p>
<p style="margin:0;${small}"><a href="{{unsubscribe_url}}" target="_blank" style="color:${C.muted};text-decoration:underline">Unsubscribe</a> &nbsp;|&nbsp; <a href="{{preferences_url}}" target="_blank" style="color:${C.muted};text-decoration:underline">Update your preferences</a></p>
</td></tr>`
}

function blockText(b: Block, brand: EmailBrand): string {
  switch (b.type) {
    case 'header': return brand.name
    case 'heading': return inlineText(b.text)
    case 'text': return paragraphs(b.text).map(inlineText).join('\n\n')
    case 'image': { const u = safeUrl(b.url, false); return u && b.alt ? `${b.alt}: ${u}` : '' }
    case 'button': { const u = safeUrl(b.url); return u && b.label ? `${b.label}: ${u}` : '' }
    case 'products': return (b.items || []).filter(p => p?.name).map(p => [p.name + (p.price ? ` (${p.price})` : ''), safeUrl(p.url, false)].filter(Boolean).join('\n')).join('\n\n')
    case 'coupon': {
      if (!b.code) return ''
      const u = String(b.label || '').trim() ? safeUrl(b.url) || safeUrl(brand.website) : ''
      return `${b.offer ? `${b.offer}\n` : ''}${b.title ? b.title + ': ' : 'Code: '}${b.code}${b.note ? `\n${b.note}` : ''}${u ? `\n${String(b.label).trim()}: ${u}` : ''}`
    }
    case 'divider': return '----------'
    case 'spacer': return ''
    case 'social': return socialLinks(b).map(l => `${l.label}: ${l.url}`).join('\n')
    case 'columns': return (b.items || []).map(c => [c?.title, c?.text ? paragraphs(c.text).map(inlineText).join('\n') : '', safeUrl(c?.url, false) ? `${c?.label || 'Find out more'}: ${safeUrl(c?.url, false)}` : ''].filter(Boolean).join('\n')).filter(Boolean).join('\n\n')
    case 'video': { const u = safeUrl(b.url, false); return u ? `${b.label || 'Watch the video'}: ${u}` : '' }
    case 'menu': return (b.links || []).map(l => { const u = safeUrl(l?.url, false); return u && l?.label ? `${l.label}: ${u}` : '' }).filter(Boolean).join('\n')
    case 'footer': return ''
  }
  return ''
}

function footerText(b: Extract<Block, { type: 'footer' }> | null, brand: EmailBrand): string {
  const address = String(b?.address ?? brand.address ?? '').trim()
  const note = String(b?.note || '').trim() || `You’re getting this because you agreed to hear from ${brand.name}.`
  return ['----------', brand.name, address, note, 'Unsubscribe: {{unsubscribe_url}}', 'Update your preferences: {{preferences_url}}'].filter(Boolean).join('\n')
}

/** Render a design to the email template (merge tags still in) and its plain text. */
export function renderEmail(design: EmailDesign, brand: EmailBrand, opts: RenderOptions = {}): RenderedEmail {
  const accent = hex(design?.accent, hex(brand.accent, DEFAULT_ACCENT))
  const bg = hex(design?.background, C.canvas)
  const font = FONTS[design?.font as FontChoice]?.stack || FONT
  const r = CORNER_PX[(design?.corners as keyof typeof CORNER_PX)] ?? CORNER_PX.soft
  const ctx: Ctx = {
    brand: { ...brand, name: String(brand.name || 'Our store').slice(0, 120) }, accent, preview: !!opts.preview,
    font, r, buttonStyle: design?.buttonStyle === 'outline' ? 'outline' : 'filled', buttonShape: design?.buttonShape === 'pill' ? 'pill' : 'rounded',
  }
  // The designer's preview marks each block's row so a click can select it.
  const tag = (h: string, id: string) => (opts.preview && h ? h.replace(/^<tr\b/, `<tr data-bid="${escapeHtml(String(id))}"`) : h)
  const blocks = Array.isArray(design?.blocks) ? design.blocks.filter(b => b && typeof b === 'object' && typeof (b as any).type === 'string') : []
  const footer = (blocks.find(b => b.type === 'footer') as Extract<Block, { type: 'footer' }> | undefined) || null
  const body = blocks.filter(b => b.type !== 'footer').map(b => tag(blockHtml(b, ctx), b.id)).join('\n')
  const pre = String(opts.previewText || '').replace(/\s+/g, ' ').trim()
  // Padding after the preheader stops inboxes pulling body text into the preview.
  // Gmail collapses plain spacer runs (its thread view then showed the logo
  // name after the preview text), so each step mixes a figure space, a
  // combining grapheme joiner, a zero-width non-joiner and a no-break space,
  // and there are enough of them to fill the longest snippet.
  const preheader = pre ? `<div style="display:none;font-size:1px;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all">${escapeHtml(pre)}${'&#8199;&#847;&zwnj;&nbsp;'.repeat(150)}</div>` : ''
  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="x-apple-disable-message-reformatting"><meta name="color-scheme" content="light"><meta name="supported-color-schemes" content="light">
<title>${escapeHtml(opts.subject || ctx.brand.name)}</title>
<style>@media only screen and (max-width:620px){.wrap{width:100%!important}.px{padding-left:20px!important;padding-right:20px!important}.col{display:block!important;width:100%!important;padding-left:0!important;padding-right:0!important}}${opts.preview ? `[data-bid]{cursor:pointer}[data-bid]:hover>td{box-shadow:inset 0 0 0 2px ${accent}55}[data-sel]>td{box-shadow:inset 0 0 0 2px ${accent}}` : ''}</style>
</head>
<body style="margin:0;padding:0;background-color:${bg}">
${preheader}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${bg}" style="background-color:${bg}"><tr><td align="center" style="padding:24px 10px">
<table role="presentation" class="wrap" width="${WIDTH}" cellpadding="0" cellspacing="0" border="0" bgcolor="${C.card}" style="width:${WIDTH}px;max-width:${WIDTH}px;background-color:${C.card};border:1px solid ${C.border};border-radius:${ctx.r ? ctx.r + 4 : 0}px">
${body}
${tag(footerHtml(footer, ctx), footer?.id || 'footer')}
</table>
</td></tr></table>
${opts.preview ? '' : '<img src="{{open_pixel_url}}" width="1" height="1" alt="" style="display:block;width:1px;height:1px;border:0">'}
</body></html>`
  const text = [
    ...blocks.filter(b => b.type !== 'footer').map(b => blockText(b, ctx.brand)).filter(s => s && s.trim()),
    footerText(footer, ctx.brand),
  ].join('\n\n').replace(/\n{3,}/g, '\n\n').trim() + '\n'
  return { html, text }
}

const TAG = /\{\{\s*([a-z_][a-z0-9_]*)\s*(?:\|([^{}]*))?\}\}/gi

/**
 * Put one recipient's values into a rendered template. In HTML the values
 * are escaped (a default written in the design is already escaped there).
 * Unknown tags become their default, or nothing.
 */
export function fillTemplate(template: string, vars: Record<string, string | null | undefined>, opts: { html: boolean }): string {
  return String(template || '').replace(TAG, (_w, rawKey: string, def?: string) => {
    const key = rawKey.toLowerCase()
    const v = vars[key]
    if (v != null && String(v).trim() !== '') return opts.html ? escapeHtml(String(v)) : String(v)
    return (def ?? '').trim()
  })
}

/** Subject lines: merge tags filled, one line. */
export function fillSubject(subject: string, vars: Record<string, string | null | undefined>): string {
  return fillTemplate(subject, vars, { html: false }).replace(/[\r\n]+/g, ' ').trim().slice(0, 250)
}

/** Sample values for the preview. */
export function sampleVars(brand: EmailBrand): Record<string, string> {
  return { first_name: 'Sarah', store_name: brand.name, outlet: 'Somerton', coupon_code: 'FISH15', unsubscribe_url: '#', preferences_url: '#', open_pixel_url: '' }
}
