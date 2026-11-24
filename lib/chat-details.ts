// The details a visitor gives before a website chat starts: name, email and
// mobile. Checked in the widget as they press Start, and again on the server
// (app/api/widget/start), so a chat can't begin as name "g", email "g" and
// phone "+61" (all three got through when only "not blank" was checked).
//
// Which fields show and which are required is the business's choice
// (widget_config.chat_form_fields). A field left empty is fine unless it's
// required; a field that's filled in must look real, so a half-typed email
// or a number with no digits after the country code is caught rather than
// saved on the contact.

export type ChatField = { show?: boolean; required?: boolean }
export type ChatFormFields = { name?: ChatField; email?: ChatField; mobile?: ChatField }
export type ChatDetailsField = 'name' | 'email' | 'mobile'

export const DEFAULT_CHAT_FIELDS: Required<ChatFormFields> = {
  name: { show: true, required: true },
  email: { show: true, required: false },
  mobile: { show: true, required: false },
}

const EMAIL_RE = /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)*\.[^\s@.]{2,}$/

/** The name as it will be saved: trimmed, single spaces, at most 120 characters. */
export function cleanChatName(raw?: string | null): string {
  return String(raw || '').replace(/\s+/g, ' ').trim().slice(0, 120)
}

/** A name needs at least two letters (any alphabet): "Jo" and "李明" pass, "g" and "12" don't. */
export function isChatName(raw?: string | null): boolean {
  return (cleanChatName(raw).match(/\p{L}/gu) || []).length >= 2
}

/** Looks like a real email address: something@domain.tld. */
export function isChatEmail(raw?: string | null): boolean {
  const e = String(raw || '').trim()
  return e.length <= 200 && EMAIL_RE.test(e)
}

/**
 * The mobile number in +international form, or null when it isn't a whole
 * number. Australian forms are understood (0412 345 678, 412 345 678,
 * 61412345678, +61 412 345 678, +61 0412 345 678); anything else needs its
 * country code (+64 21 123 4567).
 */
export function chatPhone(raw?: string | null): string | null {
  const t = String(raw || '').trim()
  if (!t || /[a-z]/i.test(t)) return null
  const d = t.replace(/\D/g, '')
  let n: string
  if (t.startsWith('+')) n = d
  else if (d.startsWith('00')) n = d.slice(2)
  else if (d.startsWith('0')) n = '61' + d.slice(1)
  else if (d.startsWith('61') && d.length === 11) n = d
  else if (d.length === 9) n = '61' + d
  else return null
  if (/^610\d{9}$/.test(n)) n = '61' + n.slice(3)            // +61 0412 345 678
  if (n.startsWith('61')) return /^61[23478]\d{8}$/.test(n) ? '+' + n : null
  return /^[1-9]\d{7,14}$/.test(n) ? '+' + n : null
}

/** ok with the details to save, or not ok with the field at fault and what to tell the visitor. */
export type ChatDetailsResult = {
  ok: boolean
  name?: string | null
  email?: string | null
  phone?: string | null
  field?: ChatDetailsField | null
  error?: string
}

/**
 * Check what the visitor typed against the business's form. On success,
 * returns the details as they should be saved (email trimmed, phone in
 * +international form, empties as null).
 */
export function checkChatDetails(
  input: { name?: string | null; email?: string | null; mobile?: string | null },
  fields?: ChatFormFields | null,
): ChatDetailsResult {
  const ff = { ...DEFAULT_CHAT_FIELDS, ...(fields || {}) }
  const on = (f: ChatField | undefined) => f?.show !== false
  const need = (f: ChatField | undefined) => on(f) && !!f?.required
  const name = cleanChatName(input.name)
  const email = String(input.email || '').trim()
  const mobile = String(input.mobile || '').trim()

  if (need(ff.name) && !name) return { ok: false, field: 'name', error: 'Please enter your name.' }
  if (name && !isChatName(name)) return { ok: false, field: 'name', error: 'Please enter your name (at least 2 letters).' }
  if (need(ff.email) && !email) return { ok: false, field: 'email', error: 'Please enter your email.' }
  if (email && !isChatEmail(email)) return { ok: false, field: 'email', error: 'Please enter a valid email, like name@example.com.' }
  if (need(ff.mobile) && !mobile) return { ok: false, field: 'mobile', error: 'Please enter your mobile number.' }
  const phone = mobile ? chatPhone(mobile) : null
  if (mobile && !phone) return { ok: false, field: 'mobile', error: 'Please enter a valid mobile number, like 0412 345 678.' }
  if (!name && !email && !phone) return { ok: false, field: null, error: 'Please fill in at least one field.' }
  return { ok: true, name: name || null, email: email || null, phone }
}
