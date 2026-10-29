// How each AI agent looks: a face shape and a colour, or a photo. Each
// workspace can change them on the AI agents page; until then every agent has
// its own default. Shared by the page and /api/agent/settings (pilot.ts), so
// what's saved is always something the page can draw.

import { BUDDY_SHAPES, type BuddyShape } from '@/lib/buddy-shapes'

export type AgentFace = { shape: BuddyShape; color: string; photo?: string | null }
export type AgentFaces = Record<string, AgentFace>

export const AGENT_FACE_KEYS = ['support', 'reception', 'reputation', 'sales', 'operations'] as const

export const DEFAULT_AGENT_FACES: AgentFaces = {
  support: { shape: 'star', color: '#2b59ff' },
  reception: { shape: 'squircle', color: '#00b386' },
  reputation: { shape: 'flower', color: '#d97706' },
  sales: { shape: 'blob', color: '#ff6a4d' },
  operations: { shape: 'pillow', color: '#7c5cff' },
}

export const faceFor = (key: string, faces?: AgentFaces | null): AgentFace =>
  ({ ...(DEFAULT_AGENT_FACES[key] || DEFAULT_AGENT_FACES.support), ...(faces?.[key] || {}) })

const HEX = /^#[0-9a-f]{6}$/i

/** Only known agents, known shapes, #rrggbb colours and https photo links. */
export function cleanFaces(raw: any): AgentFaces {
  const out: AgentFaces = {}
  if (!raw || typeof raw !== 'object') return out
  for (const k of AGENT_FACE_KEYS) {
    const f = raw[k]
    if (!f || typeof f !== 'object') continue
    const shape = BUDDY_SHAPES.includes(f.shape) ? f.shape : DEFAULT_AGENT_FACES[k].shape
    const color = HEX.test(String(f.color || '')) ? String(f.color).toLowerCase() : DEFAULT_AGENT_FACES[k].color
    const photo = typeof f.photo === 'string' && /^https:\/\/[^\s"'<>]{4,600}$/.test(f.photo) ? f.photo : null
    out[k] = photo ? { shape, color, photo } : { shape, color }
  }
  return out
}

// The colour slider: a hue, at a saturation and lightness that keep the white
// eyes readable.
export function hueToHex(h: number): string {
  const s = 0.82, l = 0.56
  const k = (n: number) => (n + h / 30) % 12
  const a = s * Math.min(l, 1 - l)
  const c = (n: number) => Math.round(255 * (l - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1))))
  return '#' + [c(0), c(8), c(4)].map(v => v.toString(16).padStart(2, '0')).join('')
}

export function hexToHue(hex: string): number {
  const m = HEX.test(hex) ? hex : '#ff6a4d'
  const [r, g, b] = [1, 3, 5].map(i => parseInt(m.slice(i, i + 2), 16) / 255)
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min
  if (!d) return 0
  const h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4
  return Math.round((h * 60 + 360) % 360)
}
