'use client'

import { useRef, useState, useEffect } from 'react'

type ToolType = 'arrow' | 'rect' | 'circle' | 'text' | 'pen' | 'eraser'
type Color = string

interface AnnotationState {
  tool: ToolType
  color: Color
  thickness: number
  isDrawing: boolean
  startX: number
  startY: number
  text: string
}

export default function ImageAnnotator({ 
  imageSrc, 
  onSave,
  onClose 
}: { 
  imageSrc: string
  onSave: (dataUrl: string) => void
  onClose: () => void
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [state, setState] = useState<AnnotationState>({
    tool: 'arrow',
    color: '#ff0000',
    thickness: 2,
    isDrawing: false,
    startX: 0,
    startY: 0,
    text: '',
  })
  const [image, setImage] = useState<HTMLImageElement | null>(null)
  const [tempCanvas, setTempCanvas] = useState<HTMLCanvasElement | null>(null)

  // Load image
  useEffect(() => {
    const img = new Image()
    img.onload = () => {
      setImage(img)
      const canvas = canvasRef.current
      if (canvas) {
        canvas.width = img.width
        canvas.height = img.height
        const ctx = canvas.getContext('2d')
        if (ctx) {
          ctx.drawImage(img, 0, 0)
          // Create temp canvas for preview
          const temp = document.createElement('canvas')
          temp.width = img.width
          temp.height = img.height
          setTempCanvas(temp)
        }
      }
    }
    img.src = imageSrc
  }, [imageSrc])

  const drawArrow = (fromX: number, fromY: number, toX: number, toY: number) => {
    const ctx = canvasRef.current?.getContext('2d')
    if (!ctx) return
    
    const headlen = 15
    const angle = Math.atan2(toY - fromY, toX - fromX)
    
    ctx.strokeStyle = state.color
    ctx.fillStyle = state.color
    ctx.lineWidth = state.thickness
    ctx.beginPath()
    ctx.moveTo(fromX, fromY)
    ctx.lineTo(toX, toY)
    ctx.stroke()
    
    ctx.beginPath()
    ctx.moveTo(toX, toY)
    ctx.lineTo(toX - headlen * Math.cos(angle - Math.PI / 6), toY - headlen * Math.sin(angle - Math.PI / 6))
    ctx.lineTo(toX - headlen * Math.cos(angle + Math.PI / 6), toY - headlen * Math.sin(angle + Math.PI / 6))
    ctx.closePath()
    ctx.fill()
  }

  const drawRect = (fromX: number, fromY: number, toX: number, toY: number) => {
    const ctx = canvasRef.current?.getContext('2d')
    if (!ctx) return
    ctx.strokeStyle = state.color
    ctx.lineWidth = state.thickness
    ctx.strokeRect(fromX, fromY, toX - fromX, toY - fromY)
  }

  const drawCircle = (fromX: number, fromY: number, toX: number, toY: number) => {
    const ctx = canvasRef.current?.getContext('2d')
    if (!ctx) return
    const radius = Math.sqrt(Math.pow(toX - fromX, 2) + Math.pow(toY - fromY, 2))
    ctx.strokeStyle = state.color
    ctx.lineWidth = state.thickness
    ctx.beginPath()
    ctx.arc(fromX, fromY, radius, 0, 2 * Math.PI)
    ctx.stroke()
  }

  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top

    setState(prev => ({ ...prev, isDrawing: true, startX: x, startY: y }))
  }

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!state.isDrawing || !image || !canvasRef.current) return

    const canvas = canvasRef.current
    const rect = canvas.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top

    // Redraw original image
    const ctx = canvas.getContext('2d')
    if (ctx) {
      ctx.drawImage(image, 0, 0)

      // Draw preview
      if (state.tool === 'arrow') drawArrow(state.startX, state.startY, x, y)
      else if (state.tool === 'rect') drawRect(state.startX, state.startY, x, y)
      else if (state.tool === 'circle') drawCircle(state.startX, state.startY, x, y)
    }
  }

  const handleMouseUp = () => {
    setState(prev => ({ ...prev, isDrawing: false }))
  }

  const handleSave = () => {
    const canvas = canvasRef.current
    if (canvas) {
      onSave(canvas.toDataURL('image/png'))
    }
  }

  const COLORS = ['#ff0000', '#00ff00', '#0000ff', '#ffff00', '#ff00ff', '#00ffff', '#000000', '#ffffff']
  const TOOLS: ToolType[] = ['arrow', 'rect', 'circle', 'text', 'pen']

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      background: '#000',
      zIndex: 10000,
      display: 'flex',
      flexDirection: 'column',
      padding: 16,
      gap: 12,
    }}>
      {/* Toolbar */}
      <div style={{
        display: 'flex',
        gap: 12,
        alignItems: 'center',
        background: '#222',
        padding: '12px 16px',
        borderRadius: 8,
        flexWrap: 'wrap',
      }}>
        {/* Tools */}
        <div style={{ display: 'flex', gap: 8 }}>
          {TOOLS.map(tool => (
            <button
              key={tool}
              onClick={() => setState(prev => ({ ...prev, tool }))}
              style={{
                padding: '8px 12px',
                background: state.tool === tool ? 'var(--coral)' : '#444',
                color: '#fff',
                border: 'none',
                borderRadius: 4,
                cursor: 'pointer',
                fontSize: 12,
                fontWeight: 'bold',
                textTransform: 'capitalize',
              }}>
              {tool === 'arrow' && '→'}
              {tool === 'rect' && '□'}
              {tool === 'circle' && '○'}
              {tool === 'text' && 'T'}
              {tool === 'pen' && '✏️'}
            </button>
          ))}
        </div>

        {/* Color picker */}
        <div style={{ display: 'flex', gap: 4 }}>
          {COLORS.map(color => (
            <button
              key={color}
              onClick={() => setState(prev => ({ ...prev, color }))}
              style={{
                width: 24,
                height: 24,
                borderRadius: 4,
                background: color,
                border: state.color === color ? '3px solid #fff' : '1px solid #666',
                cursor: 'pointer',
              }}
              title={color}
            />
          ))}
        </div>

        {/* Thickness */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <label style={{ color: '#fff', fontSize: 12 }}>Width:</label>
          <input
            type="range"
            min="1"
            max="20"
            value={state.thickness}
            onChange={(e) => setState(prev => ({ ...prev, thickness: parseInt(e.target.value) }))}
            style={{ width: 80 }}
          />
        </div>

        {/* Actions */}
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          <button
            onClick={handleSave}
            style={{
              padding: '8px 16px',
              background: 'var(--coral)',
              color: '#fff',
              border: 'none',
              borderRadius: 4,
              cursor: 'pointer',
              fontSize: 12,
              fontWeight: 'bold',
            }}>
            ✓ Save & Attach
          </button>
          <button
            onClick={onClose}
            style={{
              padding: '8px 16px',
              background: '#666',
              color: '#fff',
              border: 'none',
              borderRadius: 4,
              cursor: 'pointer',
              fontSize: 12,
              fontWeight: 'bold',
            }}>
            ✕ Cancel
          </button>
        </div>
      </div>

      {/* Canvas */}
      <div style={{
        flex: 1,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'auto',
        background: '#111',
        borderRadius: 8,
      }}>
        <canvas
          ref={canvasRef}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          style={{
            cursor: 'crosshair',
            maxWidth: '100%',
            maxHeight: '100%',
            border: '2px solid #444',
          }}
        />
      </div>
    </div>
  )
}
