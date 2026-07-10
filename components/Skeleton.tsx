'use client'

// Lightweight shimmering skeleton blocks for loading states.
export function Skeleton({ width = '100%', height = 16, radius = 8, style = {} }: { width?: number | string; height?: number; radius?: number; style?: React.CSSProperties }) {
  return (
    <div style={{ width, height, borderRadius: radius, background: 'linear-gradient(90deg, #eee 25%, #f5f5f5 50%, #eee 75%)', backgroundSize: '200% 100%', animation: 'colvy-shimmer 1.4s ease-in-out infinite', ...style }} />
  )
}

// A skeleton shaped like a list of rows (avatar + two lines).
export function SkeletonList({ rows = 6 }: { rows?: number }) {
  return (
    <div style={{ padding: 20 }}>
      <style>{`@keyframes colvy-shimmer { 0% { background-position: 200% 0 } 100% { background-position: -200% 0 } }`}</style>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} style={{ display: 'flex', gap: 14, alignItems: 'center', marginBottom: 20 }}>
          <Skeleton width={44} height={44} radius={22} />
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <Skeleton width={'45%'} height={13} />
            <Skeleton width={'70%'} height={11} />
          </div>
        </div>
      ))}
    </div>
  )
}

// A skeleton shaped like a grid of cards.
export function SkeletonCards({ cards = 6 }: { cards?: number }) {
  return (
    <div style={{ padding: 20, display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 16 }}>
      <style>{`@keyframes colvy-shimmer { 0% { background-position: 200% 0 } 100% { background-position: -200% 0 } }`}</style>
      {Array.from({ length: cards }).map((_, i) => (
        <div key={i} style={{ border: '1px solid var(--border)', borderRadius: 14, padding: 18, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <Skeleton width={38} height={38} radius={9} />
            <Skeleton width={'50%'} height={14} />
          </div>
          <Skeleton width={'100%'} height={11} />
          <Skeleton width={'80%'} height={11} />
        </div>
      ))}
    </div>
  )
}
