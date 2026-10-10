// Prexty's own logo mark and colours, for anywhere Colvy shows Prexty POS data.

export const PREXTY = {
  red: '#ef1e24',      // the logo's red
  deep: '#750505',     // the logo's shadow
  ink: '#b5121a',      // red text on the light tint
  tint: '#fff5f5',
  tint2: '#ffe5e6',
  border: '#fbc8ca',
}

export default function PrextyMark({ size = 16, title }: { size?: number; title?: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src="/logos/prexty-mark.png" alt={title || 'Prexty'} title={title} width={size} height={size}
      style={{ width: size, height: size, objectFit: 'contain', flexShrink: 0, display: 'inline-block' }} />
  )
}
