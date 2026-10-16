// add_to_waitlist: a customer asks to be told when something is back in stock,
// and the agent puts them on the back-in-stock waitlist (Waitlists page, one
// text when it's back) instead of leaving the team a task to remember.
//
// The customer is always this conversation's own contact — the model can't
// name anyone else. The product must resolve to one real catalogue product
// (lib/waitlist-add.ts): an id from check_stock or a close match the customer
// picked, or a name that is exactly one product's name. No confident match,
// and the action says so with the close matches, so the agent asks or falls
// back to create_task. Something in stock right now isn't waitlisted: the
// agent tells the customer instead.

import { resolveWaitlistProduct, addToWaitlist, waitlistRecipient, isInStock, type ProductMatch, type WaitlistProduct } from '@/lib/waitlist-add'
import { agentAddedBy } from '@/lib/waitlist-ai'
import { ACTIVITY_ROLES } from './record'
import type { ActionContext, ActionDef, ActionResult, JsonSchema } from './types'

const obj = (properties: Record<string, any>, required: string[] = []): JsonSchema => ({ type: 'object', properties, required, additionalProperties: false })
const money = (n: number | null) => (n != null ? `$${n % 1 ? n.toFixed(2) : n.toFixed(0)}` : null)

function matchList(matches: ProductMatch[]): string {
  return matches.slice(0, 5).map(m => `${m.name} (${m.inStock == null ? 'stock unknown' : m.inStock ? 'in stock' : 'out of stock'}${m.price != null ? `, ${money(m.price)}` : ''}; productId ${m.productId})`).join('; ')
}

function noMatchError(asked: string, matches: ProductMatch[], byId: boolean): string {
  const head = byId ? `That productId isn’t in the catalogue.` : `No catalogue product clearly matches “${asked}”.`
  return `${head} ${matches.length ? `Closest: ${matchList(matches)}.` : 'Nothing close either.'} Don’t add them to the waiting list for a guess: if they already picked one of these, call add_to_waitlist again with its productId; otherwise ask which one they mean, or create_task for the team with what they asked for and these close matches.`
}

function inStockData(p: WaitlistProduct) {
  return {
    added: false, inStock: true,
    product: { name: p.name, price: money(p.price), stockQty: p.stockQty, link: p.url },
    note: 'It’s in stock right now, so they weren’t added to the waiting list. Tell the customer they can order it now (price and link), with send_message topic “stock”.',
  }
}

/** The checks before adding (and before asking a person to approve it). */
async function prepare(ctx: Pick<ActionContext, 'db' | 'companyId' | 'contactId' | 'conversationId'>, args: any): Promise<{ error: string } | { inStock: WaitlistProduct } | { product: WaitlistProduct }> {
  if (!ctx.contactId && !ctx.conversationId) return { error: 'There’s no customer in this run to add to a waiting list.' }
  const asked = String(args?.product_name || '').trim()
  const r = await resolveWaitlistProduct(ctx.db, ctx.companyId, { productId: args?.product_id, variantId: args?.variant_id, name: asked })
  if ('matches' in r) return { error: noMatchError(asked, r.matches, r.reason === 'not_found') }
  if (isInStock(r.product)) return { inStock: r.product }
  return { product: r.product }
}

export const addToWaitlistAction: ActionDef = {
  key: 'add_to_waitlist',
  description: 'Put this customer on the back-in-stock waiting list for a product, so they get one text (or email) the moment it’s back. For “let me know when X is back / comes in”. Use the productId from check_stock (or a close match the customer picked). Only a real catalogue product that’s out of stock: it tells you when nothing clearly matches (with the close matches) or when it’s in stock now. The customer is always the one in this conversation.',
  input: obj({
    product_name: { type: 'string', description: 'The product’s name as the catalogue (check_stock) shows it — or exactly what the customer asked for if you have no productId.' },
    product_id: { type: 'string', description: 'The productId from check_stock or from a close match add_to_waitlist listed. Strongly preferred.' },
    variant_id: { type: 'string', description: 'A Shopify size/option id, if they asked for a specific one (optional).' },
    note: { type: 'string', description: 'A short note for the team, e.g. “wants 2, happy to pick up” (optional).' },
  }, ['product_name']),
  category: 'internal_write', risk: 'low', maxAutonomy: 'autonomous', customerSafe: true,
  async validate(ctx, args) {
    const p = await prepare(ctx, args)
    if ('error' in p) return p.error
    if ('inStock' in p) return `${p.inStock.name} is in stock right now (${money(p.inStock.price) || 'see the store'}), so there’s nothing to wait for — tell the customer they can order it.`
    const who = await waitlistRecipient(ctx.db, ctx.companyId, { contactId: ctx.contactId, conversationId: ctx.conversationId })
    return 'error' in who ? who.error : null
  },
  async describe(ctx, args) {
    const p = await prepare(ctx, args)
    const item = 'product' in p ? p.product.name : String(args?.product_name || 'a product')
    const { data: c } = ctx.contactId ? await ctx.db.from('contacts').select('name, phone').eq('company_id', ctx.companyId).eq('id', ctx.contactId).maybeSingle() : { data: null }
    return `Add ${c?.name || c?.phone || 'this customer'} to the waiting list for ${item}`
  },
  async run(ctx, args) {
    const p = await prepare(ctx, args)
    if ('error' in p) return { ok: false, error: p.error }
    if ('inStock' in p) return { ok: true, data: inStockData(p.inStock), summary: `Didn’t waitlist — ${p.inStock.name} is in stock` }
    return addFor(ctx.db, ctx.companyId, { runId: ctx.runId, roleName: ctx.roleName, contactId: ctx.contactId, conversationId: ctx.conversationId, siteOrigin: ctx.siteOrigin }, p.product, args)
  },
}

async function addFor(db: any, companyId: string, run: { runId: string; roleName: string; contactId: string | null; conversationId: string | null; siteOrigin?: string; approvedBy?: string | null }, product: WaitlistProduct, args: any): Promise<ActionResult> {
  const addedBy = agentAddedBy(run.roleName)
  const r = await addToWaitlist(db, {
    companyId, product, contactId: run.contactId, conversationId: run.conversationId,
    note: String(args?.note || '').trim() || 'Asked in their conversation to be told when it’s back.',
    source: 'ai_agent', addedBy, agentRunId: run.runId, createdBy: run.approvedBy || null, siteOrigin: run.siteOrigin,
  })
  if ('error' in r) return { ok: false, error: r.error }
  const first = String(r.customerName || '').split(/\s+/)[0] || 'The customer'
  if (!r.added) {
    return {
      ok: true, data: { added: false, alreadyWaiting: true, item: product.name, note: 'They were already on the waiting list for this. Tell them they’re on it and will hear the moment it’s back.' },
      summary: `${first} was already on the waiting list for ${product.name}`,
    }
  }
  return {
    ok: true,
    data: {
      added: true, item: product.name, notifyBy: r.notifyBy,
      note: r.notifyBy === 'sms'
        ? 'Done. Tell the customer they’re on the waiting list and will get a text as soon as it’s back in stock.'
        : `Done. Tell the customer they’re on the waiting list and will get an email as soon as it’s back in stock${r.smsOptedOut ? ' (they’ve opted out of texts, so don’t promise a text)' : ''}.`,
    },
    entityType: 'waitlist', entityId: r.entry?.id,
    summary: `Added ${first} to the waiting list for ${product.name}`,
  }
}

/** For approvals: a person approved adding them. Runs the frozen request, re-checked now. */
export async function runApprovedWaitlistAction(db: any, companyId: string, run: any, args: any, user: { id: string | null; name: string | null }): Promise<ActionResult> {
  const ctx = { db, companyId, contactId: run.contact_id || null, conversationId: run.conversation_id || null }
  const p = await prepare(ctx, args)
  if ('error' in p) return { ok: false, error: p.error }
  if ('inStock' in p) return { ok: false, error: `${p.inStock.name} is back in stock now, so there’s nothing to wait for.` }
  return addFor(db, companyId, { runId: run.id, roleName: ACTIVITY_ROLES[run.role_key] || 'agent', contactId: ctx.contactId, conversationId: ctx.conversationId, approvedBy: user.id }, p.product, args)
}
