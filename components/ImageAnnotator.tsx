'use client'

// Clean, Apple-style image annotator.
// - Frosted-glass floating toolbar with icon tools
// - Committed-layer drawing (shapes persist while previewing the next one)
// - Proper coordinate scaling when the canvas is displayed smaller than the image
// - Undo / Clear / keyboard shortcuts (⌘Z, Esc)

import { useRef, useState, useEffect, useCallback } from 'react'

type ToolType = 'arrow' | 'rect' | 'circle' | 'pen' | 'text'

const COLORS = ['#FF3B30', '#FF9500', '#FFCC00', '#34C759', '#007AFF', '#AF52DE', '#000000', '#FFFFFF']

const glass: React.CSSProperties = {
  background: 'rgba(28,28,30,0.72)',
  backdropFilter: 'blur(24px) saturate(180%)',
  WebkitBackdropFilter: 'blur(24px) saturate(180%)',
  border: '1px solid rgba(255,255,255,0.12)',
  boxShadow: '0 8px 32px rgba(0,0,0,0.35)',
}

const ToolIcon = ({ tool, active }: { tool: ToolType; active: boolean }) => {
  const stroke = active ? '#0A84FF' : 'rgba(255,255,255,0.85)'
  const common = { width: 18, height: 18, viewBox: '0 0 24 24', fill: 'none', stroke, strokeWidth: 2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const }
  switch (tool) {
    case 'arrow': return <svg {...common}><line x1="5" y1="19" x2="19" y2="5" /><polyline points="9 5 19 5 19 15" /></svg>
    case 'rect': return <svg {...common}><rect x="4" y="6" width="16" height="12" rx="2" /></svg>
    case 'circle': return <svg {...common}><circle cx="12" cy="12" r="8" /></svg>
    case 'pen': return <svg {...common}><path d="M12 19l7-7 3 3-7 7-3-3z" /><path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z" /></svg>
    case 'text': return <svg {...common}><polyline points="4 7 4 4 20 4 20 7" /><line x1="9" y1="20" x2="15" y2="20" /><line x1="12" y1="4" x2="12" y2="20" /></svg>
  }
}

export default function ImageAnnotator({
  imageSrc,
  onSave,
  onClose,
}: {
  imageSrc: string
  onSave: (dataUrl: string) => void
  onClose: () => void
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  // Committed layer: base image + all finished annotations
  const committedRef = useRef<HTMLCanvasElement | null>(null)
  const undoStackRef = useRef<ImageData[]>([])
  const [image, setImage] = useState<HTMLImageElement | null>(null)
  const [tool, setTool] = useState<ToolType>('arrow')
  const [color, setColor] = useState(COLORS[0])
  const [thickness, setThickness] = useState(4)
  const [drawing, setDrawing] = useState(false)
  const [start, setStart] = useState({ x: 0, y: 0 })
  const [textInput, setTextInput] = useState<{ x: number; y: number; value: string } | null>(null)
  const [canUndo, setCanUndo] = useState(false)

  // Load image and set up the committed layer
  useEffect(() => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => {
      setImage(img)
      const canvas = canvasRef.current
      if (!canvas) return
      canvas.width = img.width
      canvas.height = img.height
      const committed = document.createElement('canvas')
      committed.width = img.width
      committed.height = img.height
      committed.getContext('2d')?.drawImage(img, 0, 0)
      committedRef.current = committed
      canvas.getContext('2d')?.drawImage(committed, 0, 0)
    }
    img.src = imageSrc
  }, [imageSrc])

  // Convert a mouse/touch event into IMAGE-space coordinates
  // (the canvas is usually displayed scaled down)
  const toImageCoords = (clientX: number, clientY: number) => {
    const canvas = canvasRef.current!
    const rect = canvas.getBoundingClientRect()
    return {
      x: (clientX - rect.left) * (canvas.width / rect.width),
      y: (clientY - rect.top) * (canvas.height / rect.height),
    }
  }

  const restoreCommitted = () => {
    const canvas = canvasRef.current
    const committed = committedRef.current
    if (!canvas || !committed) return
    canvas.getContext('2d')?.drawImage(committed, 0, 0)
  }

  const pushUndo = () => {
    const committed = committedRef.current
    const ctx = committed?.getContext('2d')
    if (!committed || !ctx) return
    undoStackRef.current.push(ctx.getImageData(0, 0, committed.width, committed.height))
    if (undoStackRef.current.length > 30) undoStackRef.current.shift()
    setCanUndo(true)
  }

  const commitCurrent = () => {
    const canvas = canvasRef.current
    const committed = committedRef.current
    if (!canvas || !committed) return
    committed.getContext('2d')?.drawImage(canvas, 0, 0)
  }

  const strokeStyle = (ctx: CanvasRenderingContext2D) => {
    ctx.strokeStyle = color
    ctx.fillStyle = color
    ctx.lineWidth = thickness
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.shadowColor = 'rgba(0,0,0,0.25)'
    ctx.shadowBlur = 2
  }

  const drawArrow = (ctx: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number) => {
    const head = Math.max(14, thickness * 4)
    const angle = Math.atan2(y2 - y1, x2 - x1)
    strokeStyle(ctx)
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke()
    ctx.beginPath()
    ctx.moveTo(x2, y2)
    ctx.lineTo(x2 - head * Math.cos(angle - Math.PI / 7), y2 - head * Math.sin(angle - Math.PI / 7))
    ctx.lineTo(x2 - head * Math.cos(angle + Math.PI / 7), y2 - head * Math.sin(angle + Math.PI / 7))
    ctx.closePath(); ctx.fill()
  }

  const drawShapePreview = (x: number, y: number) => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return
    restoreCommitted()
    strokeStyle(ctx)
    if (tool === 'arrow') {
      drawArrow(ctx, start.x, start.y, x, y)
    } else if (tool === 'rect') {
      const r = Math.min(12, Math.abs(x - start.x) / 4, Math.abs(y - start.y) / 4)
      ctx.beginPath()
      // Rounded rectangle — matches macOS screenshot markup
      const x0 = Math.min(start.x, x), y0 = Math.min(start.y, y)
      const w = Math.abs(x - start.x), h = Math.abs(y - start.y)
      ctx.roundRect ? ctx.roundRect(x0, y0, w, h, r) : ctx.rect(x0, y0, w, h)
      ctx.stroke()
    } else if (tool === 'circle') {
      const rx = Math.abs(x - start.x) / 2
      const ry = Math.abs(y - start.y) / 2
      const cx = (x + start.x) / 2
      const cy = (y + start.y) / 2
      ctx.beginPath()
      ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2)
      ctx.stroke()
    }
  }

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const { x, y } = toImageCoords(e.clientX, e.clientY)
    if (tool === 'text') {
      setTextInput({ x, y, value: '' })
      return
    }
    pushUndo()
    setDrawing(true)
    setStart({ x, y })
    if (tool === 'pen') {
      const ctx = canvasRef.current?.getContext('2d')
      if (ctx) { strokeStyle(ctx); ctx.beginPath(); ctx.moveTo(x, y) }
    }
    ;(e.target as HTMLElement).setPointerCapture?.(e.pointerId)
  }

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawing) return
    const { x, y } = toImageCoords(e.clientX, e.clientY)
    if (tool === 'pen') {
      const ctx = canvasRef.current?.getContext('2d')
      if (ctx) { ctx.lineTo(x, y); ctx.stroke() }
    } else {
      drawShapePreview(x, y)
    }
  }

  const handlePointerUp = () => {
    if (!drawing) return
    setDrawing(false)
    commitCurrent()
  }

  const commitText = useCallback(() => {
    if (!textInput || !textInput.value.trim()) { setTextInput(null); return }
    const ctx = canvasRef.current?.getContext('2d')
    if (ctx) {
      pushUndo()
      ctx.font = `600 ${Math.max(20, thickness * 7)}px -apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Segoe UI', sans-serif`
      ctx.fillStyle = color
      ctx.shadowColor = 'rgba(0,0,0,0.35)'
      ctx.shadowBlur = 3
      ctx.fillText(textInput.value, textInput.x, textInput.y)
      commitCurrent()
    }
    setTextInput(null)
  }, [textInput, color, thickness])

  const handleUndo = useCallback(() => {
    const committed = committedRef.current
    const ctx = committed?.getContext('2d')
    const prev = undoStackRef.current.pop()
    if (committed && ctx && prev) {
      ctx.putImageData(prev, 0, 0)
      restoreCommitted()
    }
    setCanUndo(undoStackRef.current.length > 0)
  }, [])

  const handleClear = () => {
    if (!image || !committedRef.current) return
    pushUndo()
    const ctx = committedRef.current.getContext('2d')
    if (ctx) {
      ctx.clearRect(0, 0, committedRef.current.width, committedRef.current.height)
      ctx.drawImage(image, 0, 0)
    }
    restoreCommitted()
  }

  // Keyboard shortcuts: ⌘Z / Ctrl+Z undo, Esc close
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); handleUndo() }
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [handleUndo, onClose])

  const TOOLS: { id: ToolType; label: string }[] = [
    { id: 'arrow', label: 'Arrow' },
    { id: 'rect', label: 'Rectangle' },
    { id: 'circle', label: 'Oval' },
    { id: 'pen', label: 'Draw' },
    { id: 'text', label: 'Text' },
  ]

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 10010,
      background: 'rgba(0,0,0,0.82)',
      backdropFilter: 'blur(20px)',
      WebkitBackdropFilter: 'blur(20px)',
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Segoe UI', sans-serif",
    }}>

      {/* Top bar: title + Cancel / Done */}
      <div style={{
        width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '14px 20px',
      }}>
        <button type="button" onClick={onClose} style={{
          ...glass, color: 'rgba(255,255,255,0.9)', border: '1px solid rgba(255,255,255,0.14)',
          padding: '8px 18px', borderRadius: 999, fontSize: 13, fontWeight: 500, cursor: 'pointer',
        }}>
          Cancel
        </button>
        <span style={{ color: 'rgba(255,255,255,0.65)', fontSize: 13, fontWeight: 500, letterSpacing: 0.2 }}>
          Markup
        </span>
        <button type="button"
          onClick={() => { const c = canvasRef.current; if (c) onSave(c.toDataURL('image/png')) }}
          style={{
            background: '#0A84FF', color: '#fff', border: 'none',
            padding: '8px 22px', borderRadius: 999, fontSize: 13, fontWeight: 600, cursor: 'pointer',
            boxShadow: '0 4px 16px rgba(10,132,255,0.4)',
          }}>
          Done
        </button>
      </div>

      {/* Canvas */}
      <div style={{ flex: 1, width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', padding: '0 20px', position: 'relative' }}>
        <canvas
          ref={canvasRef}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerLeave={handlePointerUp}
          style={{
            maxWidth: '100%', maxHeight: '100%',
            borderRadius: 12,
            boxShadow: '0 24px 64px rgba(0,0,0,0.5)',
            cursor: tool === 'text' ? 'text' : 'crosshair',
            touchAction: 'none',
          }}
        />
        {/* Inline text entry */}
        {textInput && (
          <input
            autoFocus
            value={textInput.value}
            onChange={e => setTextInput({ ...textInput, value: e.target.value })}
            onKeyDown={e => { if (e.key === 'Enter') commitText(); if (e.key === 'Escape') setTextInput(null) }}
            onBlur={commitText}
            placeholder="Type, then press Enter"
            style={{
              position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
              ...glass, color: '#fff', outline: 'none',
              padding: '10px 16px', borderRadius: 12, fontSize: 15, minWidth: 240,
            }}
          />
        )}
      </div>

      {/* Bottom floating toolbar */}
      <div style={{
        ...glass,
        margin: '16px 0 22px',
        borderRadius: 999,
        padding: '8px 14px',
        display: 'flex', alignItems: 'center', gap: 6,
        flexWrap: 'wrap', justifyContent: 'center', maxWidth: 'calc(100vw - 32px)',
      }}>
        {/* Tools */}
        {TOOLS.map(t => (
          <button type="button" key={t.id} onClick={() => setTool(t.id)} title={t.label} style={{
            width: 36, height: 36, borderRadius: 999, border: 'none', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: tool === t.id ? 'rgba(10,132,255,0.22)' : 'transparent',
            transition: 'background 0.15s ease',
          }}>
            <ToolIcon tool={t.id} active={tool === t.id} />
          </button>
        ))}

        <div style={{ width: 1, height: 22, background: 'rgba(255,255,255,0.15)', margin: '0 4px' }} />

        {/* Colors */}
        {COLORS.map(c => (
          <button type="button" key={c} onClick={() => setColor(c)} title={c} style={{
            width: 22, height: 22, borderRadius: 999, cursor: 'pointer',
            background: c,
            border: c === '#FFFFFF' ? '1px solid rgba(255,255,255,0.4)' : '1px solid rgba(0,0,0,0.2)',
            outline: color === c ? '2px solid #0A84FF' : 'none',
            outlineOffset: 2,
            transition: 'transform 0.12s ease',
            transform: color === c ? 'scale(1.15)' : 'scale(1)',
          }} />
        ))}

        <div style={{ width: 1, height: 22, background: 'rgba(255,255,255,0.15)', margin: '0 4px' }} />

        {/* Thickness */}
        <input
          type="range" min={2} max={12} value={thickness}
          onChange={e => setThickness(Number(e.target.value))}
          title="Line thickness"
          style={{ width: 72, accentColor: '#0A84FF' }}
        />

        <div style={{ width: 1, height: 22, background: 'rgba(255,255,255,0.15)', margin: '0 4px' }} />

        {/* Undo / Clear */}
        <button type="button" onClick={handleUndo} disabled={!canUndo} title="Undo (⌘Z)" style={{
          width: 36, height: 36, borderRadius: 999, border: 'none', cursor: canUndo ? 'pointer' : 'default',
          display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'transparent',
          opacity: canUndo ? 1 : 0.35,
        }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.85)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="9 14 4 9 9 4" /><path d="M20 20v-7a4 4 0 0 0-4-4H4" />
          </svg>
        </button>
        <button type="button" onClick={handleClear} title="Clear all annotations" style={{
          width: 36, height: 36, borderRadius: 999, border: 'none', cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'transparent',
        }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.85)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
          </svg>
        </button>
      </div>
    </div>
  )
}
