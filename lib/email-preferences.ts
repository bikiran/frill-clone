// Unsubscribe and preferences for a business's marketing email (server only).
// Shared by the one-click List-Unsubscribe POST, the unsubscribe link, the
// preference page (app/api/email/*) and the announcement-email link
// (app/api/announcements/unsubscribe), so there is one set of rules:
//
//   • Email marketing off → contacts.email_marketing_opt_out_at (V396), on
//     every contact of the business with that address, logged in
//     consent_events. Before V396 there's no such column, so it's recorded as
//     an unsubscribe from all marketing (unsubscribed_at), which every sender
//     already honours. Takes effect immediately (the Spam Act allows five
//     business days; we don't need them).
//   • Texts off → a STOP in sms_keywords for their number, exactly as if they
//     had texted STOP (lib/sms-consent), plus sms_marketing_opt_out_at. Texts
//     only come back when they text START: the email page never turns texts
//     on, matching lib/sms-consent's rule that only the customer texting START
//     lifts a STOP.
//   • Everything off → the existing all-marketing unsubscribe (unsubscribed_at,
//     subscribed_to_marketing false, consent_basis none), which also stops
//     texts (textOptOut reads unsubscribed_at), plus the email opt-out.
//   • Email back on → clears an email-only opt-out. After "everything off" it
//     is express consent again, but texts must stay off, so a STOP is recorded
//     for their number first; if that can't be saved, nothing changes. Someone
//     with no marketing consent at all can't opt in here (the business adds
//     them with consent).

import { phoneKey } from '@/lib/phone'
import { textOptOut } from '@/lib/sms-consent'
import { escapeHtml } from '@/lib/safe-html'
import { isMissingColumn, isMissingTable, normEmail } from '@/lib/email-db'
import type { EmailBrand } from '@/components/EmailDesigner/types'
import { textOn } from '@/components/EmailDesigner/render'

type Opts = { source: string; campaignId?: string | null; actor?: 'customer' | 'system' }

const likePattern = (s: string) => s.replace(/[\\%_]/g, m => '\\' + m)

/** The contact plus every other contact of the business with the same address (any case). */
async function sameAddress(db: any, companyId: string, contact: { id: string; email?: string | null }): Promise<any[]> {
  const out = new Map<string, any>()
  const { data: me } = await db.from('contacts').select('*').eq('id', contact.id).eq('company_id', companyId).maybeSingle()
  if (me) out.set(me.id, me)
  const email = normEmail(contact.email || me?.email)
  if (email) {
    const { data } = await db.from('contacts').select('*').eq('company_id', companyId).ilike('email', likePattern(email)).limit(50)
    for (const c of data || []) out.set(c.id, c)
  }
  return [...out.values()]
}

async function logConsent(db: any, row: Record<string, any>) {
  try { await db.from('consent_events').insert(row) } catch {}
}

/** Report the unsubscribe against the campaign it came from (once per recipient). */
async function noteCampaignUnsubscribe(db: any, companyId: string, campaignId: string | null | undefined, contactId: string, email: string) {
  if (!campaignId) return
  try {
    const { data: rec } = await db.from('email_campaign_recipients').select('id, unsubscribed_at').eq('campaign_id', campaignId).eq('contact_id', contactId).limit(1)
    if (rec?.[0]?.unsubscribed_at) return
    if (rec?.[0]?.id) await db.from('email_campaign_recipients').update({ unsubscribed_at: new Date().toISOString() }).eq('id', rec[0].id)
    await db.from('email_events').insert({ company_id: companyId, campaign_id: campaignId, recipient_id: rec?.[0]?.id || null, contact_id: contactId, email: email || null, type: 'unsubscribed' })
  } catch {}
}

/** Record a STOP for this number (as if texted). False if it couldn't be saved. */
async function recordTextStop(db: any, companyId: string, phone: string | null | undefined): Promise<boolean> {
  const key = phoneKey(phone)
  if (key.length < 8) return true // no real number: nothing to text
  try {
    const { error } = await db.from('sms_keywords').insert({ company_id: companyId, phone_norm: key, keyword: 'STOP' })
    return !error
  } catch { return false }
}

/** Email marketing on or off for this person at this business. */
export async function setEmailMarketing(db: any, companyId: string, contact: { id: string; email?: string | null }, on: boolean, opts: Opts): Promise<{ ok: boolean; changed: number; error?: string }> {
  const now = new Date().toISOString()
  const actor = opts.actor || 'customer'
  const contacts = await sameAddress(db, companyId, contact)
  if (!contacts.length) return { ok: false, changed: 0, error: 'Contact not found' }
  let changed = 0

  if (!on) {
    for (const c of contacts) {
      if (c.email_marketing_opt_out_at || c.unsubscribed_at) continue
      const { error } = await db.from('contacts').update({ email_marketing_opt_out_at: now, email_unsubscribe_source: opts.source.slice(0, 120) }).eq('id', c.id).eq('company_id', companyId)
      if (error) {
        // Before V396: no email-only column, so stop all marketing instead.
        if (!isMissingColumn(error)) { console.error('[email prefs] opt-out not saved', error.message); return { ok: false, changed, error: 'Couldn’t save that' } }
        const full = { subscribed_to_marketing: false, consent_basis: 'none', consent_source: opts.source.slice(0, 120), unsubscribed_at: now, unsubscribe_method: 'email_link' }
        const r2 = await db.from('contacts').update(full).eq('id', c.id).eq('company_id', companyId)
        if (r2.error) return { ok: false, changed, error: 'Couldn’t save that' }
      }
      await logConsent(db, { company_id: companyId, contact_id: c.id, action: 'email_unsubscribed', basis: null, source: opts.source, actor })
      changed++
    }
    await noteCampaignUnsubscribe(db, companyId, opts.campaignId, contact.id, normEmail(contact.email || contacts[0]?.email))
    return { ok: true, changed }
  }

  for (const c of contacts) {
    if (c.is_blocked) continue
    const consented = c.subscribed_to_marketing && c.consent_basis !== 'none'
    if (!c.unsubscribed_at && consented) {
      if (!c.email_marketing_opt_out_at) continue
      const { error } = await db.from('contacts').update({ email_marketing_opt_out_at: null, email_unsubscribe_source: null }).eq('id', c.id).eq('company_id', companyId)
      if (error) return { ok: false, changed, error: 'Couldn’t save that' }
      await logConsent(db, { company_id: companyId, contact_id: c.id, action: 'email_resubscribed', basis: c.consent_basis || null, source: opts.source, actor })
      changed++
      continue
    }
    if (!c.unsubscribed_at) continue // never consented: the business adds them with consent
    // Back from "everything off": texts stay off, so record a STOP first.
    if (!(await recordTextStop(db, companyId, c.phone))) return { ok: false, changed, error: 'Couldn’t turn email back on just now' }
    const patch: Record<string, any> = {
      subscribed_to_marketing: true, consent_basis: 'express', consent_source: opts.source.slice(0, 120), consent_recorded_at: now,
      unsubscribed_at: null, unsubscribe_method: null, email_marketing_opt_out_at: null, email_unsubscribe_source: null,
    }
    if (phoneKey(c.phone).length >= 8) patch.sms_marketing_opt_out_at = c.sms_marketing_opt_out_at || now
    let { error } = await db.from('contacts').update(patch).eq('id', c.id).eq('company_id', companyId)
    if (error && isMissingColumn(error)) {
      delete patch.email_marketing_opt_out_at; delete patch.email_unsubscribe_source; delete patch.sms_marketing_opt_out_at
      ;({ error } = await db.from('contacts').update(patch).eq('id', c.id).eq('company_id', companyId))
    }
    if (error) return { ok: false, changed, error: 'Couldn’t save that' }
    await logConsent(db, { company_id: companyId, contact_id: c.id, action: 'subscribed', basis: 'express', source: opts.source, actor, note: 'Email only: texts stay off (STOP recorded)' })
    changed++
  }
  return { ok: true, changed }
}

/** Texts off for this person (a STOP for their number, as if texted). */
export async function turnOffTexts(db: any, companyId: string, contact: { id: string; email?: string | null }, opts: Opts): Promise<{ ok: boolean; error?: string }> {
  const contacts = await sameAddress(db, companyId, contact)
  const phones = [...new Set(contacts.map(c => phoneKey(c.phone)).filter(k => k.length >= 8))]
  if (!phones.length) return { ok: true }
  for (const p of phones) if (!(await recordTextStop(db, companyId, p))) return { ok: false, error: 'Couldn’t turn texts off just now' }
  const now = new Date().toISOString()
  for (const c of contacts) {
    if (phoneKey(c.phone).length < 8) continue
    if (!c.sms_marketing_opt_out_at) {
      const { error } = await db.from('contacts').update({ sms_marketing_opt_out_at: now }).eq('id', c.id).eq('company_id', companyId)
      if (error && !isMissingColumn(error)) console.error('[email prefs] sms opt-out column not saved', error.message)
    }
    await logConsent(db, { company_id: companyId, contact_id: c.id, action: 'sms_unsubscribed', basis: null, source: opts.source, actor: opts.actor || 'customer', note: 'Recorded as a STOP: texting START turns texts back on' })
  }
  return { ok: true }
}

/**
 * Unsubscribe from everything at this business: email and texts. Same
 * fields as a STOP text or the old announcement link, plus the email opt-out.
 */
export async function unsubscribeEverything(db: any, companyId: string, contact: { id: string; email?: string | null }, opts: Opts): Promise<number> {
  const now = new Date().toISOString()
  const contacts = await sameAddress(db, companyId, contact)
  let n = 0
  for (const c of contacts) {
    if (c.unsubscribed_at) continue
    const full: Record<string, any> = { subscribed_to_marketing: false, consent_basis: 'none', consent_source: opts.source.slice(0, 120), unsubscribed_at: now, unsubscribe_method: 'email_link', email_marketing_opt_out_at: c.email_marketing_opt_out_at || now, email_unsubscribe_source: opts.source.slice(0, 120) }
    let { error } = await db.from('contacts').update(full).eq('id', c.id).eq('company_id', companyId)
    if (error) {
      delete full.email_marketing_opt_out_at; delete full.email_unsubscribe_source
      ;({ error } = await db.from('contacts').update(full).eq('id', c.id).eq('company_id', companyId))
      if (error) await db.from('contacts').update({ subscribed_to_marketing: false, unsubscribed_at: now }).eq('id', c.id).eq('company_id', companyId)
    }
    await logConsent(db, { company_id: companyId, contact_id: c.id, action: 'unsubscribed', basis: 'none', source: opts.source, actor: opts.actor || 'customer' })
    n++
  }
  await noteCampaignUnsubscribe(db, companyId, opts.campaignId, contact.id, normEmail(contact.email || contacts[0]?.email))
  return n
}

// ── What the preference page shows ──────────────────────────────────────────

export type PrefState = {
  email: boolean
  /** null: no mobile number on file, so no texts toggle. */
  sms: boolean | null
  /** Email can be switched back on here (an email-only opt-out, or after "everything off"). */
  emailCanTurnOn: boolean
  everythingOff: boolean
}

export async function preferenceState(db: any, companyId: string, contact: any): Promise<PrefState> {
  const consented = !!contact.subscribed_to_marketing && contact.consent_basis !== 'none'
  const everythingOff = !!contact.unsubscribed_at
  const email = consented && !everythingOff && !contact.email_marketing_opt_out_at && !contact.is_blocked
  let sms: boolean | null = null
  if (phoneKey(contact.phone).length >= 8) {
    let textsOk = false
    try { textsOk = (await textOptOut(db, companyId, contact.phone, contact.id)).state === 'ok' } catch {}
    sms = textsOk && consented && !everythingOff && !contact.sms_marketing_opt_out_at && !contact.is_blocked
  }
  const emailCanTurnOn = !contact.is_blocked && (everythingOff || (consented && !!contact.email_marketing_opt_out_at))
  return { email, sms, emailCanTurnOn, everythingOff }
}

/**
 * Apply what the preference form sent. `email`/`sms` are the checkbox states;
 * `everything` is the "unsubscribe from everything" button.
 */
export async function applyPreferences(db: any, companyId: string, contact: any, want: { email: boolean; sms?: boolean | null; everything?: boolean }, opts: Opts): Promise<{ ok: boolean; error?: string; state: PrefState }> {
  if (want.everything) {
    await unsubscribeEverything(db, companyId, contact, opts)
    return { ok: true, state: await reload(db, companyId, contact) }
  }
  const before = await preferenceState(db, companyId, contact)
  let error: string | undefined
  if (before.sms === true && want.sms === false) {
    const r = await turnOffTexts(db, companyId, contact, opts)
    if (!r.ok) error = r.error
  }
  if (before.email !== want.email && (want.email === false || before.emailCanTurnOn)) {
    const r = await setEmailMarketing(db, companyId, contact, want.email, opts)
    if (!r.ok) error = r.error
  }
  return { ok: !error, error, state: await reload(db, companyId, contact) }
}

async function reload(db: any, companyId: string, contact: any): Promise<PrefState> {
  const { data } = await db.from('contacts').select('*').eq('id', contact.id).eq('company_id', companyId).maybeSingle()
  return preferenceState(db, companyId, data || contact)
}

// ── The page ────────────────────────────────────────────────────────────────

export type PageView =
  | { kind: 'expired' }
  | { kind: 'test' }                                          // an old test email's placeholder link
  | { kind: 'confirm'; token: string }                       // the unsubscribe link: one button
  | { kind: 'done'; what: 'email' | 'everything' }
  | { kind: 'prefs'; token: string; state: PrefState; saved?: boolean; error?: string; maskedEmail?: string }

export function maskEmail(e: string): string {
  const [u, d] = String(e || '').split('@')
  if (!u || !d) return ''
  return `${u.slice(0, 2)}${'•'.repeat(Math.max(1, Math.min(6, u.length - 2)))}@${d}`
}

/**
 * The public page, in the business's branding. Works without JavaScript.
 * `preview`: opened from a test email, so it says so and nothing is changed.
 */
export function preferencePage(brand: EmailBrand | null, view: PageView, base = '', opts: { preview?: boolean } = {}): string {
  const accent = /^#[0-9a-f]{6}$/i.test(brand?.accent || '') ? brand!.accent! : '#18181b'
  const name = escapeHtml(brand?.name || 'this business')
  const logo = brand?.logoUrl && /^https:\/\//i.test(brand.logoUrl) ? `<img src="${escapeHtml(brand.logoUrl)}" alt="${name}" class="logo">` : `<div class="mark" style="background:${accent}">${escapeHtml((brand?.name || '?').trim().charAt(0).toUpperCase())}</div>`
  const prefsUrl = (t: string) => `${base}/api/email/preferences?t=${encodeURIComponent(t)}`
  let title = '', body = ''
  if (view.kind === 'test') {
    title = 'This was a test email'
    body = `<p>Links in test emails don’t unsubscribe anyone. Send a new test email to see the page your customers get when they unsubscribe or change their preferences.</p>`
  } else if (view.kind === 'expired') {
    title = 'This link doesn’t work'
    body = `<p>It may have been copied incompletely. Reply to any email from ${name} and ask them to stop sending you emails, and they’ll take you off their list.</p>`
  } else if (view.kind === 'confirm') {
    title = `Unsubscribe from ${name}?`
    body = `<p>You’ll stop getting marketing emails from ${name}. Order updates and replies to your questions still come through.</p>
<form method="post" action="${base}/api/email/unsubscribe"><input type="hidden" name="t" value="${escapeHtml(view.token)}"><button type="submit" class="primary" style="background:${accent}">Unsubscribe</button></form>
<p class="small"><a href="${escapeHtml(prefsUrl(view.token))}">Choose what you get instead</a></p>`
  } else if (view.kind === 'done') {
    title = 'You’re unsubscribed'
    body = view.what === 'everything'
      ? `<p>You won’t get emails or texts with updates and offers from ${name} any more.</p>`
      : `<p>You won’t get marketing emails from ${name} any more. It may take a moment for emails already on their way to stop.</p>`
  } else {
    const s = view.state
    title = 'Your email preferences'
    const emailRow = `<label class="row"><span><strong>Emails with news and offers</strong><small>Updates, new stock and sales from ${name}.</small></span>
<input type="checkbox" name="email" value="1"${s.email ? ' checked' : ''}${!s.email && !s.emailCanTurnOn ? ' disabled' : ''}></label>
${!s.email && !s.emailCanTurnOn ? `<p class="note">To get emails again, ask ${name} to add you to their list.</p>` : ''}`
    const smsRow = s.sms === null ? '' : `<label class="row"><span><strong>Texts with news and offers</strong><small>${s.sms ? `Texts from ${name}. Turning these off works like replying STOP.` : 'Texts are off. To get them again, reply START to any text from us.'}</small></span>
<input type="checkbox" name="sms" value="1"${s.sms ? ' checked' : ' disabled'}></label>`
    body = `${view.maskedEmail ? `<p class="small">For ${escapeHtml(view.maskedEmail)}</p>` : ''}
${view.saved ? `<p class="ok">Saved. Changes apply straight away.</p>` : ''}${view.error ? `<p class="err">${escapeHtml(view.error)}</p>` : ''}
<form method="post" action="${base}/api/email/preferences"><input type="hidden" name="t" value="${escapeHtml(view.token)}">
<input type="hidden" name="sms_shown" value="${s.sms === null ? '0' : '1'}">
${emailRow}${smsRow}
<button type="submit" class="primary" style="background:${accent}">Save preferences</button></form>
<form method="post" action="${base}/api/email/preferences" class="all"><input type="hidden" name="t" value="${escapeHtml(view.token)}"><input type="hidden" name="everything" value="1">
<button type="submit" class="link">Unsubscribe from everything</button></form>`
  }
  return `<!doctype html><html lang="en-AU"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${escapeHtml(title)}</title>
<style>
*{box-sizing:border-box}body{margin:0;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#18181b}
main{max-width:480px;margin:8vh auto;padding:0 16px}
.card{background:#fff;border:1px solid #e4e4e7;border-radius:16px;padding:28px 24px}
.brand{display:flex;align-items:center;gap:12px;margin:0 0 22px}.brand b{font-size:16px}
.logo{height:40px;width:auto;max-width:160px;display:block}.mark{width:40px;height:40px;border-radius:10px;color:#fff;font-weight:800;font-size:18px;display:flex;align-items:center;justify-content:center}
h1{font-size:21px;line-height:1.3;margin:0 0 10px}p{font-size:15px;line-height:1.55;color:#52525b;margin:0 0 16px}
.small{font-size:13px;color:#71717a}.small a{color:#52525b}
.row{display:flex;align-items:flex-start;justify-content:space-between;gap:16px;padding:14px 0;border-top:1px solid #e4e4e7;cursor:pointer}
.row span{display:flex;flex-direction:column;gap:3px;font-size:15px}.row small{font-size:13px;color:#71717a;line-height:1.45}
.row input{width:22px;height:22px;margin:2px 0 0;flex-shrink:0;accent-color:${accent}}
.note{font-size:13px;margin:-6px 0 12px}
.primary{width:100%;height:46px;border:none;border-radius:12px;color:${textOn(accent)};font-size:15px;font-weight:700;cursor:pointer;margin:14px 0 0}
.all{margin:14px 0 0;text-align:center}.link{background:none;border:none;color:#52525b;text-decoration:underline;font-size:14px;cursor:pointer;padding:8px}
.ok{background:#ecfdf3;border:1px solid #abefc6;color:#067647;border-radius:10px;padding:10px 12px;font-size:14px}
.err{background:#fef3f2;border:1px solid #fecdca;color:#b42318;border-radius:10px;padding:10px 12px;font-size:14px}
.pv{display:flex;gap:10px;align-items:flex-start;background:#fffaeb;border:1px solid #fedf89;color:#93370d;border-radius:12px;padding:11px 13px;font-size:13.5px;line-height:1.5;margin:0 0 18px}.pv b{font-weight:700}
</style></head><body><main>${opts.preview ? `<p class="pv"><span><b>Preview from a test email.</b> This is the page your customers see. Nothing you do here changes anything.</span></p>` : ''}<div class="card">${brand ? `<div class="brand">${logo}<b>${name}</b></div>` : ''}<h1>${escapeHtml(title)}</h1>${body}</div></main></body></html>`
}
