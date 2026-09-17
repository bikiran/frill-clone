'use client'

import React from 'react'

// On-brand product-UI mockups rendered in the marketing hero frames — one
// realistic screen per feature, built from shared primitives so they read as a
// single design system and stay razor-sharp on any display (no stock photos).
// Theme-aware (light/dark) and tinted with each page's accent colour.

export type MockKind =
  | 'inbox' | 'crm' | 'gallery' | 'notes' | 'orders' | 'payments' | 'links'
  | 'insights' | 'calendar' | 'tasks' | 'broadcasts' | 'automation'
  | 'ideas' | 'roadmap' | 'announcements' | 'kb'

const TITLES: Record<MockKind, string> = {
  inbox: 'Shared inbox', crm: 'Customer profile', gallery: 'Media gallery', notes: 'Internal notes',
  orders: 'Orders', payments: 'Payments', links: 'Link analytics', insights: 'Insights',
  calendar: 'Calendar', tasks: 'Tasks', broadcasts: 'Broadcast', automation: 'Automation',
  ideas: 'Ideas board', roadmap: 'Roadmap', announcements: 'Changelog', kb: 'Help centre',
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
        {['Placed order #1043', 'Replied on WhatsApp', 'Left a 5★ review'].map((t, i) => (
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
      <div style={{ display: 'flex', gap: 6 }}>{['SMS', 'WhatsApp', 'Email'].map((c, i) => <Chip key={c} bg={i === 0 ? T.accent : T.panel} fg={i === 0 ? '#fff' : T.sub}>{c}</Chip>)}</div>
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
  const rows = [['New', T.accent, 'Shipped: WhatsApp broadcasts'], ['Improved', '#10b981', 'Faster inbox search'], ['Fixed', '#6b7280', 'Order webhook retries']] as const
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
  ideas: Ideas, announcements: Announcements, kb: Kb,
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
