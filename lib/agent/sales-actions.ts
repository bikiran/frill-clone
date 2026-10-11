// Sales Agent actions (Phase 8): follow up an abandoned cart with a personal
// message instead of a fixed template.
//
// A run is tied to ONE cart (run.input.cartId). The message goes out exactly
// like Colvy's cart message — posted in their conversation, delivered by SMS
// (else email) — and only if the cart is still abandoned, they haven't bought
// since, they haven't opted out, and it's within sending hours.

import { cartPrecheck, cartLink, deliverCartMessage } from '@/lib/cart-recovery'
import { resolveCartRecovery, cartItemsText } from '@/lib/cart-recovery-shared'
import { isWithinSendingHours } from '@/lib/campaign-sender'
import type { ActionContext, ActionDef, JsonSchema, PolicyLimits } from './types'

const obj = (properties: Record<string, any>, required: string[] = []): JsonSchema => ({ type: 'object', properties, required, additionalProperties: false })

async function theCart(ctx: ActionContext) {
  const input = ctx.scratch.runInput || {}
  if (input.cartId) {
    const { data } = await ctx.db.from('abandoned_carts').select('id, name, email, phone, items, total, currency, cart_url, coupon, status, conversation_id, created_at, updated_at')
      .eq('company_id', ctx.companyId).eq('id', input.cartId).maybeSingle()
    if (data) return data
  }
  if (ctx.mode === 'sandbox' && input.items) {
    return { id: null, name: input.name || 'Sam', email: null, phone: null, items: input.items, total: input.total ?? null, currency: 'AUD', cart_url: 'https://example.com/cart', coupon: null, status: 'abandoned', conversation_id: null, created_at: new Date(Date.now() - 3600_000).toISOString(), updated_at: new Date(Date.now() - 3600_000).toISOString() }
  }
  return null
}

export const getCart: ActionDef = {
  key: 'get_cart',
  description: 'The abandoned cart you’re following up: what’s in it, the total, when they left, the checkout link, and whether they’ve since bought or opted out.',
  input: obj({}),
  category: 'read', risk: 'low', maxAutonomy: 'autonomous', customerSafe: true,
  async run(ctx) {
    const cart = await theCart(ctx)
    if (!cart) return { ok: false, error: 'This run has no cart.' }
    ctx.scratch.cart = cart
    const pre = cart.id ? await cartPrecheck(ctx.db, ctx.companyId, cart) : { ok: true }
    const items = (Array.isArray(cart.items) ? cart.items : []).slice(0, 12).map((i: any) => ({ name: i?.name || i?.product_name || 'Item', qty: Number(i?.quantity) || 1, price: i?.price != null ? Number(i.price) : null, sku: i?.sku || null }))
    ctx.scratch.cartOk = pre.ok && cart.status === 'abandoned'
    return {
      ok: true,
      data: {
        firstName: String(cart.name || '').trim().split(/\s+/)[0] || null,
        items, summary: cartItemsText(cart.items), total: cart.total != null ? `${Number(cart.total).toFixed(2)} ${cart.currency || 'AUD'}` : null,
        leftAt: cart.updated_at, hasCheckoutLink: !!cart.cart_url, couponTried: cart.coupon || null,
        stillAbandoned: cart.status === 'abandoned', canMessage: !!pre.ok, ...(pre.ok ? {} : { whyNot: (pre as any).reason }),
      },
      entityType: 'cart', entityId: cart.id || undefined,
      summary: `${cartItemsText(cart.items)}${cart.total != null ? ` · $${Number(cart.total).toFixed(2)}` : ''}`,
    }
  },
}

async function sendingHoursOk(ctx: ActionContext) {
  const { data: co } = await ctx.db.from('companies').select('order_chat_automation').eq('id', ctx.companyId).maybeSingle()
  const s = resolveCartRecovery(co?.order_chat_automation?.cart_recovery)
  return isWithinSendingHours(new Date(), s.timezone)
}

async function sendOnItsOwn(ctx: ActionContext, args: any, _limits: PolicyLimits): Promise<string | null> {
  if (!ctx.scratch.cart) return 'It didn’t read the cart first, so a person approves the message.'
  if (!ctx.scratch.cartOk) return 'The cart was bought, dismissed or the customer opted out — a person decides.'
  if (ctx.scratch.escalated) return 'It also handed this to the team, so a person approves the message.'
  if (/\d{1,2}\s?%|\b(discount|coupon|promo|voucher|free (shipping|delivery|postage))/i.test(String(args?.text || ''))) return 'The message offers a discount or deal, so a person approves it.'
  if (!(await sendingHoursOk(ctx))) return 'It’s outside sending hours, so a person sends it later.'
  return null
}

export const sendCartFollowup: ActionDef = {
  key: 'send_cart_followup',
  description: 'Send the shopper your follow-up about their cart (SMS, else email). Plain text, 1–3 short sentences. Put {link} where their checkout link should go. Never offer discounts unless the business’s rules say you may. “Reply STOP to opt out.” is added for you.',
  input: obj({ text: { type: 'string', description: 'The message, with {link} for their checkout link.' } }, ['text']),
  category: 'communicate', risk: 'medium', maxAutonomy: 'act_within_limits', customerSafe: true,
  autoCheck: sendOnItsOwn,
  async run(ctx, args) {
    const cart = ctx.scratch.cart || await theCart(ctx)
    if (!cart?.id) return { ok: false, error: 'This run has no cart.' }
    return sendForCart(ctx.db, ctx.companyId, cart, String(args?.text || ''), ctx.siteOrigin, { agent_run_id: ctx.runId, agent_name: 'Sales Agent' })
  },
}

/** Fill {link}, add the opt-out line, re-check the cart, and deliver. Shared with approvals. */
export async function sendForCart(db: any, companyId: string, cart: any, raw: string, origin: string, meta: Record<string, any>) {
  const body = raw.trim().slice(0, 900)
  if (!body) return { ok: false, error: 'Nothing to send.' }
  const { data: fresh } = await db.from('abandoned_carts').select('status').eq('id', cart.id).maybeSingle()
  if (fresh && fresh.status !== 'abandoned') return { ok: false, error: `The cart is ${fresh.status} now — nothing sent.` }
  const pre = await cartPrecheck(db, companyId, cart)
  if (!pre.ok) return { ok: false, error: `Not sent: ${pre.reason}.` }
  const link = await cartLink(cart, companyId, pre.conv.id)
  let text = body.includes('{link}') ? body.replace(/\{link\}/g, link || '') : (link ? `${body} ${link}` : body)
  if (!/reply stop/i.test(text)) text = `${text}\nReply STOP to opt out.`
  const { data: co } = await db.from('companies').select('name').eq('id', companyId).maybeSingle()
  const d = await deliverCartMessage(db, { companyId, business: co?.name || 'us', cart, conv: pre.conv, contact: pre.contact, text, origin, meta })
  await db.from('abandoned_carts').update(d.sent ? { recovery_channel: d.channel, recovery_error: null } : { recovery_channel: 'none', recovery_error: d.error || 'Not delivered' }).eq('id', cart.id)
  return d.sent
    ? { ok: true, data: { sent: true, channel: d.channel }, entityType: 'conversation', entityId: pre.conv.id, summary: `Followed up the cart by ${d.channel}` }
    : { ok: false, error: d.error || 'Not delivered.' }
}

/** For approvals: a person approved (or edited) the follow-up. */
export async function sendApprovedCartFollowup(db: any, companyId: string, run: any, text: string, user: { id: string | null; name: string | null }) {
  const { data: cart } = await db.from('abandoned_carts').select('id, name, email, phone, items, total, currency, cart_url, status, conversation_id, created_at, updated_at').eq('company_id', companyId).eq('id', run?.input?.cartId || '').maybeSingle()
  if (!cart) return { ok: false, error: 'This cart no longer exists.' }
  const r = await sendForCart(db, companyId, cart, text, process.env.NEXT_PUBLIC_SITE_URL || 'https://colvy.com', { agent_run_id: run.id, agent_name: 'Sales Agent', approved_by: user.name, approved_by_id: user.id })
  return r.ok ? { ok: true, channel: (r as any).data?.channel } : { ok: false, error: r.error }
}
