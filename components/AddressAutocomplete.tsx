'use client'

import { useEffect, useRef, useState } from 'react'

// Google Places address autocomplete. Uses the Places JS library loaded on
// demand from NEXT_PUBLIC_GOOGLE_API_KEY. As the user types, Google suggests
// verified addresses; picking one fills the field (and, via onSelect, the
// structured parts so city/state/postcode can be split out).
//
// Requires the "Places API" (and "Maps JavaScript API") enabled on the key in
// Google Cloud. If the key is missing or the API isn't enabled, this silently
// degrades to a plain text input — the user can still type freely.

let scriptPromise: Promise<void> | null = null
function loadPlaces(): Promise<void> {
  if (typeof window === 'undefined') return Promise.resolve()
  if ((window as any).google?.maps?.places) return Promise.resolve()
  if (scriptPromise) return scriptPromise
  const key = process.env.NEXT_PUBLIC_GOOGLE_API_KEY
  if (!key) return Promise.reject(new Error('no key'))
  scriptPromise = new Promise((resolve, reject) => {
    const s = document.createElement('script')
    s.src = `https://maps.googleapis.com/maps/api/js?key=${key}&libraries=places`
    s.async = true
    s.onload = () => resolve()
    s.onerror = () => reject(new Error('places load failed'))
    document.head.appendChild(s)
  })
  return scriptPromise
}

export interface AddressParts {
  formatted: string
  line1?: string
  city?: string
  state?: string
  postcode?: string
  country?: string
}

// Keyless fallback: Photon (OpenStreetMap) autocomplete — no API key, CORS-open.
// Used when NEXT_PUBLIC_GOOGLE_API_KEY isn't set, so address autocomplete works
// out of the box everywhere. Biased to AU but returns anywhere.
async function photonSuggest(q: string): Promise<AddressParts[]> {
  const url = `https://photon.komoot.io/api/?q=${encodeURIComponent(q)}&limit=6&lang=en&lat=-37.8&lon=144.9`
  const res = await fetch(url)
  if (!res.ok) return []
  const d = await res.json().catch(() => ({}))
  return (d.features || []).map((f: any) => {
    const p = f.properties || {}
    const line1 = [p.housenumber, p.street || p.name].filter(Boolean).join(' ')
    const city = p.city || p.town || p.village || p.county || ''
    const bits = [line1 || p.name, city, p.state, p.postcode, p.country].filter(Boolean)
    return { formatted: bits.join(', '), line1: line1 || p.name || '', city, state: p.state || '', postcode: p.postcode || '', country: p.country || '' } as AddressParts
  }).filter((a: AddressParts) => a.formatted)
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
  const inputRef = useRef<HTMLInputElement>(null)
  const acRef = useRef<any>(null)
  const [ready, setReady] = useState(false)
  const [useGoogle, setUseGoogle] = useState(true)
  // Keyless fallback state (Photon dropdown).
  const [suggestions, setSuggestions] = useState<AddressParts[]>([])
  const [openList, setOpenList] = useState(false)
  const debRef = useRef<any>(null)

  useEffect(() => {
    let cancelled = false
    loadPlaces().then(() => {
      if (cancelled || !inputRef.current) return
      const g = (window as any).google
      // Bias to Australia (Roxy's market) but allow anywhere.
      acRef.current = new g.maps.places.Autocomplete(inputRef.current, {
        types: ['address'],
        fields: ['address_components', 'formatted_address'],
      })
      acRef.current.addListener('place_changed', () => {
        const place = acRef.current.getPlace()
        // Google fires place_changed on blur / Enter / re-render too, not only on
        // a real pick. In those cases getPlace() returns the raw typed text with
        // NO address_components and no formatted_address. Bailing here is critical:
        // the old code then ran onChange(place.formatted_address || '') → '' which
        // WIPED whatever the user had typed and saved an empty address.
        if (!place || (!place.address_components && !place.formatted_address)) return
        const get = (type: string, short = false) => {
          const c = (place.address_components || []).find((x: any) => x.types.includes(type))
          return c ? (short ? c.short_name : c.long_name) : ''
        }
        const streetNo = get('street_number')
        const route = get('route')
        const parts: AddressParts = {
          formatted: place.formatted_address || '',
          line1: [streetNo, route].filter(Boolean).join(' '),
          city: get('locality') || get('postal_town') || get('sublocality'),
          state: get('administrative_area_level_1', true),
          postcode: get('postal_code'),
          country: get('country'),
        }
        onChange(place.formatted_address || '')
        onSelect?.(parts)
      })
      setReady(true)
    }).catch(() => { setUseGoogle(false) /* no key → keyless dropdown */ })
    return () => { cancelled = true }
  }, [])

  // Keyless typing → debounced Photon suggestions.
  const onType = (v: string) => {
    onChange(v)
    if (useGoogle) return
    if (debRef.current) clearTimeout(debRef.current)
    if (!v.trim() || v.trim().length < 3) { setSuggestions([]); setOpenList(false); return }
    debRef.current = setTimeout(async () => {
      try { const s = await photonSuggest(v.trim()); setSuggestions(s); setOpenList(s.length > 0) } catch { setSuggestions([]) }
    }, 250)
  }

  const pick = (a: AddressParts) => {
    onChange(a.formatted)
    onSelect?.(a)
    setSuggestions([]); setOpenList(false)
  }

  return (
    <div style={{ position: 'relative' }}>
      <input
        ref={inputRef}
        value={value}
        onChange={(e) => onType(e.target.value)}
        onFocus={() => { if (!useGoogle && suggestions.length) setOpenList(true) }}
        onBlur={() => setTimeout(() => setOpenList(false), 150)}
        placeholder={placeholder || (ready ? 'Start typing an address…' : 'Address')}
        style={style}
        className={className}
        // Stop the browser's / a password manager's own address autofill from
        // covering the dropdown with a "!" bubble and blocking further typing.
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="off"
        spellCheck={false}
        name={`addr-${Math.random().toString(36).slice(2, 9)}`}
        data-1p-ignore="true"
        data-lpignore="true"
        data-form-type="other"
      />
      {!useGoogle && openList && suggestions.length > 0 && (
        <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 60, marginTop: 4, background: '#fff', border: '1px solid var(--border)', borderRadius: 10, boxShadow: '0 12px 32px rgba(0,0,0,0.14)', overflow: 'hidden', maxHeight: 240, overflowY: 'auto' }}>
          {suggestions.map((a, i) => (
            <button key={i} type="button" onMouseDown={(e) => { e.preventDefault(); pick(a) }}
              style={{ display: 'block', width: '100%', textAlign: 'left', padding: '9px 12px', background: 'none', border: 'none', borderBottom: i < suggestions.length - 1 ? '1px solid var(--border)' : 'none', fontSize: 13.5, color: 'var(--ink)', cursor: 'pointer', fontFamily: 'inherit' }}
              onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--canvas)')}
              onMouseLeave={(e) => (e.currentTarget.style.background = 'none')}>
              {a.formatted}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
