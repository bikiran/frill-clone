'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'

export default function LegalPage({ slug }: { slug: 'privacy' | 'terms' }) {
  const [page, setPage] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    ;(async () => {
      try {
        const { data } = await (supabase as any)
          .from('legal_pages').select('*')
          .eq('slug', slug).is('company_id', null).maybeSingle()
        setPage(data)
      } catch {} finally { setLoading(false) }
    })()
  }, [slug])

  const title = page?.title || (slug === 'privacy' ? 'Privacy Policy' : 'Terms of Service')
  const sections: any[] = page?.sections || []

  return (
    <div style={{ minHeight: '100vh', background: '#fff', color: '#1a1a1a', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' }}>
      {/* Nav */}
      <nav style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '18px 24px', maxWidth: 900, margin: '0 auto' }}>
        <Link href="/" style={{ fontWeight: 800, fontSize: 20, color: '#1a1a1a', textDecoration: 'none' }}>Colvy</Link>
        <div style={{ display: 'flex', gap: 18, fontSize: 14 }}>
          <Link href="/pricing" style={{ color: '#6b7280', textDecoration: 'none' }}>Pricing</Link>
          <Link href="/signin" style={{ color: '#6b7280', textDecoration: 'none' }}>Sign in</Link>
        </div>
      </nav>

      <div style={{ maxWidth: 760, margin: '0 auto', padding: '40px 24px 80px' }}>
        <h1 style={{ fontSize: 40, fontWeight: 800, margin: '0 0 8px', letterSpacing: '-0.02em' }}>{title}</h1>
        {page?.updated_at && (
          <p style={{ fontSize: 13, color: '#9ca3af', margin: '0 0 40px' }}>
            Last edited {new Date(page.updated_at).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })}
          </p>
        )}

        {loading ? (
          <p style={{ color: '#9ca3af' }}>Loading…</p>
        ) : sections.length === 0 ? (
          <p style={{ color: '#6b7280' }}>This page hasn’t been written yet.</p>
        ) : (
          sections.map((s, i) => (
            <section key={i} style={{ marginBottom: 32 }}>
              {s.heading && <h2 style={{ fontSize: 22, fontWeight: 700, margin: '0 0 10px' }}>{s.heading}</h2>}
              {(s.body || '').split('\n').filter(Boolean).map((para: string, j: number) => (
                <p key={j} style={{ fontSize: 15.5, lineHeight: 1.7, color: '#374151', margin: '0 0 12px' }}>{para}</p>
              ))}
            </section>
          ))
        )}
      </div>

      <footer style={{ borderTop: '1px solid #f0f0f0', padding: '28px 24px', textAlign: 'center', fontSize: 13, color: '#9ca3af' }}>
        <div style={{ display: 'flex', gap: 18, justifyContent: 'center', marginBottom: 10 }}>
          <Link href="/privacy" style={{ color: '#6b7280', textDecoration: 'none' }}>Privacy</Link>
          <Link href="/terms" style={{ color: '#6b7280', textDecoration: 'none' }}>Terms</Link>
          <Link href="/pricing" style={{ color: '#6b7280', textDecoration: 'none' }}>Pricing</Link>
        </div>
        © {new Date().getFullYear()} Colvy. All rights reserved.
      </footer>
    </div>
  )
}
