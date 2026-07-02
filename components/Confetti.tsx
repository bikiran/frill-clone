'use client'

import { useEffect, useRef } from 'react'

interface ConfettiProps {
  show: boolean
  color?: string
}

export default function Confetti({ show, color = '#ff7a6b' }: ConfettiProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const particlesRef = useRef<any[]>([])
  const animationIdRef = useRef<number | null>(null)

  useEffect(() => {
    if (!show || !canvasRef.current) return

    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    canvas.width = window.innerWidth
    canvas.height = window.innerHeight

    // Create many particles from bottom
    const particleCount = 120
    const particles = []

    for (let i = 0; i < particleCount; i++) {
      particles.push({
        x: Math.random() * canvas.width,
        y: canvas.height + 10,
        vx: (Math.random() - 0.5) * 6,
        vy: -Math.random() * 8 - 4,
        ax: (Math.random() - 0.5) * 0.3,
        ay: 0.2,
        rotation: Math.random() * Math.PI * 2,
        rotationSpeed: (Math.random() - 0.5) * 0.1,
        size: Math.random() * 4 + 2,
        type: Math.floor(Math.random() * 3), // circle, square, or triangle
        opacity: 1,
        life: 0,
        maxLife: Math.random() * 1.5 + 1.5,
        color: [color, '#fff', '#ffd700', '#ff6b9d', '#00d4ff'][Math.floor(Math.random() * 5)],
      })
    }

    particlesRef.current = particles

    const animate = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height)

      particlesRef.current = particlesRef.current.filter(p => p.life < p.maxLife)

      particlesRef.current.forEach(p => {
        p.life += 0.016 // ~60fps
        p.opacity = 1 - p.life / p.maxLife

        p.vx += p.ax
        p.vy += p.ay
        p.vy += 0.15 // gravity

        p.x += p.vx
        p.y += p.vy
        p.rotation += p.rotationSpeed

        ctx.save()
        ctx.globalAlpha = p.opacity
        ctx.fillStyle = p.color
        ctx.translate(p.x, p.y)
        ctx.rotate(p.rotation)

        if (p.type === 0) {
          // Circle
          ctx.beginPath()
          ctx.arc(0, 0, p.size, 0, Math.PI * 2)
          ctx.fill()
        } else if (p.type === 1) {
          // Square
          ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size)
        } else {
          // Triangle
          ctx.beginPath()
          ctx.moveTo(0, -p.size)
          ctx.lineTo(p.size, p.size)
          ctx.lineTo(-p.size, p.size)
          ctx.closePath()
          ctx.fill()
        }

        ctx.restore()
      })

      if (particlesRef.current.length > 0) {
        animationIdRef.current = requestAnimationFrame(animate)
      }
    }

    animate()

    return () => {
      if (animationIdRef.current) cancelAnimationFrame(animationIdRef.current)
    }
  }, [show, color])

  if (!show) return null

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        pointerEvents: 'none',
        zIndex: 9999,
      }}
    />
  )
}
