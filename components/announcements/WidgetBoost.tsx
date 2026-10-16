'use client'

// A boosted announcement in the chat widget (app/widget/page.tsx).
//   • banner — a slim card at the top of the widget until the visitor closes it.
//   • popup  — while the widget is closed, the embed script (public/widget.js)
//     shows a small card beside the chat bubble; tapping it opens the widget
//     on the post. Closing either one is remembered for that post.
// Only live posts reach the widget (api/widget-data), so an expired sale
// never pops up.

import { useEffect, useMemo, useState } from 'react'

const KEY = 'colvy_boost_dismissed'
function readDismissed(): string[] {
  try { const v = JSON.parse(localStorage.getItem(KEY) || '[]'); return Array.isArray(v) ? v.slice(-50) : [] } catch { return [] }
}
function writeDismissed(ids: string[]) { try { localStorage.setItem(KEY, JSON.stringify(ids.slice(-50))) } catch {} }

export default function WidgetBoost({ announcements, accent, widgetOpen, onOpen, showBanner = true }: {
  announcements: any[]; accent: string; widgetOpen: boolean; onOpen: (id: string) => void; showBanner?: boolean
}) {
  const [dismissed, setDismissed] = useState<string[]>([])
  useEffect(() => { setDismissed(readDismissed()) }, [])
  const dismiss = (id: string) => { const next = [...dismissed.filter(x => x !== id), id]; setDismissed(next); writeDismissed(next) }

  const banner = useMemo(() => announcements.find(a => a?.boost?.type === 'banner' && !dismissed.includes(a.id)), [announcements, dismissed])
  const popup = useMemo(() => announcements.find(a => a?.boost?.type === 'popup' && !dismissed.includes(a.id)), [announcements, dismissed])

  // Popup: hand the card to the embed script while the widget is closed.
  useEffect(() => {
    if (typeof window === 'undefined' || window.parent === window) return
    try {
      if (popup && !widgetOpen) {
        window.parent.postMessage({ colvy: true, type: 'teaser', id: popup.id, title: popup.boost.title, blurb: popup.boost.blurb, button: popup.boost.button, image: popup.boost.image || null, accent }, '*')
      } else {
        window.parent.postMessage({ colvy: true, type: 'teaser_hide' }, '*')
      }
    } catch {}
  }, [popup?.id, widgetOpen, accent])

  // The embed script reports taps on its card.
  useEffect(() => {
    const onMsg = (e: MessageEvent) => {
      const d: any = e.data
      if (!d || !d.colvy || typeof d.id !== 'string') return
      if (d.type === 'teaser_open') { dismiss(d.id); onOpen(d.id) }
      if (d.type === 'teaser_dismiss') dismiss(d.id)
    }
    window.addEventListener('message', onMsg)
    return () => window.removeEventListener('message', onMsg)
  })

  if (!banner || !showBanner) return null
  const b = banner.boost
  return (
    <div role="region" aria-label="Announcement" style={{ position: 'relative', display: 'flex', gap: 10, alignItems: 'center', padding: '10px 36px 10px 10px', marginBottom: 10, borderRadius: 14, border: '1px solid var(--border)', background: '#fff' }}>
      {b.image && <img src={b.image} alt="" style={{ width: 44, height: 44, borderRadius: 10, objectFit: 'cover', flexShrink: 0 }} />}
      <button type="button" onClick={() => onOpen(banner.id)} style={{ flex: 1, minWidth: 0, textAlign: 'left', border: 'none', background: 'none', padding: 0, cursor: 'pointer', font: 'inherit' }}>
        <span style={{ display: 'block', fontSize: 13, fontWeight: 700, color: '#0d0d0d', lineHeight: 1.3 }}>{b.title}</span>
        {b.blurb && <span style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' as any, overflow: 'hidden', fontSize: 12, color: '#6b7280', marginTop: 2 }}>{b.blurb}</span>}
        <span style={{ display: 'inline-block', marginTop: 6, fontSize: 12, fontWeight: 700, color: accent }}>{b.button}</span>
      </button>
      <button type="button" aria-label="Close" onClick={() => dismiss(banner.id)} style={{ position: 'absolute', top: 6, right: 6, width: 26, height: 26, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', border: 'none', background: 'none', color: '#9ca3af', cursor: 'pointer', borderRadius: 8 }}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
      </button>
    </div>
  )
}

/** Count a view once per post per browser (the server counts live posts only). */
export function trackAnnouncementView(id: string) {
  try {
    const k = `colvy_ann_view_${id}`
    if (localStorage.getItem(k)) return
    localStorage.setItem(k, '1')
  } catch { return }
  fetch('/api/announcements/public', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, action: 'view' }), keepalive: true }).catch(() => {})
}
