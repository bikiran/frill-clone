// Colour mapping for dark mode. Pages and components set plenty of light
// colours directly (#fff cards, #f4f4f5 fills, #1a1a1a text), which dark mode's
// variables can't reach. components/DarkTheme maps each of them with these
// functions: light backgrounds to dark surfaces, dark text to light text, light
// lines to dark lines. Greys map to a fixed scale; tinted colours keep their hue
// (a pale red note becomes a dark red one, its dark red text a light red).

export type RGBA = { r: number; g: number; b: number; a: number }

// The dark palette (matches the [data-theme="dark"] variables in globals.css).
export const DARK = {
  canvas: '#111113',
  sunken: '#161618',   // was a near-white page or panel tint
  card: '#1c1c1f',     // was white
  fill: '#27272a',     // was a light grey fill (#f4f4f5 and the like)
  fill2: '#2f2f34',    // was a mid-light grey (#e5e7eb)
  strong: '#3f3f46',   // was a darker light grey (#d4d4d8)
  ink: '#ededf0',
  ink2: '#d4d4d8',
  mut: '#a1a1aa',
  border: '#2c2c31',
  border2: '#3a3a40',
}

/** Perceived lightness, 0..1. */
export const lightness = (c: RGBA) => (0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b) / 255
const chroma = (c: RGBA) => Math.max(c.r, c.g, c.b) - Math.min(c.r, c.g, c.b)
const neutral = (c: RGBA) => chroma(c) <= 14

function hsl(c: RGBA) {
  const r = c.r / 255, g = c.g / 255, b = c.b / 255
  const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2
  if (max === min) return { h: 0, s: 0, l }
  const d = max - min
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
  const h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4
  return { h: h * 60, s, l }
}
const hex = (h: string, a: number) => {
  if (a >= 0.999) return h
  const n = parseInt(h.slice(1), 16)
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${+a.toFixed(3)})`
}
const tint = (c: RGBA, s: number, l: number) => {
  const x = hsl(c)
  return `hsla(${Math.round(x.h)}, ${Math.round(Math.min(x.s, 1) * s * 100)}%, ${Math.round(l * 100)}%, ${+c.a.toFixed(3)})`
}

/** A background colour for dark mode, or null to leave it (already dark, or a strong colour). */
export function darkBg(c: RGBA): string | null {
  if (c.a < 0.04) return null
  const l = lightness(c)
  if (l < 0.62) return null
  if (neutral(c)) {
    const to = l >= 0.99 ? DARK.card : l >= 0.965 ? DARK.sunken : l >= 0.925 ? DARK.fill : l >= 0.86 ? DARK.fill2 : DARK.strong
    return hex(to, c.a)
  }
  // Pastels (pale red/green/blue notes and pills) become deep tints of the same hue.
  if (l >= 0.8) return tint(c, 0.55, 0.17)
  return null
}

/** A text colour for dark mode, or null to leave it. */
export function darkText(c: RGBA): string | null {
  if (c.a < 0.04) return null
  const l = lightness(c)
  if (l >= 0.42) return null
  if (neutral(c)) return hex(l < 0.16 ? DARK.ink : l < 0.3 ? DARK.ink2 : DARK.mut, c.a)
  return tint(c, 0.85, 0.72)
}

/** A line colour (borders) for dark mode, or null to leave it. */
export function darkLine(c: RGBA): string | null {
  if (c.a < 0.04) return null
  const l = lightness(c)
  if (l < 0.78) return null
  if (neutral(c)) return hex(l >= 0.88 ? DARK.border : DARK.border2, c.a)
  return tint(c, 0.5, 0.28)
}

/** Light text that sits on a light fill in light mode stays as it is; white stays white. */
export const isWhiteish = (c: RGBA) => neutral(c) && lightness(c) > 0.97
