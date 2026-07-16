'use client'

import { useEffect, useState } from 'react'

// A warm, time-aware greeting with a gentle entrance animation. Picks the
// salutation from the local hour and rotates a friendly sub-line, the way
// polished assistants greet you. Purely presentational.

function timeContext(hour: number): { greeting: string; emoji: string; gradient: string; lines: string[] } {
  if (hour >= 5 && hour < 12) return {
    greeting: 'Good morning', emoji: '☀️',
    gradient: 'linear-gradient(135deg,#fef3c7,#fde68a)',
    lines: ['Fresh start — let’s make today count.', 'The inbox is waiting. Coffee first?', 'A new day, a clean slate.'],
  }
  if (hour >= 12 && hour < 17) return {
    greeting: 'Good afternoon', emoji: '🌤️',
    gradient: 'linear-gradient(135deg,#dbeafe,#bfdbfe)',
    lines: ['Hope the day’s treating you well.', 'Midday momentum — keep it rolling.', 'Right on schedule.'],
  }
  if (hour >= 17 && hour < 21) return {
    greeting: 'Good evening', emoji: '🌆',
    gradient: 'linear-gradient(135deg,#fce7f3,#fbcfe8)',
    lines: ['Winding down or powering through?', 'Evening check-in — let’s tidy up.', 'Almost there. Nice work today.'],
  }
  return {
    greeting: 'Working late', emoji: '🌙',
    gradient: 'linear-gradient(135deg,#e0e7ff,#c7d2fe)',
    lines: ['Burning the midnight oil, I see.', 'The quiet hours — get things done.', 'Don’t forget to rest soon.'],
  }
}

export default function Greeting({ name }: { name?: string }) {
  const [mounted, setMounted] = useState(false)
  const [ctx, setCtx] = useState(() => timeContext(new Date().getHours()))
  const [line, setLine] = useState('')

  useEffect(() => {
    const c = timeContext(new Date().getHours())
    setCtx(c)
    setLine(c.lines[Math.floor(Math.random() * c.lines.length)])
    const t = setTimeout(() => setMounted(true), 40)
    return () => clearTimeout(t)
  }, [])

  const first = (name || '').trim().split(' ')[0]

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 16, padding: '18px 22px', borderRadius: 18,
      background: ctx.gradient, marginBottom: 22,
      opacity: mounted ? 1 : 0,
      transform: mounted ? 'translateY(0)' : 'translateY(10px)',
      transition: 'opacity 0.5s ease, transform 0.5s cubic-bezier(0.22,1,0.36,1)',
    }}>
      <style>{`
        @keyframes greetWave { 0%,60%,100%{transform:rotate(0)} 10%,30%{transform:rotate(14deg)} 20%{transform:rotate(-8deg)} 40%{transform:rotate(10deg)} }
        @keyframes greetFloat { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-4px)} }
      `}</style>
      <div style={{ fontSize: 38, lineHeight: 1, animation: ctx.emoji === '☀️' ? 'greetFloat 3s ease-in-out infinite' : 'greetFloat 4s ease-in-out infinite' }}>
        {ctx.emoji}
      </div>
      <div style={{ minWidth: 0 }}>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: '#1a1a2e', display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
          <span>{ctx.greeting}{first ? ',' : ''}</span>
          {first && (
            <span style={{
              background: 'linear-gradient(90deg,#4f46e5,#db2777)', WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent', backgroundClip: 'text',
            }}>{first}</span>
          )}
          <span style={{ display: 'inline-block', animation: 'greetWave 2.4s ease-in-out 0.6s' }}>👋</span>
        </h1>
        <p style={{ margin: '4px 0 0', fontSize: 13.5, color: '#3b3b52', opacity: 0.85 }}>{line}</p>
      </div>
    </div>
  )
}
