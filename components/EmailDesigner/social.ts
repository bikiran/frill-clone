// Social links in a campaign email: the networks, what each link looks like,
// and turning whatever the owner types or pastes ("@roxyaquarium",
// "facebook.com/roxy", "0412 345 678" for WhatsApp, a full link) into the
// https link the email uses. Shared by the designer (browser) and the
// renderer (browser and server).

import type { SocialLink, SocialLook } from './types'

export type Network = SocialLink['network']

/** In the order the designer offers them. */
export const SOCIAL_NETWORKS: Network[] = ['facebook', 'instagram', 'tiktok', 'youtube', 'x', 'linkedin', 'pinterest', 'threads', 'whatsapp', 'website']

type Info = {
  label: string
  /** What to type, shown in the empty field. */
  placeholder: string
  /** Its sites (host, without www.). */
  hosts?: RegExp
  /** A bare handle's link. */
  handle?: (h: string) => string
}

export const SOCIAL: Record<Network, Info> = {
  facebook: { label: 'Facebook', placeholder: 'facebook.com/yourpage', hosts: /(^|\.)(facebook\.com|fb\.com|fb\.me)$/, handle: h => `https://www.facebook.com/${h}` },
  instagram: { label: 'Instagram', placeholder: '@yourshop', hosts: /(^|\.)(instagram\.com|instagr\.am)$/, handle: h => `https://www.instagram.com/${h}` },
  tiktok: { label: 'TikTok', placeholder: '@yourshop', hosts: /(^|\.)tiktok\.com$/, handle: h => `https://www.tiktok.com/@${h}` },
  youtube: { label: 'YouTube', placeholder: '@yourchannel', hosts: /(^|\.)(youtube\.com|youtu\.be)$/, handle: h => `https://www.youtube.com/@${h}` },
  x: { label: 'X', placeholder: '@yourshop', hosts: /(^|\.)(x\.com|twitter\.com)$/, handle: h => `https://x.com/${h}` },
  linkedin: { label: 'LinkedIn', placeholder: 'linkedin.com/company/yourshop', hosts: /(^|\.)linkedin\.com$/, handle: h => `https://www.linkedin.com/company/${h}` },
  pinterest: { label: 'Pinterest', placeholder: '@yourshop', hosts: /(^|\.)(pinterest\.[a-z.]{2,7}|pin\.it)$/, handle: h => `https://www.pinterest.com/${h}` },
  threads: { label: 'Threads', placeholder: '@yourshop', hosts: /(^|\.)threads\.(net|com)$/, handle: h => `https://www.threads.net/@${h}` },
  whatsapp: { label: 'WhatsApp', placeholder: 'Your mobile, like 0412 345 678', hosts: /(^|\.)(wa\.me|whatsapp\.com)$/ },
  website: { label: 'Website', placeholder: 'yourshop.com.au' },
}

/** Links one block can hold (every network, plus a couple of extras). */
export const MAX_SOCIAL_LINKS = 12

export const isNetwork = (v: unknown): v is Network => typeof v === 'string' && (SOCIAL_NETWORKS as string[]).includes(v)

/** The looks: logos on the network's colour, dark, light, or the names as pills. */
export const SOCIAL_LOOKS: { id: SocialLook; label: string }[] = [
  { id: 'brand', label: 'Colour' },
  { id: 'dark', label: 'Dark' },
  { id: 'light', label: 'Light' },
  { id: 'text', label: 'Names' },
]
export const socialLook = (v: unknown): SocialLook => (v === 'dark' || v === 'light' || v === 'text' ? v : 'brand')

/** The icon's path on Colvy's site (public/email/social, made by scripts/gen-social-icons.mjs). */
export const socialIconPath = (network: Network, look: SocialLook = 'brand') =>
  `/email/social/${look === 'text' ? 'brand' : look}/${isNetwork(network) ? network : 'website'}.png`

const hostOf = (s: string): string => {
  const m = s.trim().match(/^(?:https?:\/\/)?([^/?#\s:@]+\.[^/?#\s:@]+)(?::\d+)?(?:[/?#]|$)/i)
  return m ? m[1].toLowerCase().replace(/^(www|m|mobile)\./, '') : ''
}

/** The network a link belongs to, from its site; null for any other site. */
export function detectNetwork(raw: string): Network | null {
  const host = hostOf(raw)
  if (!host) return null
  for (const n of SOCIAL_NETWORKS) if (SOCIAL[n].hosts?.test(host)) return n
  return null
}

/** An Australian mobile (or any number in international form) as a wa.me link. */
function whatsappLink(raw: string): string {
  const digits = raw.replace(/[^\d+]/g, '')
  if (/^\+?\d{8,15}$/.test(digits)) {
    let d = digits.replace(/^\+/, '')
    if (/^04\d{8}$/.test(d)) d = `61${d.slice(1)}`        // 0412 345 678
    else if (/^4\d{8}$/.test(d)) d = `61${d}`             // 412 345 678
    else if (!digits.startsWith('+') && !/^61\d{9}$/.test(d)) return ''
    return `https://wa.me/${d}`
  }
  return ''
}

const SAFE = /^https:\/\/[a-z0-9.-]+\.[a-z]{2,}(?::\d+)?(?:[/?#][^\s"'<>\\]*)?$/i

/**
 * The https link for what was typed in a network's field, or '' when it can't
 * be one. A handle ("@roxy", "roxy.aquarium") becomes the network's page; a
 * link without https:// gets it.
 */
export function socialUrl(network: Network, raw: unknown): string {
  let s = String(raw ?? '').trim()
  if (!s) return ''
  if (network === 'whatsapp' && !/[a-z]{2,}\.[a-z]/i.test(s)) return whatsappLink(s)
  const info = SOCIAL[network] || SOCIAL.website
  const looksLikeLink = /^https?:\/\//i.test(s) || /^www\./i.test(s) || s.includes('/') || !!detectNetwork(s)
  if (info.handle && !looksLikeLink) {
    // A handle: letters, numbers, dots, dashes and underscores.
    const h = s.replace(/^@+/, '')
    return /^[A-Za-z0-9._-]{1,60}$/.test(h) ? info.handle(h) : ''
  }
  if (/^http:\/\//i.test(s)) s = s.replace(/^http:\/\//i, 'https://')
  else if (!/^https:\/\//i.test(s)) s = `https://${s.replace(/^\/+/, '')}`
  return SAFE.test(s) ? s : ''
}

/** The link to show back to the owner: no https://www. */
export const prettyUrl = (u: string) => u.replace(/^https?:\/\//i, '').replace(/^www\./i, '').replace(/\/$/, '')
