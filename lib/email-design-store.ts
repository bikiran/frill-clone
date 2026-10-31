// Saving email designs (server only): checks what the designer sent, renders
// it with the business's branding, and stores the JSON, HTML and plain text
// in email_designs (V396). Used by app/api/email-campaigns/designs and by
// the campaign wizard once email is wired in.

import { renderEmail } from '@/components/EmailDesigner/render'
import type { Block, EmailDesign } from '@/components/EmailDesigner/types'
import { isMissingTable } from '@/lib/email-db'
import { loadEmailBrand } from '@/lib/email-brand'

const TYPES = new Set(['header', 'heading', 'text', 'image', 'button', 'products', 'coupon', 'divider', 'spacer', 'social', 'columns', 'video', 'menu', 'footer'])
export const MAX_BLOCKS = 60
export const MAX_DESIGN_BYTES = 200_000

const s = (v: unknown, max: number) => String(v ?? '').slice(0, max)

/** Keep only known blocks and fields, with lengths capped. */
export function cleanDesign(raw: any): EmailDesign {
  const blocks: Block[] = []
  for (const b of Array.isArray(raw?.blocks) ? raw.blocks.slice(0, MAX_BLOCKS) : []) {
    if (!b || !TYPES.has(b.type)) continue
    const id = s(b.id, 40) || Math.random().toString(36).slice(2, 10)
    const align = b.align === 'center' ? 'center' : 'left'
    switch (b.type) {
      case 'header': blocks.push({ id, type: 'header', showLogo: b.showLogo !== false, showName: b.showName !== false, align: b.align === 'left' ? 'left' : 'center' }); break
      case 'heading': blocks.push({ id, type: 'heading', text: s(b.text, 300), size: b.size === 'md' ? 'md' : 'lg', align }); break
      case 'text': blocks.push({ id, type: 'text', text: s(b.text, 5000), align }); break
      case 'image': blocks.push({ id, type: 'image', src: s(b.src, 2000), alt: s(b.alt, 200), url: s(b.url, 2000), width: Number(b.width) || undefined }); break
      case 'button': blocks.push({ id, type: 'button', label: s(b.label, 80), url: s(b.url, 2000), color: /^#[0-9a-f]{6}$/i.test(b.color || '') ? b.color : undefined, align }); break
      case 'products': blocks.push({ id, type: 'products', buttonLabel: s(b.buttonLabel || 'Shop now', 40), items: (Array.isArray(b.items) ? b.items : []).slice(0, 8).map((p: any) => ({ name: s(p?.name, 120), price: s(p?.price, 40), image: s(p?.image, 2000), url: s(p?.url, 2000) })) }); break
      case 'coupon': blocks.push({ id, type: 'coupon', code: s(b.code, 60), title: s(b.title, 100), note: s(b.note, 200) }); break
      case 'divider': blocks.push({ id, type: 'divider' }); break
      case 'spacer': blocks.push({ id, type: 'spacer', height: Math.max(8, Math.min(80, Number(b.height) || 24)) }); break
      case 'social': blocks.push({ id, type: 'social', links: (Array.isArray(b.links) ? b.links : []).slice(0, 8).map((l: any) => ({ network: s(l?.network, 20) as any, url: s(l?.url, 2000) })) }); break
      case 'columns': blocks.push({ id, type: 'columns', items: (Array.isArray(b.items) ? b.items : []).slice(0, 2).map((c: any) => ({ image: s(c?.image, 2000), alt: s(c?.alt, 200), title: s(c?.title, 120), text: s(c?.text, 1200), label: s(c?.label, 60), url: s(c?.url, 2000) })) }); break
      case 'video': blocks.push({ id, type: 'video', url: s(b.url, 2000), thumbnail: s(b.thumbnail, 2000), label: s(b.label, 60) }); break
      case 'menu': blocks.push({ id, type: 'menu', links: (Array.isArray(b.links) ? b.links : []).slice(0, 6).map((l: any) => ({ label: s(l?.label, 40), url: s(l?.url, 2000) })) }); break
      case 'footer': blocks.push({ id, type: 'footer', address: b.address == null ? undefined : s(b.address, 300), note: s(b.note, 400) }); break
    }
  }
  const one = <T extends string>(v: any, allowed: readonly T[]): T | undefined => (allowed.includes(v) ? v : undefined)
  return {
    version: 1,
    accent: /^#[0-9a-f]{6}$/i.test(raw?.accent || '') ? raw.accent : undefined,
    background: /^#[0-9a-f]{6}$/i.test(raw?.background || '') ? raw.background : undefined,
    font: one(raw?.font, ['modern', 'classic', 'friendly', 'clean'] as const),
    corners: one(raw?.corners, ['sharp', 'soft', 'round'] as const),
    buttonStyle: one(raw?.buttonStyle, ['filled', 'outline'] as const),
    buttonShape: one(raw?.buttonShape, ['rounded', 'pill'] as const),
    blocks,
  }
}

export type SaveInput = { id?: string | null; campaignId?: string | null; name?: string; subject?: string; previewText?: string; design: any; userId?: string | null }

export async function saveDesign(db: any, companyId: string, input: SaveInput): Promise<{ ok: true; row: any } | { ok: false; error: string; status: number }> {
  if (JSON.stringify(input.design || {}).length > MAX_DESIGN_BYTES) return { ok: false, error: 'This email is too large to save. Remove some blocks.', status: 413 }
  const design = cleanDesign(input.design)
  const loaded = await loadEmailBrand(db, companyId)
  if (!loaded) return { ok: false, error: 'Company not found', status: 404 }
  const subject = s(input.subject, 250).replace(/[\r\n]+/g, ' ')
  const previewText = s(input.previewText, 250).replace(/[\r\n]+/g, ' ')
  const { html, text } = renderEmail(design, loaded.brand, { subject, previewText })
  if (input.campaignId) {
    const { data: c } = await db.from('campaigns').select('id, company_id, status').eq('id', input.campaignId).eq('company_id', companyId).maybeSingle()
    if (!c) return { ok: false, error: 'Campaign not found', status: 404 }
    if (['sending', 'sent'].includes(c.status)) return { ok: false, error: 'This campaign has already been sent, so its email can’t change.', status: 409 }
  }
  const now = new Date().toISOString()
  const row: any = { company_id: companyId, name: s(input.name || 'Untitled email', 120) || 'Untitled email', subject, preview_text: previewText, design, html, text, updated_at: now }
  if (input.campaignId) row.campaign_id = input.campaignId
  let res
  if (input.id) {
    res = await db.from('email_designs').update(row).eq('id', input.id).eq('company_id', companyId).select('*').maybeSingle()
    if (!res.error && !res.data) return { ok: false, error: 'Design not found', status: 404 }
  } else {
    res = await db.from('email_designs').insert({ ...row, created_by: input.userId || null, created_at: now }).select('*').maybeSingle()
  }
  if (res.error) return isMissingTable(res.error)
    ? { ok: false, error: 'Saving emails is waiting on a database update (V396).', status: 503 }
    : { ok: false, error: /duplicate|unique/i.test(res.error.message || '') ? 'That campaign already has an email.' : 'Couldn’t save the email.', status: 500 }
  return { ok: true, row: res.data }
}
