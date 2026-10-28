'use client'

import { useId } from 'react'

// The real logo of each channel (Gmail, Google, WhatsApp, Instagram,
// Messenger, realestate.com.au, Colvy's own chat) on a white tile, the way
// Sellio shows its channels. Channels that aren't a brand (SMS, calls, web
// forms, a sending domain) get their own icon on a soft tint. Brand marks are
// from Simple Icons (CC0) and each brand's own logo; colours are the brands'.

export type BrandKey = 'colvy' | 'gmail' | 'google' | 'whatsapp' | 'instagram' | 'messenger' | 'realestate' | 'sms' | 'calls' | 'webform' | 'domain'

const WHATSAPP = 'M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z'
const INSTAGRAM = 'M7.0301.084c-1.2768.0602-2.1487.264-2.911.5634-.7888.3075-1.4575.72-2.1228 1.3877-.6652.6677-1.075 1.3368-1.3802 2.127-.2954.7638-.4956 1.6365-.552 2.914-.0564 1.2775-.0689 1.6882-.0626 4.947.0062 3.2586.0206 3.6671.0825 4.9473.061 1.2765.264 2.1482.5635 2.9107.308.7889.72 1.4573 1.388 2.1228.6679.6655 1.3365 1.0743 2.1285 1.38.7632.295 1.6361.4961 2.9134.552 1.2773.056 1.6884.069 4.9462.0627 3.2578-.0062 3.668-.0207 4.9478-.0814 1.28-.0607 2.147-.2652 2.9098-.5633.7889-.3086 1.4578-.72 2.1228-1.3881.665-.6682 1.0745-1.3378 1.3795-2.1284.2957-.7632.4966-1.636.552-2.9124.056-1.2809.0692-1.6898.063-4.948-.0063-3.2583-.021-3.6668-.0817-4.9465-.0607-1.2797-.264-2.1487-.5633-2.9117-.3084-.7889-.72-1.4568-1.3876-2.1228C21.2982 1.33 20.628.9208 19.8378.6165 19.074.321 18.2017.1197 16.9244.0645 15.6471.0093 15.236-.005 11.977.0014 8.718.0076 8.31.0215 7.0301.0839m.1402 21.6932c-1.17-.0509-1.8053-.2453-2.2287-.408-.5606-.216-.96-.4771-1.3819-.895-.422-.4178-.6811-.8186-.9-1.378-.1644-.4234-.3624-1.058-.4171-2.228-.0595-1.2645-.072-1.6442-.079-4.848-.007-3.2037.0053-3.583.0607-4.848.05-1.169.2456-1.805.408-2.2282.216-.5613.4762-.96.895-1.3816.4188-.4217.8184-.6814 1.3783-.9003.423-.1651 1.0575-.3614 2.227-.4171 1.2655-.06 1.6447-.072 4.848-.079 3.2033-.007 3.5835.005 4.8495.0608 1.169.0508 1.8053.2445 2.228.408.5608.216.96.4754 1.3816.895.4217.4194.6816.8176.9005 1.3787.1653.4217.3617 1.056.4169 2.2263.0602 1.2655.0739 1.645.0796 4.848.0058 3.203-.0055 3.5834-.061 4.848-.051 1.17-.245 1.8055-.408 2.2294-.216.5604-.4763.96-.8954 1.3814-.419.4215-.8181.6811-1.3783.9-.4224.1649-1.0577.3617-2.2262.4174-1.2656.0595-1.6448.072-4.8493.079-3.2045.007-3.5825-.006-4.848-.0608M16.953 5.5864A1.44 1.44 0 1 0 18.39 4.144a1.44 1.44 0 0 0-1.437 1.4424M5.8385 12.012c.0067 3.4032 2.7706 6.1557 6.173 6.1493 3.4026-.0065 6.157-2.7701 6.1506-6.1733-.0065-3.4032-2.771-6.1565-6.174-6.1498-3.403.0067-6.156 2.771-6.1496 6.1738M8 12.0077a4 4 0 1 1 4.008 3.9921A3.9996 3.9996 0 0 1 8 12.0077'
const MESSENGER = 'M.001 11.639C.001 4.949 5.241 0 12.001 0S24 4.95 24 11.639c0 6.689-5.24 11.638-12 11.638-1.21 0-2.38-.16-3.47-.46a.96.96 0 00-.64.05l-2.39 1.05a.96.96 0 01-1.35-.85l-.07-2.14a.97.97 0 00-.32-.68A11.39 11.389 0 01.002 11.64zm8.32-2.19l-3.52 5.6c-.35.53.32 1.139.82.75l3.79-2.87c.26-.2.6-.2.87 0l2.8 2.1c.84.63 2.04.4 2.6-.48l3.52-5.6c.35-.53-.32-1.13-.82-.75l-3.79 2.87c-.25.2-.6.2-.86 0l-2.8-2.1a1.8 1.8 0 00-2.61.48z'

// Not brands: an icon on a soft tint of its own colour.
const PLAIN: Partial<Record<BrandKey, { tint: string; d: string }>> = {
  sms: { tint: '#16a34a', d: 'M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z M8 9h8 M8 13h5' },
  calls: { tint: '#6366f1', d: 'M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.5 2.1L8 9.8a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.7.7a2 2 0 0 1 1.7 2z' },
  webform: { tint: '#0ea5e9', d: 'M4 3h16a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z M7 8h10 M7 12h10 M7 16h6' },
  domain: { tint: '#7c3aed', d: 'M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0z M16 12v1.5a2.5 2.5 0 0 0 5 0V12a9 9 0 1 0-3.5 7.1' },
}

export default function BrandLogo({ brand, size = 44, radius }: { brand: BrandKey; size?: number; radius?: number }) {
  const uid = useId().replace(/:/g, '')
  const r = radius ?? Math.round(size * 0.28)
  const g = Math.round(size * 0.56) // the mark inside the tile
  const plain = PLAIN[brand]
  const tile: React.CSSProperties = {
    width: size, height: size, borderRadius: r, flexShrink: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    background: plain ? `color-mix(in srgb, ${plain.tint} 12%, #fff)` : '#fff',
    boxShadow: plain ? 'none' : '0 0 0 1px rgba(0,0,0,.07), 0 1px 2px rgba(16,24,40,.06)',
  }
  if (plain) return (
    <span style={tile} aria-hidden="true">
      <svg width={g} height={g} viewBox="0 0 24 24" fill="none" stroke={plain.tint} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d={plain.d} /></svg>
    </span>
  )
  let mark: React.ReactNode = null
  switch (brand) {
    case 'colvy':
      // eslint-disable-next-line @next/next/no-img-element
      mark = <img src="/icon-192.png" alt="" width={g + 4} height={g + 4} style={{ borderRadius: Math.round(g * 0.28), display: 'block' }} />
      break
    case 'realestate':
      // eslint-disable-next-line @next/next/no-img-element
      mark = <img src="/logos/realestate.png" alt="" width={g + 4} height={g + 4} style={{ display: 'block' }} />
      break
    case 'gmail':
      mark = (
        <svg width={g} height={g * 0.75} viewBox="52 42 88 66">
          <path fill="#4285f4" d="M58 108h14V74L52 59v43c0 3.32 2.69 6 6 6" />
          <path fill="#34a853" d="M120 108h14c3.32 0 6-2.69 6-6V59l-20 15" />
          <path fill="#fbbc04" d="M120 48v26l20-15v-8c0-7.42-8.47-11.65-14.4-7.2" />
          <path fill="#ea4335" d="M72 74V48l24 18 24-18v26L96 92" />
          <path fill="#c5221f" d="M52 51v8l20 15V48l-5.6-4.2c-5.94-4.45-14.4-.22-14.4 7.2" />
        </svg>
      )
      break
    case 'google':
      mark = (
        <svg width={g} height={g} viewBox="0 0 48 48">
          <path fill="#FBBC05" d="M43.611 20.083H42V20H24v8h11.303c-1.649 4.657-6.08 8-11.303 8-6.627 0-12-5.373-12-12s5.373-12 12-12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 12.955 4 4 12.955 4 24s8.955 20 20 20 20-8.955 20-20c0-1.341-.138-2.65-.389-3.917z" />
          <path fill="#EA4335" d="m6.306 14.691 6.571 4.819C14.655 15.108 18.961 12 24 12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 16.318 4 9.656 8.337 6.306 14.691z" />
          <path fill="#34A853" d="M24 44c5.166 0 9.86-1.977 13.409-5.192l-6.19-5.238A11.91 11.91 0 0 1 24 36c-5.202 0-9.619-3.317-11.283-7.946l-6.522 5.025C9.505 39.556 16.227 44 24 44z" />
          <path fill="#4285F4" d="M43.611 20.083H42V20H24v8h11.303a12.04 12.04 0 0 1-4.087 5.571l.003-.002 6.19 5.238C36.971 39.205 44 34 44 24c0-1.341-.138-2.65-.389-3.917z" />
        </svg>
      )
      break
    case 'whatsapp':
      mark = <svg width={g} height={g} viewBox="0 0 24 24"><path fill="#25D366" d={WHATSAPP} /></svg>
      break
    case 'instagram':
      mark = (
        <svg width={g} height={g} viewBox="0 0 24 24">
          <defs>
            <radialGradient id={`ig${uid}`} cx="30%" cy="107%" r="150%">
              <stop offset="0" stopColor="#fdf497" /><stop offset=".05" stopColor="#fdf497" /><stop offset=".45" stopColor="#fd5949" /><stop offset=".6" stopColor="#d6249f" /><stop offset=".9" stopColor="#285AEB" />
            </radialGradient>
          </defs>
          <path fill={`url(#ig${uid})`} d={INSTAGRAM} />
        </svg>
      )
      break
    case 'messenger':
      mark = (
        <svg width={g} height={g} viewBox="0 0 24 24">
          <defs>
            <radialGradient id={`ms${uid}`} cx="19%" cy="99%" r="109%">
              <stop offset="0" stopColor="#0099FF" /><stop offset=".6" stopColor="#A033FF" /><stop offset=".9" stopColor="#FF5280" /><stop offset="1" stopColor="#FF7061" />
            </radialGradient>
          </defs>
          <path fill={`url(#ms${uid})`} d={MESSENGER} />
        </svg>
      )
      break
  }
  return <span style={tile} aria-hidden="true">{mark}</span>
}
