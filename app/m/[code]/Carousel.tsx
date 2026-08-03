'use client'

import { useEffect, useRef, useState } from 'react'
import VideoPlayer from '@/components/VideoPlayer'

type Item = { url: string; name?: string; type?: string }

const isImg = (u: string, t?: string) => (t || '').startsWith('image/') || /\.(png|jpe?g|gif|webp|avif)(\?|$)/i.test(u)
const isVid = (u: string, t?: string) => (t || '').startsWith('video/') || /\.(mp4|mov|webm|m4v)(\?|$)/i.test(u)

const ExpandIcon = ({ size = 16 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" /></svg>
)
const DownloadIcon = ({ size = 16 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></svg>
)

// A left/right swipeable gallery for a shared media link. Scroll-snaps one item
// per view (swipe on touch, arrows on desktop), with a per-item download button,
// an Apple-style video player, and a thumbnail strip when there's more than one.
// Media never opens a raw storage URL — it expands into an in-page lightbox.
export default function Carousel({ items, accent }: { items: Item[]; accent: string }) {
  const ref = useRef<HTMLDivElement>(null)
  const [idx, setIdx] = useState(0)
  const [lb, setLb] = useState<number | null>(null)   // lightbox index (null = closed)
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

  // Keyboard nav while the lightbox is open.
  useEffect(() => {
    if (lb === null) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setLb(null)
      else if (e.key === 'ArrowRight') setLb(v => (v === null ? v : Math.min(items.length - 1, v + 1)))
      else if (e.key === 'ArrowLeft') setLb(v => (v === null ? v : Math.max(0, v - 1)))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [lb, items.length])

  // A fixed media height keeps every slide the same size, so a mix of portrait
  // and landscape items doesn't stretch shorter slides and the arrows stay
  // centred on the media for all.
  const MEDIA_H = 'min(70vh, 560px)'
  const arrow: React.CSSProperties = {
    position: 'absolute', top: `calc(${MEDIA_H} / 2)`, transform: 'translateY(-50%)', width: 40, height: 40, borderRadius: '50%',
    border: 'none', background: 'rgba(0,0,0,0.5)', color: '#fff', fontSize: 22, cursor: 'pointer', zIndex: 3,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  }
  const expandBtn: React.CSSProperties = {
    position: 'absolute', top: 8, right: 8, zIndex: 3, width: 34, height: 34, borderRadius: 9, border: 'none',
    background: 'rgba(0,0,0,0.5)', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(4px)',
  }

  // Blurred, scaled copy of an image, filling the frame behind the contained
  // image so letterbox areas glow with the photo's colours instead of black.
  const AmbientImg = ({ url }: { url: string }) => (
    <img src={url} alt="" aria-hidden style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', filter: 'blur(34px) saturate(1.5)', transform: 'scale(1.25)', zIndex: 0 }} />
  )

  return (
    <div style={{ position: 'relative' }}>
      <div ref={ref} onScroll={onScroll}
        style={{ display: 'flex', gap: 12, overflowX: 'auto', scrollSnapType: 'x mandatory', WebkitOverflowScrolling: 'touch', scrollbarWidth: 'none', alignItems: 'flex-start' }}>
        {items.map((m, i) => {
          const image = isImg(m.url, m.type), video = isVid(m.url, m.type)
          return (
            <div key={i} style={{ flex: '0 0 100%', scrollSnapAlign: 'center', background: '#fff', borderRadius: 14, overflow: 'hidden', boxShadow: '0 4px 18px rgba(0,0,0,0.06)', display: 'flex', flexDirection: 'column' }}>
              <div style={{ position: 'relative', height: many ? MEDIA_H : 'auto', maxHeight: many ? undefined : 'min(80vh, 620px)', background: '#111', lineHeight: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
                {image ? (
                  <>
                    <AmbientImg url={m.url} />
                    <button onClick={() => setLb(i)} title="Expand"
                      style={{ position: 'relative', zIndex: 1, display: 'flex', width: many ? '100%' : 'auto', height: many ? '100%' : 'auto', alignItems: 'center', justifyContent: 'center', background: 'none', border: 'none', padding: 0, cursor: 'zoom-in' }}>
                      <img src={m.url} alt={`Attachment ${i + 1}`} style={{ width: many ? undefined : '100%', maxWidth: '100%', maxHeight: many ? `calc(${MEDIA_H})` : 'min(80vh, 620px)', objectFit: 'contain', display: 'block' }} />
                    </button>
                  </>
                ) : video ? (
                  <VideoPlayer src={m.url} autoPlay={false} ambient={i === idx} style={many ? { width: '100%', height: '100%', objectFit: 'contain', borderRadius: 0 } : { width: '100%', maxHeight: 'min(80vh, 620px)', borderRadius: 0 }} />
                ) : (
                  <div style={{ position: 'relative', zIndex: 1, padding: 30, color: '#fff', fontSize: 14, fontWeight: 700, wordBreak: 'break-word' }}>{m.name || 'File'}</div>
                )}
                {/* Expand into the lightbox (images and videos alike). */}
                {(image || video) && (
                  <button onClick={() => setLb(i)} title="Expand" aria-label="Expand" style={expandBtn}><ExpandIcon /></button>
                )}
              </div>
              <a href={m.url} target="_blank" rel="noopener" download={m.name || true}
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, padding: '12px 0', minHeight: 46, textDecoration: 'none', fontSize: 14, fontWeight: 700, background: accent, color: '#fff' }}>
                <DownloadIcon />
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

          {/* Thumbnail strip — tap a thumbnail to jump to it. */}
          <div style={{ display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap', marginTop: 14 }}>
            {items.map((m, i) => <Thumb key={i} m={m} on={i === idx} accent={accent} onClick={() => go(i)} />)}
          </div>
        </>
      )}

      {/* ── Lightbox ─────────────────────────────────────────────────────── */}
      {lb !== null && (
        <Lightbox items={items} index={lb} accent={accent} onIndex={setLb} onClose={() => setLb(null)} />
      )}
    </div>
  )
}

function Thumb({ m, on, accent, onClick, size = 56 }: { m: Item; on: boolean; accent: string; onClick: () => void; size?: number }) {
  const image = isImg(m.url, m.type), video = isVid(m.url, m.type)
  return (
    <button aria-label="View" onClick={onClick}
      style={{ position: 'relative', width: size, height: size, flexShrink: 0, borderRadius: 9, overflow: 'hidden', padding: 0, cursor: 'pointer', background: '#000', border: on ? `2px solid ${accent}` : '2px solid transparent', boxShadow: on ? '0 2px 8px rgba(0,0,0,0.25)' : 'none', opacity: on ? 1 : 0.65, transition: 'opacity .15s, border-color .15s' }}>
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
}

// Full-screen in-page viewer — never navigates to a raw storage URL. Blurred
// ambient backing, big media, arrows, a thumbnail strip and a download button.
function Lightbox({ items, index, accent, onIndex, onClose }: {
  items: Item[]; index: number; accent: string; onIndex: (i: number) => void; onClose: () => void
}) {
  const m = items[index]
  const image = isImg(m.url, m.type), video = isVid(m.url, m.type)
  const many = items.length > 1
  const arrow: React.CSSProperties = {
    position: 'absolute', top: '50%', transform: 'translateY(-50%)', width: 46, height: 46, borderRadius: '50%',
    border: 'none', background: 'rgba(255,255,255,0.14)', color: '#fff', fontSize: 26, cursor: 'pointer', zIndex: 2,
    display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(6px)',
  }
  return (
    <div onClick={onClose}
      style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(6,6,8,0.92)', backdropFilter: 'blur(8px)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      {/* Blurred ambient wash from the current image. */}
      {image && <img src={m.url} alt="" aria-hidden style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', filter: 'blur(60px) saturate(1.4)', opacity: 0.35, zIndex: 0 }} />}

      <button onClick={onClose} aria-label="Close" title="Close"
        style={{ position: 'absolute', top: 14, right: 16, zIndex: 3, width: 42, height: 42, borderRadius: '50%', border: 'none', background: 'rgba(255,255,255,0.14)', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(6px)' }}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
      </button>

      <div onClick={e => e.stopPropagation()} style={{ position: 'relative', zIndex: 1, flex: 1, minHeight: 0, width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        {image ? (
          <img src={m.url} alt={m.name || ''} style={{ maxWidth: '94vw', maxHeight: '80vh', objectFit: 'contain', borderRadius: 8, boxShadow: '0 20px 60px rgba(0,0,0,0.5)' }} />
        ) : video ? (
          <VideoPlayer key={m.url} src={m.url} autoPlay ambient style={{ maxWidth: '94vw', maxHeight: '80vh' }} />
        ) : (
          <div style={{ color: '#fff', fontSize: 15, fontWeight: 700 }}>{m.name || 'File'}</div>
        )}

        {many && (
          <>
            <button aria-label="Previous" onClick={() => onIndex(Math.max(0, index - 1))} disabled={index <= 0} style={{ ...arrow, left: 10, opacity: index <= 0 ? 0.3 : 1 }}>‹</button>
            <button aria-label="Next" onClick={() => onIndex(Math.min(items.length - 1, index + 1))} disabled={index >= items.length - 1} style={{ ...arrow, right: 10, opacity: index >= items.length - 1 ? 0.3 : 1 }}>›</button>
          </>
        )}
      </div>

      {/* Bottom bar: download + thumbnail strip */}
      <div onClick={e => e.stopPropagation()} style={{ position: 'relative', zIndex: 1, width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, paddingTop: 12 }}>
        <a href={m.url} target="_blank" rel="noopener" download={m.name || true}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '10px 22px', borderRadius: 999, textDecoration: 'none', fontSize: 14, fontWeight: 700, background: accent, color: '#fff' }}>
          <DownloadIcon /> Download
        </a>
        {many && (
          <div style={{ display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'nowrap', overflowX: 'auto', maxWidth: '96vw', paddingBottom: 4 }}>
            {items.map((it, i) => <Thumb key={i} m={it} on={i === index} accent={accent} onClick={() => onIndex(i)} size={52} />)}
          </div>
        )}
      </div>
    </div>
  )
}
