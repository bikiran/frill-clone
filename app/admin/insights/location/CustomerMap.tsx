'use client'

import { useEffect, useRef } from 'react'

export type MapPoint = { name: string; revenue: number; customers: number; orders: number; lat: number; lng: number }

const money = (n: number) =>
  new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD', currencyDisplay: 'narrowSymbol' }).format(n || 0)

let leafletPromise: Promise<any> | null = null
function loadLeaflet(): Promise<any> {
  if (typeof window === 'undefined') return Promise.resolve(null)
  if ((window as any).L) return Promise.resolve((window as any).L)
  if (leafletPromise) return leafletPromise
  leafletPromise = new Promise((resolve) => {
    if (!document.querySelector('link[data-leaflet]')) {
      const css = document.createElement('link')
      css.rel = 'stylesheet'
      css.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css'
      css.setAttribute('data-leaflet', '1')
      document.head.appendChild(css)
    }
    const js = document.createElement('script')
    js.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js'
    js.onload = () => resolve((window as any).L)
    js.onerror = () => resolve(null)
    document.head.appendChild(js)
  })
  return leafletPromise
}

export function CustomerMap({ points }: { points: MapPoint[] }) {
  const elRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<any>(null)
  const layerRef = useRef<any>(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const L = await loadLeaflet()
      if (cancelled || !L || !elRef.current) return

      if (!mapRef.current) {
        mapRef.current = L.map(elRef.current, { scrollWheelZoom: false }).setView([-37.8136, 144.9631], 10)
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          attribution: '&copy; OpenStreetMap', maxZoom: 18,
        }).addTo(mapRef.current)
      }
      const map = mapRef.current
      if (layerRef.current) { map.removeLayer(layerRef.current); layerRef.current = null }

      const group = L.layerGroup().addTo(map)
      layerRef.current = group
      const maxRev = Math.max(...points.map(p => p.revenue), 1)
      const latlngs: [number, number][] = []
      for (const p of points) {
        const radius = 7 + Math.sqrt(p.revenue / maxRev) * 26
        const m = L.circleMarker([p.lat, p.lng], {
          radius, color: '#ff7a6b', weight: 2, fillColor: '#ff7a6b', fillOpacity: 0.45,
        })
        m.bindPopup(
          `<div style="font-family:system-ui;font-size:13px"><b>${p.name}</b><br/>` +
          `${money(p.revenue)} &middot; ${p.orders} order${p.orders === 1 ? '' : 's'}<br/>` +
          `${p.customers} customer${p.customers === 1 ? '' : 's'}</div>`
        )
        m.addTo(group)
        latlngs.push([p.lat, p.lng])
      }
      if (latlngs.length === 1) map.setView(latlngs[0], 12)
      else if (latlngs.length > 1) { try { map.fitBounds(latlngs, { padding: [40, 40], maxZoom: 13 }) } catch {} }
      setTimeout(() => { try { map.invalidateSize() } catch {} }, 200)
    })()
    return () => { cancelled = true }
  }, [points])

  useEffect(() => () => { if (mapRef.current) { try { mapRef.current.remove() } catch {}; mapRef.current = null } }, [])

  return <div ref={elRef} style={{ height: 440, width: '100%', borderRadius: 12, overflow: 'hidden', background: 'var(--canvas)' }} />
}
