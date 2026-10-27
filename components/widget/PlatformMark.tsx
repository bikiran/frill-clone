import { PLATFORM_MARKS } from './platform-marks'

/** A platform's logo (Next.js, Shopify…) in its own colour, or `color` to override. */
export default function PlatformMark({ name, size = 16, color }: { name: string; size?: number; color?: string }) {
  const m = PLATFORM_MARKS[name]
  if (!m) return null
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden style={{ flexShrink: 0, display: 'block' }}>
      <path d={m.d} fill={color || m.color} />
    </svg>
  )
}
