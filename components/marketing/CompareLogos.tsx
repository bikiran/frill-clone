// Colvy's mark beside a competitor's, for the /compare hub cards and each
// comparison's hero. Each competitor logo is that company's own site icon
// (its favicon or app icon, from its own website), used only to name the
// product being compared. A competitor without a logo file here shows its
// initial on its accent colour instead.

/* eslint-disable @next/next/no-img-element */

type Logo = { src: string; fit?: 'cover'; scale?: number }

// fit 'cover': the file is already a full app-icon square (it fills the tile).
// Otherwise the mark sits on a white tile, at `scale` of the default size.
const LOGOS: Record<string, Logo> = {
  podium: { src: '/logos/compare/podium.png' },
  gorgias: { src: '/logos/compare/gorgias.png', fit: 'cover' },
  gladly: { src: '/logos/compare/gladly.png' },
  intercom: { src: '/logos/intercom.svg', fit: 'cover' },
  zendesk: { src: '/logos/zendesk.svg', fit: 'cover' },
  freshdesk: { src: '/logos/compare/freshdesk.png' },
  coax: { src: '/logos/compare/coax.png' },
  highlevel: { src: '/logos/compare/highlevel.svg', scale: 0.9 },
  salesforce: { src: '/logos/compare/salesforce.png', scale: 1.22 },
  birdeye: { src: '/logos/compare/birdeye.svg' },
}

export const hasCompetitorLogo = (slug: string) => !!LOGOS[slug]

function Tile({ size, ring, children, bg = '#fff', clip = false, edge }: { size: number; ring?: string; children: React.ReactNode; bg?: string; clip?: boolean; edge?: string }) {
  return (
    <span style={{
      position: 'relative', width: size, height: size, borderRadius: Math.round(size * 0.3), flexShrink: 0,
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: bg, overflow: clip ? 'hidden' : 'visible',
      boxShadow: `${ring ? `0 0 0 ${Math.max(2, Math.round(size / 18))}px ${ring}, ` : ''}${edge ? `0 0 0 1px ${edge}, ` : ''}0 0 0 1px rgba(15,17,25,0.07) inset, 0 2px 6px rgba(15,17,25,0.08)`,
    }}>{children}</span>
  )
}

/** One competitor's logo tile (or its initial when there's no logo). */
export function CompetitorLogo({ slug, name, accent, size = 42, ring }: { slug: string; name: string; accent: string; size?: number; ring?: string }) {
  const logo = LOGOS[slug]
  if (!logo) {
    return (
      <Tile size={size} ring={ring} bg={`color-mix(in srgb, ${accent} 12%, #fff)`}>
        <span aria-label={name} style={{ color: accent, fontWeight: 900, fontSize: Math.round(size * 0.42) }}>{name.charAt(0)}</span>
      </Tile>
    )
  }
  if (logo.fit === 'cover') {
    return <Tile size={size} ring={ring} clip><img src={logo.src} alt={`${name} logo`} width={size} height={size} loading="lazy" decoding="async" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} /></Tile>
  }
  const inner = Math.round(size * 0.64 * (logo.scale || 1))
  return <Tile size={size} ring={ring} clip><img src={logo.src} alt={`${name} logo`} width={inner} height={inner} loading="lazy" decoding="async" style={{ width: inner, height: inner, objectFit: 'contain', display: 'block' }} /></Tile>
}

/** Colvy's tile and the competitor's: overlapping ('stack', the hub cards) or with "vs" between ('vs', the hero). */
export function VsLogos({ slug, name, accent, size = 42, ring = '#fff', variant = 'stack', muted = '#6b7280' }: {
  slug: string; name: string; accent: string; size?: number; ring?: string; variant?: 'stack' | 'vs'; muted?: string
}) {
  const colvy = (
    // A faint light edge so Colvy's dark tile still reads on dark pages (invisible on light ones).
    <Tile size={size} clip bg="#0f1119" edge="rgba(255,255,255,0.16)">
      <img src="/icon-192.png" alt="Colvy logo" width={size} height={size} loading="lazy" decoding="async" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
    </Tile>
  )
  if (variant === 'vs') {
    return (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: Math.round(size * 0.24) }}>
        {colvy}
        <span style={{ fontSize: Math.round(size * 0.3), fontWeight: 800, color: muted, letterSpacing: '0.02em' }}>vs</span>
        <CompetitorLogo slug={slug} name={name} accent={accent} size={size} />
      </span>
    )
  }
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center' }}>
      {colvy}
      <span style={{ marginLeft: -Math.round(size * 0.24), display: 'inline-flex' }}>
        <CompetitorLogo slug={slug} name={name} accent={accent} size={size} ring={ring} />
      </span>
    </span>
  )
}
