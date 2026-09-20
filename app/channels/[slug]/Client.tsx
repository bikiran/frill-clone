'use client'

import { useParams } from 'next/navigation'
import Image from 'next/image'
import { useEffect, useRef, useState, ReactNode } from 'react'
import { supabase } from '@/lib/supabase'
import { redirectToUserAdmin, boardUrl } from '@/lib/redirect'
import MarketingNav from '@/components/MarketingNav'
import MarketingFooter from '@/components/MarketingFooter'
import FeatureIcon from '@/components/FeatureIcon'

// Landing-styled per-channel pages (Meta DMs / Email / Phones / Chat widget / …).
// Data-driven, sharing the same look as the industry and solutions pages.
// Copy is product-level and neutral — no fabricated customer stories.

const CORAL = '#ff6a4d', BLUE = '#2b59ff', PURPLE = '#7c5cff', GREEN = '#00c48c', PINK = '#ff4d8d', CYAN = '#0891b2', AMBER = '#f59e0b', WA = '#25d366', INK = '#0f1119'

// Shared "every channel" list — the same across pages.
const CHANNELS = ['Phone calls', 'SMS / MMS', 'WhatsApp', 'Instagram & Facebook', 'Email', 'Google Reviews', 'Live chat', 'Contact forms']

type Band = { tag: string; title: string; body: string; bullets: string[] }
type Ch = {
  accent: string; eyebrow: string; name: string; title: string; sub: string; heroChips: string[]
  features: { icon: string; title: string; desc: string }[]
  bands: Band[]
  stats: { big: string; label: string }[]
  ctaHead: string
}

const CH: Record<string, Ch> = {
  meta: {
    accent: PURPLE, eyebrow: 'Instagram & Messenger', name: 'Meta DMs',
    title: 'Instagram & Facebook DMs, in one inbox',
    sub: 'Answer every Instagram and Messenger DM, story reply and comment from the same shared inbox as your other channels — with full customer context beside each thread.',
    heroChips: ['Instagram DMs', 'Messenger', 'Story replies'],
    features: [
      { icon: 'reaction', title: 'Instagram & Messenger', desc: 'Both Meta inboxes in one place — no app-switching.' },
      { icon: 'inbox', title: 'One shared thread', desc: 'DMs sit beside SMS, email and chat, per customer.' },
      { icon: 'ai', title: 'AI replies', desc: 'Draft on-brand answers from your docs in a click.' },
      { icon: 'bell', title: 'Story & comment replies', desc: 'Handle story mentions and comments without leaving.' },
      { icon: 'user', title: 'Full context', desc: 'Order history and past chats beside every DM.' },
      { icon: 'target', title: 'Auto-routing', desc: 'Send each DM to the right person automatically.' },
    ],
    bands: [
      { tag: 'Never miss a DM', title: 'Every Meta message, one place', body: 'Instagram and Messenger DMs land in the same inbox as the rest of your channels, so nothing gets lost between apps and everyone can see the full history.', bullets: ['Instagram + Messenger unified', 'Story replies & mentions', 'Comment-to-DM'] },
      { tag: 'Answer in seconds', title: 'AI drafts, your team sends', body: 'Your assistant suggests replies trained on your own docs, so even a small team keeps up with a busy DM inbox.', bullets: ['AI-drafted replies', 'Saved replies & snippets', 'Assign & @mention teammates'] },
    ],
    stats: [{ big: '2', label: 'Meta inboxes, one thread' }, { big: '24/7', label: 'AI coverage' }, { big: '0', label: 'apps to switch' }],
    ctaHead: 'Bring Meta DMs into one inbox',
  },
  email: {
    accent: CORAL, eyebrow: 'Gmail & Outlook', name: 'Email',
    title: 'Email that lives in the same thread',
    sub: 'Connect Gmail or Outlook and handle customer email right beside chat, SMS and social — shared, assignable, and never buried in a personal inbox.',
    heroChips: ['Gmail', 'Outlook', 'Shared inbox'],
    features: [
      { icon: 'mail', title: 'Gmail & Outlook', desc: 'Connect in a click and send from your own domain.' },
      { icon: 'inbox', title: 'Shared, not personal', desc: 'Team email out of one box — nothing siloed.' },
      { icon: 'user', title: 'Assign & collaborate', desc: 'Owners, @mentions and internal notes per email.' },
      { icon: 'ai', title: 'AI drafts', desc: 'Reply suggestions from your knowledge base.' },
      { icon: 'pen', title: 'Templates & snippets', desc: 'Send consistent answers in seconds.' },
      { icon: 'chart', title: 'One history', desc: 'Email sits with every other channel, per contact.' },
    ],
    bands: [
      { tag: 'Out of the silo', title: 'Team email, finally shared', body: 'Route sales@ and support@ into a shared inbox where anyone can pick up, hand off and see who’s replied — no more forwarding chains.', bullets: ['Send from your domain', 'Assign & internal notes', 'No duplicate replies'] },
      { tag: 'One customer view', title: 'Email beside every channel', body: 'An email thread sits next to that customer’s texts, DMs and calls, so context never depends on which inbox you opened.', bullets: ['Unified customer timeline', 'AI-drafted replies', 'Search across every channel'] },
    ],
    stats: [{ big: '2-way', label: 'Gmail & Outlook sync' }, { big: '1', label: 'thread per customer' }, { big: '45 min', label: 'to set up' }],
    ctaHead: 'Put email in the shared inbox',
  },
  phones: {
    accent: GREEN, eyebrow: 'Built-in calling', name: 'Phones',
    title: 'A phone system inside your inbox',
    sub: 'Make and take business calls right where your messages live — every call logged, recorded and summarised beside the customer’s full history.',
    heroChips: ['Click-to-dial', 'Call recording', 'Missed-call text-back'],
    features: [
      { icon: 'phone', title: 'Voice calls', desc: 'Call and receive from a browser dialer — no hardware.' },
      { icon: 'camera', title: 'Record & transcribe', desc: 'Every call recorded, transcribed and summarised.' },
      { icon: 'target', title: 'IVR & routing', desc: 'Send callers to the right team automatically.' },
      { icon: 'chat', title: 'Missed-call text-back', desc: 'Auto-text callers you missed so no lead drops.' },
      { icon: 'pin', title: 'Numbers & porting', desc: 'Buy a new number or bring your own.' },
      { icon: 'user', title: 'Context on the call', desc: 'See who’s calling and their history instantly.' },
    ],
    bands: [
      { tag: 'Calls with context', title: 'Know the caller before you answer', body: 'The moment the phone rings, their past messages, orders and notes are on screen — so every call starts informed.', bullets: ['Screen pop with history', 'Click-to-dial anywhere', 'HD audio in the browser'] },
      { tag: 'Nothing slips', title: 'Every call logged and summarised', body: 'Recordings, transcripts and AI summaries attach to the thread automatically, and missed calls trigger an instant text back.', bullets: ['Recording & transcription', 'AI call summaries', 'Missed-call auto-SMS'] },
    ],
    stats: [{ big: '0', label: 'hardware needed' }, { big: 'Every', label: 'call logged' }, { big: 'Instant', label: 'missed-call text-back' }],
    ctaHead: 'Add calling to your inbox',
  },
  'chat-widget': {
    accent: BLUE, eyebrow: 'Live chat widget', name: 'Chat Widget',
    title: 'Turn website visitors into conversations',
    sub: 'Drop a lightweight chat widget on your site and capture leads around the clock — AI answers instantly, and your team takes over whenever they like.',
    heroChips: ['One-line install', 'AI 24/7', 'Lead capture'],
    features: [
      { icon: 'chat', title: 'Live chat', desc: 'Talk to visitors in real time from the inbox.' },
      { icon: 'ai', title: 'AI concierge', desc: 'Answers FAQs instantly from your docs, 24/7.' },
      { icon: 'target', title: 'Lead capture', desc: 'Collect name and email before you reply.' },
      { icon: 'bolt', title: 'One-line install', desc: 'Paste a snippet — live in minutes.' },
      { icon: 'pen', title: 'Your branding', desc: 'Match colours, avatar and greeting.' },
      { icon: 'inbox', title: 'Same inbox', desc: 'Chats land beside email, SMS and social.' },
    ],
    bands: [
      { tag: 'Always answered', title: 'Never leave a visitor waiting', body: 'AI greets and answers instantly, day or night, and hands off to a human the moment the question needs one — no visitor sits on hold.', bullets: ['Instant AI first reply', 'Seamless human handoff', 'Works out of hours'] },
      { tag: 'More leads', title: 'Capture the lead, keep the thread', body: 'Collect contact details in the widget and the whole conversation continues in your shared inbox, following the customer across channels.', bullets: ['Pre-chat lead capture', 'Continues by email / SMS', 'Full history retained'] },
    ],
    stats: [{ big: '1-line', label: 'to install' }, { big: '24/7', label: 'AI answers' }, { big: '1', label: 'inbox for every chat' }],
    ctaHead: 'Add live chat to your site',
  },
  'google-reviews': {
    accent: AMBER, eyebrow: 'Google Reviews', name: 'Google Reviews',
    title: 'Grow your Google rating on autopilot',
    sub: 'Ask happy customers for a review at the perfect moment, then read and reply to every Google review from the same inbox as your chats.',
    heroChips: ['Auto review requests', 'Reply in the inbox', 'Multi-location'],
    features: [
      { icon: 'star', title: 'Auto review requests', desc: 'Send the ask at the right moment, by text or email.' },
      { icon: 'chat', title: 'Reply in one place', desc: 'Respond to reviews without leaving Colvy.' },
      { icon: 'bell', title: 'Instant alerts', desc: 'Know the moment a new review lands.' },
      { icon: 'ai', title: 'AI-drafted replies', desc: 'On-brand responses to every rating in a click.' },
      { icon: 'pin', title: 'Multi-location', desc: 'Manage each location’s profile from one place.' },
      { icon: 'chart', title: 'Rating trends', desc: 'Track your score and volume over time.' },
    ],
    bands: [
      { tag: 'More reviews', title: 'Ask at exactly the right moment', body: 'Automated requests go out after a purchase, visit or resolved chat — the moment goodwill is highest — so your rating climbs without anyone chasing.', bullets: ['Timed, automated asks', 'By SMS or email', 'Per-location targeting'] },
      { tag: 'Every review answered', title: 'Reply from the same inbox', body: 'New reviews arrive as threads you can answer like any message, with AI drafting on-brand replies to good and bad ratings alike.', bullets: ['Reply without app-switching', 'AI-drafted responses', 'Alerts on every new review'] },
    ],
    stats: [{ big: 'Auto', label: 'review requests' }, { big: '1', label: 'inbox for reviews & chats' }, { big: 'Multi', label: 'location ready' }],
    ctaHead: 'Grow your reviews with Colvy',
  },
  whatsapp: {
    accent: WA, eyebrow: 'WhatsApp Business', name: 'WhatsApp',
    title: 'WhatsApp for your whole team',
    sub: 'Bring WhatsApp into a shared inbox anyone can answer — with templates, broadcasts and full customer context, on a business number or your own.',
    heroChips: ['Shared WhatsApp', 'Templates', 'Broadcasts'],
    features: [
      { icon: 'chat', title: 'Shared WhatsApp', desc: 'One number your whole team can answer.' },
      { icon: 'inbox', title: 'One thread', desc: 'WhatsApp beside SMS, email and social.' },
      { icon: 'pen', title: 'Message templates', desc: 'Approved templates for fast, compliant replies.' },
      { icon: 'megaphone', title: 'Broadcasts', desc: 'Send updates and offers to opted-in contacts.' },
      { icon: 'ai', title: 'AI replies', desc: 'Draft answers from your docs instantly.' },
      { icon: 'user', title: 'Full context', desc: 'Orders and history beside every chat.' },
    ],
    bands: [
      { tag: 'Team-ready', title: 'One WhatsApp, everyone answers', body: 'Move off a single phone stuck with one person. A shared WhatsApp inbox lets any teammate pick up, assign and reply — with the full history in view.', bullets: ['Business number or your own', 'Assign & @mention', 'No lost messages'] },
      { tag: 'Reach & reply', title: 'Broadcasts and quick replies', body: 'Send opted-in customers updates and offers, and answer the replies right in the same thread with templates and AI drafts.', bullets: ['Opt-in broadcasts', 'Approved templates', 'AI-drafted replies'] },
    ],
    stats: [{ big: '1', label: 'shared WhatsApp inbox' }, { big: 'Team', label: 'wide access' }, { big: 'Auto', label: 'AI drafts' }],
    ctaHead: 'Bring WhatsApp to your team',
  },
  sms: {
    accent: CYAN, eyebrow: 'Two-way SMS & MMS', name: 'SMS',
    title: 'Two-way texting people actually read',
    sub: 'Text customers back and forth from a shared number — send images and links, run campaigns, and keep every text in the same thread as your other channels.',
    heroChips: ['Two-way SMS', 'MMS', 'Campaigns'],
    features: [
      { icon: 'chat', title: 'Two-way SMS', desc: 'Real conversations, not one-way blasts.' },
      { icon: 'camera', title: 'MMS', desc: 'Send images, links and files by text.' },
      { icon: 'megaphone', title: 'Campaigns', desc: 'Broadcast offers and win-backs that convert.' },
      { icon: 'inbox', title: 'Shared number', desc: 'A team texting line, not a personal phone.' },
      { icon: 'ai', title: 'AI replies', desc: 'Draft texts from your docs in a click.' },
      { icon: 'bell', title: 'Reminders', desc: 'Automated confirmations and follow-ups.' },
    ],
    bands: [
      { tag: 'Read in minutes', title: 'The channel people answer', body: 'Texts get opened and answered fast. Colvy makes SMS a two-way conversation your whole team can run from a shared number.', bullets: ['Two-way SMS & MMS', 'Shared team number', 'Full thread history'] },
      { tag: 'At scale', title: 'Campaigns and follow-ups', body: 'Send targeted campaigns and automated reminders, then handle the replies as normal threads — with AI drafting where it helps.', bullets: ['Broadcast campaigns', 'Automated reminders', 'AI-drafted replies'] },
    ],
    stats: [{ big: 'Two-way', label: 'SMS & MMS' }, { big: '1', label: 'shared number' }, { big: 'High', label: 'open rates' }],
    ctaHead: 'Start texting from Colvy',
  },
  forms: {
    accent: PINK, eyebrow: 'Contact forms', name: 'Forms',
    title: 'Turn form submissions into conversations',
    sub: 'Build branded contact and enquiry forms, embed them anywhere, and land every submission as a thread in the same shared inbox as your other channels — with full customer context attached.',
    heroChips: ['Branded forms', 'Embed anywhere', 'Straight to the inbox'],
    features: [
      { icon: 'pen', title: 'Branded forms', desc: 'Match your colours, logo and fields in minutes.' },
      { icon: 'inbox', title: 'Straight to the inbox', desc: 'Each submission opens a thread beside chat, SMS and email.' },
      { icon: 'target', title: 'Structured fields', desc: 'Collect exactly what you need to reply fast.' },
      { icon: 'bolt', title: 'Embed anywhere', desc: 'Drop a form on your site or share a link.' },
      { icon: 'ai', title: 'AI replies', desc: 'Draft an on-brand response from your docs in a click.' },
      { icon: 'user', title: 'Full context', desc: 'Match submissions to a customer and their history.' },
    ],
    bands: [
      { tag: 'Capture cleanly', title: 'Every enquiry, one thread', body: 'Contact and enquiry forms land as threads in your shared inbox, so nothing sits in a separate tool and anyone on the team can pick it up with the full picture.', bullets: ['Branded, structured forms', 'Straight into the inbox', 'Matched to a customer'] },
      { tag: 'Reply faster', title: 'From submission to answer', body: 'The moment a form comes in, your team can reply on the channel the customer prefers — with AI drafting where it helps and context beside every field.', bullets: ['Reply on any channel', 'AI-drafted responses', 'Assign & @mention teammates'] },
    ],
    stats: [{ big: '1', label: 'inbox for every enquiry' }, { big: 'Embed', label: 'anywhere' }, { big: '0', label: 'tools to switch' }],
    ctaHead: 'Bring forms into your inbox',
  },
  broadcasts: {
    accent: '#f97316', eyebrow: 'Broadcasts', name: 'Broadcasts',
    title: 'Reach everyone at once, on their channel',
    sub: 'Send offers, announcements and win-backs to a whole segment in one go — by SMS, WhatsApp or email — then handle every reply as a normal thread in your shared inbox.',
    heroChips: ['Segment & send', 'Any channel', 'Replies in the inbox'],
    features: [
      { icon: 'megaphone', title: 'One-to-many', desc: 'Message a whole segment in a single send.' },
      { icon: 'target', title: 'Smart segments', desc: 'Target by tag, activity or custom fields.' },
      { icon: 'chat', title: 'Any channel', desc: 'Broadcast over SMS, WhatsApp or email.' },
      { icon: 'ai', title: 'AI copywriting', desc: 'Draft on-brand campaigns in a click.' },
      { icon: 'calendar', title: 'Schedule sends', desc: 'Pick the perfect time, or send now.' },
      { icon: 'inbox', title: 'Replies land home', desc: 'Every response opens a thread in your inbox.' },
    ],
    bands: [
      { tag: 'Send once', title: 'One message, your whole list', body: 'Build a segment and send a broadcast across the channels your customers actually use — no exporting lists or juggling separate blast tools.', bullets: ['Tag & field-based segments', 'SMS, WhatsApp & email', 'Schedule or send now'] },
      { tag: 'Two-way by design', title: 'Broadcasts that start conversations', body: 'Unlike a one-way blast, every reply comes back as a thread in your shared inbox, so a campaign turns into real conversations your team can pick up.', bullets: ['Replies become threads', 'Full customer context', 'AI-drafted follow-ups'] },
    ],
    stats: [{ big: '1', label: 'send, whole segment' }, { big: '3', label: 'channels to broadcast on' }, { big: '2-way', label: 'replies in the inbox' }],
    ctaHead: 'Send your first broadcast',
  },
}

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

export default function ChannelPage() {
  const params = useParams()
  const slug = (params?.slug as string) || 'meta'
  const ch = CH[slug] || CH.meta
  const accent = ch.accent
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
        @keyframes chFloat { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-12px)} }
        .ch-card,.ch-btn{ transition:all 0.22s cubic-bezier(0.16,1,0.3,1); }
        .ch-card:hover{ transform:translateY(-6px); }
        .ch-btn:hover{ transform:translateY(-2px); }
        @media (max-width:900px){ .ch-hero{ grid-template-columns:1fr !important; } .ch-band{ grid-template-columns:1fr !important; } .ch-hero-cta{ flex-wrap:nowrap !important; } .ch-hero-cta > *{ flex:1 1 0 !important; justify-content:center !important; white-space:nowrap !important; padding-left:14px !important; padding-right:14px !important; } }
        @media (prefers-reduced-motion:reduce){ [style*="chFloat"]{ animation:none !important } }
      `}</style>

      <MarketingNav dark={dark} onToggleDark={() => setDark(v => !v)} />

      {/* HERO */}
      <section className="ch-hero" style={{ position: 'relative', display: 'grid', gridTemplateColumns: '1.05fr 0.95fr', gap: 48, alignItems: 'center', maxWidth: 1280, margin: '0 auto', padding: '150px 24px 60px' }}>
        <div aria-hidden style={{ position: 'absolute', inset: 0, backgroundImage: gridImg, backgroundSize: '54px 54px', WebkitMaskImage: 'radial-gradient(ellipse 70% 60% at 40% 40%, #000 40%, transparent 80%)', maskImage: 'radial-gradient(ellipse 70% 60% at 40% 40%, #000 40%, transparent 80%)', pointerEvents: 'none' }} />
        <div style={{ position: 'relative' }}>
          <Reveal>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '6px 14px', borderRadius: 999, background: accent + '18', color: accent, fontSize: 12.5, fontWeight: 800, letterSpacing: '0.04em', textTransform: 'uppercase', marginBottom: 18 }}><FeatureIcon name={ch.features[0].icon} color={accent} size={15} />{ch.eyebrow}</span>
            <h1 style={{ fontSize: 'clamp(38px, 5.4vw, 64px)', fontWeight: 900, letterSpacing: '-0.035em', lineHeight: 1.04, margin: '0 0 18px' }}>{ch.title}</h1>
            <p style={{ fontSize: 'clamp(16px, 1.9vw, 20px)', color: muted, maxWidth: 520, lineHeight: 1.6, margin: '0 0 30px' }}>{ch.sub}</p>
            <div className="ch-hero-cta" style={{ display: 'flex', gap: 12 }}>
              <button onClick={go} className="ch-btn" style={btnPrimary}>Start free — no card →</button>
              <a href="/pricing" className="ch-btn" style={btnGhost}>See pricing</a>
            </div>
          </Reveal>
        </div>
        <Reveal delay={0.1}>
          <div style={{ position: 'relative', borderRadius: 28, minHeight: 340, overflow: 'hidden', background: `linear-gradient(150deg, ${accent} 0%, ${accent}cc 45%, ${dark ? '#0b0c14' : '#171a2b'} 120%)`, boxShadow: `0 30px 70px ${accent}44` }}>
            <Image src={`/channels/${slug}.jpg`} alt="" aria-hidden fill priority sizes="(max-width: 900px) 100vw, 50vw" style={{ objectFit: 'cover' }} />
            <div aria-hidden style={{ position: 'absolute', inset: 0, background: `linear-gradient(150deg, ${accent}e6 0%, ${accent}59 42%, rgba(10,12,20,0.5) 115%)` }} />
            <div style={{ position: 'absolute', top: 22, right: 22, color: 'rgba(255,255,255,0.95)', filter: 'drop-shadow(0 2px 8px rgba(0,0,0,0.35))', animation: 'chFloat 6s ease-in-out infinite' }}><FeatureIcon name={ch.features[0].icon} color="rgba(255,255,255,0.95)" size={54} /></div>
            <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 12, padding: 32 }}>
              {ch.heroChips.map((c, i) => (
                <span key={c} style={{ alignSelf: i % 2 ? 'flex-end' : 'flex-start', fontSize: 14, fontWeight: 800, color: '#fff', background: 'rgba(255,255,255,0.16)', backdropFilter: 'blur(8px)', border: '1px solid rgba(255,255,255,0.3)', borderRadius: 999, padding: '9px 16px', animation: `chFloat ${5 + i * 0.6}s ease-in-out ${i * 0.3}s infinite` }}>{c}</span>
              ))}
            </div>
          </div>
        </Reveal>
      </section>

      {/* FEATURE GRID */}
      <section style={{ maxWidth: 1280, margin: '0 auto', padding: '10px 24px 40px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 18 }}>
          {ch.features.map((f, i) => (
            <Reveal key={f.title} delay={(i % 3) * 0.05}>
              <div className="ch-card" style={{ height: '100%', borderRadius: 20, padding: 26, background: cardBg, border: `1px solid ${cardBorder}` }}>
                <span style={{ width: 46, height: 46, borderRadius: 13, background: accent + '16', color: accent, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginBottom: 14 }}><FeatureIcon name={f.icon} color={accent} size={23} /></span>
                <h3 style={{ fontSize: 17.5, fontWeight: 800, margin: '0 0 6px', color: text }}>{f.title}</h3>
                <p style={{ fontSize: 14.5, lineHeight: 1.6, color: muted, margin: 0 }}>{f.desc}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* BANDS */}
      {ch.bands.map((b, i) => (
        <section key={b.title} style={{ background: i % 2 ? (dark ? 'rgba(255,255,255,0.02)' : accent + '08') : 'transparent', padding: 'clamp(40px, 6vw, 80px) 24px' }}>
          <div className="ch-band" style={{ maxWidth: 1160, margin: '0 auto', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 48, alignItems: 'center', direction: i % 2 ? 'rtl' : 'ltr' }}>
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
                  <div style={{ position: 'relative', width: 96, height: 96, borderRadius: 26, background: accent, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: `0 20px 50px ${accent}55`, animation: 'chFloat 6s ease-in-out infinite' }}>
                    <FeatureIcon name={ch.features[Math.min(i + 2, ch.features.length - 1)].icon} color="#fff" size={44} />
                  </div>
                </div>
              </Reveal>
            </div>
          </div>
        </section>
      ))}

      {/* EVERY CHANNEL */}
      <section style={{ maxWidth: 1000, margin: '0 auto', padding: '30px 24px 20px', textAlign: 'center' }}>
        <Reveal>
          <h2 style={{ fontSize: 'clamp(24px, 3.4vw, 38px)', fontWeight: 900, letterSpacing: '-0.02em', margin: '0 0 8px' }}>Every channel, <span style={{ color: accent }}>one thread</span></h2>
          <p style={{ fontSize: 16, color: muted, maxWidth: 560, margin: '0 auto 22px', lineHeight: 1.55 }}>{ch.name} is one of many. Customers reach out however they like — Colvy brings it together, one conversation per customer.</p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, justifyContent: 'center' }}>
            {CHANNELS.map(c => (
              <span key={c} style={{ fontSize: 13.5, fontWeight: 700, color: text, background: cardBg, border: `1px solid ${cardBorder}`, borderRadius: 999, padding: '8px 16px' }}>{c}</span>
            ))}
          </div>
        </Reveal>
      </section>

      {/* STATS */}
      <section style={{ maxWidth: 1000, margin: '0 auto', padding: '30px 24px 60px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 18 }}>
          {ch.stats.map((s, i) => (
            <Reveal key={s.label} delay={i * 0.06}>
              <div style={{ textAlign: 'center', borderRadius: 20, padding: '28px 14px', background: cardBg, border: `1px solid ${cardBorder}` }}>
                <div style={{ fontSize: 'clamp(26px, 4.4vw, 42px)', fontWeight: 900, letterSpacing: '-0.03em', color: accent }}>{s.big}</div>
                <div style={{ fontSize: 13, fontWeight: 600, color: muted, marginTop: 4 }}>{s.label}</div>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section style={{ padding: 'clamp(48px, 8vw, 96px) 24px', textAlign: 'center', background: `linear-gradient(135deg, ${accent}, ${PINK} 60%, ${PURPLE})` }}>
        <Reveal>
          <div style={{ maxWidth: 720, margin: '0 auto' }}>
            <h2 style={{ fontSize: 'clamp(28px, 5vw, 52px)', fontWeight: 900, letterSpacing: '-0.03em', lineHeight: 1.05, color: '#fff', margin: '0 0 12px' }}>{ch.ctaHead}</h2>
            <p style={{ fontSize: 17, color: 'rgba(255,255,255,0.9)', margin: '0 0 30px' }}>Start free, set up in about 45 minutes — no credit card, cancel anytime.</p>
            <button onClick={go} className="ch-btn" style={{ padding: '16px 38px', borderRadius: 999, background: '#fff', color: INK, fontWeight: 900, fontSize: 17, border: 'none', cursor: 'pointer', boxShadow: '0 14px 40px rgba(0,0,0,0.2)' }}>Get started — it’s free</button>
          </div>
        </Reveal>
      </section>

      <MarketingFooter dark={dark} />
    </div>
  )
}
