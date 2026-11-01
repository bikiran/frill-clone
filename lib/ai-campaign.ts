// Colvy AI campaign builder (server only): one sentence from the business
// ("20% off tropical fish this weekend") becomes a ready-to-review campaign:
// who it goes to, the text and/or the email, which products to feature, and
// when to send it. Follow-up requests ("shorter", "more playful") rework it.
//
// What the model sees: the business, today's date, how its recent campaigns
// did (so it can lean on what worked), the audiences it can choose from, and
// store products matching the request (so it features real ones, never made
// up). What it returns is checked before anyone sees it:
//   • the audience must be one the campaign editor can open, else everyone
//     who can get marketing;
//   • links only go to the business's website, a featured product or a link
//     the business typed; an SMS uses {{short_link}} (tracked per person);
//   • a coupon code appears only if the business gave one (a code the store
//     doesn't have would let customers down);
//   • every text says how to opt out, and texts aren't scheduled in quiet
//     hours (before 9 am or after 8 pm).
// Nothing is created or sent here: the browser makes the draft from the plan
// and the business reviews it in the campaign editor.

import Anthropic from '@anthropic-ai/sdk'
import { modelFor, trackAi } from '@/lib/ai-models'
import { audienceFilterProblem, type AudienceFilter } from '@/lib/campaign-audience-rules'
import { newId } from '@/components/EmailDesigner/templates'
import type { Block, EmailBrand, EmailDesign } from '@/components/EmailDesigner/types'

export type AiChannel = 'sms' | 'email' | 'both'
export type AiProduct = { id: string; name: string; price: string; image: string; url: string }
export type AiPlan = {
  reply: string
  name: string
  campaignType: string
  audience: { filter: AudienceFilter; label: string; why: string }
  send: { day: string; time: string; why: string }
  products: AiProduct[]
  sms: { message: string; attachment: any | null } | null
  email: { subject: string; previewText: string; design: EmailDesign } | null
  tips: string[]
}
export type PastCampaign = { id: string; name: string; channel: string; clickRate: number; revenue: number; sent: number; message?: string | null }
export type BuildInput = {
  prompt: string
  channel: AiChannel
  brand: EmailBrand & { industry?: string | null }
  past: PastCampaign[]
  products: AiProduct[]
  /** For a follow-up: the plan as it stands and what to change. */
  previous?: AiPlan | null
  change?: string | null
  now?: Date
  timezone?: string
}

export const CAMPAIGN_TYPES = ['promotion', 'new_arrivals', 'product_launch', 'event', 'review_request', 'follow_up', 'service_announcement', 'general_update'] as const
const AUDIENCES = ['all_subscribed', 'segment', 'lapsed', 'purchased_category', 'clicked_campaign', 'abandoned_checkout'] as const
const SEGMENTS = ['Champions', 'Loyal Customers', 'Potential Loyalists', 'At Risk', 'Lost']
const DAYS = ['today', 'tomorrow', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const
const BLOCK_TYPES = ['heading', 'text', 'button', 'products', 'coupon', 'divider'] as const
const SMS_TAGS = ['first_name', 'store_name', 'outlet', 'short_link']
const EMAIL_TAGS = ['first_name', 'store_name', 'outlet', 'unsubscribe_url', 'preferences_url', 'open_pixel_url']

const str = { type: 'string' }
const SCHEMA = {
  type: 'object',
  properties: {
    reply: str,
    name: str,
    campaign_type: { type: 'string', enum: [...CAMPAIGN_TYPES] },
    audience: {
      type: 'object',
      properties: {
        type: { type: 'string', enum: [...AUDIENCES] },
        segment: str, lapsed_days: { type: 'integer' }, product_query: str, campaign_id: str, why: str,
      },
      required: ['type', 'segment', 'lapsed_days', 'product_query', 'campaign_id', 'why'],
      additionalProperties: false,
    },
    send: {
      type: 'object',
      properties: { day: { type: 'string', enum: [...DAYS] }, time: str, why: str },
      required: ['day', 'time', 'why'],
      additionalProperties: false,
    },
    product_ids: { type: 'array', items: str },
    sms_message: str,
    email: {
      type: 'object',
      properties: {
        subject: str, preview_text: str,
        blocks: {
          type: 'array',
          items: {
            type: 'object',
            properties: { type: { type: 'string', enum: [...BLOCK_TYPES] }, text: str, label: str, url: str, code: str, offer: str },
            required: ['type', 'text', 'label', 'url', 'code', 'offer'],
            additionalProperties: false,
          },
        },
      },
      required: ['subject', 'preview_text', 'blocks'],
      additionalProperties: false,
    },
    tips: { type: 'array', items: str },
  },
  required: ['reply', 'name', 'campaign_type', 'audience', 'send', 'product_ids', 'sms_message', 'email', 'tips'],
  additionalProperties: false,
}

const SYSTEM = `You are Colvy AI, building a marketing campaign for a small business from what the owner asks for. You return the whole campaign as JSON in the given schema.

Write like a friendly local shop, in Australian English. Plain words, no hype, no ALL CAPS, at most one exclamation mark, no emoji unless asked.

TEXT MESSAGE (sms_message; empty string when the channel is email only):
- Aim for 160 characters or fewer (one text), never more than 300. Plain characters only: straight quotes and apostrophes, hyphens not dashes, no emoji.
- Say who it's from early ({{store_name}} or the business name).
- One clear offer or reason, one call to action.
- If there's something to look at (a product, the shop, a page), put {{short_link}} once where the link goes. Never write a web address.
- End with "Reply STOP to opt out".
- Merge tags you can use: {{first_name}}, {{store_name}}, {{short_link}}. Nothing else.

EMAIL (email; subject, preview text and blocks empty when the channel is sms only):
- Subject: about 45 characters, specific and inviting, no clickbait. Preview text: about 90 characters that add to the subject, not repeat it.
- Blocks, in order: a heading; one or two short text blocks (2–3 sentences each, start with "Hi {{first_name|there}}," in the first); a products block if products were picked; a button; optionally a divider. The logo header and the footer are added for you.
- Text blocks can use **bold** and _italic_. Merge tags: {{first_name|there}}, {{store_name}}.
- Button: a short label ("Shop the sale"). Its url must be the business website, a picked product's url, or a link the owner gave. Leave url empty if none fits.
- Coupon block: ONLY if the owner gave a coupon code; put that exact code in "code" and the offer in "offer" (e.g. "20% off"). Never invent a code; describe the offer in words instead.
- Unused fields in a block are empty strings.

AUDIENCE: pick who should get it, and say why in one short sentence.
- all_subscribed: everyone who can get marketing. The safe choice for broad news and sales.
- segment: one of Champions, Loyal Customers, Potential Loyalists, At Risk, Lost (best customers down to lapsed ones). Good for VIP early access (Champions, Loyal Customers) or win-backs (At Risk, Lost).
- lapsed: haven't ordered in lapsed_days days (60–365). Good for "we miss you".
- purchased_category: bought something matching product_query (one word or short phrase, like "betta" or "plants"). Good for refills, accessories and related new stock.
- clicked_campaign: clicked a link in one of the recent campaigns listed (campaign_id from the list). Good for a follow-up to people who showed interest.
- abandoned_checkout: left a checkout unfinished. Only for cart reminders.
Unused audience fields: empty string or 0.

PRODUCTS: if store products are listed and fit the request, pick up to 3 (product_ids from the list) to feature. Never mention a product that isn't listed by name unless the owner did.

WHEN: suggest a day and time (24-hour "HH:MM", local time) and why in one short sentence. Texts go between 10:00 and 19:30. A weekend sale is best announced Thursday evening or Friday. Emails do well mid-morning on weekdays. "today" only if there's time left today.

NAME: a short internal name for the campaign, like "Weekend fish sale".
REPLY: one or two friendly sentences to the owner about what you built and why (or, for a change request, what you changed). Mention if you leaned on one of their past campaigns.
TIPS: up to 3 short, specific suggestions to make it work better (e.g. "Create the code FISH20 in your store before sending"). No generic advice.

If the request is unclear, still build a sensible campaign and say what you assumed in the reply. If a change is asked for, keep everything else as it was.`

const pad = (n: number) => String(n).padStart(2, '0')
const clip = (s: unknown, n: number) => String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, n)

/** Store products whose names share a word with the request: real ones for the model to feature. */
export async function productCandidates(db: any, companyId: string, prompt: string): Promise<AiProduct[]> {
  const STOP = new Set(['this', 'that', 'with', 'from', 'your', 'their', 'have', 'week', 'weekend', 'sale', 'sales', 'customers', 'customer', 'everyone', 'people', 'campaign', 'email', 'text', 'message', 'send', 'about', 'some', 'when', 'what', 'they', 'them', 'will', 'just', 'only', 'more', 'less', 'than', 'into', 'over', 'free', 'days', 'today', 'tomorrow', 'store', 'shop', 'stock', 'landed', 'arrived', 'new'])
  const words = [...new Set(String(prompt).toLowerCase().match(/[a-z]{4,}/g) || [])].filter(w => !STOP.has(w)).slice(0, 5)
  if (!words.length) return []
  const stems = words.map(w => w.replace(/(ies|es|s)$/, ''))
  try {
    const { data, error } = await db.from('woocommerce_products')
      .select('woo_product_id, name, price, regular_price, sale_price, on_sale, stock_status, image, permalink')
      .eq('company_id', companyId)
      .or(stems.map(w => `name.ilike.%${w.replace(/[%,()]/g, '')}%`).join(','))
      .limit(60)
    if (error || !data) return []
    return (data as any[])
      .filter(p => p.stock_status !== 'outofstock' && p.permalink && p.name)
      .map(p => ({ p, score: stems.filter(w => String(p.name).toLowerCase().includes(w)).length + (p.on_sale ? 0.5 : 0) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 12)
      .map(({ p }) => ({
        id: String(p.woo_product_id), name: clip(p.name, 120),
        price: Number(p.price) ? `$${Number(p.price).toFixed(2).replace(/\.00$/, '')}` : '',
        image: typeof p.image === 'string' ? p.image : p.image?.src || '', url: String(p.permalink),
      }))
  } catch { return [] }
}

/** The day, date and time in the business's time zone, for "this weekend" and "today". */
function localNow(now: Date, timezone: string) {
  const f = new Intl.DateTimeFormat('en-AU', { timeZone: timezone, weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', hour: 'numeric', minute: '2-digit' })
  return f.format(now)
}

/** The context the model works from. */
export function buildContext(input: BuildInput): string {
  const b = input.brand
  const lines = [
    `BUSINESS\nName: ${b.name}\nIndustry: ${b.industry || 'retail'}\nWebsite: ${b.website || 'none'}`,
    `NOW\n${localNow(input.now || new Date(), input.timezone || 'Australia/Melbourne')} (${input.timezone || 'Australia/Melbourne'})`,
    `CHANNEL\n${input.channel === 'both' ? 'Both: write the text message AND the email.' : input.channel === 'sms' ? 'Text message only.' : 'Email only.'}`,
  ]
  if (input.past.length) {
    lines.push(`RECENT CAMPAIGNS (click rate = people who clicked, of people reached)\n${input.past.map(p =>
      `- id ${p.id}: "${clip(p.name, 80)}" (${p.channel === 'email' ? 'email' : 'text'}, sent to ${p.sent}, ${p.clickRate}% clicked, $${Math.round(p.revenue)} in orders)${p.message ? ` text: "${clip(p.message, 200)}"` : ''}`).join('\n')}`)
  } else lines.push('RECENT CAMPAIGNS\nNone yet: this is their first.')
  lines.push(input.products.length
    ? `STORE PRODUCTS MATCHING THE REQUEST (in stock)\n${input.products.map(p => `- id ${p.id}: ${p.name}${p.price ? ` (${p.price})` : ''}`).join('\n')}`
    : 'STORE PRODUCTS\nNone matched the request.')
  return lines.join('\n\n')
}

/** Model output → a checked plan (pure, for tests). */
export function normalisePlan(raw: any, input: BuildInput): AiPlan {
  const prompt = `${input.prompt}\n${input.change || ''}`
  const website = input.brand.website || ''
  const products = (Array.isArray(raw?.product_ids) ? raw.product_ids : []).map(String)
    .map((id: string) => input.products.find(p => p.id === id)).filter(Boolean).slice(0, 3) as AiProduct[]
  const promptUrls = (prompt.match(/https?:\/\/[^\s<>"')]+/g) || []).map(u => u.replace(/[.,!?]+$/, ''))
  const allowedUrl = (u: string) => {
    const url = String(u || '').trim()
    if (!/^https?:\/\//i.test(url)) return ''
    const norm = (x: string) => x.replace(/\/+$/, '').toLowerCase()
    const ok = [website, ...products.map(p => p.url), ...promptUrls].filter(Boolean).some(a => norm(url) === norm(a) || (website && norm(url).startsWith(norm(website) + '/')))
    return ok ? url : ''
  }
  // Codes the business gave ("code SPRING15", "coupon: FISH20").
  const codes = [...prompt.matchAll(/\b(?:code|coupon)\s*:?\s*([A-Za-z0-9][A-Za-z0-9_-]{2,23})\b/gi)].map(m => m[1].toUpperCase()).filter(c => !['IS', 'FOR', 'THE'].includes(c))
  const wantSms = input.channel !== 'email', wantEmail = input.channel !== 'sms'

  // Audience: one the editor can open, else everyone who can get marketing.
  const a = raw?.audience || {}
  let filter: AudienceFilter = { type: 'all_subscribed' }
  if (a.type === 'segment' && SEGMENTS.includes(a.segment)) filter = { type: 'segment', segment: a.segment }
  else if (a.type === 'lapsed') filter = { type: 'lapsed', lapsedDays: Math.min(730, Math.max(30, Math.round(Number(a.lapsed_days) || 90))) }
  else if (a.type === 'purchased_category' && clip(a.product_query, 60)) filter = { type: 'purchased_category', productQuery: clip(a.product_query, 60) }
  else if (a.type === 'clicked_campaign' && input.past.some(p => p.id === a.campaign_id)) filter = { type: 'clicked_campaign', campaignId: a.campaign_id }
  else if (a.type === 'abandoned_checkout') filter = { type: 'abandoned_checkout' }
  if (audienceFilterProblem(filter)) filter = { type: 'all_subscribed' }
  const pastName = (id?: string) => input.past.find(p => p.id === id)?.name || 'a recent campaign'
  const label = filter.type === 'segment' ? `${filter.segment}`
    : filter.type === 'lapsed' ? `Haven’t ordered in ${filter.lapsedDays} days`
    : filter.type === 'purchased_category' ? `Bought “${filter.productQuery}”`
    : filter.type === 'clicked_campaign' ? `Clicked “${pastName(filter.campaignId)}”`
    : filter.type === 'abandoned_checkout' ? 'Left a checkout unfinished'
    : 'Everyone who can get marketing'

  // When: a known day and a real time; texts outside quiet hours.
  const s = raw?.send || {}
  const day = (DAYS as readonly string[]).includes(s.day) ? s.day : 'tomorrow'
  let [h, m] = String(s.time || '').split(':').map(Number)
  if (!Number.isFinite(h) || h < 0 || h > 23) h = 10
  if (!Number.isFinite(m) || m < 0 || m > 59) m = 0
  m = Math.round(m / 15) * 15; if (m === 60) { m = 0; h = Math.min(23, h + 1) }
  if (wantSms) { if (h < 10) { h = 10; m = 0 } if (h > 19 || (h === 19 && m > 30)) { h = 19; m = 30 } }

  // Text message.
  let sms: AiPlan['sms'] = null
  if (wantSms) {
    let text = String(raw?.sms_message || '').trim()
      .replace(/https?:\/\/[^\s]+/g, '{{short_link}}')
      .replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/[–—]/g, '-').replace(/…/g, '...')
      .replace(/\{\{\s*(\w+)\s*(?:\|[^}]*)?\}\}/g, (all, tag) => (SMS_TAGS.includes(tag) ? `{{${tag}}}` : ''))
    // One link at most.
    let seen = false
    text = text.replace(/\{\{short_link\}\}/g, () => (seen ? '' : ((seen = true), '{{short_link}}'))).replace(/\s{2,}/g, ' ').trim()
    if (!/\bSTOP\b/i.test(text)) text = `${text.replace(/[\s.]*$/, '')}. Reply STOP to opt out`
    let attachment: any = null
    if (/\{\{short_link\}\}/.test(text)) {
      if (products[0]) attachment = { kind: 'product', id: products[0].id, label: products[0].name, url: products[0].url, price: products[0].price }
      else if (website) attachment = { kind: 'external', label: `${input.brand.name} website`, url: website }
      else text = text.replace(/\s*\{\{short_link\}\}\s*/g, ' ').trim()
    }
    sms = { message: text.slice(0, 480), attachment }
  }

  // Email.
  let email: AiPlan['email'] = null
  if (wantEmail) {
    const e = raw?.email || {}
    const cleanTags = (t: string) => String(t || '').replace(/\{\{\s*(\w+)\s*(\|[^}]*)?\}\}/g, (all, tag, fb) => (EMAIL_TAGS.includes(tag) ? `{{${tag}${fb || ''}}}` : ''))
    const blocks: Block[] = [{ id: newId(), type: 'header', showLogo: true, showName: true, align: 'center' }]
    let addedProducts = false
    for (const b of Array.isArray(e.blocks) ? e.blocks.slice(0, 10) : []) {
      if (b?.type === 'heading' && clip(b.text, 120)) blocks.push({ id: newId(), type: 'heading', text: cleanTags(clip(b.text, 120)), align: 'left' })
      else if (b?.type === 'text' && String(b.text || '').trim()) blocks.push({ id: newId(), type: 'text', text: cleanTags(String(b.text).trim().slice(0, 1200)) })
      else if (b?.type === 'button') {
        const url = allowedUrl(b.url) || (products.length === 1 ? products[0].url : '') || website
        if (url && clip(b.label, 40)) blocks.push({ id: newId(), type: 'button', label: clip(b.label, 40), url, align: 'center' })
      } else if (b?.type === 'products' && products.length && !addedProducts) {
        addedProducts = true
        blocks.push({ id: newId(), type: 'products', items: products.map(p => ({ name: p.name, price: p.price, image: p.image, url: p.url })), buttonLabel: clip(b.label, 30) || 'Shop now' })
      } else if (b?.type === 'coupon') {
        const code = String(b.code || '').trim().toUpperCase()
        if (code && codes.includes(code)) blocks.push({ id: newId(), type: 'coupon', code, offer: clip(b.offer, 40), title: 'Your code', label: 'Shop now', url: website || products[0]?.url || '' })
      } else if (b?.type === 'divider') blocks.push({ id: newId(), type: 'divider' })
    }
    // Products picked but no block for them: show them before the button.
    if (products.length && !addedProducts) {
      const at = blocks.findIndex(b => b.type === 'button')
      const pb: Block = { id: newId(), type: 'products', items: products.map(p => ({ name: p.name, price: p.price, image: p.image, url: p.url })), buttonLabel: 'Shop now' }
      if (at > 0) blocks.splice(at, 0, pb); else blocks.push(pb)
    }
    if (!blocks.some(b => b.type === 'text')) blocks.push({ id: newId(), type: 'text', text: `Hi {{first_name|there}},\n\n${clip(input.prompt, 400)}` })
    blocks.push({ id: newId(), type: 'footer' })
    email = {
      subject: cleanTags(clip(e.subject, 90)) || clip(raw?.name, 60) || `News from ${input.brand.name}`,
      previewText: cleanTags(clip(e.preview_text, 150)),
      design: { version: 1, blocks },
    }
  }

  return {
    reply: clip(raw?.reply, 400) || 'Here’s a campaign to start from.',
    name: clip(raw?.name, 80) || clip(input.prompt, 60) || 'New campaign',
    campaignType: (CAMPAIGN_TYPES as readonly string[]).includes(raw?.campaign_type) ? raw.campaign_type : 'promotion',
    audience: { filter, label, why: clip(a.why, 200) },
    send: { day, time: `${pad(h)}:${pad(m)}`, why: clip(s.why, 200) },
    products,
    sms, email,
    tips: (Array.isArray(raw?.tips) ? raw.tips : []).map((t: any) => clip(t, 160)).filter(Boolean).slice(0, 3),
  }
}

/** The plan as the model should see it for a follow-up (compact). */
function planForModel(p: AiPlan) {
  return {
    name: p.name, campaign_type: p.campaignType,
    audience: { ...p.audience.filter, why: p.audience.why },
    send: p.send, product_ids: p.products.map(x => x.id),
    sms_message: p.sms?.message || '',
    email: p.email ? {
      subject: p.email.subject, preview_text: p.email.previewText,
      blocks: p.email.design.blocks.filter(b => !['header', 'footer'].includes(b.type)).map((b: any) => ({ type: b.type, text: b.text || '', label: b.label || b.buttonLabel || '', url: b.url || '', code: b.code || '', offer: b.offer || '' })),
    } : null,
  }
}

export type CreateFn = (params: any) => Promise<any>

/** Ask the model for a plan and check it. */
export async function buildCampaignPlan(input: BuildInput, opts: { companyId?: string | null; create?: CreateFn } = {}): Promise<{ ok: boolean; plan?: AiPlan; error?: string }> {
  const context = buildContext(input)
  const messages: any[] = [{ role: 'user', content: `${context}\n\n---\n\nREQUEST\n${clip(input.prompt, 2000)}` }]
  if (input.previous && input.change) {
    messages.push({ role: 'assistant', content: JSON.stringify(planForModel(input.previous)) })
    messages.push({ role: 'user', content: `CHANGE\n${clip(input.change, 1000)}\n\nReturn the whole campaign again with this change, keeping the rest. Channel: ${input.channel}.` })
  }
  try {
    const create: CreateFn = opts.create || ((params: any) => new Anthropic().beta.messages.create(params))
    const response = await create({
      model: await modelFor('campaign_builder'),
      max_tokens: 8000,
      // Someone is watching; a change request is quicker still.
      output_config: { effort: input.change ? 'low' : 'medium', format: { type: 'json_schema', schema: SCHEMA } },
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      system: SYSTEM,
      messages,
    })
    await trackAi('campaign_builder', opts.companyId || null, response)
    if (response.stop_reason === 'refusal') return { ok: false, error: 'Colvy AI can’t help with that one. Try describing the campaign differently.' }
    if (response.stop_reason === 'max_tokens') return { ok: false, error: 'That came out too long. Try a simpler request.' }
    const text = (response.content || []).filter((b: any) => b.type === 'text').map((b: any) => b.text).join('')
    let raw: any
    try { raw = JSON.parse(text) } catch { return { ok: false, error: 'Colvy AI returned something unexpected. Please try again.' } }
    return { ok: true, plan: normalisePlan(raw, input) }
  } catch (e: any) {
    console.error('[ai-campaign]', e?.message || e)
    return { ok: false, error: 'Colvy AI is busy right now. Please try again in a moment.' }
  }
}
