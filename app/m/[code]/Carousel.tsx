'use client'

import { useRef, useState } from 'react'
import VideoPlayer from '@/components/VideoPlayer'

type Item = { url: string; name?: string; type?: string }

const isImg = (u: string, t?: string) => (t || '').startsWith('image/') || /\.(png|jpe?g|gif|webp|avif)(\?|$)/i.test(u)
const isVid = (u: string, t?: string) => (t || '').startsWith('video/') || /\.(mp4|mov|webm|m4v)(\?|$)/i.test(u)

// A left/right swipeable gallery for a shared media link. Scroll-snaps one item
// per view (swipe on touch, arrows on desktop), with a per-item download button,
// an Apple-style video player, and a thumbnail strip when there's more than one.
export default function Carousel({ items, accent }: { items: Item[]; accent: string }) {
  const ref = useRef<HTMLDivElement>(null)
  const [idx, setIdx] = useState(0)
  const many = items.length > 1

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

  // A fixed media height keeps every slide the same size, so a mix of portrait
  // and landscape items doesn't stretch shorter slides (which left a big gap
  // under a landscape video) and the arrows stay centred on the media for all.
  const MEDIA_H = 'min(70vh, 560px)'
  const arrow: React.CSSProperties = {
    position: 'absolute', top: `calc(${MEDIA_H} / 2)`, transform: 'translateY(-50%)', width: 40, height: 40, borderRadius: '50%',
    border: 'none', background: 'rgba(0,0,0,0.5)', color: '#fff', fontSize: 22, cursor: 'pointer', zIndex: 2,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  }

  return (
    <div style={{ position: 'relative' }}>
      <div ref={ref} onScroll={onScroll}
        style={{ display: 'flex', gap: 12, overflowX: 'auto', scrollSnapType: 'x mandatory', WebkitOverflowScrolling: 'touch', scrollbarWidth: 'none', alignItems: 'flex-start' }}>
        {items.map((m, i) => {
          const image = isImg(m.url, m.type), video = isVid(m.url, m.type)
          return (
            <div key={i} style={{ flex: '0 0 100%', scrollSnapAlign: 'center', background: '#fff', borderRadius: 14, overflow: 'hidden', boxShadow: '0 4px 18px rgba(0,0,0,0.06)', display: 'flex', flexDirection: 'column' }}>
              {/* Many items → a fixed media height so every slide matches and the
                  arrows stay centred. A single item → natural height, so it
                  isn't letterboxed into a tall black box with blank space. */}
              <div style={{ height: many ? MEDIA_H : 'auto', maxHeight: many ? undefined : 'min(80vh, 620px)', background: '#000', lineHeight: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
                {image ? (
                  <a href={m.url} target="_blank" rel="noopener" style={{ display: 'flex', width: '100%', height: many ? '100%' : 'auto', alignItems: 'center', justifyContent: 'center' }}>
                    <img src={m.url} alt={`Attachment ${i + 1}`} style={{ width: many ? undefined : '100%', maxWidth: '100%', maxHeight: many ? '100%' : 'min(80vh, 620px)', objectFit: 'contain', display: 'block' }} />
                  </a>
                ) : video ? (
                  <VideoPlayer src={m.url} autoPlay={false} style={many ? { width: '100%', height: '100%', objectFit: 'contain', borderRadius: 0 } : { width: '100%', maxHeight: 'min(80vh, 620px)', borderRadius: 0 }} />
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

      {many && (
        <>
          <button aria-label="Previous" onClick={() => go(idx - 1)} disabled={idx <= 0} style={{ ...arrow, left: 8, opacity: idx <= 0 ? 0.35 : 1 }}>‹</button>
          <button aria-label="Next" onClick={() => go(idx + 1)} disabled={idx >= items.length - 1} style={{ ...arrow, right: 8, opacity: idx >= items.length - 1 ? 0.35 : 1 }}>›</button>

          {/* Thumbnail strip — tap a thumbnail to jump to it. The active one is
              highlighted in the brand accent. */}
          <div style={{ display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap', marginTop: 14 }}>
            {items.map((m, i) => {
              const on = i === idx
              const image = isImg(m.url, m.type), video = isVid(m.url, m.type)
              return (
                <button key={i} aria-label={`Go to ${i + 1}`} onClick={() => go(i)}
                  style={{ position: 'relative', width: 56, height: 56, flexShrink: 0, borderRadius: 9, overflow: 'hidden', padding: 0, cursor: 'pointer', background: '#000', border: on ? `2px solid ${accent}` : '2px solid transparent', boxShadow: on ? '0 2px 8px rgba(0,0,0,0.18)' : 'none', opacity: on ? 1 : 0.7, transition: 'opacity .15s, border-color .15s' }}>
                  {image ? (
                    <img src={m.url} alt="" loading="lazy" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  ) : video ? (
                    <>
                      <video src={m.url + '#t=0.1'} preload="metadata" muted playsInline style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      <span style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', textShadow: '0 1px 4px rgba(0,0,0,0.7)', pointerEvents: 'none' }}>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><polygon points="6 3 20 12 6 21 6 3" /></svg>
                      </span>
                    </>
                  ) : (
                    <span style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 18 }}>📄</span>
                  )}
                </button>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}
