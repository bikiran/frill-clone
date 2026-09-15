'use client'

import { useParams } from 'next/navigation'
import { useEffect, useRef, useState, ReactNode } from 'react'
import { supabase } from '@/lib/supabase'
import { redirectToUserAdmin, boardUrl } from '@/lib/redirect'
import MarketingNav from '@/components/MarketingNav'
import MarketingFooter from '@/components/MarketingFooter'
import FeatureIcon from '@/components/FeatureIcon'

// Individual AI Assistant capability pages. Data-driven, one per menu item.
// Copy is grounded in what the assistant actually does (see the AI hub and
// lib/ai-assistant/tools.ts): draft, look up, and take reversible, audited
// actions with a human in control. No fabricated metrics.

const CORAL = '#ff6a4d', BLUE = '#2b59ff', PURPLE = '#7c5cff', GREEN = '#00c48c', PINK = '#ff4d8d', CYAN = '#0891b2', INDIGO = '#4f46e5', INK = '#0f1119'

type Band = { tag: string; title: string; body: string; bullets: string[] }
type Feat = {
  accent: string; eyebrow: string; name: string; title: string; sub: string; heroChips: string[]
  features: { icon: string; title: string; desc: string }[]
  bands: Band[]
  stats: { big: string; label: string }[]
  ctaHead: string
}

const AI: Record<string, Feat> = {
  'ai-replies': {
    accent: PURPLE, eyebrow: 'AI replies', name: 'AI Replies', title: 'Replies drafted in a blink',
    sub: 'The assistant drafts an on-brand answer for every message — ready to send, tweak or discard. You’re never staring at a blank reply box.',
    heroChips: ['On-brand', 'One-tap send', 'You approve'],
    features: [
      { icon: 'ai', title: 'Instant drafts', desc: 'A ready reply on every conversation, in a tap.' },
      { icon: 'book', title: 'In your voice', desc: 'Written from your docs and past replies.' },
      { icon: 'pen', title: 'Edit or send', desc: 'Tweak a word or send as-is — your call.' },
      { icon: 'lock', title: 'You approve', desc: 'Nothing sends without a human saying yes.' },
    ],
    bands: [
      { tag: 'No blank box', title: 'From blank box to ready reply', body: 'Every thread opens with a suggested response already drafted, grounded in the customer’s history and your knowledge — so answering is a glance and a click.', bullets: ['Draft on every thread', 'Grounded in history', 'Send, edit or discard'] },
      { tag: 'Always your words', title: 'Sounds like your team wrote it', body: 'Drafts use your tone and your facts, so customers can’t tell the difference — because, in effect, your team did write it.', bullets: ['On-brand tone', 'Your own content', 'Consistent across the team'] },
    ],
    stats: [{ big: '24/7', label: 'ready to draft' }, { big: '1-tap', label: 'to send' }, { big: 'Every', label: 'draft yours to approve' }],
    ctaHead: 'Draft every reply in a tap',
  },
  'knowledge-base': {
    accent: BLUE, eyebrow: 'Knowledge base', name: 'Knowledge Base', title: 'Answers from your own knowledge',
    sub: 'Teach the assistant your help center, docs and best replies, so every answer is accurate and on-brand — and it hands off when it isn’t sure.',
    heroChips: ['Trained on you', 'Accurate', 'Hands off when unsure'],
    features: [
      { icon: 'book', title: 'Your docs', desc: 'Point it at your help center and guides.' },
      { icon: 'search', title: 'Grounded answers', desc: 'Replies cite your content, not the internet.' },
      { icon: 'pen', title: 'On-brand', desc: 'Answers in your voice, every time.' },
      { icon: 'user', title: 'Hands off when unsure', desc: 'It escalates instead of guessing.' },
    ],
    bands: [
      { tag: 'Trained on you', title: 'Your knowledge, working the front desk', body: 'Connect your help center and docs and the assistant answers from them — so customers get your facts, not a generic guess.', bullets: ['Learns from your content', 'Stays up to date', 'Answers in your voice'] },
      { tag: 'No confident nonsense', title: 'It knows what it doesn’t know', body: 'When the answer isn’t in your knowledge, the assistant hands the conversation to a human rather than inventing one.', bullets: ['No hallucinated answers', 'Clean handoff to a person', 'Every reply traceable'] },
    ],
    stats: [{ big: 'Your', label: 'content, your answers' }, { big: 'Always', label: 'up to date' }, { big: 'Handoff', label: 'when unsure' }],
    ctaHead: 'Ground your AI in your knowledge',
  },
  'auto-summaries': {
    accent: INDIGO, eyebrow: 'Auto-summaries', name: 'Auto-Summaries', title: 'Every thread, summed up',
    sub: 'Long conversations and calls condensed to a line at the top, so anyone can pick up where things left off in seconds.',
    heroChips: ['One-line TL;DR', 'Threads & calls', 'Instant catch-up'],
    features: [
      { icon: 'pen', title: 'Thread summaries', desc: 'The gist of a long chat, up top.' },
      { icon: 'phone', title: 'Call summaries', desc: 'Every call written up automatically.' },
      { icon: 'inbox', title: 'Right in the thread', desc: 'No separate notes to chase.' },
      { icon: 'search', title: 'Searchable', desc: 'Find a conversation by what happened.' },
    ],
    bands: [
      { tag: 'Catch up fast', title: 'Read the story in one line', body: 'Instead of scrolling a hundred messages, read the summary at the top and you’re instantly up to speed.', bullets: ['Long threads condensed', 'Calls summarised too', 'Anyone can jump in'] },
      { tag: 'Nothing lost', title: 'Smooth handovers, every time', body: 'When a conversation moves between teammates, the summary travels with it — so nobody has to re-read the whole thing.', bullets: ['Context on handover', 'No re-reading', 'Details preserved'] },
    ],
    stats: [{ big: '1-line', label: 'summaries' }, { big: 'Threads', label: '& calls' }, { big: 'Seconds', label: 'to catch up' }],
    ctaHead: 'Summarise every thread',
  },
  'ai-actions': {
    accent: CORAL, eyebrow: 'AI actions', name: 'AI Actions', title: 'AI that takes real action',
    sub: 'Beyond chat: the assistant looks up orders, checks stock, creates tasks and records sales — with a human approving anything that matters.',
    heroChips: ['Looks things up', 'Gets things done', 'You approve'],
    features: [
      { icon: 'bolt', title: 'Real actions', desc: 'Not just talk — it does the thing.' },
      { icon: 'search', title: 'Look up orders & stock', desc: 'Pull live data into the reply.' },
      { icon: 'calendar', title: 'Create tasks & events', desc: 'Turn outcomes into to-dos.' },
      { icon: 'lock', title: 'You approve', desc: 'Anything that matters needs your OK.' },
    ],
    bands: [
      { tag: 'Not just chat', title: 'It reaches into your data', body: 'The assistant checks orders, tracking and stock, creates tasks and reminders, and can record a sale — right inside the conversation.', bullets: ['Live order & stock lookups', 'Tasks, reminders, events', 'Records sales in the thread'] },
      { tag: 'On a leash', title: 'Only what you allow', body: 'You choose which actions it can take, and every action it performs is logged — so power never means loss of control.', bullets: ['Opt-in per action', 'Human-in-the-loop', 'Full audit trail'] },
    ],
    stats: [{ big: 'Real', label: 'actions, not just chat' }, { big: 'You', label: 'enable each one' }, { big: 'Every', label: 'action audited' }],
    ctaHead: 'Let AI do the work',
  },
  'auto-routing': {
    accent: CYAN, eyebrow: 'Auto-routing', name: 'Auto-Routing', title: 'Every conversation, to the right person',
    sub: 'The assistant reads each incoming message and sends it to the right teammate or team — automatically, the moment it lands.',
    heroChips: ['Reads intent', 'Right team', 'Instant'],
    features: [
      { icon: 'target', title: 'Reads intent', desc: 'Understands what each message needs.' },
      { icon: 'user', title: 'To the right teammate', desc: 'Assigned to whoever can help.' },
      { icon: 'bolt', title: 'Instant', desc: 'Routed the moment it arrives.' },
      { icon: 'chart', title: 'Balanced load', desc: 'Spread fairly across the team.' },
    ],
    bands: [
      { tag: 'Right hands, faster', title: 'No more triage bottleneck', body: 'Instead of one person sorting the queue, the assistant reads each message and routes it straight to the person or team who should own it.', bullets: ['Intent-based routing', 'Assign by skill or team', 'Faster first response'] },
      { tag: 'Rules + intelligence', title: 'Your rules, smarter', body: 'Combine simple rules with AI understanding, so routing fits how your team actually works.', bullets: ['Rules you define', 'AI fills the gaps', 'Adjustable anytime'] },
    ],
    stats: [{ big: 'Right', label: 'team, every time' }, { big: 'Instant', label: 'routing' }, { big: 'Balanced', label: 'workload' }],
    ctaHead: 'Route conversations automatically',
  },
  'follow-ups': {
    accent: GREEN, eyebrow: 'Follow-ups', name: 'Follow-ups', title: 'Nothing slips through',
    sub: 'The assistant turns conversations into reminders and tasks, and nudges at the right moment — so the things you promised actually happen.',
    heroChips: ['Auto-reminders', 'Timely nudges', 'Nothing forgotten'],
    features: [
      { icon: 'bell', title: 'Auto-reminders', desc: 'Spotted from what you agreed to.' },
      { icon: 'calendar', title: 'Scheduled nudges', desc: 'Reminders at the right time.' },
      { icon: 'inbox', title: 'From the thread', desc: 'Created without leaving the chat.' },
      { icon: 'target', title: 'The right moment', desc: 'Not too soon, not too late.' },
    ],
    bands: [
      { tag: 'Kept promises', title: 'Turn talk into to-dos', body: 'When a conversation implies a next step — send a quote, check back next week — the assistant captures it as a task so it doesn’t evaporate.', bullets: ['Detects next steps', 'Creates tasks for you', 'Attached to the customer'] },
      { tag: 'Right on time', title: 'A nudge when it counts', body: 'Follow-ups fire at the moment they matter, recovering quotes and check-ins that would otherwise go cold.', bullets: ['Timely reminders', 'Recover cold threads', 'Never forget a customer'] },
    ],
    stats: [{ big: 'Auto', label: 'follow-ups' }, { big: 'Right', label: 'moment' }, { big: '0', label: 'dropped promises' }],
    ctaHead: 'Never drop a follow-up',
  },
  'tasks-reminders': {
    accent: PINK, eyebrow: 'Tasks & reminders', name: 'Tasks & Reminders', title: 'Turn chats into to-dos',
    sub: 'Spin a task out of any conversation, assign it and set a reminder — so what you agreed to actually gets done.',
    heroChips: ['From any chat', 'Assign & remind', 'Stay on top'],
    features: [
      { icon: 'kanban', title: 'Tasks from chats', desc: 'One click from message to to-do.' },
      { icon: 'user', title: 'Assign', desc: 'Give it an owner on your team.' },
      { icon: 'bell', title: 'Reminders', desc: 'Nudges so nothing is forgotten.' },
      { icon: 'calendar', title: 'Due dates', desc: 'Keep work on schedule.' },
    ],
    bands: [
      { tag: 'One click', title: 'From message to task instantly', body: 'See something that needs doing in a conversation? Turn it into a task with an owner and a due date without leaving the thread.', bullets: ['Create from any message', 'Owner & due date', 'Linked to the customer'] },
      { tag: 'In sync', title: 'The whole team, on the same page', body: 'Tasks live beside your conversations, so everyone can see what’s outstanding and who’s on it.', bullets: ['Shared task view', 'Reminders that nudge', 'Nothing falls through'] },
    ],
    stats: [{ big: '1-click', label: 'to a task' }, { big: 'Assign', label: '& remind' }, { big: '1', label: 'place for work' }],
    ctaHead: 'Turn conversations into action',
  },
  workflows: {
    accent: BLUE, eyebrow: 'Workflows', name: 'Workflows', title: 'Trigger actions on any event',
    sub: 'Build simple automations — when this happens, do that — so the routine runs itself while you focus on customers.',
    heroChips: ['If-this-then-that', 'No code', 'Runs itself'],
    features: [
      { icon: 'link', title: 'Event triggers', desc: 'Start a flow on any event.' },
      { icon: 'bolt', title: 'Automatic actions', desc: 'Tag, assign, notify, reply, more.' },
      { icon: 'target', title: 'Conditions', desc: 'Only run when the rules match.' },
      { icon: 'lock', title: 'You stay in control', desc: 'Test, pause or tweak anytime.' },
    ],
    bands: [
      { tag: 'Automate routine', title: 'Let the repetitive stuff run itself', body: 'Welcome new contacts, tag by keyword, notify a channel, create a task — set the rule once and it happens every time.', bullets: ['Trigger on any event', 'Chain multiple actions', 'No code required'] },
      { tag: 'Simple to build', title: 'Powerful, not complicated', body: 'Build flows in plain steps, test them safely, and adjust as your process changes.', bullets: ['Plain-language steps', 'Test before you ship', 'Edit anytime'] },
    ],
    stats: [{ big: 'No-code', label: 'automations' }, { big: 'Any', label: 'event' }, { big: 'Runs', label: 'itself' }],
    ctaHead: 'Automate the busywork',
  },
  'human-in-control': {
    accent: PURPLE, eyebrow: 'You stay in control', name: 'Human in Control', title: 'AI proposes, you decide',
    sub: 'Every reply is a suggestion and every action is opt-in, with a full audit log. The assistant helps — it never goes rogue.',
    heroChips: ['Human-in-the-loop', 'Opt-in actions', 'Full audit'],
    features: [
      { icon: 'lock', title: 'You approve', desc: 'Drafts and actions wait for your OK.' },
      { icon: 'target', title: 'Only enabled actions', desc: 'It can only do what you switch on.' },
      { icon: 'pen', title: 'Audit log', desc: 'Every action recorded and reviewable.' },
      { icon: 'user', title: 'Handoff to humans', desc: 'Escalates whenever it should.' },
    ],
    bands: [
      { tag: 'Nothing without you', title: 'Suggestions, not surprises', body: 'The assistant drafts and proposes; a person decides. Nothing is sent or changed behind your back.', bullets: ['Human-in-the-loop by default', 'Approve or discard', 'No silent actions'] },
      { tag: 'Transparent', title: 'See exactly what it did', body: 'Every action the assistant takes is logged with who, what and when — so trust is built on a record, not a promise.', bullets: ['Full audit trail', 'Per-action permissions', 'Reviewable anytime'] },
    ],
    stats: [{ big: 'Human', label: 'in the loop' }, { big: 'Opt-in', label: 'actions' }, { big: 'Every', label: 'action logged' }],
    ctaHead: 'AI on your terms',
  },
}

const ALL = Object.entries(AI).map(([slug, f]) => ({ slug, name: f.name }))

function useReveal(threshold = 0.14) {
  const ref = useRef<HTMLDivElement>(null)
  const [v, setV] = useState(false)
  useEffect(() => { const o = new IntersectionObserver(([e]) => { if (e.isIntersecting) setV(true) }, { threshold }); if (ref.current) o.observe(ref.current); return () => o.disconnect() }, [threshold])
  return { ref, v }
}
function Reveal({ children, delay = 0, y = 28 }: { children: ReactNode; delay?: number; y?: number }) {
  const { ref, v } = useReveal()
  return <div ref={ref} style={{ opacity: v ? 1 : 0, transform: v ? 'none' : `translateY(${y}px)`, transition: `opacity 0.7s cubic-bezier(0.16,1,0.3,1) ${delay}s, transform 0.7s cubic-bezier(0.16,1,0.3,1) ${delay}s` }}>{children}</div>
}

export default function AiFeaturePage() {
  const params = useParams()
  const slug = (params?.slug as string) || 'ai-replies'
  const f = AI[slug] || AI['ai-replies']
  const accent = f.accent
  const [dark, setDark] = useState(false)
  const [user, setUser] = useState<any>(null)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }: any) => setUser(data?.session?.user))
    const { data: l } = supabase.auth.onAuthStateChange((_: any, s: any) => setUser(s?.user ?? null))
    return () => { l?.subscription?.unsubscribe() }
  }, [])

  const go = async () => {
    if (!user) { window.location.href = '/signup'; return }
    try {
      const hostname = window.location.hostname
      if (hostname.includes('localhost') || hostname.includes('vercel.app')) { window.location.href = '/admin'; return }
      const { data: co } = await (supabase as any).from('companies').select('slug').eq('owner_id', user.id).order('created_at', { ascending: true }).limit(1).maybeSingle()
      if (co?.slug) { window.location.href = boardUrl(co.slug, '/admin'); return }
      await redirectToUserAdmin(user.id)
    } catch { await redirectToUserAdmin(user.id) }
  }

  const bg = dark ? '#0a0b12' : '#ffffff'
  const text = dark ? '#f4f5fb' : INK
  const muted = dark ? 'rgba(244,245,251,0.62)' : 'rgba(15,17,25,0.6)'
  const cardBg = dark ? 'rgba(255,255,255,0.045)' : '#ffffff'
  const cardBorder = dark ? 'rgba(255,255,255,0.09)' : 'rgba(15,17,25,0.09)'
  const font = '-apple-system,BlinkMacSystemFont,"SF Pro Display","Segoe UI",Inter,sans-serif'
  const gridImg = `linear-gradient(${dark ? 'rgba(255,255,255,0.04)' : 'rgba(15,17,25,0.045)'} 1px,transparent 1px),linear-gradient(90deg,${dark ? 'rgba(255,255,255,0.04)' : 'rgba(15,17,25,0.045)'} 1px,transparent 1px)`
  const btnPrimary: React.CSSProperties = { padding: '15px 30px', borderRadius: 999, background: accent, color: '#fff', fontWeight: 800, fontSize: 16, cursor: 'pointer', border: 'none', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 8, boxShadow: `0 10px 30px ${accent}55` }
  const btnGhost: React.CSSProperties = { padding: '15px 26px', borderRadius: 999, border: `2px solid ${dark ? 'rgba(255,255,255,0.16)' : 'rgba(15,17,25,0.12)'}`, background: 'transparent', color: text, fontWeight: 700, fontSize: 15, textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 8, cursor: 'pointer' }

  return (
    <div style={{ background: bg, color: text, fontFamily: font, minHeight: '100vh', overflowX: 'hidden', transition: 'background 0.3s, color 0.3s' }}>
      <style>{`
        @keyframes afFloat { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-12px)} }
        .af-card,.af-btn{ transition:all 0.22s cubic-bezier(0.16,1,0.3,1); }
        .af-card:hover{ transform:translateY(-6px); }
        .af-btn:hover{ transform:translateY(-2px); }
        @media (max-width:900px){ .af-hero{ grid-template-columns:1fr !important; } .af-band{ grid-template-columns:1fr !important; } .af-hero-cta{ flex-wrap:nowrap !important; } .af-hero-cta > *{ flex:1 1 0 !important; justify-content:center !important; white-space:nowrap !important; padding-left:14px !important; padding-right:14px !important; } }
        @media (prefers-reduced-motion:reduce){ [style*="afFloat"]{ animation:none !important } }
      `}</style>

      <MarketingNav dark={dark} onToggleDark={() => setDark(v => !v)} />

      {/* HERO */}
      <section className="af-hero" style={{ position: 'relative', display: 'grid', gridTemplateColumns: '1.05fr 0.95fr', gap: 48, alignItems: 'center', maxWidth: 1280, margin: '0 auto', padding: '150px 24px 60px' }}>
        <div aria-hidden style={{ position: 'absolute', inset: 0, backgroundImage: gridImg, backgroundSize: '54px 54px', WebkitMaskImage: 'radial-gradient(ellipse 70% 60% at 40% 40%, #000 40%, transparent 80%)', maskImage: 'radial-gradient(ellipse 70% 60% at 40% 40%, #000 40%, transparent 80%)', pointerEvents: 'none' }} />
        <div style={{ position: 'relative' }}>
          <Reveal>
            <a href="/ai-assistant" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12.5, fontWeight: 800, color: accent, textDecoration: 'none', marginBottom: 14 }}>← AI Assistant</a>
            <div style={{ marginBottom: 8 }}><span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '6px 14px', borderRadius: 999, background: accent + '18', color: accent, fontSize: 12.5, fontWeight: 800, letterSpacing: '0.04em', textTransform: 'uppercase' }}><FeatureIcon name={f.features[0].icon} color={accent} size={15} />{f.eyebrow}</span></div>
            <h1 style={{ fontSize: 'clamp(36px, 5.2vw, 60px)', fontWeight: 900, letterSpacing: '-0.035em', lineHeight: 1.04, margin: '0 0 18px' }}>{f.title}</h1>
            <p style={{ fontSize: 'clamp(16px, 1.9vw, 20px)', color: muted, maxWidth: 520, lineHeight: 1.6, margin: '0 0 30px' }}>{f.sub}</p>
            <div className="af-hero-cta" style={{ display: 'flex', gap: 12 }}>
              <button onClick={go} className="af-btn" style={btnPrimary}>Start free — no card →</button>
              <a href="/pricing" className="af-btn" style={btnGhost}>See pricing</a>
            </div>
          </Reveal>
        </div>
        <Reveal delay={0.1}>
          <div style={{ position: 'relative', borderRadius: 28, minHeight: 340, overflow: 'hidden', background: `linear-gradient(150deg, ${accent} 0%, ${accent}cc 45%, ${dark ? '#0b0c14' : '#171a2b'} 120%)`, boxShadow: `0 30px 70px ${accent}44` }}>
            <div aria-hidden style={{ position: 'absolute', top: -50, right: -40, width: 240, height: 240, borderRadius: '50%', background: 'rgba(255,255,255,0.22)', filter: 'blur(36px)' }} />
            <div aria-hidden style={{ position: 'absolute', bottom: -60, left: -40, width: 200, height: 200, borderRadius: '50%', background: 'rgba(0,0,0,0.2)', filter: 'blur(40px)' }} />
            <div style={{ position: 'absolute', top: 22, right: 22, color: 'rgba(255,255,255,0.92)', animation: 'afFloat 6s ease-in-out infinite' }}><FeatureIcon name={f.features[0].icon} color="rgba(255,255,255,0.92)" size={54} /></div>
            <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 12, padding: 32 }}>
              {f.heroChips.map((c, i) => (
                <span key={c} style={{ alignSelf: i % 2 ? 'flex-end' : 'flex-start', fontSize: 14, fontWeight: 800, color: '#fff', background: 'rgba(255,255,255,0.16)', backdropFilter: 'blur(8px)', border: '1px solid rgba(255,255,255,0.3)', borderRadius: 999, padding: '9px 16px', animation: `afFloat ${5 + i * 0.6}s ease-in-out ${i * 0.3}s infinite` }}>{c}</span>
              ))}
            </div>
          </div>
        </Reveal>
      </section>

      {/* FEATURE GRID */}
      <section style={{ maxWidth: 1280, margin: '0 auto', padding: '10px 24px 40px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 18 }}>
          {f.features.map((ft, i) => (
            <Reveal key={ft.title} delay={(i % 4) * 0.05}>
              <div className="af-card" style={{ height: '100%', borderRadius: 20, padding: 26, background: cardBg, border: `1px solid ${cardBorder}` }}>
                <span style={{ width: 46, height: 46, borderRadius: 13, background: accent + '16', color: accent, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginBottom: 14 }}><FeatureIcon name={ft.icon} color={accent} size={23} /></span>
                <h3 style={{ fontSize: 17.5, fontWeight: 800, margin: '0 0 6px', color: text }}>{ft.title}</h3>
                <p style={{ fontSize: 14.5, lineHeight: 1.6, color: muted, margin: 0 }}>{ft.desc}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* BANDS */}
      {f.bands.map((b, i) => (
        <section key={b.title} style={{ background: i % 2 ? (dark ? 'rgba(255,255,255,0.02)' : accent + '08') : 'transparent', padding: 'clamp(40px, 6vw, 80px) 24px' }}>
          <div className="af-band" style={{ maxWidth: 1160, margin: '0 auto', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 48, alignItems: 'center', direction: i % 2 ? 'rtl' : 'ltr' }}>
            <div style={{ direction: 'ltr' }}>
              <Reveal>
                <span style={{ fontSize: 12.5, fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase', color: accent }}>{b.tag}</span>
                <h2 style={{ fontSize: 'clamp(26px, 3.4vw, 40px)', fontWeight: 900, letterSpacing: '-0.02em', lineHeight: 1.08, margin: '10px 0 14px', color: text }}>{b.title}</h2>
                <p style={{ fontSize: 16.5, lineHeight: 1.65, color: muted, margin: '0 0 20px' }}>{b.body}</p>
                <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 11 }}>
                  {b.bullets.map(bl => (
                    <li key={bl} style={{ display: 'flex', alignItems: 'flex-start', gap: 11, fontSize: 15, fontWeight: 600, color: text }}>
                      <span style={{ width: 22, height: 22, borderRadius: '50%', background: accent + '1a', color: accent, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 1 }}><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg></span>{bl}
                    </li>
                  ))}
                </ul>
              </Reveal>
            </div>
            <div style={{ direction: 'ltr' }}>
              <Reveal delay={0.1}>
                <div style={{ position: 'relative', borderRadius: 24, minHeight: 280, overflow: 'hidden', background: `linear-gradient(140deg, ${accent}22, ${accent}05)`, border: `1px solid ${cardBorder}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <div aria-hidden style={{ position: 'absolute', inset: 0, backgroundImage: gridImg, backgroundSize: '32px 32px', opacity: 0.5 }} />
                  <div style={{ position: 'relative', width: 96, height: 96, borderRadius: 26, background: accent, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: `0 20px 50px ${accent}55`, animation: 'afFloat 6s ease-in-out infinite' }}>
                    <FeatureIcon name={f.features[Math.min(i + 1, f.features.length - 1)].icon} color="#fff" size={44} />
                  </div>
                </div>
              </Reveal>
            </div>
          </div>
        </section>
      ))}

      {/* MORE AI CAPABILITIES */}
      <section style={{ maxWidth: 1000, margin: '0 auto', padding: '30px 24px 20px', textAlign: 'center' }}>
        <Reveal>
          <h2 style={{ fontSize: 'clamp(24px, 3.4vw, 38px)', fontWeight: 900, letterSpacing: '-0.02em', margin: '0 0 8px' }}>More of the <span style={{ color: accent }}>AI assistant</span></h2>
          <p style={{ fontSize: 16, color: muted, maxWidth: 560, margin: '0 auto 22px', lineHeight: 1.55 }}>One assistant, many jobs — explore the rest.</p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, justifyContent: 'center' }}>
            {ALL.filter(a => a.slug !== slug).map(a => (
              <a key={a.slug} href={`/ai-assistant/${a.slug}`} style={{ fontSize: 13.5, fontWeight: 700, color: text, background: cardBg, border: `1px solid ${cardBorder}`, borderRadius: 999, padding: '8px 16px', textDecoration: 'none' }}>{a.name}</a>
            ))}
          </div>
        </Reveal>
      </section>

      {/* STATS */}
      <section style={{ maxWidth: 1000, margin: '0 auto', padding: '30px 24px 60px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 18 }}>
          {f.stats.map((s, i) => (
            <Reveal key={s.label} delay={i * 0.06}>
              <div style={{ textAlign: 'center', borderRadius: 20, padding: '28px 14px', background: cardBg, border: `1px solid ${cardBorder}` }}>
                <div style={{ fontSize: 'clamp(22px, 3.4vw, 34px)', fontWeight: 900, letterSpacing: '-0.03em', color: accent }}>{s.big}</div>
                <div style={{ fontSize: 13, fontWeight: 600, color: muted, marginTop: 4 }}>{s.label}</div>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section style={{ padding: 'clamp(48px, 8vw, 96px) 24px', textAlign: 'center', background: `linear-gradient(135deg, ${accent}, ${PINK} 60%, ${BLUE})` }}>
        <Reveal>
          <div style={{ maxWidth: 720, margin: '0 auto' }}>
            <h2 style={{ fontSize: 'clamp(28px, 5vw, 52px)', fontWeight: 900, letterSpacing: '-0.03em', lineHeight: 1.05, color: '#fff', margin: '0 0 12px' }}>{f.ctaHead}</h2>
            <p style={{ fontSize: 17, color: 'rgba(255,255,255,0.9)', margin: '0 0 30px' }}>Start free, set up in about 45 minutes — no credit card, cancel anytime.</p>
            <button onClick={go} className="af-btn" style={{ padding: '16px 38px', borderRadius: 999, background: '#fff', color: INK, fontWeight: 900, fontSize: 17, border: 'none', cursor: 'pointer', boxShadow: '0 14px 40px rgba(0,0,0,0.2)' }}>Get started — it’s free</button>
          </div>
        </Reveal>
      </section>

      <MarketingFooter dark={dark} />
    </div>
  )
}
