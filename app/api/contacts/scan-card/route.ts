import { NextRequest, NextResponse } from 'next/server'
import { guardAiRequest } from '@/lib/rate-limit'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
// Vision extraction on a phone photo can take several seconds — give it room.
export const maxDuration = 30

// Scan a business card / contact photo and pull out the fields the New-contact
// form needs. The browser sends a downscaled JPEG/PNG (base64); Claude reads it
// and returns a flat contact object. This is the web counterpart to the mobile
// "scan contact" button — same idea, same ANTHROPIC_API_KEY.
//
// It only ever RETURNS extracted fields; the client decides what to fill and
// the human reviews before saving. Nothing is written to the database here.

const ALLOWED_MEDIA = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif'])

const clean = (v: any) => (typeof v === 'string' && v.trim() ? v.trim() : null)

export interface ScannedContact {
  name: string | null
  company_name: string | null
  phone: string | null
  email: string | null
  address: string | null
  city: string | null
  state: string | null
  postcode: string | null
  country: string | null
  notes: string | null
}

const EMPTY: ScannedContact = {
  name: null, company_name: null, phone: null, email: null,
  address: null, city: null, state: null, postcode: null, country: null, notes: null,
}

export async function POST(req: NextRequest) {
  try {
    const { companyId, image, mediaType } = await req.json()

    if (!image || typeof image !== 'string') {
      return NextResponse.json({ ok: false, error: 'No image provided' }, { status: 400 })
    }
    // Accept either a raw base64 string or a full data URL — strip the prefix.
    const base64 = image.includes(',') ? image.slice(image.indexOf(',') + 1) : image
    const media = ALLOWED_MEDIA.has(mediaType) ? mediaType : 'image/jpeg'
    if (!base64.trim()) {
      return NextResponse.json({ ok: false, error: 'Empty image' }, { status: 400 })
    }

    // Same per-company burst + daily ceiling as the other AI endpoints — a
    // vision call is more expensive than a text one, so it must be metered.
    const guard = await guardAiRequest(req, companyId, 'scan-card')
    if (!guard.ok) return guard.response!

    const key = process.env.ANTHROPIC_API_KEY
    if (!key) {
      // No silent fallback here: scanning is the whole point, so tell the caller
      // plainly rather than returning an empty form that looks like a bad scan.
      return NextResponse.json(
        { ok: false, error: 'Photo scanning is not configured (ANTHROPIC_API_KEY missing).' },
        { status: 503 },
      )
    }

    const system =
      'You read a photo of a business card, contact card, letterhead, email signature ' +
      'or handwritten contact details and extract the person\'s details. ' +
      'Return ONLY a compact JSON object with exactly these keys: ' +
      '{"name","company_name","phone","email","address","city","state","postcode","country","notes"}. ' +
      'Rules: name = the person\'s full name (not the business). company_name = their organisation. ' +
      'phone = a single best phone number in the format printed (prefer mobile, else the main line). ' +
      'email = their email address. address = street line only. city = city/suburb/town. ' +
      'state = state/province/region. postcode = postal/ZIP code. country = country if shown. ' +
      'notes = their job title or role if present (e.g. "Sales Manager"), otherwise null. ' +
      'Use null for anything not clearly legible. Do not invent or guess values. ' +
      'No prose, no markdown — JSON only.'

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-5',
        max_tokens: 400,
        system,
        messages: [{
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: media, data: base64 } },
            { type: 'text', text: 'Extract this contact\'s details as JSON.' },
          ],
        }],
      }),
    })

    if (!res.ok) {
      // Surface the real upstream failure (bad key / no credits / bad model) so
      // the same key/credits problem the AI summariser hits is diagnosable here
      // too, instead of masquerading as an unreadable card.
      const detail = await res.text()
      return NextResponse.json(
        { ok: false, error: 'Scan failed', detail: detail.slice(0, 500) },
        { status: 502 },
      )
    }

    const data = await res.json()
    const raw = (data.content || [])
      .filter((c: any) => c.type === 'text')
      .map((c: any) => c.text)
      .join('')
      .trim()

    let parsed: any = {}
    try {
      const json = raw.slice(raw.indexOf('{'), raw.lastIndexOf('}') + 1)
      parsed = JSON.parse(json)
    } catch {
      return NextResponse.json(
        { ok: false, error: 'Could not read contact details from that photo. Try a clearer, well-lit shot.' },
        { status: 422 },
      )
    }

    const fields: ScannedContact = {
      name: clean(parsed.name),
      company_name: clean(parsed.company_name),
      phone: clean(parsed.phone),
      email: clean(parsed.email),
      address: clean(parsed.address),
      city: clean(parsed.city),
      state: clean(parsed.state),
      postcode: clean(parsed.postcode),
      country: clean(parsed.country),
      notes: clean(parsed.notes),
    }

    const found = Object.values(fields).some(v => v !== null)
    if (!found) {
      return NextResponse.json(
        { ok: false, error: 'No contact details found in that photo. Try a clearer, well-lit shot.', fields: EMPTY },
        { status: 422 },
      )
    }

    return NextResponse.json({ ok: true, fields })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || 'Scan failed' }, { status: 500 })
  }
}
