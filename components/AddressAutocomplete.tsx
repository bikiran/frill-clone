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
// The browser's region (en-AU → "au") nudges Google towards local addresses
// without ruling out the rest of the world.
function browserRegion(): string | undefined {
  try {
    const r = (navigator.language || '').split('-')[1]
    return r && /^[a-z]{2}$/i.test(r) ? r.toLowerCase() : undefined
  } catch { return undefined }
}

async function googleSuggest(q: string, token: string): Promise<Suggestion[]> {
  const regionCode = browserRegion()
  const res = await fetch('https://places.googleapis.com/v1/places:autocomplete', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': GKEY! },
    body: JSON.stringify({ input: q, sessionToken: token, ...(regionCode ? { regionCode } : {}) }),
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
  value, onChange, onSelect, placeholder, style, className, required, id, ariaLabel, maxLength,
}: {
  value: string
  onChange: (v: string) => void
  onSelect?: (parts: AddressParts) => void
  placeholder?: string
  required?: boolean
  style?: React.CSSProperties
  className?: string
  /** For a <label htmlFor>. */
  id?: string
  ariaLabel?: string
  maxLength?: number
}) {
  const [suggestions, setSuggestions] = useState<Suggestion[]>([])
  const [openList, setOpenList] = useState(false)
  const [active, setActive] = useState(-1)
  const debRef = useRef<any>(null)
  const tokenRef = useRef<string>(newToken())
  // Only the newest lookup may fill the list, so a slow answer for "5 c"
  // can't replace the one for "5 co".
  const seqRef = useRef(0)
  const nameRef = useRef(`addr-${Math.random().toString(36).slice(2, 9)}`)
  const listId = useRef(`addr-list-${Math.random().toString(36).slice(2, 9)}`).current
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
    const mine = ++seqRef.current
    if (!v.trim() || v.trim().length < 3) { setSuggestions([]); setOpenList(false); setActive(-1); return }
    debRef.current = setTimeout(async () => {
      const s = await fetchSuggestions(v.trim())
      if (mine !== seqRef.current) return
      setSuggestions(s); setOpenList(s.length > 0); setActive(-1)
    }, 200)
  }

  const pick = async (s: Suggestion) => {
    ++seqRef.current
    setSuggestions([]); setOpenList(false); setActive(-1)
    // Photon suggestions already carry structured parts.
    if (s.parts) { onChange(s.parts.formatted); onSelect?.(s.parts); return }
    // Google: show the label immediately, then resolve structured parts.
    onChange(s.label)
    if (s.placeId && googleOk.current) {
      try {
        const parts = await googleDetails(s.placeId, tokenRef.current)
        onChange(parts.formatted || s.label)
        onSelect?.({ ...parts, formatted: parts.formatted || s.label })
      } catch {
        onSelect?.({ formatted: s.label })
      }
      // A new session token after each completed pick (Google billing convention).
      tokenRef.current = newToken()
    } else {
      onSelect?.({ formatted: s.label })
    }
  }

  const onKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!openList || !suggestions.length) return
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive(a => (a + 1) % suggestions.length) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(a => (a <= 0 ? suggestions.length - 1 : a - 1)) }
    else if (e.key === 'Enter' && active >= 0) { e.preventDefault(); pick(suggestions[active]) }
    else if (e.key === 'Escape') { e.preventDefault(); setOpenList(false); setActive(-1) }
  }

  const shown = openList && suggestions.length > 0
  return (
    <div style={{ position: 'relative' }}>
      <input
        id={id}
        aria-label={ariaLabel}
        value={value}
        onChange={(e) => onType(e.target.value)}
        onKeyDown={onKey}
        onFocus={() => { if (suggestions.length) setOpenList(true) }}
        onBlur={() => setTimeout(() => setOpenList(false), 150)}
        placeholder={placeholder || 'Start typing an address…'}
        required={required}
        maxLength={maxLength}
        style={style}
        className={className}
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={shown}
        aria-controls={listId}
        aria-activedescendant={shown && active >= 0 ? `${listId}-${active}` : undefined}
        // Keep the browser's / a password manager's own address autofill from
        // covering the dropdown with a "!" bubble.
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="off"
        spellCheck={false}
        name={nameRef.current}
        data-1p-ignore="true"
        data-lpignore="true"
        data-form-type="other"
      />
      {shown && (
        <div id={listId} role="listbox" className="addr-ac-list" style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 60, marginTop: 6, background: 'var(--card, #fff)', border: '1px solid var(--line, var(--border))', borderRadius: 14, boxShadow: '0 14px 36px rgba(0,0,0,0.14)', padding: 4, maxHeight: 260, overflowY: 'auto' }}>
          {suggestions.map((a, i) => (
            <button key={i} id={`${listId}-${i}`} type="button" role="option" aria-selected={i === active} tabIndex={-1}
              onMouseDown={(e) => { e.preventDefault(); pick(a) }}
              onMouseEnter={() => setActive(i)}
              style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', textAlign: 'left', padding: '9px 10px', background: i === active ? 'var(--f, var(--canvas, #f4f4f5))' : 'none', border: 'none', borderRadius: 10, fontSize: 14, lineHeight: 1.35, color: 'var(--ink)', cursor: 'pointer', fontFamily: 'inherit' }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden style={{ flexShrink: 0, opacity: 0.55 }}><path d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21z" /><circle cx="12" cy="9.5" r="2.5" /></svg>
              <span style={{ minWidth: 0, overflowWrap: 'anywhere' }}>{a.label}</span>
            </button>
          ))}
          {GKEY && googleOk.current && <div aria-hidden style={{ padding: '6px 10px 4px', fontSize: 11, color: 'var(--mut, #71717a)', textAlign: 'right' }}>Powered by Google</div>}
        </div>
      )}
    </div>
  )
}
