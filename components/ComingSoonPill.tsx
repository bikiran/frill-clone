import { isComingSoon, type ComingSoonKey } from '@/lib/feature-availability'

// A small "Coming soon" pill for features that aren't live yet. Renders
// nothing once the feature is switched on in lib/feature-availability.ts.
export default function ComingSoonPill({ feature, color = '#b45309', style }: { feature: ComingSoonKey; color?: string; style?: React.CSSProperties }) {
  if (!isComingSoon(feature)) return null
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', padding: '3px 9px', borderRadius: 999, background: color + '1f', color, fontSize: 11, fontWeight: 800, letterSpacing: '0.04em', textTransform: 'uppercase', whiteSpace: 'nowrap', verticalAlign: 'middle', ...style }}>
      Coming soon
    </span>
  )
}
