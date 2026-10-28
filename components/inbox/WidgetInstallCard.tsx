'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import PlatformMark from '@/components/widget/PlatformMark'
import { useWidgetInstall } from '@/components/widget/useWidgetInstall'
import { isLocalHost } from '@/lib/widget-install'

const LOGOS = ['react', 'nextjs', 'wordpress', 'shopify', 'vue', 'webflow', 'wix']
const key = (companyId: string) => `colvy_install_card:${companyId}`

// "Install your chat widget", at the foot of the conversation list until the
// chat widget is live on their website (lib/widget-install). Folds down to
// one line with the dash, and that line can be closed for good. Shown only
// once Colvy can tell (the COLVY_V421 migration has run), so nobody is told
// to install a widget that's already there.
export default function WidgetInstallCard({ companyId, dock = false }: {
  companyId: string | null
  /** At the foot of a flex column: pushed to the bottom, with room below for the + button. */
  dock?: boolean
}) {
  const { data } = useWidgetInstall(companyId)
  const [fold, setFold] = useState<'open' | 'min' | 'hidden' | null>(null)
  useEffect(() => {
    if (!companyId) return
    try { const v = localStorage.getItem(key(companyId)); setFold(v === 'min' || v === 'hidden' ? v : 'open') } catch { setFold('open') }
  }, [companyId])
  const set = (v: 'open' | 'min' | 'hidden') => { setFold(v); try { if (companyId) localStorage.setItem(key(companyId), v) } catch {} }

  if (!companyId || !data?.tracking || data.state === 'live' || !fold || fold === 'hidden') return null
  const real = data.sites.find(s => !isLocalHost(s.host))
  const pill = data.state === 'stale' ? 'Not seen lately' : data.state === 'testing' ? 'Testing only' : 'Not connected'
  const title = data.state === 'stale' ? 'Is your chat widget still on?' : 'Install your chat widget'
  const line = data.state === 'stale' ? `It hasn’t loaded on ${real?.host || 'your site'} for a while. Check it’s still on your website.`
    : data.state === 'testing' ? 'It works while you test. Add it to your live website so visitors can chat with you.'
    : 'Add Colvy to your website so visitors can chat with you and your AI agent.'

  const Pill = (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, height: 26, padding: '0 11px 0 8px', borderRadius: 999, background: '#fdebd3', color: '#b45309', fontSize: 12.5, fontWeight: 600, whiteSpace: 'nowrap' }}>
      <svg className="wic-ring" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="3" strokeLinecap="round" aria-hidden><path d="M21 12a9 9 0 1 1-6.2-8.56" /></svg>
      {pill}
    </span>
  )

  return (
    <div className="wic" style={dock ? { margin: 'auto 10px 0', padding: '12px 0 80px' } : { margin: '10px 10px 4px' }}>
      <style>{`
        @keyframes wicSpin { to { transform: rotate(360deg); } }
        .wic-ring { animation: wicSpin 2.4s linear infinite; }
        .wic-cta { background: linear-gradient(135deg, #111 0%, #2b2b2b 60%, #4a4a4a 100%); transition: transform .15s cubic-bezier(.22,1,.36,1), box-shadow .15s; }
        .wic-cta:hover { transform: translateY(-1px); box-shadow: 0 8px 18px -8px rgba(0,0,0,.45); }
        .wic-x { width: 28px; height: 28px; border: none; border-radius: 8px; background: none; color: #9ca3af; cursor: pointer; display: inline-flex; align-items: center; justify-content: center; flex-shrink: 0; }
        .wic-x:hover { background: rgba(0,0,0,.05); color: var(--ink); }
        @media (prefers-reduced-motion: reduce) { .wic-ring { animation: none; } }
      `}</style>
      {fold === 'min' ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 6px 7px 10px', borderRadius: 14, background: '#f4f4f5' }}>
          {/* Folded: just the status ring, so the title has room to be read. */}
          <span title={pill} aria-label={pill} role="img" style={{ width: 26, height: 26, borderRadius: '50%', background: '#fdebd3', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <svg className="wic-ring" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="3" strokeLinecap="round" aria-hidden><path d="M21 12a9 9 0 1 1-6.2-8.56" /></svg>
          </span>
          <Link href="/admin/crm-settings/install" style={{ flex: 1, minWidth: 0, fontSize: 13, fontWeight: 600, color: 'var(--ink)', textDecoration: 'none', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{data.state === 'stale' ? 'Check your chat widget' : 'Install your chat widget'} ›</Link>
          <button type="button" className="wic-x" onClick={() => set('open')} aria-label="Show more" title="Show more">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden><path d="M12 5v14M5 12h14" /></svg>
          </button>
          <button type="button" className="wic-x" onClick={() => set('hidden')} aria-label="Don’t show this again" title="Don’t show this again">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden><path d="M6 6l12 12M18 6 6 18" /></svg>
          </button>
        </div>
      ) : (
        <div style={{ padding: 18, borderRadius: 22, background: '#f4f4f5' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
            {Pill}
            <button type="button" className="wic-x" onClick={() => set('min')} aria-label="Minimise" title="Minimise">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden><path d="M5 12h14" /></svg>
            </button>
          </div>
          <div aria-hidden style={{ display: 'flex', gap: 8, margin: '14px 0 16px', overflow: 'hidden', WebkitMaskImage: 'linear-gradient(90deg, #000 78%, transparent)', maskImage: 'linear-gradient(90deg, #000 78%, transparent)' }}>
            {LOGOS.map(n => (
              <span key={n} style={{ width: 44, height: 44, borderRadius: 13, background: '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, boxShadow: '0 1px 2px rgba(0,0,0,.04)' }}>
                <PlatformMark name={n} size={22} />
              </span>
            ))}
          </div>
          <p style={{ margin: '0 0 5px', fontSize: 16, fontWeight: 700, color: 'var(--ink)', letterSpacing: '-0.01em' }}>{title}</p>
          <p style={{ margin: '0 0 16px', fontSize: 13.5, color: 'var(--slate)', lineHeight: 1.5 }}>{line}</p>
          <Link href="/admin/crm-settings/install" className="wic-cta"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, height: 40, padding: '0 16px 0 18px', borderRadius: 999, color: '#fff', fontSize: 14, fontWeight: 600, textDecoration: 'none' }}>
            {data.state === 'stale' ? 'Check the install' : 'Install widget'}
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden><polyline points="9 18 15 12 9 6" /></svg>
          </Link>
        </div>
      )}
    </div>
  )
}
