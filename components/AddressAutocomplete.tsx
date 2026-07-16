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
        if (!place) return
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
    }).catch(() => { /* degrade to plain input */ })
    return () => { cancelled = true }
  }, [])

  return (
    <input
      ref={inputRef}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder || (ready ? 'Start typing an address…' : 'Address')}
      style={style}
      className={className}
      // Stop the browser's own autofill covering Google's dropdown.
      autoComplete="off"
    />
  )
}
