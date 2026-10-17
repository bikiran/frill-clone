// Colvy's logo lockup for the sign-in / sign-up / account pages: the app-icon
// mark (public/icon-192.png, the same mark as the marketing nav and the
// colvy.com app header) beside the coral wordmark. Links home by default.

export default function ColvyLogo({ size = 30, href = '/', fontSize, style }: { size?: number; href?: string | null; fontSize?: number; style?: React.CSSProperties }) {
  const inner = (
    <>
      <img src="/icon-192.png" alt="Colvy logo" width={size} height={size} style={{ width: size, height: size, borderRadius: Math.round(size * 0.28), display: 'block', flexShrink: 0 }} />
      <span style={{ fontWeight: 800, fontSize: fontSize ?? Math.round(size * 0.66), color: 'var(--coral, #ff7a6b)', letterSpacing: '-0.01em', lineHeight: 1 }}>Colvy</span>
    </>
  )
  const box: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: Math.round(size * 0.3), textDecoration: 'none', ...style }
  return href
    ? <a href={href} aria-label="Colvy home" style={box}>{inner}</a>
    : <span style={box} aria-label="Colvy" role="img">{inner}</span>
}
