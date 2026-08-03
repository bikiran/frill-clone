'use client'

import { useEffect, useState } from 'react'
import VideoPlayer from '@/components/VideoPlayer'

type Item = { url: string; name?: string; type?: string; kind?: string }
const isVid = (a: Item) => a.kind === 'video' || (a.type || '').startsWith('video/') || /\.(mp4|mov|webm|m4v)(\?|$)/i.test(a.url)

// A grid of a note's attachments that expand into an in-page lightbox — never a
// raw storage URL in a new tab.
export default function NoteAttachments({ items, accent }: { items: Item[]; accent: string }) {
  const [lb, setLb] = useState<number | null>(null)
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

  const cur = lb !== null ? items[lb] : null

  return (
    <>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 10 }}>
        {items.map((a, i) => (
          <button key={i} onClick={() => setLb(i)} style={{ display: 'block', aspectRatio: '1 / 1', borderRadius: 10, overflow: 'hidden', background: '#000', position: 'relative', padding: 0, border: 'none', cursor: 'pointer' }}>
            {isVid(a)
              ? <video src={a.url + '#t=0.1'} preload="metadata" muted style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              : <img src={a.url} alt={a.name || ''} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />}
            {isVid(a) && <span style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', textShadow: '0 1px 6px rgba(0,0,0,0.6)' }}>
              <svg width="26" height="26" viewBox="0 0 24 24" fill="currentColor"><polygon points="6 3 20 12 6 21 6 3"/></svg>
            </span>}
          </button>
        ))}
      </div>

      {cur && (
        <div onClick={() => setLb(null)} style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(6,6,8,0.93)', backdropFilter: 'blur(8px)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <button onClick={() => setLb(null)} aria-label="Close" style={{ position: 'absolute', top: 14, right: 16, zIndex: 3, width: 42, height: 42, borderRadius: '50%', border: 'none', background: 'rgba(255,255,255,0.14)', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
          <div onClick={e => e.stopPropagation()} style={{ position: 'relative', flex: 1, minHeight: 0, width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {isVid(cur)
              ? <VideoPlayer key={cur.url} src={cur.url} autoPlay ambient style={{ maxWidth: '94vw', maxHeight: '82vh' }} />
              : <img src={cur.url} alt={cur.name || ''} style={{ maxWidth: '94vw', maxHeight: '82vh', objectFit: 'contain', borderRadius: 8 }} />}
            {items.length > 1 && (<>
              <button onClick={() => setLb(Math.max(0, (lb || 0) - 1))} disabled={lb === 0} style={{ ...arrow, left: 10, opacity: lb === 0 ? 0.3 : 1 }}>‹</button>
              <button onClick={() => setLb(Math.min(items.length - 1, (lb || 0) + 1))} disabled={lb === items.length - 1} style={{ ...arrow, right: 10, opacity: lb === items.length - 1 ? 0.3 : 1 }}>›</button>
            </>)}
          </div>
          <div onClick={e => e.stopPropagation()} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, paddingTop: 12 }}>
            <a href={cur.url} target="_blank" rel="noopener" download={cur.name || true} style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '10px 22px', borderRadius: 999, textDecoration: 'none', fontSize: 14, fontWeight: 700, background: accent, color: '#fff' }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
              Download
            </a>
            {items.length > 1 && (
              <div style={{ display: 'flex', gap: 8, justifyContent: 'center', overflowX: 'auto', maxWidth: '96vw' }}>
                {items.map((a, i) => (
                  <button key={i} onClick={() => setLb(i)} style={{ width: 52, height: 52, flexShrink: 0, borderRadius: 8, overflow: 'hidden', padding: 0, cursor: 'pointer', background: '#000', border: i === lb ? `2px solid ${accent}` : '2px solid transparent', opacity: i === lb ? 1 : 0.6 }}>
                    {isVid(a)
                      ? <video src={a.url + '#t=0.1'} preload="metadata" muted style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      : <img src={a.url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  )
}

const arrow: React.CSSProperties = {
  position: 'absolute', top: '50%', transform: 'translateY(-50%)', width: 46, height: 46, borderRadius: '50%',
  border: 'none', background: 'rgba(255,255,255,0.14)', color: '#fff', fontSize: 26, cursor: 'pointer', zIndex: 2,
  display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(6px)',
}
