'use client'

// Full-screen image viewer with zoom/pan.
// Annotation is OPT-IN: only available while composing (allowAnnotate={true}).
// Already-posted images open in view-only mode — no annotate button.

import { useState, useEffect } from 'react'
import ImageAnnotator from './ImageAnnotator'

const glass: React.CSSProperties = {
  background: 'rgba(28,28,30,0.72)',
  backdropFilter: 'blur(24px) saturate(180%)',
  WebkitBackdropFilter: 'blur(24px) saturate(180%)',
  border: '1px solid rgba(255,255,255,0.12)',
  boxShadow: '0 8px 32px rgba(0,0,0,0.35)',
}

const pillBtn: React.CSSProperties = {
  padding: '7px 14px',
  background: 'rgba(255,255,255,0.1)',
  color: 'rgba(255,255,255,0.9)',
  border: '1px solid rgba(255,255,255,0.14)',
  borderRadius: 999,
  cursor: 'pointer',
  fontSize: 13,
  fontWeight: 500,
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
}

export default function ImageViewer({
  imageSrc,
  onClose,
  allowAnnotate = false,
  onAnnotationSave,
}: {
  imageSrc: string
  onClose: () => void
  /** Only pass true while COMPOSING — posted images must stay view-only */
  allowAnnotate?: boolean
  /** Receives the annotated PNG data URL so the caller can replace the image */
  onAnnotationSave?: (dataUrl: string) => void
}) {
  const [scale, setScale] = useState(1)
  const [position, setPosition] = useState({ x: 0, y: 0 })
  const [isDragging, setIsDragging] = useState(false)
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 })
  const [showAnnotator, setShowAnnotator] = useState(false)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault()
    const delta = e.deltaY > 0 ? 0.9 : 1.1
    setScale(prev => Math.min(Math.max(prev * delta, 0.5), 5))
  }

  const handleMouseDown = (e: React.MouseEvent) => {
    setIsDragging(true)
    setDragStart({ x: e.clientX - position.x, y: e.clientY - position.y })
  }

  const handleMouseMove = (e: React.MouseEvent) => {
    if (isDragging) {
      setPosition({ x: e.clientX - dragStart.x, y: e.clientY - dragStart.y })
    }
  }

  const handleMouseUp = () => setIsDragging(false)

  if (showAnnotator && allowAnnotate) {
    return (
      <ImageAnnotator
        imageSrc={imageSrc}
        onClose={() => setShowAnnotator(false)}
        onSave={(dataUrl) => {
          onAnnotationSave?.(dataUrl)
          setShowAnnotator(false)
          onClose()
        }}
      />
    )
  }

  return (
    <div
      style={{
        position: 'fixed', inset: 0,
        background: 'rgba(0,0,0,0.88)',
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
        zIndex: 10001,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 16,
        fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Segoe UI', sans-serif",
      }}
      onClick={onClose}>

      {/* Floating top toolbar */}
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          ...glass,
          position: 'absolute',
          top: 16, left: '50%', transform: 'translateX(-50%)',
          display: 'flex', gap: 8, alignItems: 'center',
          padding: '8px 12px',
          borderRadius: 999,
          zIndex: 10002,
          maxWidth: 'calc(100vw - 32px)',
          flexWrap: 'wrap', justifyContent: 'center',
        }}>

        <button type="button" onClick={() => setScale(prev => Math.max(prev - 0.2, 0.5))} style={pillBtn} title="Zoom out">−</button>
        <span style={{ color: 'rgba(255,255,255,0.75)', fontSize: 12, minWidth: 44, textAlign: 'center', fontVariantNumeric: 'tabular-nums' }}>
          {Math.round(scale * 100)}%
        </span>
        <button type="button" onClick={() => setScale(prev => Math.min(prev + 0.2, 5))} style={pillBtn} title="Zoom in">+</button>
        <button type="button" onClick={() => { setScale(1); setPosition({ x: 0, y: 0 }) }} style={pillBtn} title="Reset view">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="1 4 1 10 7 10" /><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
          </svg>
          Reset
        </button>

        {allowAnnotate && (
          <>
            <div style={{ width: 1, height: 20, background: 'rgba(255,255,255,0.15)' }} />
            <button type="button"
              onClick={() => setShowAnnotator(true)}
              style={{
                ...pillBtn,
                background: '#0A84FF',
                border: 'none',
                color: '#fff',
                fontWeight: 600,
                boxShadow: '0 4px 14px rgba(10,132,255,0.4)',
              }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 19l7-7 3 3-7 7-3-3z" /><path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z" />
              </svg>
              Markup
            </button>
          </>
        )}

        <div style={{ width: 1, height: 20, background: 'rgba(255,255,255,0.15)' }} />
        <button type="button" onClick={onClose} style={pillBtn} title="Close (Esc)">✕</button>
      </div>

      {/* Hint */}
      <span style={{
        position: 'absolute', bottom: 18, left: '50%', transform: 'translateX(-50%)',
        color: 'rgba(255,255,255,0.45)', fontSize: 12, pointerEvents: 'none',
      }}>
        Scroll to zoom · Drag to pan · Esc to close
      </span>

      {/* Image */}
      <div
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%', height: '100%',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          overflow: 'hidden',
          cursor: isDragging ? 'grabbing' : 'grab',
        }}>
        <img
          src={imageSrc}
          style={{
            transform: `scale(${scale}) translate(${position.x / scale}px, ${position.y / scale}px)`,
            maxWidth: '92%',
            maxHeight: '88%',
            objectFit: 'contain',
            borderRadius: 12,
            boxShadow: '0 24px 64px rgba(0,0,0,0.5)',
            userSelect: 'none',
          }}
          draggable={false}
          alt="Full screen view"
        />
      </div>
    </div>
  )
}
