// Request handlers for the public unsubscribe and preference links in a
// business's marketing email (campaigns and announcements). Shared by
// app/api/email/unsubscribe, app/api/email/preferences and the older
// app/api/announcements/unsubscribe, so every link follows one set of rules
// (lib/email-preferences).
//
//   GET  unsubscribe   a page with one button. A mail scanner opening the
//                      link must not unsubscribe anyone, so GET never changes
//                      anything.
//   POST unsubscribe   the button, or a mail app's one-click
//                      List-Unsubscribe-Post (RFC 8058): email marketing off,
//                      immediately.
//   GET  preferences   the preference page (email on/off, texts off,
//                      everything off), in the business's branding.
//   POST preferences   saves it.
// Tokens are signed and name one contact of one business (lib/email-tokens),
// so a link can't be pointed at anyone else. No sign-in.

import { NextRequest, NextResponse } from 'next/server'
import { emailAdminDb } from '@/lib/email-db'
import { readUnsubToken, type UnsubToken } from '@/lib/email-tokens'
import { loadEmailBrand } from '@/lib/email-brand'
import { applyPreferences, maskEmail, preferencePage, preferenceState, setEmailMarketing, type PageView, type PrefState } from '@/lib/email-preferences'

const HTML_HEADERS = { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex', 'Referrer-Policy': 'no-referrer' }

function html(body: string, status = 200) {
  return new NextResponse(body, { status, headers: HTML_HEADERS })
}

async function load(db: any, tok: UnsubToken | null) {
  if (!tok) return null
  const [{ data: contact }, loaded] = await Promise.all([
    db.from('contacts').select('*').eq('id', tok.c).eq('company_id', tok.co).maybeSingle(),
    loadEmailBrand(db, tok.co),
  ])
  if (!loaded) return null
  return { contact: contact || null, brand: loaded.brand }
}

// Test emails. Old ones carry the placeholder "test"; newer ones a signed
// preview token, which opens the real pages (branded, with sample settings)
// and never changes anything.
const OLD_TEST = 'test'
const SAMPLE: PrefState = { email: true, sms: true, emailCanTurnOn: true, everythingOff: false }
async function previewBrand(db: any, tok: UnsubToken) {
  const loaded = await loadEmailBrand(db, tok.co).catch(() => null)
  return loaded?.brand || null
}

/** The token from the query string or a posted form. */
async function tokenOf(req: NextRequest): Promise<{ t: string; form: Record<string, string>; oneClick: boolean }> {
  let t = req.nextUrl.searchParams.get('t') || ''
  const form: Record<string, string> = {}
  let oneClick = false
  try {
    const ct = req.headers.get('content-type') || ''
    if (ct.includes('form')) {
      const fd = await req.formData()
      for (const [k, v] of fd.entries()) form[k] = String(v)
      if (form.t) t = form.t
      oneClick = form['List-Unsubscribe'] === 'One-Click'
    } else if (ct.includes('text/plain')) {
      oneClick = /List-Unsubscribe=One-Click/i.test(await req.text())
    }
  } catch {}
  return { t, form, oneClick }
}

export async function unsubscribeGet(req: NextRequest) {
  const t = req.nextUrl.searchParams.get('t') || ''
  if (t === OLD_TEST) return html(preferencePage(null, { kind: 'test' }))
  const tok = readUnsubToken(t)
  const db = emailAdminDb()
  if (tok?.preview) return html(preferencePage(await previewBrand(db, tok), { kind: 'confirm', token: t }, '', { preview: true }))
  const r = await load(db, tok).catch(() => null)
  if (!tok || !r) return html(preferencePage(null, { kind: 'expired' }), tok ? 200 : 400)
  if (r.contact && (r.contact.email_marketing_opt_out_at || r.contact.unsubscribed_at)) return html(preferencePage(r.brand, { kind: 'done', what: r.contact.unsubscribed_at ? 'everything' : 'email' }))
  return html(preferencePage(r.brand, { kind: 'confirm', token: t }))
}

export async function unsubscribePost(req: NextRequest) {
  const { t, oneClick } = await tokenOf(req)
  if (t === OLD_TEST) return oneClick ? new NextResponse('Test email: nothing changed', { status: 200 }) : html(preferencePage(null, { kind: 'test' }))
  const tok = readUnsubToken(t)
  const db = emailAdminDb()
  if (tok?.preview) return oneClick ? new NextResponse('Test email: nothing changed', { status: 200 }) : html(preferencePage(await previewBrand(db, tok), { kind: 'done', what: 'email' }, '', { preview: true }))
  const r = await load(db, tok).catch(() => null)
  if (!tok || !r) {
    return oneClick ? new NextResponse('Unknown link', { status: 400 }) : html(preferencePage(null, { kind: 'expired' }), 400)
  }
  if (r.contact) {
    const source = oneClick ? 'One-click unsubscribe from their mail app' : tok.legacy ? 'Unsubscribe link in an announcement email' : 'Unsubscribe link in a campaign email'
    const res = await setEmailMarketing(db, tok.co, r.contact, false, { source, campaignId: tok.cam || null })
    if (!res.ok) {
      console.error('[email unsubscribe] not saved', res.error)
      return oneClick ? new NextResponse('Try again', { status: 503 }) : html(preferencePage(r.brand, { kind: 'prefs', token: t, state: await preferenceState(db, tok.co, r.contact), error: 'That didn’t save. Please try again in a minute.' }), 503)
    }
  }
  return oneClick ? new NextResponse('Unsubscribed', { status: 200, headers: { 'Cache-Control': 'no-store' } }) : html(preferencePage(r.brand, { kind: 'done', what: 'email' }))
}

export async function preferencesGet(req: NextRequest) {
  const t = req.nextUrl.searchParams.get('t') || ''
  if (t === OLD_TEST) return html(preferencePage(null, { kind: 'test' }))
  const tok = readUnsubToken(t)
  const db = emailAdminDb()
  if (tok?.preview) return html(preferencePage(await previewBrand(db, tok), { kind: 'prefs', token: t, state: SAMPLE }, '', { preview: true }))
  const r = await load(db, tok).catch(() => null)
  if (!tok || !r || !r.contact) return html(preferencePage(r?.brand || null, { kind: 'expired' }), tok ? 200 : 400)
  const view: PageView = { kind: 'prefs', token: t, state: await preferenceState(db, tok.co, r.contact), maskedEmail: maskEmail(r.contact.email || '') }
  return html(preferencePage(r.brand, view))
}

export async function preferencesPost(req: NextRequest) {
  const { t, form } = await tokenOf(req)
  if (t === OLD_TEST) return html(preferencePage(null, { kind: 'test' }))
  const tok = readUnsubToken(t)
  const db = emailAdminDb()
  if (tok?.preview) {
    // Show what the customer would see after saving; nothing is stored.
    const brand = await previewBrand(db, tok)
    if (form.everything === '1') return html(preferencePage(brand, { kind: 'done', what: 'everything' }, '', { preview: true }))
    const state: PrefState = { ...SAMPLE, email: form.email === '1', sms: form.sms_shown === '1' ? form.sms === '1' : null }
    return html(preferencePage(brand, { kind: 'prefs', token: t, state, saved: true }, '', { preview: true }))
  }
  const r = await load(db, tok).catch(() => null)
  if (!tok || !r || !r.contact) return html(preferencePage(r?.brand || null, { kind: 'expired' }), 400)
  const source = 'Email preference page'
  if (form.everything === '1') {
    await applyPreferences(db, tok.co, r.contact, { email: false, everything: true }, { source, campaignId: tok.cam || null })
    return html(preferencePage(r.brand, { kind: 'done', what: 'everything' }))
  }
  const res = await applyPreferences(db, tok.co, r.contact, { email: form.email === '1', sms: form.sms_shown === '1' ? form.sms === '1' : null }, { source, campaignId: tok.cam || null })
  return html(preferencePage(r.brand, { kind: 'prefs', token: t, state: res.state, saved: res.ok, error: res.error, maskedEmail: maskEmail(r.contact.email || '') }), res.ok ? 200 : 503)
}
