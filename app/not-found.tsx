'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'

// Branded, animated 404. Rendered as a fixed full-screen overlay so it looks
// clean regardless of whatever chrome the root layout wraps an unknown route in.
// "Self-recovering": we fuzzy-match the mistyped path against known routes and,
// when we're confident, offer the best match and auto-redirect after a short
// countdown (cancellable). Otherwise we fall back to search + quick links.

const CORAL = '#ff6a4d'

// Curated, human-readable destinations. Used for both matching and quick links.
const ROUTES: { href: string; label: string }[] = [
  { href: '/', label: 'Home' },
  { href: '/product', label: 'Product' },
  { href: '/pricing', label: 'Pricing' },
  { href: '/solutions', label: 'Solutions' },
  { href: '/channels', label: 'Channels' },
  { href: '/channels/meta', label: 'Meta DMs' },
  { href: '/channels/whatsapp', label: 'WhatsApp' },
  { href: '/channels/sms', label: 'SMS & MMS' },
  { href: '/channels/email', label: 'Email' },
  { href: '/channels/chat-widget', label: 'Live chat widget' },
  { href: '/channels/google-reviews', label: 'Google Reviews' },
  { href: '/channels/forms', label: 'Contact forms' },
  { href: '/phones', label: 'Phone system' },
  { href: '/ai-assistant', label: 'AI assistant' },
  { href: '/features', label: 'Features' },
  { href: '/integrations', label: 'Integrations' },
  { href: '/industries', label: 'Industries' },
  { href: '/compare', label: 'Compare' },
  { href: '/about', label: 'About' },
  { href: '/careers', label: 'Careers' },
  { href: '/blog', label: 'Blog' },
  { href: '/changelog', label: 'Changelog' },
  { href: '/security', label: 'Security' },
  { href: '/status', label: 'Status' },
  { href: '/demo', label: 'Book a demo' },
]

// Compact Levenshtein distance for fuzzy path matching.
function lev(a: string, b: string): number {
  const m = a.length, n = b.length
  if (!m) return n
  if (!n) return m
  let prev = Array.from({ length: n + 1 }, (_, i) => i)
  let curr = new Array(n + 1)
  for (let i = 1; i <= m; i++) {
    curr[0] = i
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost)
    }
    ;[prev, curr] = [curr, prev]
  }
  return prev[n]
}

const norm = (p: string) => (p || '').toLowerCase().replace(/\/+$/, '') || '/'

// Best guess for a mistyped path, with a confidence flag.
function bestMatch(path: string): { route: { href: string; label: string }; confident: boolean } | null {
  const target = norm(path)
  if (target === '/') return null
  const lastSeg = target.split('/').filter(Boolean).pop() || ''
  let best: { href: string; label: string } | null = null
  let bestScore = Infinity
  for (const r of ROUTES) {
    if (r.href === '/') continue
    const cand = norm(r.href)
    // Distance on the full path, plus a lighter distance on the last segment so
    // "/chanels/whatsap" still lands near "/channels/whatsapp".
    const candLast = cand.split('/').filter(Boolean).pop() || ''
    const score = Math.min(lev(target, cand), lev(lastSeg, candLast) + 1)
    if (score < bestScore) { bestScore = score; best = r }
  }
  if (!best) return null
  // Confident when the edit distance is small relative to the path length.
  const threshold = Math.max(2, Math.floor(target.replace(/[^a-z0-9]/g, '').length * 0.34))
  return { route: best, confident: bestScore <= threshold }
}

export default function NotFound() {
  const router = useRouter()
  const [query, setQuery] = useState('')
  const [countdown, setCountdown] = useState<number | null>(null)
  const [cancelled, setCancelled] = useState(false)

  // The global App Router not-found renders with usePathname() === '/_not-found',
  // so we read the real mistyped URL from the browser on mount. Empty on the
  // server / first paint; the suggestion resolves once it's set.
  const [pathname, setPathname] = useState('')
  useEffect(() => {
    if (typeof window !== 'undefined') setPathname(window.location.pathname)
  }, [])

  const match = useMemo(() => (pathname ? bestMatch(pathname) : null), [pathname])

  // Auto-recover: when we have a confident guess, count down and redirect.
  useEffect(() => {
    if (!match?.confident || cancelled) return
    setCountdown(5)
    const id = setInterval(() => {
      setCountdown(c => {
        if (c === null) return c
        if (c <= 1) { clearInterval(id); router.replace(match.route.href); return 0 }
        return c - 1
      })
    }, 1000)
    return () => clearInterval(id)
  }, [match, cancelled, router])

  const runSearch = (e: React.FormEvent) => {
    e.preventDefault()
    const q = query.trim().toLowerCase()
    if (!q) return
    const hit = ROUTES.find(r => r.label.toLowerCase().includes(q) || r.href.includes(q))
    router.push(hit ? hit.href : `/product`)
  }

  const suggestions = ROUTES.filter(r => ['/', '/product', '/pricing', '/channels', '/demo'].includes(r.href))

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9999, overflowY: 'auto',
      background: 'radial-gradient(1200px 600px at 15% -10%, #fff1ec 0%, transparent 55%), radial-gradient(1000px 620px at 100% 110%, #eef1ff 0%, transparent 55%), #ffffff',
      fontFamily: '-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif', color: '#0f1119',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '48px 20px',
    }}>
      <style>{`
        @keyframes nfFloat{0%,100%{transform:translateY(0)}50%{transform:translateY(-14px)}}
        @keyframes nfBlob{0%,100%{transform:translate(0,0) scale(1)}50%{transform:translate(24px,-18px) scale(1.08)}}
        @keyframes nfUp{from{opacity:0;transform:translateY(16px)}to{opacity:1;transform:none}}
        @keyframes nfPulse{0%,100%{opacity:.35}50%{opacity:.6}}
        .nf-up{animation:nfUp .6s cubic-bezier(.16,1,.3,1) both}
        .nf-link{transition:transform .18s,box-shadow .18s,background .18s}
        .nf-link:hover{transform:translateY(-2px)}
        .nf-chip:hover{background:#fff !important;box-shadow:0 8px 22px rgba(15,17,25,.08)}
        .nf-field:focus{border-color:${CORAL} !important;box-shadow:0 0 0 4px ${CORAL}22}
      `}</style>

      {/* drifting background blobs */}
      <div aria-hidden style={{ position: 'absolute', top: '8%', left: '10%', width: 260, height: 260, borderRadius: '50%', background: `radial-gradient(circle at 30% 30%, ${CORAL}33, transparent 70%)`, filter: 'blur(6px)', animation: 'nfBlob 9s ease-in-out infinite' }} />
      <div aria-hidden style={{ position: 'absolute', bottom: '6%', right: '8%', width: 320, height: 320, borderRadius: '50%', background: 'radial-gradient(circle at 60% 40%, #2b59ff26, transparent 70%)', filter: 'blur(6px)', animation: 'nfBlob 11s ease-in-out infinite reverse' }} />

      <div style={{ position: 'relative', width: '100%', maxWidth: 620, textAlign: 'center' }}>
        {/* brand */}
        <a href="/" className="nf-up" style={{ display: 'inline-flex', alignItems: 'center', gap: 9, textDecoration: 'none', marginBottom: 30 }}>
          <span style={{ width: 34, height: 34, borderRadius: 10, background: CORAL, color: '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900, fontSize: 18 }}>C</span>
          <span style={{ fontSize: 20, fontWeight: 900, letterSpacing: '-0.02em', color: '#0f1119' }}>Colvy</span>
        </a>

        {/* animated 404 */}
        <div className="nf-up" style={{ animationDelay: '.05s', position: 'relative', display: 'inline-block', margin: '0 auto 6px' }}>
          <div style={{ fontSize: 'clamp(96px, 22vw, 168px)', fontWeight: 900, lineHeight: 1, letterSpacing: '-0.05em', background: `linear-gradient(120deg, ${CORAL}, #ff9a3d 55%, #2b59ff)`, WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent', animation: 'nfFloat 5s ease-in-out infinite' }}>404</div>
          <div aria-hidden style={{ position: 'absolute', left: '50%', bottom: -6, transform: 'translateX(-50%)', width: '58%', height: 18, borderRadius: '50%', background: 'rgba(15,17,25,0.14)', filter: 'blur(9px)', animation: 'nfPulse 5s ease-in-out infinite' }} />
        </div>

        <h1 className="nf-up" style={{ animationDelay: '.1s', fontSize: 'clamp(24px, 4.5vw, 34px)', fontWeight: 900, letterSpacing: '-0.03em', margin: '10px 0 8px' }}>This page went off-thread</h1>
        <p className="nf-up" style={{ animationDelay: '.15s', fontSize: 16, color: 'rgba(15,17,25,0.6)', margin: '0 auto 26px', maxWidth: 460, lineHeight: 1.55 }}>
          We couldn’t find {pathname ? <code style={{ background: '#f3f4f8', padding: '2px 7px', borderRadius: 6, fontSize: 13.5, color: '#0f1119', wordBreak: 'break-all' }}>{norm(pathname)}</code> : 'that page'}. Let’s get you back on track.
        </p>

        {/* self-recovery suggestion */}
        {match && (
          <div className="nf-up" style={{ animationDelay: '.2s', maxWidth: 460, margin: '0 auto 22px', padding: '16px 18px', borderRadius: 16, background: '#fff', border: '1px solid rgba(15,17,25,0.08)', boxShadow: '0 12px 30px rgba(15,17,25,0.06)', textAlign: 'left' }}>
            <div style={{ fontSize: 12.5, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.04em', color: CORAL, marginBottom: 6 }}>Did you mean</div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
              <a href={match.route.href} className="nf-link" style={{ fontSize: 17, fontWeight: 800, color: '#0f1119', textDecoration: 'none' }}>
                {match.route.label} <span style={{ color: 'rgba(15,17,25,0.4)', fontWeight: 600 }}>· {match.route.href}</span>
              </a>
              <a href={match.route.href} className="nf-link" style={{ padding: '9px 16px', borderRadius: 10, background: CORAL, color: '#fff', fontWeight: 800, fontSize: 14, textDecoration: 'none', boxShadow: `0 8px 20px ${CORAL}44` }}>Go now →</a>
            </div>
            {countdown !== null && !cancelled && (
              <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, color: 'rgba(15,17,25,0.6)' }}>
                <span>Taking you there in <strong style={{ color: '#0f1119' }}>{countdown}s</strong></span>
                <button onClick={() => { setCancelled(true); setCountdown(null) }} style={{ border: 'none', background: 'transparent', color: CORAL, fontWeight: 800, fontSize: 13, cursor: 'pointer', padding: 0 }}>Stay here</button>
                <span aria-hidden style={{ flex: 1, height: 4, borderRadius: 4, background: '#f0f1f5', overflow: 'hidden' }}>
                  <span style={{ display: 'block', height: '100%', width: `${(countdown / 5) * 100}%`, background: CORAL, transition: 'width 1s linear' }} />
                </span>
              </div>
            )}
          </div>
        )}

        {/* search */}
        <form onSubmit={runSearch} className="nf-up" style={{ animationDelay: '.25s', display: 'flex', gap: 8, maxWidth: 460, margin: '0 auto 22px' }}>
          <input
            className="nf-field"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search Colvy — pricing, channels, WhatsApp…"
            aria-label="Search"
            style={{ flex: 1, padding: '12px 15px', borderRadius: 12, border: '1px solid rgba(15,17,25,0.14)', fontSize: 14.5, outline: 'none', fontFamily: 'inherit', background: '#fff', color: '#0f1119' }}
          />
          <button type="submit" className="nf-link" style={{ padding: '12px 20px', borderRadius: 12, background: '#0f1119', color: '#fff', border: 'none', fontWeight: 800, fontSize: 14.5, cursor: 'pointer' }}>Search</button>
        </form>

        {/* quick links */}
        <div className="nf-up" style={{ animationDelay: '.3s', display: 'flex', gap: 9, flexWrap: 'wrap', justifyContent: 'center' }}>
          {suggestions.map(s => (
            <a key={s.href} href={s.href} className="nf-chip nf-link" style={{ padding: '9px 15px', borderRadius: 999, background: '#f6f7fb', color: '#0f1119', textDecoration: 'none', fontWeight: 700, fontSize: 13.5, border: '1px solid rgba(15,17,25,0.06)' }}>{s.label}</a>
          ))}
        </div>

        <p className="nf-up" style={{ animationDelay: '.35s', marginTop: 28, fontSize: 13, color: 'rgba(15,17,25,0.5)' }}>
          Still stuck? Email <a href="mailto:support@colvy.com" style={{ color: CORAL, textDecoration: 'none', fontWeight: 700 }}>support@colvy.com</a>
        </p>
      </div>
    </div>
  )
}
