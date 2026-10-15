// A path to forward someone to on this same site, from something a URL handed
// us (e.g. /auth/handoff's `next`). Shared by the browser and the server.

/**
 * The path itself if it's a relative path on this site ("/admin",
 * "/admin?setup=1"), else ''. Rejects absolute and protocol-relative URLs,
 * backslashes (browsers read "/\evil.com" as "//evil.com"), whitespace and
 * control characters, so it can never send anyone to another site.
 */
export function sameSitePath(raw: unknown): string {
  if (typeof raw !== 'string') return ''
  const s = raw
  if (!s || s.length > 2000) return ''
  if (!s.startsWith('/') || s.startsWith('//')) return ''
  if (/[\\\s]/.test(s)) return ''
  for (let i = 0; i < s.length; i++) { const c = s.charCodeAt(i); if (c < 32 || c === 127) return '' }
  try {
    const base = 'https://same-site.invalid'
    const u = new URL(s, base)
    if (u.origin !== base || u.pathname.startsWith('//')) return ''
    return `${u.pathname}${u.search}${u.hash}`
  } catch { return '' }
}
