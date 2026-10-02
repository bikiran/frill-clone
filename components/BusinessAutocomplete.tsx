'use client'

import { useEffect, useRef, useState } from 'react'

// "Find on Google" business search for signup.
//
// A plain React-controlled <input> with our own dropdown — NO Google widget is
// attached to it. (The old version bolted Google's legacy `places.Autocomplete`
// onto the field; with the legacy Places API not enabled it showed Google's "!"
// error icon and froze typing after a letter or two.)
//
// Suggestions:
//   • Google Places API (New) REST — business name, address, website, phone and
//     opening hours. Needs "Places API (New)" enabled and allowed on
//     NEXT_PUBLIC_GOOGLE_API_KEY.
//   • Photon (OpenStreetMap) — keyless fallback when Google isn't available, so
//     the field always responds (fewer businesses, no phone/hours).

const GKEY = process.env.NEXT_PUBLIC_GOOGLE_API_KEY

export interface DayHours { open: boolean; from: string; to: string }
export type BusinessHours = Record<string, DayHours>

export interface BusinessDetails {
  name: string
  address?: string
  city?: string
  state?: string
  postcode?: string
  country?: string
  website?: string
  phone?: string
  hours?: BusinessHours | null
  source?: 'google' | 'osm'
}

export const DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'] as const

export function emptyHours(): BusinessHours {
  const h: BusinessHours = {}
  for (const d of DAYS) h[d] = { open: d !== 'saturday' && d !== 'sunday', from: '09:00', to: '17:00' }
  return h
}

type Suggestion = { main: string; sub: string; placeId?: string; details?: BusinessDetails }

const newToken = () => { try { return (crypto as any)?.randomUUID?.() || Math.random().toString(36).slice(2) } catch { return Math.random().toString(36).slice(2) } }
const pad = (n: number) => String(n).padStart(2, '0')

// Places (New) regularOpeningHours.periods → our per-day schema (day: 0=Sun).
function hoursFromPlaces(oh: any): BusinessHours | null {
  const periods = oh?.periods
  if (!Array.isArray(periods) || !periods.length) return null
  const key = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']
  const out: BusinessHours = {}
  for (const d of DAYS) out[d] = { open: false, from: '09:00', to: '17:00' }
  // Open 24/7 is a single period with no close.
  if (periods.length === 1 && !periods[0].close) { for (const d of DAYS) out[d] = { open: true, from: '00:00', to: '23:59' }; return out }
  for (const p of periods) {
    const k = key[p?.open?.day]
    if (!k) continue
    out[k] = { open: true, from: `${pad(p.open.hour ?? 9)}:${pad(p.open.minute ?? 0)}`, to: p.close ? `${pad(p.close.hour ?? 17)}:${pad(p.close.minute ?? 0)}` : '23:59' }
  }
  return out
}

async function googleSuggest(q: string, token: string): Promise<Suggestion[]> {
  const res = await fetch('https://places.googleapis.com/v1/places:autocomplete', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': GKEY! },
    body: JSON.stringify({ input: q, sessionToken: token }),
  })
  if (!res.ok) throw new Error(`google ${res.status}`)
  const d = await res.json()
  return (d.suggestions || []).map((s: any) => s.placePrediction).filter((p: any) => p?.placeId).map((p: any) => ({
    main: p.structuredFormat?.mainText?.text || p.text?.text || '',
    sub: p.structuredFormat?.secondaryText?.text || '',
    placeId: p.placeId,
  })).filter((s: Suggestion) => s.main)
}

async function googleDetails(placeId: string, token: string): Promise<BusinessDetails> {
  const res = await fetch(`https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}?sessionToken=${encodeURIComponent(token)}`, {
    headers: {
      'X-Goog-Api-Key': GKEY!,
      'X-Goog-FieldMask': 'displayName,formattedAddress,addressComponents,websiteUri,internationalPhoneNumber,nationalPhoneNumber,regularOpeningHours',
    },
  })
  if (!res.ok) throw new Error(`google details ${res.status}`)
  const p = await res.json()
  const comps: any[] = p.addressComponents || []
  const get = (type: string, short = false) => { const c = comps.find(x => (x.types || []).includes(type)); return c ? (short ? c.shortText || c.longText : c.longText || c.shortText) : '' }
  return {
    name: p.displayName?.text || '',
    address: p.formattedAddress || '',
    city: get('locality') || get('postal_town') || get('sublocality'),
    state: get('administrative_area_level_1', true),
    postcode: get('postal_code'),
    country: get('country'),
    website: p.websiteUri || '',
    phone: p.nationalPhoneNumber || p.internationalPhoneNumber || '',
    hours: hoursFromPlaces(p.regularOpeningHours),
    source: 'google',
  }
}

// Bias OpenStreetMap results toward where the person is (by timezone).
function photonBias(): string {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || ''
    if (tz.startsWith('Australia/')) return '&lat=-33.9&lon=146.0'
    if (tz.startsWith('Pacific/Auckland')) return '&lat=-41.3&lon=174.8'
    if (tz.startsWith('Europe/London')) return '&lat=51.5&lon=-0.1'
    if (tz.startsWith('America/')) return '&lat=39.8&lon=-98.6'
  } catch {}
  return ''
}

async function photonSuggest(q: string): Promise<Suggestion[]> {
  const res = await fetch(`https://photon.komoot.io/api/?q=${encodeURIComponent(q)}&limit=6&lang=en${photonBias()}`)
  if (!res.ok) return []
  const d = await res.json().catch(() => ({}))
  return (d.features || []).map((f: any) => {
    const p = f.properties || {}
    if (!p.name) return null
    const street = [p.housenumber, p.street].filter(Boolean).join(' ')
    const city = p.district || p.locality || p.suburb || p.city || p.town || p.village || ''
    const address = [street, city, p.state, p.postcode, p.country].filter(Boolean).join(', ')
    return { main: p.name, sub: [city, p.state].filter(Boolean).join(', ') || p.country || '', details: { name: p.name, address, city, state: p.state || '', postcode: p.postcode || '', country: p.country || '', source: 'osm' } }
  }).filter(Boolean) as Suggestion[]
}

const PinIcon = () => <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M12 21s-7-6.2-7-12a7 7 0 0 1 14 0c0 5.8-7 12-7 12z" /><circle cx="12" cy="9" r="2.5" /></svg>

export default function BusinessAutocomplete({
  value, onChange, onSelect, placeholder, style, className,
}: {
  value: string
  onChange: (v: string) => void
  onSelect?: (details: BusinessDetails) => void
  placeholder?: string
  style?: React.CSSProperties
  className?: string
}) {
  const [items, setItems] = useState<Suggestion[]>([])
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const [busy, setBusy] = useState(false)
  const debRef = useRef<any>(null)
  const seq = useRef(0)
  const tokenRef = useRef(newToken())
  const googleOk = useRef(!!GKEY)   // once Google fails, use OpenStreetMap for this field

  useEffect(() => () => { if (debRef.current) clearTimeout(debRef.current) }, [])

  const search = async (q: string) => {
    const my = ++seq.current
    setBusy(true)
    let out: Suggestion[] = []
    if (googleOk.current) {
      try { out = await googleSuggest(q, tokenRef.current) } catch { googleOk.current = false }
    }
    if (!googleOk.current) { try { out = await photonSuggest(q) } catch { out = [] } }
    if (my !== seq.current) return       // a newer keystroke won
    setBusy(false); setItems(out); setActive(0); setOpen(out.length > 0)
  }

  const onType = (v: string) => {
    onChange(v)
    if (debRef.current) clearTimeout(debRef.current)
    if (v.trim().length < 2) { seq.current++; setItems([]); setOpen(false); setBusy(false); return }
    debRef.current = setTimeout(() => search(v.trim()), 220)
  }

  const pick = async (s: Suggestion) => {
    setOpen(false); setItems([])
    onChange(s.main)
    if (s.details) { onSelect?.(s.details); return }
    if (!s.placeId) return
    setBusy(true)
    try { onSelect?.(await googleDetails(s.placeId, tokenRef.current)) }
    catch { onSelect?.({ name: s.main, address: s.sub, source: 'google' }) }
    finally { setBusy(false); tokenRef.current = newToken() }
  }

  const onKey = (e: React.KeyboardEvent) => {
    if (!open || !items.length) return
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive(i => (i + 1) % items.length) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(i => (i - 1 + items.length) % items.length) }
    else if (e.key === 'Enter') { e.preventDefault(); pick(items[active]) }
    else if (e.key === 'Escape') setOpen(false)
  }

  return (
    <div style={{ position: 'relative' }}>
      <style>{`
        .bza-list{animation:bzaIn .18s cubic-bezier(.22,1,.36,1) both;transform-origin:top center}
        @keyframes bzaIn{from{opacity:0;transform:translate3d(0,-4px,0) scale(.99)}to{opacity:1;transform:none}}
        .bza-spin{width:16px;height:16px;border-radius:50%;border:2px solid #e5e7eb;border-top-color:#9ca3af;animation:bzaSpin .7s linear infinite}
        @keyframes bzaSpin{to{transform:rotate(360deg)}}
        @media (prefers-reduced-motion:reduce){.bza-list{animation:none}}
      `}</style>
      <input
        value={value}
        onChange={e => onType(e.target.value)}
        onKeyDown={onKey}
        onFocus={() => { if (items.length) setOpen(true) }}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder={placeholder || 'Search your business name…'}
        style={{ ...style, paddingRight: 40 }}
        className={className}
        role="combobox"
        aria-expanded={open}
        aria-autocomplete="list"
        // Keep browser / password-manager autofill from covering the list.
        autoComplete="off" autoCorrect="off" autoCapitalize="off" spellCheck={false}
        name="biz-search" data-1p-ignore="true" data-lpignore="true" data-form-type="other"
      />
      {busy && <span className="bza-spin" aria-hidden style={{ position: 'absolute', right: 14, top: '50%', marginTop: -8 }} />}
      {open && items.length > 0 && (
        <div className="bza-list" role="listbox" style={{ position: 'absolute', top: 'calc(100% + 6px)', left: 0, right: 0, zIndex: 60, background: '#fff', border: '1px solid #ececef', borderRadius: 14, boxShadow: '0 18px 40px -12px rgba(16,24,40,.25)', overflow: 'hidden', maxHeight: 300, overflowY: 'auto', padding: 4 }}>
          {items.map((s, i) => (
            <button key={i} type="button" role="option" aria-selected={i === active}
              onMouseDown={e => { e.preventDefault(); pick(s) }} onMouseEnter={() => setActive(i)}
              style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', textAlign: 'left', padding: '10px 12px', border: 'none', borderRadius: 10, background: i === active ? '#f5f5f7' : 'transparent', cursor: 'pointer', fontFamily: 'inherit' }}>
              <span style={{ width: 30, height: 30, borderRadius: 9, background: '#fff1ee', color: '#ff6a4d', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><PinIcon /></span>
              <span style={{ minWidth: 0 }}>
                <span style={{ display: 'block', fontSize: 14, fontWeight: 700, color: '#0d0d0d', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.main}</span>
                {s.sub && <span style={{ display: 'block', fontSize: 12.5, color: '#6b7280', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.sub}</span>}
              </span>
            </button>
          ))}
          {!googleOk.current && <p style={{ margin: 0, padding: '6px 12px 4px', fontSize: 11, color: '#9ca3af' }}>Results from OpenStreetMap · can&rsquo;t find it? Use “Enter manually”.</p>}
        </div>
      )}
    </div>
  )
}
