'use client'

import { useId } from 'react'

// Channel icons for the marketing demos: as a small filled badge (white glyph
// on the channel's colour, for the corner of an avatar) or as the coloured
// glyph on its own (for a tile). Website chat is Colvy's own mark.

export type ChannelKey = 'chat' | 'instagram' | 'messenger' | 'sms' | 'email' | 'phone'

export const CHANNEL_LABEL: Record<ChannelKey, string> = {
  chat: 'Website chat', instagram: 'Instagram', messenger: 'Messenger', sms: 'SMS', email: 'Email', phone: 'Phone call',
}

const FILL: Record<ChannelKey, string> = {
  chat: '#ff6a4d',
  instagram: 'radial-gradient(circle at 30% 107%, #fdf497 0%, #fdf497 5%, #fd5949 45%, #d6249f 60%, #285aeb 90%)',
  messenger: 'linear-gradient(45deg, #0099ff, #a033ff 60%, #ff5280)',
  sms: '#22c55e',
  email: '#2563eb',
  phone: '#7c3aed',
}

const INSTAGRAM = 'M12 2.16c3.2 0 3.58.01 4.85.07 1.17.05 1.8.25 2.23.41.56.22.96.48 1.38.9.42.42.68.82.9 1.38.16.42.36 1.06.41 2.23.06 1.27.07 1.65.07 4.85s-.01 3.58-.07 4.85c-.05 1.17-.25 1.8-.41 2.23-.22.56-.48.96-.9 1.38-.42.42-.82.68-1.38.9-.42.16-1.06.36-2.23.41-1.27.06-1.65.07-4.85.07s-3.58-.01-4.85-.07c-1.17-.05-1.8-.25-2.23-.41a3.7 3.7 0 0 1-1.38-.9 3.7 3.7 0 0 1-.9-1.38c-.16-.42-.36-1.06-.41-2.23C2.17 15.58 2.16 15.2 2.16 12s.01-3.58.07-4.85c.05-1.17.25-1.8.41-2.23.22-.56.48-.96.9-1.38.42-.42.82-.68 1.38-.9.42-.16 1.06-.36 2.23-.41C8.42 2.17 8.8 2.16 12 2.16Zm0 3.68A6.16 6.16 0 1 0 18.16 12 6.16 6.16 0 0 0 12 5.84Zm0 10.16A4 4 0 1 1 16 12a4 4 0 0 1-4 4Zm6.4-10.4a1.44 1.44 0 1 0 1.44 1.44 1.44 1.44 0 0 0-1.44-1.44Z'
const MESSENGER = 'M12 2C6.36 2 2 6.13 2 11.7c0 2.91 1.19 5.44 3.14 7.17.16.14.26.35.27.57l.05 1.78c.02.57.6.94 1.12.71l1.99-.88c.17-.07.36-.09.54-.04.91.25 1.88.39 2.89.39 5.64 0 10-4.13 10-9.7S17.64 2 12 2Zm6 7.46-2.93 4.67c-.47.74-1.47.93-2.17.4l-2.33-1.75a.6.6 0 0 0-.72 0l-3.15 2.4c-.42.32-.97-.18-.69-.63l2.93-4.67c.47-.74 1.47-.93 2.17-.4l2.33 1.75a.6.6 0 0 0 .72 0l3.15-2.4c.42-.32.97.18.69.63Z'
const STROKE: Partial<Record<ChannelKey, string>> = {
  chat: 'M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z',
  sms: 'M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z M8 9h8 M8 13h5',
  email: 'M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z M22 6l-10 7L2 6',
  phone: 'M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z',
}
const INK: Partial<Record<ChannelKey, string>> = { sms: '#16a34a', email: '#2563eb', phone: '#7c3aed' }

export default function ChannelGlyph({ ch, size = 24, badge = false, ring }: {
  ch: ChannelKey
  size?: number
  /** A filled circle with a white glyph, for the corner of an avatar. */
  badge?: boolean
  /** Badge outline colour (the background it sits on). */
  ring?: string
}) {
  const gid = 'cg' + useId().replace(/[^a-zA-Z0-9_-]/g, '')

  if (badge) {
    const g = Math.round(size * 0.6)
    return (
      <span aria-hidden="true" style={{ width: size, height: size, borderRadius: '50%', background: FILL[ch], display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, boxShadow: ring ? `0 0 0 2px ${ring}` : undefined }}>
        <svg width={g} height={g} viewBox="0 0 24 24" aria-hidden="true">
          {ch === 'instagram' ? <path d={INSTAGRAM} fill="#fff" />
            : ch === 'messenger' ? <path d={MESSENGER} fill="#fff" />
            : <path d={STROKE[ch]} fill="none" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />}
        </svg>
      </span>
    )
  }

  if (ch === 'chat') return <img src="/icon-192.png" alt="" width={size} height={size} style={{ width: size, height: size, borderRadius: size * 0.26, display: 'block' }} />
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" style={{ display: 'block' }}>
      {ch === 'instagram' && (<>
        <defs><radialGradient id={gid} cx="0.3" cy="1.07" r="1.3"><stop offset="0" stopColor="#fdf497" /><stop offset="0.05" stopColor="#fdf497" /><stop offset="0.45" stopColor="#fd5949" /><stop offset="0.6" stopColor="#d6249f" /><stop offset="0.9" stopColor="#285aeb" /></radialGradient></defs>
        <path d={INSTAGRAM} fill={`url(#${gid})`} />
      </>)}
      {ch === 'messenger' && (<>
        <defs><linearGradient id={gid} x1="0" y1="1" x2="1" y2="0"><stop offset="0" stopColor="#0099ff" /><stop offset="0.6" stopColor="#a033ff" /><stop offset="1" stopColor="#ff5280" /></linearGradient></defs>
        <path d={MESSENGER} fill={`url(#${gid})`} />
      </>)}
      {STROKE[ch] && <path d={STROKE[ch]} fill="none" stroke={INK[ch]} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />}
    </svg>
  )
}
