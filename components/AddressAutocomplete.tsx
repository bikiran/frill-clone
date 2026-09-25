'use client'

import { useEffect, useRef, useState } from 'react'

// Address autocomplete with a fully self-controlled dropdown.
//
// The input is a plain React-controlled <input>; NO third-party widget is ever
// attached to it. (The old version bolted Google's legacy `places.Autocomplete`
// onto the DOM node, which fought React for control of the field — it summoned
// the browser's autofill "!" bubble and, on keys without the legacy API, froze
// typing after the first character.)
//
// Suggestions come from whichever provider is available:
//   • Google Places Autocomplete (New) REST — used when NEXT_PUBLIC_GOOGLE_API_KEY
//     is set. CORS-open, current API. Needs "Places API (New)" enabled on the key.
//   • Photon (OpenStreetMap) — keyless fallback, used when there's no key OR when
//     a Google request fails for any reason (API not enabled, quota, network).
// Either way they render into the same dropdown below, so the field always works.

const GKEY = process.env.NEXT_PUBLIC_GOOGLE_API_KEY

export interface AddressParts {
  formatted: string
  line1?: string
  city?: string
  state?: string
  postcode?: string
  country?: string
}

type Suggestion = { label: string; placeId?: string; parts?: AddressParts }

function newToken(): string {
  try { return (crypto as any)?.randomUUID?.() || Math.random().toString(36).slice(2) }
  catch { return Math.random().toString(36).slice(2) }
}

// ── Google Places (New) ──────────────────────────────────────────────────────
async function googleSuggest(q: string, token: string): Promise<Suggestion[]> {
  const res = await fetch('https://places.googleapis.com/v1/places:autocomplete', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': GKEY! },
    body: JSON.stringify({ input: q, sessionToken: token }),
  })
  if (!res.ok) throw new Error(`google autocomplete ${res.status}`)
  const d = await res.json()
  return (d.suggestions || [])
    .map((s: any) => {
      const p = s.placePrediction
      return p?.placeId ? { label: p?.text?.text || '', placeId: p.placeId } : null
    })
    .filter((x: any): x is Suggestion => !!x && !!x.label)
}

async function googleDetails(placeId: string, token: string): Promise<AddressParts> {
  const res = await fetch(
    `https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}?sessionToken=${encodeURIComponent(token)}`,
    { headers: { 'X-Goog-Api-Key': GKEY!, 'X-Goog-FieldMask': 'formattedAddress,addressComponents' } }
  )
  if (!res.ok) throw new Error(`google details ${res.status}`)
  const d = await res.json()
  const comps: any[] = d.addressComponents || []
  const get = (type: string, short = false) => {
    const c = comps.find((x) => (x.types || []).includes(type))
    return c ? (short ? c.shortText || c.longText : c.longText || c.shortText) : ''
  }
  const line1 = [get('street_number'), get('route')].filter(Boolean).join(' ')
  return {
    formatted: d.formattedAddress || '',
    line1,
    city: get('locality') || get('postal_town') || get('sublocality'),
    state: get('administrative_area_level_1', true),
    postcode: get('postal_code'),
    country: get('country'),
  }
}

// ── Photon (keyless) ─────────────────────────────────────────────────────────
// Biased to AU (Roxy's market) but returns anywhere.
async function photonSuggest(q: string): Promise<Suggestion[]> {
  const url = `https://photon.komoot.io/api/?q=${encodeURIComponent(q)}&limit=6&lang=en&lat=-37.8&lon=144.9`
  const res = await fetch(url)
  if (!res.ok) return []
  const d = await res.json().catch(() => ({}))
  return (d.features || [])
    .map((f: any) => {
      const p = f.properties || {}
      const line1 = [p.housenumber, p.street || p.name].filter(Boolean).join(' ')
      // Prefer the actual suburb (OSM puts it in `district`/`locality`/`suburb`)
      // over the metropolitan `city`. Otherwise a Melbourne address came back as
      // "…, Melbourne, Victoria" instead of "…, Dallas, Victoria".
      const suburb = p.district || p.locality || p.suburb || p.neighbourhood || ''
      const city = suburb || p.city || p.town || p.village || p.county || ''
      const bits = [line1 || p.name, city, p.state, p.postcode, p.country].filter(Boolean)
      const parts: AddressParts = { formatted: bits.join(', '), line1: line1 || p.name || '', city, state: p.state || '', postcode: p.postcode || '', country: p.country || '' }
      return parts.formatted ? { label: parts.formatted, parts } : null
    })
    .filter((x: any): x is Suggestion => !!x)
}

export default function AddressAutocomplete({
  value, onChange, onSelect, placeholder, style, className,
}: {
  value: string
  onChange: (v: string) => void
  onSelect?: (parts: AddressParts) => void
  placeholder?: string
  style?: React.CSSProperties
  className?: string
}) {
  const [suggestions, setSuggestions] = useState<Suggestion[]>([])
  const [openList, setOpenList] = useState(false)
  const debRef = useRef<any>(null)
  const tokenRef = useRef<string>(newToken())
  // Once a Google request fails we stop trying it for this field and use Photon.
  const googleOk = useRef<boolean>(!!GKEY)

  useEffect(() => () => { if (debRef.current) clearTimeout(debRef.current) }, [])

  const fetchSuggestions = async (q: string): Promise<Suggestion[]> => {
    if (googleOk.current) {
      try { return await googleSuggest(q, tokenRef.current) }
      catch { googleOk.current = false /* fall through to Photon */ }
    }
    try { return await photonSuggest(q) } catch { return [] }
  }

  const onType = (v: string) => {
    onChange(v)
    if (debRef.current) clearTimeout(debRef.current)
    if (!v.trim() || v.trim().length < 3) { setSuggestions([]); setOpenList(false); return }
    debRef.current = setTimeout(async () => {
      const s = await fetchSuggestions(v.trim())
      setSuggestions(s); setOpenList(s.length > 0)
    }, 250)
  }

  const pick = async (s: Suggestion) => {
    setSuggestions([]); setOpenList(false)
    // Photon suggestions already carry structured parts.
    if (s.parts) { onChange(s.parts.formatted); onSelect?.(s.parts); return }
    // Google: show the label immediately, then resolve structured parts.
    onChange(s.label)
    if (s.placeId && googleOk.current) {
      try {
        const parts = await googleDetails(s.placeId, tokenRef.current)
        onChange(parts.formatted || s.label)
        onSelect?.(parts)
      } catch {
        onSelect?.({ formatted: s.label })
      }
      // A new session token after each completed pick (Google billing convention).
      tokenRef.current = newToken()
    } else {
      onSelect?.({ formatted: s.label })
    }
  }

  return (
    <div style={{ position: 'relative' }}>
      <input
        value={value}
        onChange={(e) => onType(e.target.value)}
        onFocus={() => { if (suggestions.length) setOpenList(true) }}
        onBlur={() => setTimeout(() => setOpenList(false), 150)}
        placeholder={placeholder || 'Start typing an address…'}
        style={style}
        className={className}
        // Keep the browser's / a password manager's own address autofill from
        // covering the dropdown with a "!" bubble.
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="off"
        spellCheck={false}
        name={`addr-${Math.random().toString(36).slice(2, 9)}`}
        data-1p-ignore="true"
        data-lpignore="true"
        data-form-type="other"
      />
      {openList && suggestions.length > 0 && (
        <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 60, marginTop: 4, background: '#fff', border: '1px solid var(--border)', borderRadius: 10, boxShadow: '0 12px 32px rgba(0,0,0,0.14)', overflow: 'hidden', maxHeight: 240, overflowY: 'auto' }}>
          {suggestions.map((a, i) => (
            <button key={i} type="button" onMouseDown={(e) => { e.preventDefault(); pick(a) }}
              style={{ display: 'block', width: '100%', textAlign: 'left', padding: '9px 12px', background: 'none', border: 'none', borderBottom: i < suggestions.length - 1 ? '1px solid var(--border)' : 'none', fontSize: 13.5, color: 'var(--ink)', cursor: 'pointer', fontFamily: 'inherit' }}
              onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--canvas)')}
              onMouseLeave={(e) => (e.currentTarget.style.background = 'none')}>
              {a.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
