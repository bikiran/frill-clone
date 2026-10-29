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

export function CustomerMap({ points, height = 440 }: { points: MapPoint[]; height?: number }) {
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
          radius, color: '#ff5a3c', weight: 1.5, fillColor: '#ff6a4d', fillOpacity: 0.42,
        })
        m.bindPopup(
          `<div style="font:13px/1.45 -apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif"><b style="font-size:14px">${p.name}</b><br/>` +
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

  // isolation keeps Leaflet's own stacking (its +/- controls sit at z-index
  // 1000) inside the map, so the rail's flyouts and menus draw over it.
  return (
    <>
      <style>{MAP_CSS}</style>
      <div ref={elRef} className="cmap" style={{ height, width: '100%', borderRadius: 16, overflow: 'hidden', background: '#f4f4f5', isolation: 'isolate', position: 'relative', zIndex: 0 }} />
    </>
  )
}

// Softer, grey tiles so the bubbles stand out; pill zoom buttons.
const MAP_CSS = `
.cmap .leaflet-tile-pane{filter:grayscale(1) contrast(.92) brightness(1.04)}
.cmap .leaflet-control-zoom{border:none!important;border-radius:14px!important;overflow:hidden;box-shadow:0 0 0 1px rgba(0,0,0,.06),0 6px 16px -6px rgba(16,24,40,.25)!important}
.cmap .leaflet-control-zoom a{width:34px!important;height:34px!important;line-height:34px!important;color:#18181b!important;border-bottom-color:#f1f1f3!important}
.cmap .leaflet-control-zoom a::before{display:none!important}
.cmap .leaflet-popup-content-wrapper{border-radius:14px;box-shadow:0 12px 32px -10px rgba(16,24,40,.3)}
.cmap .leaflet-control-attribution{font-size:10px;background:rgba(255,255,255,.75)!important;border-radius:8px 0 0 0}
`
