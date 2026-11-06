'use client'

import React from 'react'

// On-brand product-UI mockups rendered in the marketing hero frames — one
// realistic screen per feature, built from shared primitives so they read as a
// single design system and stay razor-sharp on any display (no stock photos).
// Theme-aware (light/dark) and tinted with each page's accent colour.

export type MockKind =
  | 'inbox' | 'crm' | 'gallery' | 'notes' | 'orders' | 'payments' | 'links'
  | 'insights' | 'calendar' | 'tasks' | 'broadcasts' | 'automation'
  | 'ideas' | 'roadmap' | 'announcements' | 'kb' | 'booking' | 'waitlist' | 'carts' | 'voice'
  | 'reservations' | 'checkin' | 'jobs' | 'portal' | 'receipt'

const TITLES: Record<MockKind, string> = {
  inbox: 'Shared inbox', crm: 'Customer profile', gallery: 'Media gallery', notes: 'Internal notes',
  orders: 'Orders', payments: 'Payments', links: 'Link analytics', insights: 'Insights',
  calendar: 'Calendar', tasks: 'Tasks', broadcasts: 'Broadcast', automation: 'Automation',
  ideas: 'Ideas board', roadmap: 'Roadmap', announcements: 'Changelog', kb: 'Help centre', booking: 'Book online',
  waitlist: 'Back-in-stock waitlists', carts: 'Abandoned carts', voice: 'Colvy Voice',
  reservations: 'Reservations · Friday', checkin: 'Your booking', jobs: 'Jobs & quotes', portal: 'Your account', receipt: 'Orders and receipts',
}

interface Theme { bg: string; panel: string; ink: string; sub: string; border: string; accent: string; soft: string; dark: boolean }

const AV = ['#ef4444', '#f59e0b', '#10b981', '#2b59ff', '#7c5cff', '#ec4899', '#0891b2']

// ── primitives ──────────────────────────────────────────────────────────────
const Line = ({ w, h = 8, c, r = 5, style }: { w: number | string; h?: number; c: string; r?: number; style?: React.CSSProperties }) =>
  <div style={{ width: w, height: h, borderRadius: r, background: c, ...style }} />

const Avatar = ({ t, c, s = 26 }: { t: string; c: string; s?: number }) =>
  <div style={{ width: s, height: s, borderRadius: '50%', background: c, color: '#fff', fontSize: s * 0.4, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{t}</div>

const Chip = ({ children, bg, fg }: { children: React.ReactNode; bg: string; fg: string }) =>
  <span style={{ fontSize: 9.5, fontWeight: 800, padding: '2px 7px', borderRadius: 999, background: bg, color: fg, whiteSpace: 'nowrap' }}>{children}</span>

const Card: React.FC<{ T: Theme; style?: React.CSSProperties; children: React.ReactNode }> = ({ T, style, children }) =>
  <div style={{ background: T.bg, border: `1px solid ${T.border}`, borderRadius: 10, padding: 10, ...style }}>{children}</div>

const hex = (a: string, o: string) => a + o // accent + alpha suffix e.g. '22'

// ── per-kind screens ────────────────────────────────────────────────────────
function Inbox(T: Theme) {
  const rows = [['A', 'Aisha K.', 'Is my order shipped yet?', 0], ['M', 'Marco P.', 'Thanks — that worked!', 1], ['J', 'Jena R.', 'Can I change the size?', 2]] as const
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1.15fr 1fr', gap: 10 }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {rows.map(([i, n, p, k], idx) => (
          <div key={n} style={{ display: 'flex', gap: 8, alignItems: 'center', padding: 7, borderRadius: 9, background: idx === 0 ? hex(T.accent, '14') : 'transparent', border: `1px solid ${idx === 0 ? hex(T.accent, '33') : 'transparent'}` }}>
            <Avatar t={i} c={AV[k]} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: T.ink }}>{n}</div>
              <div style={{ fontSize: 9.5, color: T.sub, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>{p}</div>
            </div>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: [T.accent, '#25d366', '#7c5cff'][k % 3] }} />
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, justifyContent: 'flex-end' }}>
        <div style={{ alignSelf: 'flex-start', maxWidth: '90%', background: T.panel, borderRadius: '10px 10px 10px 3px', padding: '7px 9px' }}><Line w={90} c={T.border} /><Line w={60} c={T.border} style={{ marginTop: 4 }} /></div>
        <div style={{ alignSelf: 'flex-end', maxWidth: '90%', background: T.accent, borderRadius: '10px 10px 3px 10px', padding: '7px 9px' }}><Line w={80} c="rgba(255,255,255,0.85)" /><Line w={50} c="rgba(255,255,255,0.6)" style={{ marginTop: 4 }} /></div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2, border: `1px solid ${T.border}`, borderRadius: 8, padding: '6px 8px' }}><Line w="70%" c={T.border} /><span style={{ marginLeft: 'auto', width: 16, height: 16, borderRadius: 5, background: T.accent }} /></div>
      </div>
    </div>
  )
}

function Crm(T: Theme) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <Avatar t="AK" c={AV[3]} s={38} />
        <div style={{ flex: 1 }}><div style={{ fontSize: 12.5, fontWeight: 800, color: T.ink }}>Aisha Khan</div><div style={{ fontSize: 10, color: T.sub }}>aisha@example.com</div></div>
        <Chip bg={hex(T.accent, '1f')} fg={T.accent}>VIP</Chip>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6 }}>
        {[['Lifetime', '$2,480'], ['Orders', '14'], ['Since', '2023']].map(([a, b]) => (
          <Card key={a} T={T} style={{ padding: 8 }}><div style={{ fontSize: 9, color: T.sub, fontWeight: 700 }}>{a}</div><div style={{ fontSize: 13, fontWeight: 800, color: T.ink }}>{b}</div></Card>
        ))}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
        {['Placed order #1043', 'Replied on Instagram', 'Left a 5★ review'].map((t, i) => (
          <div key={t} style={{ display: 'flex', gap: 8, alignItems: 'center' }}><span style={{ width: 7, height: 7, borderRadius: '50%', background: T.accent, flexShrink: 0 }} /><span style={{ fontSize: 10.5, color: T.ink }}>{t}</span><span style={{ marginLeft: 'auto', fontSize: 9, color: T.sub }}>{i + 1}d</span></div>
        ))}
      </div>
    </div>
  )
}

function Gallery(T: Theme) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 6 }}>
      {Array.from({ length: 9 }).map((_, i) => (
        <div key={i} style={{ aspectRatio: '1', borderRadius: 8, background: `linear-gradient(135deg, ${hex(T.accent, ['33', '22', '44'][i % 3])}, ${T.panel})`, position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {i % 4 === 0 && <span style={{ width: 16, height: 16, borderRadius: '50%', background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><span style={{ width: 0, height: 0, borderLeft: `5px solid ${T.accent}`, borderTop: '3px solid transparent', borderBottom: '3px solid transparent', marginLeft: 1 }} /></span>}
        </div>
      ))}
    </div>
  )
}

function Notes(T: Theme) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
      <div style={{ alignSelf: 'flex-start', maxWidth: '85%', background: T.panel, borderRadius: '10px 10px 10px 3px', padding: '7px 9px' }}><Line w={110} c={T.border} /><Line w={70} c={T.border} style={{ marginTop: 4 }} /></div>
      <div style={{ alignSelf: 'stretch', background: '#fff8e1', border: '1px solid #fde68a', borderRadius: 8, padding: '8px 9px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 4 }}><span style={{ fontSize: 10 }}>🔒</span><span style={{ fontSize: 9.5, fontWeight: 800, color: '#b45309' }}>Internal note · @team</span></div>
        <Line w="90%" c="#fcd66b" /><Line w="60%" c="#fcd66b" style={{ marginTop: 4 }} />
      </div>
      <div style={{ alignSelf: 'flex-end', maxWidth: '85%', background: T.accent, borderRadius: '10px 10px 3px 10px', padding: '7px 9px' }}><Line w={80} c="rgba(255,255,255,0.85)" /></div>
    </div>
  )
}

function Orders(T: Theme) {
  const rows = [['#1043', 'Aisha K.', 'Shipped', '#10b981', '$128'], ['#1042', 'Marco P.', 'Packing', '#f59e0b', '$64'], ['#1041', 'Jena R.', 'Paid', T.accent, '$210'], ['#1040', 'Sam W.', 'Delivered', '#6b7280', '$92']] as const
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.3fr 1fr 0.7fr', gap: 6, padding: '0 4px 6px', fontSize: 9, fontWeight: 800, color: T.sub }}><span>Order</span><span>Customer</span><span>Status</span><span style={{ textAlign: 'right' }}>Total</span></div>
      {rows.map(([o, c, s, col, t]) => (
        <div key={o} style={{ display: 'grid', gridTemplateColumns: '1fr 1.3fr 1fr 0.7fr', gap: 6, alignItems: 'center', padding: '7px 4px', borderTop: `1px solid ${T.border}` }}>
          <span style={{ fontSize: 10.5, fontWeight: 700, color: T.ink }}>{o}</span>
          <span style={{ fontSize: 10.5, color: T.ink }}>{c}</span>
          <span><Chip bg={col + '22'} fg={col}>{s}</Chip></span>
          <span style={{ fontSize: 10.5, fontWeight: 700, color: T.ink, textAlign: 'right' }}>{t}</span>
        </div>
      ))}
    </div>
  )
}

function Payments(T: Theme) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <Card T={T} style={{ background: T.panel }}>
        <div style={{ fontSize: 9.5, color: T.sub, fontWeight: 700 }}>Amount due</div>
        <div style={{ fontSize: 24, fontWeight: 900, color: T.ink, letterSpacing: '-0.02em' }}>$128.00</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 5, margin: '8px 0' }}>
          {[['Product × 2', '$96'], ['Shipping', '$12'], ['Tax', '$20']].map(([a, b]) => (
            <div key={a} style={{ display: 'flex', fontSize: 10, color: T.sub }}><span>{a}</span><span style={{ marginLeft: 'auto', color: T.ink, fontWeight: 600 }}>{b}</span></div>
          ))}
        </div>
      </Card>
      <div style={{ background: T.accent, color: '#fff', borderRadius: 9, padding: '10px 0', textAlign: 'center', fontSize: 12, fontWeight: 800 }}>Pay securely →</div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5, fontSize: 9, color: T.sub }}><span>🔒</span> Encrypted checkout</div>
    </div>
  )
}

function Links(T: Theme) {
  const rows = [['/spring-sale', 842, '86%'], ['/new-arrivals', 531, '72%'], ['/loyalty', 318, '64%'], ['/refer', 129, '48%']] as const
  const max = 842
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
      {rows.map(([l, clicks, ctr]) => (
        <div key={l} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <div style={{ display: 'flex', alignItems: 'center', fontSize: 10.5 }}><span style={{ fontWeight: 700, color: T.ink }}>{l}</span><span style={{ marginLeft: 'auto', color: T.sub }}>{clicks} clicks · {ctr}</span></div>
          <div style={{ height: 7, borderRadius: 4, background: T.panel, overflow: 'hidden' }}><div style={{ width: `${(clicks / max) * 100}%`, height: '100%', borderRadius: 4, background: T.accent }} /></div>
        </div>
      ))}
    </div>
  )
}

function Insights(T: Theme) {
  const bars = [40, 62, 48, 78, 96, 70, 88]
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6 }}>
        {[['Replies', '1.2k'], ['Avg time', '4m'], ['CSAT', '96%']].map(([a, b]) => (
          <Card key={a} T={T} style={{ padding: 8 }}><div style={{ fontSize: 9, color: T.sub, fontWeight: 700 }}>{a}</div><div style={{ fontSize: 14, fontWeight: 800, color: T.ink }}>{b}</div></Card>
        ))}
      </div>
      <Card T={T} style={{ padding: 10 }}>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, height: 66 }}>
          {bars.map((h, i) => <div key={i} style={{ flex: 1, height: `${h}%`, borderRadius: '4px 4px 0 0', background: i === 4 ? T.accent : hex(T.accent, '55') }} />)}
        </div>
      </Card>
    </div>
  )
}

function Calendar(T: Theme) {
  const ev: Record<number, string> = { 3: T.accent, 10: '#10b981', 11: '#10b981', 18: '#f59e0b', 24: '#7c5cff' }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center' }}><span style={{ fontSize: 11.5, fontWeight: 800, color: T.ink }}>September</span><span style={{ marginLeft: 'auto', display: 'flex', gap: 4 }}><span style={{ width: 16, height: 16, borderRadius: 5, background: T.panel }} /><span style={{ width: 16, height: 16, borderRadius: 5, background: T.panel }} /></span></div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 4 }}>
        {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d, i) => <div key={i} style={{ fontSize: 8, fontWeight: 700, color: T.sub, textAlign: 'center' }}>{d}</div>)}
        {Array.from({ length: 28 }).map((_, i) => (
          <div key={i} style={{ aspectRatio: '1', borderRadius: 6, background: ev[i] ? hex(ev[i], '22') : T.panel, border: ev[i] ? `1px solid ${ev[i]}` : 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 8, fontWeight: 700, color: ev[i] ? ev[i] : T.sub }}>{i + 1}</div>
        ))}
      </div>
    </div>
  )
}

// The customer's booking page: pick a service, a time, pay the deposit.
function Booking(T: Theme) {
  const services = [['Aquarium health check', '30 min', '$45'], ['Tank setup consult', '60 min', '$90']] as const
  const slots = ['9:00', '9:30', '10:30', '11:00', '1:30', '2:00']
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
      {services.map(([name, len, price], i) => (
        <Card key={name} T={T} style={{ padding: 9, display: 'flex', alignItems: 'center', gap: 8, borderColor: i === 0 ? T.accent : T.border, background: i === 0 ? T.soft : T.bg }}>
          <div style={{ width: 22, height: 22, borderRadius: 7, background: i === 0 ? T.accent : T.panel, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={i === 0 ? '#fff' : T.sub} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><polyline points="12 7 12 12 15 14" /></svg>
          </div>
          <div style={{ minWidth: 0 }}><div style={{ fontSize: 10.5, fontWeight: 800, color: T.ink }}>{name}</div><div style={{ fontSize: 9, color: T.sub }}>{len}</div></div>
          <span style={{ marginLeft: 'auto', fontSize: 10.5, fontWeight: 800, color: T.ink }}>{price}</span>
        </Card>
      ))}
      <div style={{ display: 'flex', alignItems: 'center' }}><span style={{ fontSize: 10.5, fontWeight: 800, color: T.ink }}>Thu 9 Oct</span><span style={{ marginLeft: 'auto', fontSize: 9, color: T.sub }}>Melbourne time</span></div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 5 }}>
        {slots.map((t, i) => (
          <div key={t} style={{ padding: '6px 0', borderRadius: 7, textAlign: 'center', fontSize: 10, fontWeight: 800, background: i === 2 ? T.accent : T.panel, color: i === 2 ? '#fff' : T.ink, opacity: i === 1 ? 0.4 : 1, textDecoration: i === 1 ? 'line-through' : 'none' }}>{t}</div>
        ))}
      </div>
      <div style={{ background: T.accent, color: '#fff', borderRadius: 9, padding: '9px 0', textAlign: 'center', fontSize: 11.5, fontWeight: 800 }}>Pay $20 deposit and book</div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5, fontSize: 9, color: T.sub }}>Confirmation and reminder by SMS</div>
    </div>
  )
}

// Waitlists ranked by demand, with the restock alert going out.
function Waitlist(T: Theme) {
  const items = [['Fluval 307 canister filter', 14, 'Out of stock'], ['Red cherry shrimp (10)', 9, 'Out of stock'], ['CO2 refill 2.6kg', 6, 'Back in stock']] as const
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
        {[['Customers waiting', '29'], ['Potential revenue', '$2,184']].map(([a, b]) => (
          <Card key={a} T={T} style={{ padding: 8 }}><div style={{ fontSize: 9, color: T.sub, fontWeight: 700 }}>{a}</div><div style={{ fontSize: 15, fontWeight: 900, color: T.ink }}>{b}</div></Card>
        ))}
      </div>
      {items.map(([name, n, st]) => {
        const back = st === 'Back in stock'
        return (
          <Card key={name} T={T} style={{ padding: 9, display: 'flex', alignItems: 'center', gap: 8, borderColor: back ? T.accent : T.border, background: back ? T.soft : T.bg }}>
            <div style={{ width: 24, height: 24, borderRadius: 7, background: T.panel, flexShrink: 0 }} />
            <div style={{ minWidth: 0, flex: 1 }}><div style={{ fontSize: 10.5, fontWeight: 800, color: T.ink, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{name}</div><div style={{ fontSize: 9, color: back ? T.accent : T.sub, fontWeight: 700 }}>{st}</div></div>
            <Chip bg={T.panel} fg={T.ink}>{n} waiting</Chip>
          </Card>
        )
      })}
      <div style={{ background: T.accent, color: '#fff', borderRadius: 9, padding: '9px 10px', fontSize: 10.5, fontWeight: 700, lineHeight: 1.45 }}>SMS sent to 6 people: “Hi Mia, the CO2 refill 2.6kg is back in stock at Roxy Aquarium.”</div>
    </div>
  )
}

// Dictating a reply: the rambling take on top, the polished text it becomes below.
function Voice(T: Theme) {
  const bars = [5, 9, 14, 8, 18, 11, 6, 15, 20, 12, 7, 16, 10, 5, 13, 9, 17, 8, 12, 6]
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', gap: 7, alignItems: 'flex-end' }}>
        <Avatar t="MA" c={AV[2]} s={22} />
        <div style={{ background: T.panel, color: T.ink, borderRadius: '10px 10px 10px 3px', padding: '7px 10px', fontSize: 10.5, lineHeight: 1.45, maxWidth: '82%' }}>Do you have the Fluval 307 in stock? And can I pick up Saturday?</div>
      </div>
      <Card T={T} style={{ padding: 9, display: 'flex', alignItems: 'center', gap: 9, borderColor: T.accent, background: T.soft }}>
        <div style={{ width: 26, height: 26, borderRadius: '50%', background: T.accent, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="2" width="6" height="12" rx="3" /><path d="M19 10v1a7 7 0 0 1-14 0v-1" /><line x1="12" y1="18" x2="12" y2="22" /></svg>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 2, flex: 1, height: 22 }}>
          {bars.map((h, i) => <span key={i} style={{ width: 3, height: h, borderRadius: 2, background: T.accent, opacity: 0.45 + (h / 40) }} />)}
        </div>
        <span style={{ fontSize: 9.5, fontWeight: 800, color: T.accent }}>0:07</span>
      </Card>
      <div style={{ fontSize: 9.5, color: T.sub, fontStyle: 'italic', lineHeight: 1.45, padding: '0 2px' }}>“um yeah hi Mia so the uh 307 came in this morning and yep Saturday’s fine we’re open till four”</div>
      <Card T={T} style={{ padding: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 5 }}><Chip bg={T.soft} fg={T.accent}>Polished</Chip><span style={{ fontSize: 9, color: T.sub, fontWeight: 700 }}>Fillers removed · punctuated</span></div>
        <div style={{ fontSize: 10.5, color: T.ink, lineHeight: 1.5 }}>Hi Mia, the Fluval 307 came in this morning. Saturday is fine, we’re open until 4pm.</div>
      </Card>
    </div>
  )
}

// An abandoned checkout landing in the inbox, then recovered.
function Carts(T: Theme) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <Card T={T} style={{ padding: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          <Avatar t="JL" c={AV[3]} s={24} />
          <div style={{ minWidth: 0 }}><div style={{ fontSize: 10.5, fontWeight: 800, color: T.ink }}>Jordan Lee</div><div style={{ fontSize: 9, color: T.sub }}>Left checkout · 12 min ago</div></div>
          <span style={{ marginLeft: 'auto' }}><Chip bg={hex('#f59e0b', '22')} fg={T.dark ? '#fbbf24' : '#b45309'}>Abandoned cart</Chip></span>
        </div>
        {[['Aqua One 60cm tank', '$189'], ['LED light kit', '$64'], ['Shipping', '$12']].map(([a, b]) => (
          <div key={a} style={{ display: 'flex', fontSize: 10, color: T.sub, padding: '2px 0' }}><span>{a}</span><span style={{ marginLeft: 'auto', color: T.ink, fontWeight: 700 }}>{b}</span></div>
        ))}
        <div style={{ display: 'flex', fontSize: 11, fontWeight: 900, color: T.ink, borderTop: `1px solid ${T.border}`, marginTop: 6, paddingTop: 6 }}><span>Total</span><span style={{ marginLeft: 'auto' }}>$265</span></div>
      </Card>
      <div style={{ alignSelf: 'flex-end', maxWidth: '85%', background: T.accent, color: '#fff', borderRadius: '12px 12px 4px 12px', padding: '8px 10px', fontSize: 10.5, fontWeight: 600, lineHeight: 1.4 }}>Hi Jordan, any questions about the tank? Here’s 10% off if you’d like to finish your order.</div>
      <div style={{ alignSelf: 'center', display: 'flex', alignItems: 'center', gap: 6, padding: '6px 11px', borderRadius: 999, background: hex('#10b981', '22'), color: T.dark ? '#34d399' : '#047857', fontSize: 10, fontWeight: 800 }}>
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>Recovered · order #10482 · $238.50
      </div>
    </div>
  )
}

const GOOD = '#10b981', WARN = '#f59e0b'
const goodInk = (T: Theme) => (T.dark ? '#34d399' : '#047857')
const warnInk = (T: Theme) => (T.dark ? '#fbbf24' : '#b45309')
const Glyph = ({ d, c, s = 12 }: { d: React.ReactNode; c: string; s?: number }) =>
  <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">{d}</svg>
const HAND = <><path d="M18 11V6a2 2 0 0 0-4 0" /><path d="M14 10V4a2 2 0 0 0-4 0v2" /><path d="M10 10.5V6a2 2 0 0 0-4 0v8" /><path d="M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15" /></>
const BELL = <><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.73 21a2 2 0 0 1-3.46 0" /></>
const TICK = <polyline points="20 6 9 17 4 12" />

// Table reservations: the covers strip, the live floor and the evening's sheet.
function Reservations(T: Theme) {
  type St = 'seated' | 'here' | 'soon' | 'free' | 'out'
  const tables: { l: string; c: string; r: string; round?: boolean; st: St }[] = [
    { l: 'T1', c: '1', r: '1', round: true, st: 'seated' },
    { l: 'T2', c: '2', r: '1', round: true, st: 'free' },
    { l: 'T3', c: '3', r: '1', round: true, st: 'soon' },
    { l: 'T4', c: '1 / span 2', r: '2', st: 'here' },
    { l: 'T6', c: '3', r: '2 / span 2', st: 'seated' },
    { l: 'B1', c: '1', r: '3', st: 'free' },
    { l: 'B2', c: '2', r: '3', st: 'out' },
  ]
  const look = (st: St) => st === 'seated' ? { bg: T.accent, fg: '#fff', bd: T.accent }
    : st === 'here' ? { bg: hex(GOOD, '26'), fg: goodInk(T), bd: GOOD }
    : st === 'soon' ? { bg: hex(WARN, '22'), fg: warnInk(T), bd: WARN }
    : st === 'out' ? { bg: T.panel, fg: T.sub, bd: T.border }
    : { bg: T.bg, fg: T.ink, bd: T.border }
  const rows: [string, string, string, string, string, string][] = [
    ['6:30', 'Mia · 4', 'T1', 'Seated', hex(T.accent, '22'), T.accent],
    ['7:00', 'Ava · 2', 'T4', 'Here 6:57', hex(GOOD, '22'), goodInk(T)],
    ['7:30', 'Leo · 3', 'T3', 'Due soon', hex(WARN, '22'), warnInk(T)],
    ['8:00', 'Noah · 8', 'T7 + T8', 'Deposit ✓', T.panel, T.ink],
  ]
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: 11, fontWeight: 800, color: T.ink }}>Dinner</span>
        <div style={{ flex: 1, height: 7, borderRadius: 4, background: T.panel, overflow: 'hidden' }}><div style={{ width: '43%', height: '100%', borderRadius: 4, background: T.accent }} /></div>
        <span style={{ fontSize: 9.5, fontWeight: 800, color: T.sub, whiteSpace: 'nowrap' }}>34 of 80 covers</span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 0.9fr) minmax(0, 1.1fr)', gap: 10 }}>
        <Card T={T} style={{ padding: 8, background: T.panel, display: 'flex' }}>
          <div style={{ flex: 1, display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gridTemplateRows: 'repeat(3, minmax(32px, 1fr))', gap: 7 }}>
            {tables.map(t => {
              const k = look(t.st)
              return <div key={t.l} style={{ gridColumn: t.c, gridRow: t.r, borderRadius: t.round ? 999 : 7, background: k.bg, border: `1.5px solid ${k.bd}`, color: k.fg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9.5, fontWeight: 900, boxShadow: t.st === 'here' ? `0 0 0 3px ${hex(GOOD, '30')}, 0 0 16px ${hex(GOOD, '77')}` : 'none' }}>{t.l}</div>
            })}
          </div>
        </Card>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0 }}>
          {rows.map(([time, who, table, label, bg, fg]) => (
            <div key={who} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 7px', borderRadius: 8, border: `1px solid ${T.border}`, background: T.bg, minWidth: 0 }}>
              <span style={{ fontSize: 9, fontWeight: 800, color: T.sub, width: 24, flexShrink: 0 }}>{time}</span>
              <div style={{ minWidth: 0, flex: 1 }}><div style={{ fontSize: 10, fontWeight: 800, color: T.ink, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{who}</div><div style={{ fontSize: 8.5, color: T.sub }}>{table}</div></div>
              <Chip bg={bg} fg={fg}>{label}</Chip>
            </div>
          ))}
        </div>
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
        {[['Seated', T.accent], ['Here', GOOD], ['Due soon', WARN], ['Free', T.border]].map(([l, c]) => (
          <span key={l} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 9, fontWeight: 700, color: T.sub }}><span style={{ width: 8, height: 8, borderRadius: 3, background: c }} />{l}</span>
        ))}
      </div>
    </div>
  )
}

// "I'm here": the guest's booking page, then what the team sees.
function Checkin(T: Theme) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
      <Card T={T} style={{ padding: 10, display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ width: 40, borderRadius: 9, overflow: 'hidden', border: `1px solid ${T.border}`, textAlign: 'center', flexShrink: 0 }}>
          <div style={{ background: T.accent, color: '#fff', fontSize: 8, fontWeight: 900, padding: '2px 0', letterSpacing: '0.06em' }}>FRI</div>
          <div style={{ fontSize: 15, fontWeight: 900, color: T.ink, padding: '3px 0' }}>14</div>
        </div>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 11.5, fontWeight: 800, color: T.ink }}>Table for 2 · 7:30pm</div>
          <div style={{ fontSize: 9.5, color: T.sub }}>Inside · Birthday</div>
        </div>
        <span style={{ marginLeft: 'auto' }}><Chip bg={hex(GOOD, '22')} fg={goodInk(T)}>Confirmed</Chip></span>
      </Card>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px 10px 10px', borderRadius: 14, background: T.accent, color: '#fff', boxShadow: `0 12px 26px ${hex(T.accent, '55')}` }}>
        <span style={{ width: 32, height: 32, borderRadius: 10, background: 'rgba(255,255,255,0.22)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><Glyph d={HAND} c="#fff" s={17} /></span>
        <span style={{ minWidth: 0 }}><span style={{ display: 'block', fontSize: 13.5, fontWeight: 900 }}>I’m here</span><span style={{ display: 'block', fontSize: 9.5, opacity: 0.92 }}>Tap when you arrive and we’ll let them know.</span></span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '2px 0' }}><span style={{ flex: 1, height: 1, background: T.border }} /><span style={{ fontSize: 8.5, fontWeight: 800, color: T.sub, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Your team sees</span><span style={{ flex: 1, height: 1, background: T.border }} /></div>
      <Card T={T} style={{ padding: 9, display: 'flex', alignItems: 'center', gap: 8, background: T.panel }}>
        <span style={{ width: 24, height: 24, borderRadius: '50%', background: hex(GOOD, '26'), display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><Glyph d={BELL} c={goodInk(T)} /></span>
        <div style={{ minWidth: 0, flex: 1 }}><div style={{ fontSize: 10.5, fontWeight: 800, color: T.ink }}>Ava is here</div><div style={{ fontSize: 9, color: T.sub }}>Table for 2, 7:30pm · T4</div></div>
        <span style={{ fontSize: 9, color: T.sub }}>now</span>
      </Card>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        <Chip bg={hex(GOOD, '22')} fg={goodInk(T)}>Here · 7:27pm</Chip>
        <Chip bg={T.panel} fg={T.sub}>Push sent to the team</Chip>
        <Chip bg={T.panel} fg={T.sub}>Note in the chat</Chip>
      </div>
    </div>
  )
}

// Jobs & quotes: an accepted quote with GST, and the job it became.
function Jobs(T: Theme) {
  const lines = [['Labour · 3 hrs', '$330.00'], ['Hot water unit, installed', '$1,480.00'], ['Call-out', '$90.00']]
  const checks = [true, true, false, false]
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
      <Card T={T} style={{ padding: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 7 }}>
          <span style={{ fontSize: 10.5, fontWeight: 900, color: T.ink }}>Q-1042 · Hot water replacement</span>
          <span style={{ marginLeft: 'auto' }}><Chip bg={hex(GOOD, '22')} fg={goodInk(T)}>Accepted</Chip></span>
        </div>
        {lines.map(([a, b]) => (
          <div key={a} style={{ display: 'flex', fontSize: 9.5, color: T.sub, padding: '2px 0' }}><span>{a}</span><span style={{ marginLeft: 'auto', color: T.ink, fontWeight: 700 }}>{b}</span></div>
        ))}
        <div style={{ display: 'flex', fontSize: 11, fontWeight: 900, color: T.ink, borderTop: `1px solid ${T.border}`, marginTop: 6, paddingTop: 6 }}><span>Total incl. GST</span><span style={{ marginLeft: 'auto' }}>$1,900.00</span></div>
        <div style={{ display: 'flex', fontSize: 9, color: T.sub, marginTop: 2 }}><span>Includes GST</span><span style={{ marginLeft: 'auto' }}>$172.73</span></div>
        <div style={{ fontSize: 9, color: T.sub, marginTop: 6 }}>Accepted online by Liam · deposit paid</div>
      </Card>
      <Card T={T} style={{ padding: 10, background: T.panel }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
          <span style={{ fontSize: 10.5, fontWeight: 900, color: T.ink }}>J-1018</span>
          <Chip bg={hex(T.accent, '22')} fg={T.accent}>Scheduled · Thu 8:00am</Chip>
          <span style={{ marginLeft: 'auto', display: 'flex' }}>{['S', 'R'].map((t, i) => <span key={t} style={{ marginLeft: i ? -6 : 0, border: `2px solid ${T.panel}`, borderRadius: '50%' }}><Avatar t={t} c={AV[i + 3]} s={20} /></span>)}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
          <span style={{ fontSize: 9, fontWeight: 800, color: T.sub }}>Checklist 2/4</span>
          <div style={{ flex: 1, display: 'flex', gap: 3 }}>{checks.map((c, i) => <span key={i} style={{ flex: 1, height: 6, borderRadius: 3, background: c ? T.accent : T.border }} />)}</div>
        </div>
        <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
          <Chip bg={T.bg} fg={T.ink}>3 photos</Chip>
          <Chip bg={T.bg} fg={T.ink}>Timer 1:24</Chip>
          <Chip bg={hex(GOOD, '22')} fg={goodInk(T)}>No clashes</Chip>
          <Chip bg={T.bg} fg={T.sub}>Signature on completion</Chip>
        </div>
      </Card>
    </div>
  )
}

// Customer accounts: what a signed-in customer sees.
function Portal(T: Theme) {
  const rows: [string, string, string][] = [
    ['Coming up', 'Tank service · Thu 10 Dec, 10:00am', 'Change or cancel'],
    ['Quotes and jobs', 'Q-1042 · Reef tank install', 'View and accept'],
    ['Payments due', 'Payment link · $120.00', 'Pay'],
    ['Orders and receipts', '#5012 · In store · $86.40', 'Receipt'],
    ['Messages', '“Thanks, see you Thursday!”', 'Reply'],
  ]
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <Avatar t="M" c={AV[4]} s={26} />
        <div style={{ minWidth: 0 }}><div style={{ fontSize: 12, fontWeight: 900, color: T.ink }}>Hi Mia</div><div style={{ fontSize: 9, color: T.sub }}>Signed in with a code · no password</div></div>
        <span style={{ marginLeft: 'auto' }}><Chip bg={T.panel} fg={T.sub}>Preferences</Chip></span>
      </div>
      {rows.map(([sec, what, act], i) => (
        <Card key={sec} T={T} style={{ padding: '7px 9px', display: 'flex', alignItems: 'center', gap: 8, background: i === 0 ? T.soft : T.bg, borderColor: i === 0 ? hex(T.accent, '55') : T.border }}>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ fontSize: 8.5, fontWeight: 800, color: T.sub, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{sec}</div>
            <div style={{ fontSize: 10.5, fontWeight: 700, color: T.ink, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{what}</div>
          </div>
          <span style={{ fontSize: 9.5, fontWeight: 800, color: i === 2 ? '#fff' : T.accent, background: i === 2 ? T.accent : 'transparent', borderRadius: 7, padding: i === 2 ? '4px 10px' : 0, whiteSpace: 'nowrap' }}>{act}</span>
        </Card>
      ))}
    </div>
  )
}

// A receipt opened from the customer's account: a tax invoice with GST shown.
function Receipt(T: Theme) {
  const lines = [['Canister filter', '1', '$289.00'], ['Water conditioner 500ml', '2', '$39.90']]
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
      <Card T={T} style={{ padding: 12 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 9, marginBottom: 10 }}>
          <span style={{ width: 26, height: 26, borderRadius: 8, background: T.accent, flexShrink: 0 }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <Line w="60%" h={9} c={T.ink} style={{ opacity: 0.85 }} />
            <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 5 }}><span style={{ fontSize: 8.5, fontWeight: 800, color: T.sub }}>ABN</span><Line w={64} h={6} c={T.border} /></div>
          </div>
          <div style={{ textAlign: 'right' }}><div style={{ fontSize: 11, fontWeight: 900, color: T.ink, letterSpacing: '0.04em' }}>TAX INVOICE</div><div style={{ fontSize: 9, color: T.sub }}>#5012 · 14 Nov</div></div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr auto auto', gap: '4px 12px', fontSize: 9.5, color: T.sub, borderTop: `1px solid ${T.border}`, paddingTop: 8 }}>
          <span style={{ fontWeight: 800 }}>Item</span><span style={{ fontWeight: 800 }}>Qty</span><span style={{ fontWeight: 800, textAlign: 'right' }}>Amount</span>
          {lines.map(([a, q, b]) => <React.Fragment key={a}><span style={{ color: T.ink }}>{a}</span><span style={{ color: T.ink }}>{q}</span><span style={{ color: T.ink, fontWeight: 700, textAlign: 'right' }}>{b}</span></React.Fragment>)}
        </div>
        <div style={{ display: 'flex', fontSize: 12, fontWeight: 900, color: T.ink, borderTop: `1px solid ${T.border}`, marginTop: 8, paddingTop: 7 }}><span>Total</span><span style={{ marginLeft: 'auto' }}>$328.90</span></div>
        <div style={{ display: 'flex', fontSize: 9.5, color: T.sub, marginTop: 2 }}><span>Includes GST of</span><span style={{ marginLeft: 'auto' }}>$29.90</span></div>
        <div style={{ display: 'flex', gap: 5, marginTop: 9, flexWrap: 'wrap' }}><Chip bg={hex(GOOD, '22')} fg={goodInk(T)}>Paid</Chip><Chip bg={T.panel} fg={T.sub}>Card</Chip><Chip bg={T.panel} fg={T.sub}>In store</Chip></div>
      </Card>
      <div style={{ background: T.accent, color: '#fff', borderRadius: 9, padding: '9px 0', textAlign: 'center', fontSize: 11.5, fontWeight: 800 }}>Print or save as PDF</div>
    </div>
  )
}

function Kanban(T: Theme, cols: [string, string][], cards: Record<number, number>) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: `repeat(${cols.length},1fr)`, gap: 8 }}>
      {cols.map(([name, col], ci) => (
        <div key={name} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}><span style={{ width: 7, height: 7, borderRadius: '50%', background: col }} /><span style={{ fontSize: 9.5, fontWeight: 800, color: T.ink }}>{name}</span></div>
          {Array.from({ length: cards[ci] || 2 }).map((_, i) => (
            <Card key={i} T={T} style={{ padding: 8, background: T.panel }}><Line w="80%" c={T.border} /><div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 6 }}><Chip bg={hex(col, '22')} fg={col}>•</Chip><span style={{ marginLeft: 'auto', width: 14, height: 14, borderRadius: '50%', background: AV[(ci + i) % AV.length] }} /></div></Card>
          ))}
        </div>
      ))}
    </div>
  )
}

function Broadcasts(T: Theme) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
      <div style={{ display: 'flex', gap: 6 }}>{['SMS', 'Email'].map((c, i) => <Chip key={c} bg={i === 0 ? T.accent : T.panel} fg={i === 0 ? '#fff' : T.sub}>{c}</Chip>)}</div>
      <Card T={T} style={{ background: T.panel }}><Line w="95%" c={T.border} /><Line w="80%" c={T.border} style={{ marginTop: 5 }} /><Line w="55%" c={T.border} style={{ marginTop: 5 }} /></Card>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>{AV.slice(0, 4).map((c, i) => <span key={i} style={{ width: 18, height: 18, borderRadius: '50%', background: c, marginLeft: i ? -8 : 0, border: `2px solid ${T.bg}` }} />)}</div>
        <span style={{ fontSize: 10, color: T.sub }}>to <b style={{ color: T.ink }}>3,120</b> contacts</span>
        <span style={{ marginLeft: 'auto', fontSize: 11, fontWeight: 800, color: '#fff', background: T.accent, borderRadius: 8, padding: '6px 12px' }}>Send</span>
      </div>
    </div>
  )
}

function Automation(T: Theme) {
  const node = (label: string, tag: string, col: string) => (
    <Card T={T} style={{ padding: 9, display: 'flex', alignItems: 'center', gap: 8 }}>
      <span style={{ width: 22, height: 22, borderRadius: 7, background: hex(col, '22'), color: col, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 900 }}>{tag}</span>
      <div><div style={{ fontSize: 8.5, color: T.sub, fontWeight: 700 }}>{label}</div><Line w={80} c={T.border} style={{ marginTop: 3 }} /></div>
    </Card>
  )
  const arrow = <div style={{ display: 'flex', justifyContent: 'center' }}><div style={{ width: 2, height: 12, background: T.border }} /></div>
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
      {node('When', '⚡', T.accent)}{arrow}{node('If', '?', '#f59e0b')}{arrow}{node('Then', '→', '#10b981')}
    </div>
  )
}

function Ideas(T: Theme) {
  const rows = [['Dark mode for the inbox', 147, T.accent], ['Bulk export contacts', 96, '#10b981'], ['Slack integration', 58, '#7c5cff'], ['Custom fields on orders', 34, '#f59e0b']] as const
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
      {rows.map(([t, v, col]) => (
        <Card key={t} T={T} style={{ padding: 8, display: 'flex', alignItems: 'center', gap: 9 }}>
          <div style={{ width: 30, textAlign: 'center' }}><div style={{ fontSize: 9, color: col }}>▲</div><div style={{ fontSize: 11, fontWeight: 800, color: T.ink }}>{v}</div></div>
          <div style={{ flex: 1 }}><div style={{ fontSize: 10.5, fontWeight: 700, color: T.ink }}>{t}</div><div style={{ display: 'flex', gap: 4, marginTop: 4 }}><Chip bg={hex(col, '1f')} fg={col}>Planned</Chip></div></div>
        </Card>
      ))}
    </div>
  )
}

function Announcements(T: Theme) {
  const rows = [['New', T.accent, 'Shipped: Email broadcasts'], ['Improved', '#10b981', 'Faster inbox search'], ['Fixed', '#6b7280', 'Order webhook retries']] as const
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
      {rows.map(([tag, col, t], i) => (
        <div key={t} style={{ display: 'flex', flexDirection: 'column', gap: 5, paddingBottom: 9, borderBottom: i < 2 ? `1px solid ${T.border}` : 'none' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}><Chip bg={hex(col, '22')} fg={col}>{tag}</Chip><span style={{ marginLeft: 'auto', fontSize: 8.5, color: T.sub }}>{['Today', '2d ago', '5d ago'][i]}</span></div>
          <div style={{ fontSize: 11, fontWeight: 700, color: T.ink }}>{t}</div>
          <Line w="85%" c={T.border} />
        </div>
      ))}
    </div>
  )
}

function Kb(T: Theme) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, border: `1px solid ${T.border}`, borderRadius: 9, padding: '7px 10px' }}><span style={{ fontSize: 11 }}>🔍</span><Line w="60%" c={T.border} /></div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
        {[['🚀', 'Getting started'], ['💳', 'Billing'], ['🔌', 'Integrations'], ['🛠️', 'Troubleshooting']].map(([e, t]) => (
          <Card key={t} T={T} style={{ padding: 8, background: T.panel }}><div style={{ fontSize: 13 }}>{e}</div><div style={{ fontSize: 10, fontWeight: 700, color: T.ink, marginTop: 3 }}>{t}</div><Line w="70%" c={T.border} style={{ marginTop: 4 }} /></Card>
        ))}
      </div>
    </div>
  )
}

const RENDER: Record<MockKind, (T: Theme) => React.ReactNode> = {
  inbox: Inbox, crm: Crm, gallery: Gallery, notes: Notes, orders: Orders, payments: Payments,
  links: Links, insights: Insights, calendar: Calendar, broadcasts: Broadcasts, automation: Automation,
  ideas: Ideas, announcements: Announcements, kb: Kb, booking: Booking, waitlist: Waitlist, carts: Carts, voice: Voice,
  reservations: Reservations, checkin: Checkin, jobs: Jobs, portal: Portal, receipt: Receipt,
  tasks: (T) => Kanban(T, [['To do', '#6b7280'], ['Doing', T.accent], ['Done', '#10b981']], { 0: 2, 1: 2, 2: 1 }),
  roadmap: (T) => Kanban(T, [['Planned', '#6b7280'], ['Building', T.accent], ['Shipped', '#10b981']], { 0: 2, 1: 1, 2: 2 }),
}

export default function FeatureMockup({ kind, accent, dark = false }: { kind: MockKind; accent: string; dark?: boolean }) {
  const T: Theme = dark
    ? { bg: '#12131d', panel: '#1c1e2b', ink: '#f4f5fb', sub: 'rgba(244,245,251,0.55)', border: 'rgba(255,255,255,0.09)', accent, soft: hex(accent, '22'), dark: true }
    : { bg: '#ffffff', panel: '#f4f5fa', ink: '#0f1119', sub: 'rgba(15,17,25,0.5)', border: 'rgba(15,17,25,0.09)', accent, soft: hex(accent, '14'), dark: false }
  return (
    <div style={{ borderRadius: 16, background: T.bg, border: `1px solid ${T.border}`, boxShadow: dark ? '0 30px 70px rgba(0,0,0,0.55)' : '0 30px 70px rgba(15,17,25,0.16)', overflow: 'hidden', width: '100%' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '9px 12px', borderBottom: `1px solid ${T.border}`, background: T.panel }}>
        <span style={{ width: 9, height: 9, borderRadius: '50%', background: '#ff5f57' }} />
        <span style={{ width: 9, height: 9, borderRadius: '50%', background: '#febc2e' }} />
        <span style={{ width: 9, height: 9, borderRadius: '50%', background: '#28c840' }} />
        <span style={{ marginLeft: 8, fontSize: 10.5, fontWeight: 700, color: T.sub }}>{TITLES[kind]}</span>
        <span style={{ marginLeft: 'auto', width: 24, height: 6, borderRadius: 3, background: T.border }} />
      </div>
      <div style={{ padding: 14 }}>{RENDER[kind](T)}</div>
    </div>
  )
}
