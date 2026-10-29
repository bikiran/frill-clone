'use client'

import { useEffect, useRef, useState } from 'react'

// The dashboard's greeting, set like the top of an Apple app's summary
// screen: today's date in small grey type with a sun or moon, a large title
// ("Good morning, Roxy") and a quiet line under it. No card behind it. As the
// page scrolls the title eases back a touch (a little parallax) and softens.

type Part = 'morning' | 'afternoon' | 'evening' | 'night'

function partOfDay(hour: number): Part {
  if (hour >= 5 && hour < 12) return 'morning'
  if (hour >= 12 && hour < 17) return 'afternoon'
  if (hour >= 17 && hour < 21) return 'evening'
  return 'night'
}

const COPY: Record<Part, { greeting: string; lines: string[] }> = {
  morning: { greeting: 'Good morning', lines: ['Fresh start. Let’s make today count.', 'The inbox is waiting. Coffee first?', 'A new day, a clean slate.'] },
  afternoon: { greeting: 'Good afternoon', lines: ['Hope the day’s treating you well.', 'Midday momentum. Keep it rolling.', 'Right on schedule.'] },
  evening: { greeting: 'Good evening', lines: ['Winding down or powering through?', 'Evening check-in. Let’s tidy up.', 'Almost there. Nice work today.'] },
  night: { greeting: 'Working late', lines: ['Burning the midnight oil, I see.', 'The quiet hours. Get things done.', 'Don’t forget to rest soon.'] },
}

const Sun = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#ff9f0a" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
    <circle cx="12" cy="12" r="4.2" fill="#ff9f0a" stroke="none" />
    <path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4" />
  </svg>
)
const Moon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true">
    <path d="M20.5 14.6A8.5 8.5 0 0 1 9.4 3.5a8.5 8.5 0 1 0 11.1 11.1z" fill="#5e5ce6" />
  </svg>
)

export default function Greeting({ name }: { name?: string }) {
  const [part, setPart] = useState<Part>(() => partOfDay(new Date().getHours()))
  const [line, setLine] = useState('')
  const [date, setDate] = useState('')

  useEffect(() => {
    const p = partOfDay(new Date().getHours())
    setPart(p)
    setLine(COPY[p].lines[Math.floor(Math.random() * COPY[p].lines.length)])
    setDate(new Date().toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'long' }))
  }, [])

  // As the page scrolls the title eases back and softens, the way a large
  // title gives way. `translate` leaves the entrance animation's transform
  // alone.
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return
    let raf = 0
    const paint = () => {
      raf = 0
      const el = ref.current
      if (!el) return
      const y = Math.max(0, Math.min(window.scrollY, 160))
      el.style.translate = `0 ${(y * 0.12).toFixed(1)}px`
      el.style.opacity = (1 - y / 260).toFixed(3)
    }
    const on = () => { if (!raf) raf = requestAnimationFrame(paint) }
    window.addEventListener('scroll', on, { passive: true })
    return () => { window.removeEventListener('scroll', on); cancelAnimationFrame(raf) }
  }, [])

  const first = (name || '').trim().split(' ')[0]
  const c = COPY[part]

  return (
    <div ref={ref} className="cv-greet" style={{ marginBottom: 26, willChange: 'translate, opacity' }}>
      <style>{`
        .cv-greet > * { animation: cvGreetIn .55s cubic-bezier(.2,.8,.2,1) both; }
        .cv-greet > :nth-child(2) { animation-delay: .05s; }
        .cv-greet > :nth-child(3) { animation-delay: .1s; }
        @keyframes cvGreetIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } }
        @media (prefers-reduced-motion: reduce) { .cv-greet > * { animation: none; } }
      `}</style>
      <p style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 600, color: '#8e8e93', letterSpacing: '0.01em', minHeight: 18 }}>
        {part === 'night' ? <Moon /> : <Sun />}
        <span suppressHydrationWarning>{date}</span>
      </p>
      <h1 style={{ margin: '4px 0 0', fontSize: 28, lineHeight: 1.15, fontWeight: 700, letterSpacing: '-0.02em', color: 'var(--ink)' }}>
        {c.greeting}{first ? <>, <em className="cv-accent">{first}</em></> : ''}
      </h1>
      <p style={{ margin: '6px 0 0', fontSize: 15, color: 'var(--slate)', minHeight: 20 }}>{line}</p>
    </div>
  )
}
