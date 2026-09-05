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
  // Full postal address the customer states about themselves (e.g. when they
  // text back their address on request). Each part is only filled when clearly
  // stated — the model never invents a postcode or state it wasn't given.
  address: string | null   // street line, e.g. "26 Hopkins Road"
  city: string | null      // town / suburb / locality, e.g. "Fulham"
  state: string | null     // AU state abbreviation, e.g. "VIC"
  postcode: string | null  // e.g. "3851"
  country: string | null   // e.g. "Australia"
}

// Ask Claude for the sender's name / address / email from the message text.
// The phone is NOT extracted here — it's the sender's number, which the caller
// supplies separately (the model never sees it in the body).
export async function extractContactDetails(text: string): Promise<ExtractedContact> {
  const empty: ExtractedContact = {
    name: null, suburb: null, email: null,
    address: null, city: null, state: null, postcode: null, country: null,
  }
  const key = process.env.ANTHROPIC_API_KEY
  if (!key || !text || !text.trim()) return empty

  const system =
    'You extract contact details a customer states about THEMSELVES in an inbound SMS to an ' +
    'Australian business. Return ONLY a compact JSON object with these keys: ' +
    '{"name": string|null, "email": string|null, "address": string|null, "city": string|null, ' +
    '"state": string|null, "postcode": string|null, "country": string|null}. ' +
    'Rules: name = the sender\'s own first/full name only when they clearly self-identify ' +
    '(e.g. "its Dylan here", "this is Sarah Lee") — never a name they mention about someone else, ' +
    'and never a business name. email = their email address if present. ' +
    'For a postal address they give (often when texting back their address): ' +
    'address = the street line ONLY (e.g. "26 Hopkins Road"), never the business name, unit notes, ' +
    'or delivery instructions. city = the town/suburb/locality (e.g. "Fulham"). ' +
    'state = the Australian state as its standard abbreviation (NSW, VIC, QLD, SA, WA, TAS, NT, ACT) ' +
    'when stated OR unambiguous from the locality; else null. ' +
    'postcode = the 4-digit Australian postcode ONLY if it appears in the text — NEVER guess or infer it. ' +
    'country = "Australia" when the address is clearly Australian, else null. ' +
    'Use null for anything not clearly stated. No prose, no markdown — JSON only.'

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({
        model: 'claude-sonnet-5',
        max_tokens: 300,
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
    // The locality doubles as both `city` (shown on the contact card) and `suburb`
    // (used by older suburb-based features) — prefer an explicit city, else suburb.
    const city = clean(parsed.city)
    return {
      name: clean(parsed.name),
      email: clean(parsed.email),
      address: clean(parsed.address),
      city,
      suburb: city,
      state: clean(parsed.state),
      postcode: clean(parsed.postcode),
      country: clean(parsed.country),
    }
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
      const { data: c } = await db.from('contacts').select('name, phone, suburb, email, address, city, state, postcode, country, ai_saved_fields, ai_rejected').eq('id', contactId).maybeSingle()
      const patch: Record<string, any> = {}
      const marks = new Set<string>((c?.ai_saved_fields as string[]) || [])
      // Values a human already cleared/corrected for this field — never re-fill
      // the same wrong value again (a DIFFERENT value is still allowed).
      const rejected = (c?.ai_rejected && typeof c.ai_rejected === 'object') ? (c.ai_rejected as Record<string, any>) : {}
      const isRejected = (field: string, val: string) =>
        Array.isArray(rejected[field]) && rejected[field].some((v: any) => String(v).trim().toLowerCase() === val.trim().toLowerCase())
      // Only ever fill an EMPTY field, skip a value a human rejected, and mark it
      // as AI-added. Same rule for every field, so add the address parts uniformly.
      const fill = (field: keyof ExtractedContact) => {
        const val = (details as any)[field]
        if (val && !(c as any)?.[field] && !isRejected(field, val)) { patch[field] = val; marks.add(field) }
      }
      fill('name')
      fill('suburb')
      fill('email')
      fill('address')
      fill('city')
      fill('state')
      fill('postcode')
      fill('country')
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
  // (a name/address/suburb/email). We never mint a bare, nameless contact for
  // every random inbound number — that just fills the CRM with noise.
  const captured: (keyof ExtractedContact)[] = ['name', 'email', 'address', 'city', 'suburb', 'state', 'postcode', 'country']
  if (!captured.some(f => (details as any)[f])) return noop

  try {
    const marks = captured.filter(f => (details as any)[f]) as string[]
    const { data: created } = await db.from('contacts').insert({
      company_id: companyId,
      name: details.name || from,
      phone: from,
      suburb: details.suburb || null,
      email: details.email || null,
      address: details.address || null,
      city: details.city || null,
      state: details.state || null,
      postcode: details.postcode || null,
      country: details.country || null,
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
