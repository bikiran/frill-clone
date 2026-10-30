'use client'

import { useEffect, useState } from 'react'
import Collapse from '@/components/Collapse'
import MarketingNav from '@/components/MarketingNav'
import MarketingFooter from '@/components/MarketingFooter'
import FeatureIcon from '@/components/FeatureIcon'
import InviteCta from '@/components/InviteCta'
import { AGENTS, AGENT_PILLARS, AGENT_PLANS_LABEL, CONTROL_STEPS, type MarketingAgent } from '@/lib/agents-marketing'

// /ai-agents: Colvy's five AI agents, how much they do on their own, and what
// keeps them safe to leave running. Copy comes from lib/agents-marketing.ts.

const CORAL = '#ff6a4d'
const INK = '#0f1119'
const MONO = 'ui-monospace, "SF Mono", SFMono-Regular, Menlo, Consolas, monospace'

const FAQ = [
  { q: 'Will an agent message my customers without me knowing?', a: 'Not unless you let it. Every agent starts by drafting: replies wait in the inbox for your team to send, edit or discard. You can later let some replies go out on their own, for the topics you pick, with a daily limit, and only when the reply is backed by a live lookup. One switch pauses every agent.' },
  { q: 'Which plans include the agents?', a: `The ${AGENT_PLANS_LABEL}. Each team member can be given or refused access to the agents in their permissions.` },
  { q: 'Where do the facts come from?', a: 'From your own systems, at the moment it answers: your WooCommerce or Shopify orders and stock, carrier tracking, your booking calendar, Google Business Profile hours, your help centre and the knowledge you add. If it can’t check something, it says it will ask the team.' },
  { q: 'What happens when it can’t help?', a: 'It hands the conversation to your team with a short note: what the customer wants, what it checked, and what it found. The hand-over shows in the inbox and in Needs you, so nobody has to read the whole thread.' },
  { q: 'Can I see why it did something?', a: 'Yes. Every reply, hand-off and task has a “Why?” link: what came in, what the agent looked up, what it decided, which permission allowed it, and who approved it.' },
  { q: 'Does it learn from my team?', a: 'When someone edits a draft before sending, Colvy may suggest a lesson for Business Memory, like “we don’t ship live fish to WA”. Nothing changes until the owner keeps it. The agents never teach themselves.' },
]

// The hero console: one agent's run, typed out line by line, then the next.
function Console({ dark }: { dark: boolean }) {
  const [k, setK] = useState(0)
  // The first run is shown whole, so the panel is never empty on arrival.
  const [n, setN] = useState(99)
  const a = AGENTS[k]
  const lines = 2 + a.example.checks.length + 1
  useEffect(() => {
    if (typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) { setN(99); return }
    const t = setTimeout(() => {
      if (n < lines) setN(n + 1)
      else { setN(0); setK((k + 1) % AGENTS.length) }
    }, n === 0 ? 450 : n < lines ? 750 : 3200)
    return () => clearTimeout(t)
  }, [n, k, lines])
  const line = 'rgba(255,255,255,0.09)'
  const row = (i: number, el: React.ReactNode) => (
    <div key={i} style={{ opacity: n > i ? 1 : 0, transform: n > i ? 'none' : 'translateY(6px)', transition: 'opacity .35s, transform .35s' }}>{el}</div>
  )
  return (
    <div aria-label={`${a.name} example`} style={{ borderRadius: 22, background: '#0d0f16', border: `1px solid ${line}`, boxShadow: dark ? 'none' : '0 40px 90px rgba(15,17,25,0.25)', overflow: 'hidden', color: '#e8eaf2' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 18px', borderBottom: `1px solid ${line}` }}>
        <span style={{ width: 8, height: 8, borderRadius: '50%', background: a.color, boxShadow: `0 0 12px ${a.color}` }} />
        <span style={{ fontFamily: MONO, fontSize: 12, letterSpacing: '0.06em' }}>{a.name}</span>
        <span style={{ marginLeft: 'auto', fontFamily: MONO, fontSize: 11, color: 'rgba(232,234,242,0.5)' }}>{a.example.channel}</span>
      </div>
      <div style={{ padding: 20, display: 'grid', gap: 12, minHeight: 300, alignContent: 'start' }}>
        {row(0, <div style={{ maxWidth: '85%', padding: '10px 14px', borderRadius: '16px 16px 16px 4px', background: 'rgba(255,255,255,0.07)', fontSize: 14.5, lineHeight: 1.45 }}>{a.example.them}</div>)}
        {a.example.checks.map((c, i) => row(i + 1, (
          <div style={{ fontFamily: MONO, fontSize: 12.5, color: 'rgba(232,234,242,0.7)', display: 'flex', gap: 8 }}>
            <span style={{ color: a.color }}>✓</span><span>{c}</span>
          </div>
        )))}
        {row(a.example.checks.length + 1, <div style={{ justifySelf: 'end', maxWidth: '88%', padding: '10px 14px', borderRadius: '16px 16px 4px 16px', background: a.color, color: '#fff', fontSize: 14.5, lineHeight: 1.45 }}>{a.example.reply}</div>)}
        {row(a.example.checks.length + 2, <div style={{ justifySelf: 'end', fontFamily: MONO, fontSize: 11.5, color: 'rgba(232,234,242,0.55)' }}>{a.example.status}</div>)}
      </div>
      <div style={{ display: 'flex', gap: 6, padding: '0 20px 18px' }} aria-hidden>
        {AGENTS.map((x, i) => <span key={x.key} style={{ height: 3, flex: 1, borderRadius: 3, background: i === k ? x.color : 'rgba(255,255,255,0.1)', transition: 'background .3s' }} />)}
      </div>
    </div>
  )
}

function AgentSection({ a, i, text, muted, line, card }: { a: MarketingAgent; i: number; text: string; muted: string; line: string; card: string }) {
  return (
    <article id={a.key} className="ag-row" style={{ scrollMarginTop: 90, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'clamp(28px, 5vw, 64px)', alignItems: 'center', padding: 'clamp(40px, 6vw, 70px) 0', borderTop: `1px solid ${line}` }}>
      <div style={{ order: i % 2 ? 2 : 1 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
          <span style={{ width: 42, height: 42, borderRadius: 13, background: a.color + '1f', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}><FeatureIcon name={a.icon} color={a.color} size={20} /></span>
          <span style={{ fontFamily: MONO, fontSize: 12, letterSpacing: '0.1em', textTransform: 'uppercase', color: muted }}>{String(i + 1).padStart(2, '0')} · {a.where}</span>
        </div>
        <h2 style={{ fontSize: 'clamp(28px, 3.6vw, 42px)', fontWeight: 900, letterSpacing: '-0.03em', lineHeight: 1.05, margin: '0 0 12px', color: text }}>{a.name}</h2>
        <p style={{ fontSize: 17, lineHeight: 1.55, color: muted, margin: '0 0 22px' }}>{a.role}</p>
        <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 20px', display: 'grid', gap: 10 }}>
          {a.does.map(d => (
            <li key={d} style={{ display: 'flex', gap: 10, fontSize: 15, lineHeight: 1.45, color: text }}>
              <span aria-hidden style={{ color: a.color, fontWeight: 900 }}>✓</span>{d}
            </li>
          ))}
        </ul>
        <p style={{ fontSize: 14, lineHeight: 1.5, color: muted, margin: 0, paddingLeft: 12, borderLeft: `2px solid ${a.color}` }}>{a.never}</p>
      </div>
      <div style={{ order: i % 2 ? 1 : 2, borderRadius: 20, border: `1px solid ${line}`, background: card, padding: 20 }}>
        <div style={{ fontFamily: MONO, fontSize: 11.5, letterSpacing: '0.08em', textTransform: 'uppercase', color: muted, marginBottom: 14 }}>{a.example.channel}</div>
        <div style={{ maxWidth: '88%', padding: '10px 14px', borderRadius: '16px 16px 16px 4px', background: line, fontSize: 15, lineHeight: 1.45, color: text, marginBottom: 14 }}>{a.example.them}</div>
        <div style={{ display: 'grid', gap: 6, margin: '0 0 14px', padding: '12px 14px', borderRadius: 12, border: `1px dashed ${line}` }}>
          {a.example.checks.map(c => <div key={c} style={{ fontFamily: MONO, fontSize: 12.5, color: muted }}><span style={{ color: a.color }}>✓</span> {c}</div>)}
        </div>
        <div style={{ marginLeft: 'auto', maxWidth: '90%', padding: '10px 14px', borderRadius: '16px 16px 4px 16px', background: a.color, color: '#fff', fontSize: 15, lineHeight: 1.45 }}>{a.example.reply}</div>
        <div style={{ textAlign: 'right', fontFamily: MONO, fontSize: 11.5, color: muted, marginTop: 8 }}>{a.example.status}</div>
      </div>
    </article>
  )
}

export default function AiAgentsPage() {
  const [dark, setDark] = useState(false)
  const [open, setOpen] = useState<number | null>(0)

  const bg = dark ? '#0a0b12' : '#ffffff'
  const text = dark ? '#f4f5fb' : INK
  const muted = dark ? 'rgba(244,245,251,0.62)' : 'rgba(15,17,25,0.6)'
  const line = dark ? 'rgba(255,255,255,0.09)' : 'rgba(15,17,25,0.09)'
  const card = dark ? 'rgba(255,255,255,0.04)' : '#fbfaf8'
  const font = '-apple-system,BlinkMacSystemFont,"SF Pro Display","Segoe UI",Inter,sans-serif'

  return (
    <div style={{ background: bg, color: text, fontFamily: font, minHeight: '100vh', overflowX: 'hidden' }}>
      <style>{`
        .ag-faq::before{ display:none }
        .ag-faq:hover{ color:${CORAL} !important }
        .ag-faq:focus-visible{ outline:2px solid ${CORAL}; outline-offset:4px; border-radius:6px }
        @media (max-width: 900px){ .ag-hero{ grid-template-columns:1fr !important } .ag-row{ grid-template-columns:1fr !important } .ag-row > *{ order:0 !important } .ag-steps{ grid-template-columns:1fr !important } }
      `}</style>
      <MarketingNav dark={dark} onToggleDark={() => setDark(v => !v)} />

      {/* HERO */}
      <section style={{ position: 'relative', background: dark ? '#0a0b10' : 'linear-gradient(180deg, #fff4ef 0%, #ffffff 80%)', padding: 'clamp(110px, 13vw, 150px) 24px clamp(60px, 8vw, 90px)', overflow: 'hidden' }}>
        <div className="ag-hero" style={{ maxWidth: 1240, margin: '0 auto', display: 'grid', gridTemplateColumns: '1.05fr 0.95fr', gap: 'clamp(32px, 5vw, 64px)', alignItems: 'center' }}>
          <div>
            <div style={{ fontFamily: MONO, fontSize: 12, letterSpacing: '0.12em', textTransform: 'uppercase', color: muted, marginBottom: 18 }}>AI agents · {AGENT_PLANS_LABEL}</div>
            <h1 style={{ fontSize: 'clamp(40px, 6vw, 74px)', fontWeight: 900, letterSpacing: '-0.04em', lineHeight: 0.98, margin: '0 0 20px' }}>Your AI team.<br /><span style={{ color: CORAL }}>Your rules.</span></h1>
            <p style={{ fontSize: 'clamp(16px, 1.9vw, 20px)', lineHeight: 1.6, color: muted, margin: '0 0 30px', maxWidth: 540 }}>Five agents that answer customers, book appointments, follow up carts, chase late orders and reply to reviews. They check your real orders, stock and calendar first, and hand your team anything that needs a person.</p>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
              <InviteCta cta={{ id: 'agents_hero_start_free', location: 'ai_agents' }} href="/signup" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '15px 28px', borderRadius: 999, background: CORAL, color: '#fff', fontWeight: 800, fontSize: 16, textDecoration: 'none', boxShadow: `0 12px 32px ${CORAL}55` }}>Start free</InviteCta>
              <a href="#support" style={{ padding: '15px 24px', borderRadius: 999, border: `1.5px solid ${line}`, color: text, fontWeight: 700, fontSize: 15, textDecoration: 'none' }}>Meet the agents ↓</a>
            </div>
          </div>
          <Console dark={dark} />
        </div>
      </section>

      {/* THE AGENTS */}
      <section style={{ padding: '0 24px' }}>
        <div style={{ maxWidth: 1180, margin: '0 auto' }}>
          {AGENTS.map((a, i) => <AgentSection key={a.key} a={a} i={i} text={text} muted={muted} line={line} card={card} />)}
        </div>
      </section>

      {/* CONTROL */}
      <section id="control" style={{ background: '#0a0b10', color: '#f4f5fb', padding: 'clamp(64px, 9vw, 110px) 24px', scrollMarginTop: 80 }}>
        <div style={{ maxWidth: 1180, margin: '0 auto' }}>
          <div style={{ fontFamily: MONO, fontSize: 12, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'rgba(244,245,251,0.5)', marginBottom: 14 }}>You decide how much they do</div>
          <h2 style={{ fontSize: 'clamp(30px, 4.6vw, 54px)', fontWeight: 900, letterSpacing: '-0.035em', lineHeight: 1.02, margin: '0 0 40px', maxWidth: 760 }}>Start with drafts. Hand over more when you’re ready.</h2>
          <ol className="ag-steps" style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 0, borderTop: '1px solid rgba(255,255,255,0.12)' }}>
            {CONTROL_STEPS.map((s, i) => (
              <li key={s.title} style={{ padding: '26px 24px 6px 0', borderRight: i < 2 ? '1px solid rgba(255,255,255,0.08)' : 'none', paddingLeft: i ? 24 : 0 }}>
                <div style={{ fontFamily: MONO, fontSize: 12, color: CORAL, marginBottom: 10 }}>{String(i + 1).padStart(2, '0')} · {s.tag}</div>
                <div style={{ fontSize: 22, fontWeight: 800, marginBottom: 8 }}>{s.title}</div>
                <p style={{ fontSize: 15, lineHeight: 1.6, color: 'rgba(244,245,251,0.65)', margin: 0 }}>{s.body}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* PILLARS */}
      <section id="memory" style={{ padding: 'clamp(64px, 9vw, 110px) 24px', scrollMarginTop: 80 }}>
        <div style={{ maxWidth: 1180, margin: '0 auto' }}>
          <h2 style={{ fontSize: 'clamp(28px, 4vw, 46px)', fontWeight: 900, letterSpacing: '-0.03em', lineHeight: 1.05, margin: '0 0 12px', maxWidth: 720 }}>Built so you can leave them running</h2>
          <p style={{ fontSize: 17, lineHeight: 1.6, color: muted, margin: '0 0 36px', maxWidth: 620 }}>Your team only hears about the exceptions, and can always see what happened and why.</p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(300px, 100%), 1fr))', gap: 14 }}>
            {AGENT_PILLARS.map(p => (
              <div key={p.title} style={{ padding: 24, borderRadius: 20, border: `1px solid ${line}`, background: card }}>
                <FeatureIcon name={p.icon} color={CORAL} size={22} />
                <div style={{ fontSize: 18, fontWeight: 800, margin: '14px 0 8px' }}>{p.title}</div>
                <p style={{ fontSize: 15, lineHeight: 1.55, color: muted, margin: 0 }}>{p.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section style={{ padding: '0 24px clamp(64px, 9vw, 100px)' }}>
        <div style={{ maxWidth: 760, margin: '0 auto' }}>
          <h2 style={{ fontSize: 'clamp(26px, 3.6vw, 40px)', fontWeight: 900, letterSpacing: '-0.02em', textAlign: 'center', margin: '0 0 28px' }}>Questions, answered</h2>
          {FAQ.map((f, i) => (
            <div key={f.q} style={{ borderTop: `1px solid ${line}` }}>
              <button type="button" className="ag-faq" aria-expanded={open === i} onClick={() => setOpen(open === i ? null : i)} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16, width: '100%', padding: '18px 0', background: 'none', border: 'none', cursor: 'pointer', color: text, fontFamily: 'inherit', transition: 'color .2s', fontSize: 16.5, fontWeight: 700, textAlign: 'left' }}>
                {f.q}<span aria-hidden style={{ color: CORAL, fontSize: 20, flexShrink: 0, transform: open === i ? 'rotate(45deg)' : 'none', transition: 'transform 0.55s cubic-bezier(0.32,0.72,0,1)' }}>+</span>
              </button>
              <Collapse open={open === i}>
                <p style={{ margin: '0 0 18px', fontSize: 15.5, lineHeight: 1.65, color: muted }}>{f.a}</p>
              </Collapse>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section style={{ padding: 'clamp(60px, 8vw, 100px) 24px', textAlign: 'center', background: `linear-gradient(135deg, ${CORAL}, #ff4d8d 55%, #7c5cff)` }}>
        <h2 style={{ fontSize: 'clamp(30px, 5vw, 56px)', fontWeight: 900, letterSpacing: '-0.03em', color: '#fff', lineHeight: 1.04, margin: '0 0 14px' }}>Put your AI team to work</h2>
        <p style={{ fontSize: 17, color: 'rgba(255,255,255,0.9)', margin: '0 0 28px' }}>Included on the Inbox and Everything plans · 14-day free trial, no card</p>
        <InviteCta cta={{ id: 'agents_band_start_trial', location: 'ai_agents' }} href="/signup" ring={CORAL} style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '16px 36px', borderRadius: 999, background: '#fff', color: INK, fontWeight: 900, fontSize: 17, textDecoration: 'none', boxShadow: '0 14px 40px rgba(0,0,0,0.2)' }}>Start free trial</InviteCta>
        <div style={{ marginTop: 16 }}><a href="/pricing" style={{ color: '#fff', fontWeight: 700, fontSize: 14.5 }}>See plans and pricing</a></div>
      </section>

      <MarketingFooter dark={dark} />
    </div>
  )
}
