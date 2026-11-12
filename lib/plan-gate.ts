// What the Inbox plans (Inbox, Everything, plus trials, legacy Pro and
// Enterprise) unlock, and the server checks that lock it for the plans below
// them (Free, Feedback and Business number).
//
//   inbox            live chat widget, email, Instagram and Messenger
//   campaigns        email and SMS broadcasts
//   reviewDashboard  Google reviews and social engagement
//   ecommerceSync    WooCommerce, Shopify and Prexty orders
//   aiAutomation     automatic replies and time savers
//
// How a lock behaves (the owner's choice): customers' messages on a locked
// channel still arrive and show in the inbox, so nothing is lost; replying,
// connecting a channel or sending a campaign asks the business to upgrade
// (HTTP 402 with `upgrade: true` and these words). The website chat widget
// hides on a locked workspace, so visitors can't start a chat nobody can answer.
//
// Workspaces that already used one of these before the lock keep it: a one-off
// grant in company_entitlements (V433), which a super admin can remove there.
//
// A check that can't read the plan (the database is down) lets the action
// through: a paying business is never locked out of replying by an outage.

import { canAccess, effectivePlan, type Plan } from './plan'

export type GatedFeature = 'inbox' | 'campaigns' | 'reviewDashboard' | 'ecommerceSync' | 'aiAutomation'

export const GATED: Record<GatedFeature, { name: string; locked: string }> = {
  inbox: { name: 'Live chat, email and social', locked: 'Live chat, email, Instagram and Messenger are on the Inbox and Everything plans. Upgrade in Billing to reply here.' },
  campaigns: { name: 'Campaigns', locked: 'Email and SMS campaigns are on the Inbox and Everything plans. Upgrade in Billing to send them.' },
  reviewDashboard: { name: 'Reviews', locked: 'Google reviews and social engagement are on the Inbox and Everything plans. Upgrade in Billing to use them.' },
  ecommerceSync: { name: 'Store orders', locked: 'WooCommerce, Shopify and Prexty orders are on the Inbox and Everything plans. Upgrade in Billing to connect your store.' },
  aiAutomation: { name: 'Automations', locked: 'Automatic replies and time savers are on the Inbox and Everything plans. Upgrade in Billing to turn them on.' },
}

export const PLAN_LOCKED_STATUS = 402

/** The JSON body of a locked answer. */
export const lockedBody = (feature: GatedFeature) => ({ error: GATED[feature].locked, upgrade: true, feature })

/**
 * Whether a company's plan (with its per-company overrides) includes a feature.
 * Reads companies.plan / trial_ends_at and company_entitlements directly so a
 * read failure can let the action through (see the note above) instead of
 * looking like the Free plan.
 */
export async function planAllows(db: any, companyId: string, feature: GatedFeature): Promise<boolean> {
  if (!companyId) return false
  let plan: Plan
  try {
    const { data, error } = await db.from('companies').select('plan, trial_ends_at').eq('id', companyId).maybeSingle()
    if (error) return true
    if (!data) return false
    plan = effectivePlan(data.plan, data.trial_ends_at)
  } catch { return true }
  try {
    const { data: ent, error } = await db.from('company_entitlements').select('features').eq('company_id', companyId).maybeSingle()
    if (!error) {
      const v = ent?.features?.[feature]
      if (v === true || v === false) return v
    }
  } catch {}
  return canAccess(plan, feature)
}

/** For routes: null when allowed, else the 402 answer to return. */
export async function planLock(db: any, companyId: string, feature: GatedFeature): Promise<Response | null> {
  if (await planAllows(db, companyId, feature)) return null
  return new Response(JSON.stringify(lockedBody(feature)), { status: PLAN_LOCKED_STATUS, headers: { 'content-type': 'application/json' } })
}

/** The channels whose replies need the `inbox` feature (SMS and calls need `channels`, WhatsApp its own check). */
export const INBOX_CHANNELS = new Set(['chat', 'widget', 'livechat', 'live_chat', 'web', 'email', 'instagram', 'messenger', 'facebook', 'ig', 'fb'])

/** Does replying on this conversation channel need the Inbox plan? */
export const channelNeedsInbox = (channel: string | null | undefined) => INBOX_CHANNELS.has(String(channel || '').toLowerCase())
