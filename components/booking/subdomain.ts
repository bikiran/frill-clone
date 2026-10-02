// The tenant slug when the page is served on <slug>.colvy.com, else null.
export function tenantSubdomain(): string | null {
  if (typeof window === 'undefined') return null
  const h = window.location.hostname.toLowerCase()
  if (!h.endsWith('.colvy.com')) return null
  const parts = h.split('.')
  if (parts.length !== 3) return null
  return ['www', 'admin', 'api', 'app'].includes(parts[0]) ? null : parts[0]
}
