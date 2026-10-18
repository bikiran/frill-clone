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
import type { Align, Block, EmailBrand, EmailDesign, ProductItem } from './types'

const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif"
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

function button(label: string, url: string, color: string, align: Align = 'left', small = false): string {
  const href = safeUrl(url)
  if (!href || !String(label || '').trim()) return ''
  const fg = textOn(color)
  const pad = small ? '9px 16px' : '14px 28px'
  const size = small ? 14 : 16
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" align="${alignOf(align)}" style="margin:${small ? '4px 0 0' : '6px 0 22px'}${align === 'center' ? ';margin-left:auto;margin-right:auto' : ''}">
<tr><td align="center" bgcolor="${color}" style="background-color:${color};border-radius:8px">
<a href="${escapeHtml(href)}" target="_blank" style="display:inline-block;padding:${pad};font-family:${FONT};font-size:${size}px;font-weight:700;line-height:20px;color:${fg};text-decoration:none;border-radius:8px;border:1px solid ${color}">${escapeHtml(label)}</a>
</td></tr></table>`
}

function placeholder(label: string, height: number): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td height="${height}" align="center" bgcolor="${C.soft}" style="height:${height}px;background-color:${C.soft};border:1px dashed #d4d4d8;border-radius:8px;font-family:${FONT};font-size:13px;color:${C.muted}">${escapeHtml(label)}</td></tr></table>`
}

function productCell(p: ProductItem, accent: string, buttonLabel: string, preview: boolean): string {
  const img = safeImage(p.image)
  const url = safeUrl(p.url, false)
  const name = String(p.name || '').trim()
  if (!name && !img && !preview) return ''
  const pic = img
    ? `<img src="${escapeHtml(img)}" alt="${escapeHtml(name)}" width="240" style="display:block;width:100%;max-width:240px;height:auto;border:0;border-radius:8px;margin:0 0 10px">`
    : preview ? `<div style="margin:0 0 10px">${placeholder('Product picture', 150)}</div>` : ''
  const picLinked = pic && url ? `<a href="${escapeHtml(url)}" target="_blank" style="text-decoration:none">${pic}</a>` : pic
  const title = name ? `<p style="margin:0 0 4px;font-family:${FONT};font-size:15px;line-height:1.35;font-weight:700;color:${C.ink}">${url ? `<a href="${escapeHtml(url)}" target="_blank" style="color:${C.ink};text-decoration:none">${escapeHtml(name)}</a>` : escapeHtml(name)}</p>` : ''
  const price = p.price ? `<p style="margin:0 0 6px;font-family:${FONT};font-size:14px;color:${C.body}">${escapeHtml(String(p.price))}</p>` : ''
  return `${picLinked}${title}${price}${url ? button(buttonLabel, url, accent, 'left', true) : ''}`
}

const SOCIAL_LABEL: Record<string, string> = { facebook: 'Facebook', instagram: 'Instagram', tiktok: 'TikTok', youtube: 'YouTube', website: 'Website', x: 'X', linkedin: 'LinkedIn' }

type Ctx = { brand: EmailBrand; accent: string; preview: boolean }

function blockHtml(b: Block, ctx: Ctx): string {
  const { brand, accent, preview } = ctx
  switch (b.type) {
    case 'header': {
      const logo = b.showLogo !== false ? safeImage(brand.logoUrl) : ''
      const align = alignOf(b.align || 'center')
      const showName = b.showName !== false || !logo
      const name = showName ? `<p style="margin:${logo ? '10px' : '0'} 0 0;font-family:${FONT};font-size:${logo ? 15 : 22}px;line-height:1.3;font-weight:800;color:${logo ? C.ink : accent}">${escapeHtml(brand.name)}</p>` : ''
      const img = logo ? `<img src="${escapeHtml(logo)}" alt="${escapeHtml(brand.name)}" height="48" style="display:${align === 'center' ? 'block;margin:0 auto' : 'block'};height:48px;width:auto;max-width:220px;border:0">` : ''
      return row(`<div style="text-align:${align}">${img}${name}</div>`, '32px 40px 8px')
    }
    case 'heading': {
      const size = b.size === 'md' ? 20 : 28
      return row(`<h${b.size === 'md' ? 2 : 1} style="margin:18px 0 12px;font-family:${FONT};font-size:${size}px;line-height:1.25;font-weight:800;color:${C.ink};text-align:${alignOf(b.align)}">${inlineHtml(b.text, accent)}</h${b.size === 'md' ? 2 : 1}>`)
    }
    case 'text': {
      const ps = paragraphs(b.text)
      if (!ps.length) return ''
      return row(ps.map(p => `<p style="margin:0 0 16px;font-family:${FONT};font-size:16px;line-height:1.6;color:${C.body};text-align:${alignOf(b.align)}">${inlineHtml(p, accent).replace(/\n/g, '<br>')}</p>`).join(''))
    }
    case 'image': {
      const src = safeImage(b.src)
      if (!src) return preview ? row(`<div style="margin:8px 0 18px">${placeholder('Add a picture', 200)}</div>`) : ''
      const w = Math.max(80, Math.min(INNER, Number(b.width) || INNER))
      const img = `<img src="${escapeHtml(src)}" alt="${escapeHtml(b.alt || '')}" width="${w}" style="display:block;width:100%;max-width:${w}px;height:auto;border:0;border-radius:8px;margin:0 auto">`
      const url = safeUrl(b.url, false)
      return row(`<div style="margin:8px 0 18px">${url ? `<a href="${escapeHtml(url)}" target="_blank" style="text-decoration:none">${img}</a>` : img}</div>`)
    }
    case 'button': {
      const color = hex(b.color, accent)
      const html = button(b.label, b.url, color, b.align || 'left')
      return html ? row(html) : (preview ? row(`<div style="margin:6px 0 22px">${placeholder('Add the button’s label and link', 48)}</div>`) : '')
    }
    case 'products': {
      const items = (b.items || []).filter(p => preview || String(p?.name || '').trim() || safeImage(p?.image))
      const list = items.length ? items : (preview ? [{ name: 'Product name', price: '$0.00' }, { name: 'Product name', price: '$0.00' }] : [])
      if (!list.length) return ''
      const label = String(b.buttonLabel || 'Shop now')
      let rows = ''
      for (let i = 0; i < list.length; i += 2) {
        const cells = [list[i], list[i + 1]].map((p, j) => `<td class="col" width="50%" valign="top" style="width:50%;padding:${j === 0 ? '0 10px 18px 0' : '0 0 18px 10px'}">${p ? productCell(p, accent, label, preview) : ''}</td>`).join('')
        rows += `<tr>${cells}</tr>`
      }
      return row(`<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:6px 0 4px">${rows}</table>`)
    }
    case 'coupon': {
      const code = String(b.code || '').trim()
      if (!code && !preview) return ''
      return row(`<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 22px"><tr><td align="center" bgcolor="${C.soft}" style="background-color:${C.soft};border:2px dashed ${accent};border-radius:10px;padding:20px 16px">
${b.title ? `<p style="margin:0 0 8px;font-family:${FONT};font-size:14px;font-weight:700;color:${C.body}">${escapeHtml(b.title)}</p>` : ''}
<p style="margin:0;font-family:${MONO};font-size:26px;line-height:1.2;font-weight:700;letter-spacing:3px;color:${C.ink}">${escapeHtml(code || 'CODE')}</p>
${b.note ? `<p style="margin:8px 0 0;font-family:${FONT};font-size:13px;color:${C.muted}">${escapeHtml(b.note)}</p>` : ''}
</td></tr></table>`)
    }
    case 'divider':
      return row(`<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:12px 0 20px"><tr><td style="border-top:1px solid ${C.border};font-size:0;line-height:0;height:1px">&nbsp;</td></tr></table>`)
    case 'spacer': {
      const h = Math.max(8, Math.min(80, Number(b.height) || 24))
      return `<tr><td height="${h}" style="height:${h}px;font-size:0;line-height:0">&nbsp;</td></tr>`
    }
    case 'social': {
      const links = (b.links || []).map(l => ({ label: SOCIAL_LABEL[l.network] || 'Link', url: safeUrl(l.url, false) })).filter(l => l.url)
      if (!links.length) return preview ? row(`<div style="margin:4px 0 18px">${placeholder('Add your social links', 40)}</div>`) : ''
      const cells = links.map(l => `<td style="padding:0 4px 8px"><a href="${escapeHtml(l.url)}" target="_blank" style="display:inline-block;padding:7px 14px;border:1px solid ${C.border};border-radius:999px;font-family:${FONT};font-size:13px;font-weight:600;color:${C.ink};text-decoration:none">${escapeHtml(l.label)}</a></td>`).join('')
      return row(`<table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin:4px auto 14px"><tr>${cells}</tr></table>`)
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
  const small = `font-family:${FONT};font-size:12px;line-height:1.6;color:${C.muted}`
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
    case 'coupon': return b.code ? `${b.title ? b.title + ': ' : 'Code: '}${b.code}${b.note ? `\n${b.note}` : ''}` : ''
    case 'divider': return '----------'
    case 'spacer': return ''
    case 'social': return (b.links || []).map(l => { const u = safeUrl(l.url, false); return u ? `${SOCIAL_LABEL[l.network] || 'Link'}: ${u}` : '' }).filter(Boolean).join('\n')
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
  const ctx: Ctx = { brand: { ...brand, name: String(brand.name || 'Our store').slice(0, 120) }, accent, preview: !!opts.preview }
  const blocks = Array.isArray(design?.blocks) ? design.blocks.filter(b => b && typeof b === 'object' && typeof (b as any).type === 'string') : []
  const footer = (blocks.find(b => b.type === 'footer') as Extract<Block, { type: 'footer' }> | undefined) || null
  const body = blocks.filter(b => b.type !== 'footer').map(b => blockHtml(b, ctx)).join('\n')
  const pre = String(opts.previewText || '').replace(/\s+/g, ' ').trim()
  // Padding after the preheader stops inboxes pulling body text into the preview.
  const preheader = pre ? `<div style="display:none;font-size:1px;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all">${escapeHtml(pre)}${'&#8204;&nbsp;'.repeat(60)}</div>` : ''
  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="x-apple-disable-message-reformatting"><meta name="color-scheme" content="light"><meta name="supported-color-schemes" content="light">
<title>${escapeHtml(opts.subject || ctx.brand.name)}</title>
<style>@media only screen and (max-width:620px){.wrap{width:100%!important}.px{padding-left:20px!important;padding-right:20px!important}.col{display:block!important;width:100%!important;padding-left:0!important;padding-right:0!important}}</style>
</head>
<body style="margin:0;padding:0;background-color:${bg}">
${preheader}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${bg}" style="background-color:${bg}"><tr><td align="center" style="padding:24px 10px">
<table role="presentation" class="wrap" width="${WIDTH}" cellpadding="0" cellspacing="0" border="0" bgcolor="${C.card}" style="width:${WIDTH}px;max-width:${WIDTH}px;background-color:${C.card};border:1px solid ${C.border};border-radius:12px">
${body}
${footerHtml(footer, ctx)}
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
