// Server-side "Colvy AI" contact capture for inbound SMS.
//
// When a customer texts in, we extract their details from the message and
// create/link a contact — so a first-time texter like "Good day, its Dylan here
// from Ballarat…" lands as a contact named Dylan, in Ballarat, with the phone
// already filled from the sender number, without an agent having to open the
// thread. This is the server counterpart to the browser-side regex detector in
// the inbox (which only ran on open, couldn't see the sender number, and missed
// bare suburbs).
//
// Best-effort: guarded on ANTHROPIC_API_KEY, never throws, and only ever FILLS
// EMPTY fields on an existing contact — it won't overwrite what a human saved.

import { isLikelyPersonName } from '@/lib/contactName'

const digitsOf = (s: string) => (s || '').replace(/\D/g, '').slice(-9)

// Find, or create, a contact for a phone number — company-scoped.
//
// Unlike captureContactFromSms (which deliberately won't mint a nameless contact
// for a random texter), an inbound CALL should always leave a contact behind so
// the number is saved in the CRM and future calls/texts resolve to it. Matches
// an existing contact by the last-9-digits of the number first; only inserts a
// new one if there's no match. Best-effort — returns null rather than throwing.
export async function ensureContactByPhone(
  db: any,
  companyId: string,
  phone: string,
  opts?: { name?: string | null; source?: string },
): Promise<string | null> {
  if (!companyId || !phone) return null
  const tail = digitsOf(phone)
  if (!tail || tail.length < 6) return null
  try {
    const { data: matches } = await db.from('contacts')
      .select('id, phone').eq('company_id', companyId).ilike('phone', `%${tail}%`).limit(10)
    const hit = (matches || []).find((c: any) => c.phone && digitsOf(c.phone) === tail)
    if (hit) return hit.id
  } catch { /* fall through to create */ }
  try {
    const { data: created } = await db.from('contacts').insert({
      company_id: companyId,
      name: opts?.name ?? null,
      phone,
      source: opts?.source || 'phone',
    }).select('id').maybeSingle()
    return created?.id || null
  } catch { return null }
}

export interface ExtractedContact {
  name: string | null
  suburb: string | null
  email: string | null
}

// Ask Claude for the sender's name / suburb / email from the message text.
// The phone is NOT extracted here — it's the sender's number, which the caller
// supplies separately (the model never sees it in the body).
export async function extractContactDetails(text: string): Promise<ExtractedContact> {
  const empty: ExtractedContact = { name: null, suburb: null, email: null }
  const key = process.env.ANTHROPIC_API_KEY
  if (!key || !text || !text.trim()) return empty

  const system =
    'You extract contact details a customer states about THEMSELVES in an inbound SMS. ' +
    'Return ONLY a compact JSON object: {"name": string|null, "suburb": string|null, "email": string|null}. ' +
    'Rules: name = the sender\'s own first/full name only when they clearly self-identify ' +
    '(e.g. "its Dylan here", "this is Sarah Lee") — never a name they mention about someone else, ' +
    'and never a business name. suburb = the town/suburb/locality they say they are from or in ' +
    '(e.g. "from Ballarat"). email = their email address if present. ' +
    'Use null for anything not clearly stated. No prose, no markdown — JSON only.'

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({
        model: 'claude-sonnet-5',
        max_tokens: 200,
        system,
        messages: [{ role: 'user', content: text.slice(0, 2000) }],
      }),
    })
    const data = await res.json()
    if (!res.ok) return empty
    const raw = (data.content || []).filter((c: any) => c.type === 'text').map((c: any) => c.text).join('').trim()
    const json = raw.slice(raw.indexOf('{'), raw.lastIndexOf('}') + 1)
    const parsed = JSON.parse(json)
    const clean = (v: any) => (typeof v === 'string' && v.trim() ? v.trim() : null)
    // Gate the name at the source: even though the model is told to return only a
    // self-identified name, it can echo a message fragment ("looking for", "I
    // need help"). Drop anything that doesn't resemble a real name so no consumer
    // of this function can persist a phrase as the contact name.
    const rawName = clean(parsed.name)
    return { name: rawName && isLikelyPersonName(rawName) ? rawName : null, suburb: clean(parsed.suburb), email: clean(parsed.email) }
  } catch {
    return empty
  }
}

// Extract + create/link the contact for one inbound SMS. `db` is a Supabase
// admin client. Returns which contact (if any) it touched.
export async function captureContactFromSms(params: {
  db: any
  companyId: string
  conversationId: string
  from: string
  text: string
}): Promise<{ contactId: string | null; created: boolean }> {
  const { db, companyId, conversationId, from } = params
  const noop = { contactId: null, created: false }
  if (!companyId || !conversationId || !from) return noop

  const details = await extractContactDetails(params.text || '')

  // Resolve the conversation's current contact link.
  let contactId: string | null = null
  try {
    const { data: conv } = await db.from('conversations').select('contact_id').eq('id', conversationId).eq('company_id', companyId).maybeSingle()
    contactId = conv?.contact_id || null
  } catch { return noop }

  const fromDigits = digitsOf(from)

  // Not linked yet → try to find an existing contact by phone before creating one.
  if (!contactId && fromDigits) {
    try {
      const { data: matches } = await db.from('contacts')
        .select('id, phone').eq('company_id', companyId).ilike('phone', `%${fromDigits}%`).limit(10)
      const hit = (matches || []).find((c: any) => c.phone && digitsOf(c.phone) === fromDigits)
      if (hit) contactId = hit.id
    } catch {}
  }

  // ── Existing contact: fill only empty fields, mark them as AI-added ─────────
  if (contactId) {
    try {
      const { data: c } = await db.from('contacts').select('name, phone, suburb, email, ai_saved_fields, ai_rejected').eq('id', contactId).maybeSingle()
      const patch: Record<string, any> = {}
      const marks = new Set<string>((c?.ai_saved_fields as string[]) || [])
      // Values a human already cleared/corrected for this field — never re-fill
      // the same wrong value again (a DIFFERENT value is still allowed).
      const rejected = (c?.ai_rejected && typeof c.ai_rejected === 'object') ? (c.ai_rejected as Record<string, any>) : {}
      const isRejected = (field: string, val: string) =>
        Array.isArray(rejected[field]) && rejected[field].some((v: any) => String(v).trim().toLowerCase() === val.trim().toLowerCase())
      if (!c?.name && details.name && !isRejected('name', details.name)) { patch.name = details.name; marks.add('name') }
      if (!c?.suburb && details.suburb && !isRejected('suburb', details.suburb)) { patch.suburb = details.suburb; marks.add('suburb') }
      if (!c?.email && details.email && !isRejected('email', details.email)) { patch.email = details.email; marks.add('email') }
      if (!c?.phone && fromDigits) { patch.phone = from }
      if (Object.keys(patch).length) {
        patch.ai_saved_fields = Array.from(marks)
        patch.updated_at = new Date().toISOString()
        await db.from('contacts').update(patch).eq('id', contactId)
      }
    } catch {}
    // Make sure the conversation is linked even if it wasn't before.
    try { await db.from('conversations').update({ contact_id: contactId }).eq('id', conversationId).is('contact_id', null) } catch {}
    return { contactId, created: false }
  }

  // ── No contact: create one only when we actually captured something useful ──
  // (a name/suburb/email). We never mint a bare, nameless contact for every
  // random inbound number — that just fills the CRM with noise.
  if (!details.name && !details.suburb && !details.email) return noop

  try {
    const marks: string[] = []
    if (details.name) marks.push('name')
    if (details.suburb) marks.push('suburb')
    if (details.email) marks.push('email')
    const { data: created } = await db.from('contacts').insert({
      company_id: companyId,
      name: details.name || from,
      phone: from,
      suburb: details.suburb || null,
      email: details.email || null,
      source: 'sms',
      ai_saved_fields: marks,
    }).select('id').maybeSingle()
    if (created?.id) {
      await db.from('conversations').update({ contact_id: created.id }).eq('id', conversationId)
      return { contactId: created.id, created: true }
    }
  } catch {}
  return noop
}
