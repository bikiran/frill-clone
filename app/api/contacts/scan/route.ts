import { NextRequest, NextResponse } from 'next/server'
import { guardAiRequest } from '@/lib/rate-limit'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

/**
 * POST /api/contacts/scan  { companyId, image (base64, no data: prefix), mediaType }
 *
 * Reads contact details out of a photo — a business card, a screenshot of a
 * message, an email signature, anything with contact info — using Claude's
 * vision, and returns them as structured fields for the mobile "New contact"
 * form to auto-fill. Extraction only: it never invents data.
 */
export async function POST(req: NextRequest) {
  try {
    const { companyId, image, mediaType } = await req.json()
    if (!image || typeof image !== 'string') {
      return NextResponse.json({ error: 'No image provided' }, { status: 400 })
    }

    const guard = await guardAiRequest(req, companyId, 'contact-scan')
    if (!guard.ok) return guard.response!

    const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY
    if (!ANTHROPIC_KEY) {
      return NextResponse.json({ error: 'AI is not configured on the server' }, { status: 503 })
    }

    const media = typeof mediaType === 'string' && /^image\/(jpeg|png|webp|gif)$/.test(mediaType) ? mediaType : 'image/jpeg'

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': ANTHROPIC_KEY,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-5',
        max_tokens: 500,
        messages: [{
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: media, data: image } },
            {
              type: 'text',
              text: [
                'Extract the contact details from this image (it may be a business card, a screenshot of a chat/email, or a photo of a document).',
                'Respond with ONLY a JSON object in exactly this shape, no prose, no code fences:',
                '{"name":"","phone":"","email":"","company_name":"","address":"","city":"","state":"","postcode":"","country":""}',
                'Rules: use an empty string for any field not clearly present. Do NOT invent or guess data. "name" is the person\'s full name (not the company). "company_name" is the business/organisation. "address" is the street line only; put suburb/city, state, postcode and country in their own fields. Keep the phone number formatted as shown.',
              ].join(' '),
            },
          ],
        }],
      }),
    })

    if (!res.ok) {
      const err = await res.text()
      console.error('[contacts/scan] anthropic error', res.status, err)
      let detail = err
      try { detail = JSON.parse(err)?.error?.message || err } catch {}
      return NextResponse.json({ error: `Scan failed (${res.status})`, detail: String(detail).slice(0, 300) }, { status: 502 })
    }

    const data = await res.json()
    const text = data.content?.[0]?.text || ''
    const clean = text.replace(/```json|```/g, '').trim()
    let parsed: any = {}
    try { parsed = JSON.parse(clean) } catch {
      return NextResponse.json({ error: 'Could not read details from that image' }, { status: 422 })
    }

    // Whitelist + stringify so the client gets a predictable shape.
    const keys = ['name', 'phone', 'email', 'company_name', 'address', 'city', 'state', 'postcode', 'country'] as const
    const contact: Record<string, string> = {}
    for (const k of keys) contact[k] = typeof parsed?.[k] === 'string' ? parsed[k].trim() : ''

    return NextResponse.json({ contact })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
