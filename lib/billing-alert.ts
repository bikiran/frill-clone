// Tell the Colvy team, at most once a day, that a customer tried to upgrade
// (or buy an add-on or a number) but online billing isn't set up. Server only.
//
// Where it goes, both best-effort:
//   • the bell in Colvy's own workspace (lib/signup-attempts colvyWorkspace:
//     the workspace sign-up leads go to, whose staff are the platform admins);
//   • an email to Colvy's support inbox (lib/colvy-contact), when Resend is set.
// Once a day (Sydney date): claimed in platform_settings under
// 'billing_setup_alert', plus an in-process guard for when that table is
// missing. The customer is told separately (lib/billing-config
// billingUnavailableCopy), without any env var names.

import { COLVY_CONTACT } from '@/lib/colvy-contact'

export const BILLING_ALERT_SETTING = 'billing_setup_alert'

// Per alert key: the Sydney day it was last sent from this process.
const sentDays = new Map<string, string>()
/** Tests only. */
export function resetBillingAlertMemo() { sentDays.clear() }

/** YYYY-MM-DD in Sydney. */
export function sydneyDay(d: Date = new Date()): string {
  return d.toLocaleDateString('en-CA', { timeZone: 'Australia/Sydney' })
}

const WHAT: Record<string, string> = {
  feedback: 'the Feedback plan', omnichannel: 'the Inbox plan', everything: 'the Everything plan',
  branding_removal: 'the Remove “Powered by Colvy” add-on', phone_number: 'a phone number', sms_credit: 'SMS credit',
}

export type BillingAlertInfo = {
  companyId?: string | null
  companyName?: string | null
  tier: string
  billing?: string
  /** Env var names (or a short reason) for the admin. */
  missing: string[]
  detail?: string
}

export type BillingAlertDeps = {
  now?: Date
  notify?: (db: any, message: string) => Promise<void>
  email?: (subject: string, text: string) => Promise<void>
}

async function notifyColvyTeam(db: any, message: string) {
  const { colvyWorkspace } = await import('@/lib/signup-attempts')
  const { notifyCompany } = await import('@/lib/notify')
  const co = await colvyWorkspace(db)
  if (!co) { console.warn('[billing-alert] no Colvy workspace to notify (super admin → Signups → choose one)'); return }
  await notifyCompany({ companyId: co.id, type: 'integration', message, db })
}

async function emailColvyTeam(subject: string, text: string) {
  const key = process.env.RESEND_API_KEY
  if (!key) return
  const { colvyTeamAlertEmail } = await import('@/lib/colvy-account-emails')
  const mail = colvyTeamAlertEmail(subject, text)
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: 'Colvy <noreply@updates.colvy.com>', to: [COLVY_CONTACT.email], subject, html: mail.html, text: mail.text }),
  })
  if (!res.ok) console.error('[billing-alert] email failed', res.status)
}

/** The bell/email text. Env var names are fine here: it only reaches the Colvy team. */
export function billingAlertMessage(info: BillingAlertInfo): string {
  const who = info.companyName ? info.companyName : 'A customer'
  const what = WHAT[info.tier] || `“${info.tier}”`
  const period = info.billing && info.tier !== 'branding_removal' && info.tier !== 'phone_number' && info.tier !== 'sms_credit' ? ` (${info.billing})` : ''
  const missing = info.missing.length ? ` Missing or wrong: ${info.missing.join(', ')}.` : ''
  return `Online billing isn’t set up: ${who} tried to buy ${what}${period} and couldn’t.${missing}${info.detail ? ` ${info.detail}` : ''} See super admin → Billing for what to add.`
}

/**
 * The once-a-day Colvy team alert, for any problem only the platform can fix
 * (billing not set up, Resend key can't read received email…): the bell in
 * Colvy's own workspace plus an email to Colvy's support inbox. Claimed per
 * Sydney day in platform_settings under `key` (plus an in-process guard).
 * Never throws. Returns whether this call sent it.
 */
export async function alertColvyTeamOncePerDay(db: any, a: {
  key: string; message: string; subject: string
  /** Extra fields kept with the day claim in platform_settings. */
  value?: Record<string, any>
  updatedBy?: string
}, deps: BillingAlertDeps = {}): Promise<boolean> {
  try {
    const now = deps.now || new Date()
    const day = sydneyDay(now)
    if (sentDays.get(a.key) === day) return false
    try {
      const { data, error } = await db.from('platform_settings').select('value').eq('key', a.key).maybeSingle()
      if (!error && data?.value?.day === day) { sentDays.set(a.key, day); return false }
      // Claim the day before sending, so two requests at once don't both alert.
      await db.from('platform_settings').upsert({
        key: a.key,
        value: { day, at: now.toISOString(), ...(a.value || {}) },
        updated_by: a.updatedBy || 'alert', updated_at: now.toISOString(),
      }, { onConflict: 'key' })
    } catch {}
    sentDays.set(a.key, day)

    await Promise.allSettled([
      (deps.notify || notifyColvyTeam)(db, a.message),
      (deps.email || emailColvyTeam)(a.subject, `${a.message}\n\nThis alert is sent at most once a day.`),
    ])
    return true
  } catch (e: any) {
    console.error('[colvy-alert] failed', e?.message || e)
    return false
  }
}

/**
 * Alert the Colvy team unless it was already done today. Never throws.
 * Returns whether this call sent it.
 */
export async function alertBillingNotConfigured(db: any, info: BillingAlertInfo, deps: BillingAlertDeps = {}): Promise<boolean> {
  try {
    return await alertColvyTeamOncePerDay(db, {
      key: BILLING_ALERT_SETTING,
      message: billingAlertMessage(info),
      subject: 'Colvy billing isn’t set up: a customer couldn’t upgrade',
      value: { tier: info.tier, companyId: info.companyId || null, missing: info.missing },
      updatedBy: 'billing',
    }, deps)
  } catch (e: any) {
    console.error('[billing-alert] failed', e?.message || e)
    return false
  }
}
