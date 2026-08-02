'use client'

import { useEffect, useState } from 'react'

// A lightweight guided tour shown inside a demo workspace. A floating button
// opens a step-by-step overlay explaining Colvy's key areas. Descriptive (not
// element-anchored) so it's robust across pages. Progress is remembered for the
// browser session only.
const STEPS: { title: string; body: string }[] = [
  { title: 'One unified inbox', body: 'Instagram, Facebook, email, website chat, SMS, phone and reviews all land in a single inbox — no switching platforms. Try filtering by channel or status.' },
  { title: 'AI conversation summaries', body: 'Open any conversation and generate a summary, detect intent, sentiment and priority, and get a suggested next action — all simulated in the demo.' },
  { title: 'Customer profiles', body: 'Every contact has a full profile: spend, orders, average order value, location, preferred channel, tags, sentiment history and an AI summary.' },
  { title: 'Order context', body: 'Orders sit right beside the conversation, so you can answer order and delivery questions without leaving the thread.' },
  { title: 'Team assignment', body: 'Assign conversations to teammates, add internal notes and @mention colleagues to collaborate privately.' },
  { title: 'Tasks & follow-ups', body: 'Turn any message into a task with a due date, so nothing slips through the cracks.' },
  { title: 'Reviews', body: 'See Google reviews in one place and draft AI replies you can approve — great for reputation management.' },
  { title: 'Customer map', body: 'See where your customers are across Melbourne, with spend by suburb, delivery zones and AI geographic insights.' },
  { title: 'Analytics', body: 'Response times, resolution rates, channel mix, team performance and customer satisfaction — all on one dashboard.' },
  { title: 'Ready to go live?', body: 'In a real Colvy workspace you connect your own channels and message customers for real. Start a free trial to make it yours.' },
]

export default function DemoTour() {
  const [open, setOpen] = useState(false)
  const [i, setI] = useState(0)
  useEffect(() => {
    try { if (!sessionStorage.getItem('colvy:demo-tour-seen')) setOpen(true) } catch {}
  }, [])
  const close = () => { setOpen(false); try { sessionStorage.setItem('colvy:demo-tour-seen', '1') } catch {} }
  const step = STEPS[i]

  return (
    <>
      <button onClick={() => { setI(0); setOpen(true) }}
        style={{ position: 'fixed', left: 18, bottom: 18, zIndex: 99998, padding: '10px 16px', borderRadius: 999, border: 'none', background: 'linear-gradient(90deg,#0b8457,#0e9e6a)', color: '#fff', fontSize: 13.5, fontWeight: 700, cursor: 'pointer', boxShadow: '0 6px 20px rgba(11,132,87,0.4)', display: 'flex', alignItems: 'center', gap: 7 }}>
        ✨ Take a tour
      </button>

      {open && (
        <div onClick={close} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 99999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div onClick={e => e.stopPropagation()} style={{ width: 460, maxWidth: '96vw', background: '#fff', borderRadius: 18, overflow: 'hidden', boxShadow: '0 24px 60px rgba(0,0,0,0.3)', fontFamily: '-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif' }}>
            <div style={{ height: 5, background: '#eef0f2' }}><div style={{ height: '100%', width: `${((i + 1) / STEPS.length) * 100}%`, background: 'linear-gradient(90deg,#0b8457,#0e9e6a)', transition: 'width 0.25s ease' }} /></div>
            <div style={{ padding: '26px 26px 22px' }}>
              <p style={{ fontSize: 12, fontWeight: 700, color: '#0b8457', margin: '0 0 8px', letterSpacing: '0.04em' }}>STEP {i + 1} OF {STEPS.length}</p>
              <h2 style={{ fontSize: 21, fontWeight: 800, color: '#111', margin: '0 0 10px', letterSpacing: '-0.01em' }}>{step.title}</h2>
              <p style={{ fontSize: 14.5, color: '#4b5563', lineHeight: 1.6, margin: 0 }}>{step.body}</p>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 24 }}>
                <button onClick={close} style={{ background: 'none', border: 'none', color: '#9ca3af', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Skip tour</button>
                <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
                  {i > 0 && <button onClick={() => setI(i - 1)} style={{ padding: '9px 16px', borderRadius: 10, border: '1px solid #e5e7eb', background: '#fff', color: '#374151', fontSize: 13.5, fontWeight: 600, cursor: 'pointer' }}>Back</button>}
                  {i < STEPS.length - 1
                    ? <button onClick={() => setI(i + 1)} style={{ padding: '9px 18px', borderRadius: 10, border: 'none', background: '#0b8457', color: '#fff', fontSize: 13.5, fontWeight: 700, cursor: 'pointer' }}>Next</button>
                    : <a href="https://colvy.com/signup" style={{ padding: '9px 18px', borderRadius: 10, border: 'none', background: '#ff7a6b', color: '#fff', fontSize: 13.5, fontWeight: 700, cursor: 'pointer', textDecoration: 'none' }}>Start free trial</a>}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
