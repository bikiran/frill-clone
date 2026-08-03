'use client'

import { useRef, useState } from 'react'

type Item = { url: string; name?: string; type?: string }

const isImg = (u: string, t?: string) => (t || '').startsWith('image/') || /\.(png|jpe?g|gif|webp|avif)(\?|$)/i.test(u)
const isVid = (u: string, t?: string) => (t || '').startsWith('video/') || /\.(mp4|mov|webm|m4v)(\?|$)/i.test(u)

// A left/right swipeable gallery for a shared media link. Scroll-snaps one item
// per view (swipe on touch, arrows on desktop), with a per-item download button.
export default function Carousel({ items, accent }: { items: Item[]; accent: string }) {
  const ref = useRef<HTMLDivElement>(null)
  const [idx, setIdx] = useState(0)

  const go = (i: number) => {
    const el = ref.current; if (!el) return
    const n = Math.max(0, Math.min(items.length - 1, i))
    const child = el.children[n] as HTMLElement | undefined
    if (child) el.scrollTo({ left: child.offsetLeft - el.offsetLeft, behavior: 'smooth' })
    setIdx(n)
  }
  const onScroll = () => {
    const el = ref.current; if (!el) return
    const per = el.scrollWidth / items.length
    setIdx(Math.round(el.scrollLeft / per))
  }

  const arrow: React.CSSProperties = {
    position: 'absolute', top: '50%', transform: 'translateY(-50%)', width: 40, height: 40, borderRadius: '50%',
    border: 'none', background: 'rgba(0,0,0,0.5)', color: '#fff', fontSize: 22, cursor: 'pointer', zIndex: 2,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  }

  return (
    <div style={{ position: 'relative' }}>
      <div ref={ref} onScroll={onScroll}
        style={{ display: 'flex', gap: 12, overflowX: 'auto', scrollSnapType: 'x mandatory', WebkitOverflowScrolling: 'touch', scrollbarWidth: 'none' }}>
        {items.map((m, i) => {
          const image = isImg(m.url, m.type), video = isVid(m.url, m.type)
          return (
            <div key={i} style={{ flex: '0 0 100%', scrollSnapAlign: 'center', background: '#fff', borderRadius: 14, overflow: 'hidden', boxShadow: '0 4px 18px rgba(0,0,0,0.06)', display: 'flex', flexDirection: 'column' }}>
              <div style={{ background: '#000', lineHeight: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {image ? (
                  <a href={m.url} target="_blank" rel="noopener" style={{ display: 'block', width: '100%' }}>
                    <img src={m.url} alt={`Attachment ${i + 1}`} style={{ width: '100%', maxHeight: '68vh', objectFit: 'contain' }} />
                  </a>
                ) : video ? (
                  <video src={m.url} controls playsInline style={{ width: '100%', maxHeight: '68vh' }} />
                ) : (
                  <div style={{ padding: 30, color: '#fff', fontSize: 14, fontWeight: 700, wordBreak: 'break-word' }}>{m.name || 'File'}</div>
                )}
              </div>
              <a href={m.url} target="_blank" rel="noopener" download={m.name || true}
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, padding: '12px 0', minHeight: 46, textDecoration: 'none', fontSize: 14, fontWeight: 700, background: accent, color: '#fff' }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></svg>
                {image || video ? 'Download' : 'Open file'}
              </a>
            </div>
          )
        })}
      </div>

      {items.length > 1 && (
        <>
          <button aria-label="Previous" onClick={() => go(idx - 1)} disabled={idx <= 0} style={{ ...arrow, left: 8, opacity: idx <= 0 ? 0.35 : 1 }}>‹</button>
          <button aria-label="Next" onClick={() => go(idx + 1)} disabled={idx >= items.length - 1} style={{ ...arrow, right: 8, opacity: idx >= items.length - 1 ? 0.35 : 1 }}>›</button>
          <div style={{ display: 'flex', gap: 6, justifyContent: 'center', marginTop: 12 }}>
            {items.map((_, i) => (
              <button key={i} aria-label={`Go to ${i + 1}`} onClick={() => go(i)}
                style={{ width: i === idx ? 20 : 7, height: 7, borderRadius: 4, border: 'none', padding: 0, cursor: 'pointer', background: i === idx ? accent : '#d1d5db', transition: 'width .18s' }} />
            ))}
          </div>
        </>
      )}
    </div>
  )
}
