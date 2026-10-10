'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { confirmDialog } from '@/components/ConfirmDialog'

// Orders → Drafts: half-built orders saved from Create Order. Tap one to keep
// editing it; it disappears from here once it becomes a real order.

export function useOrderDraftCount(companyId: string | null | undefined, bump = 0) {
  const [count, setCount] = useState(0)
  useEffect(() => {
    if (!companyId) return
    let live = true
    ;(async () => {
      try {
        const { count: n, error } = await (supabase as any).from('order_drafts').select('id', { count: 'exact', head: true }).eq('company_id', companyId)
        if (live) setCount(error ? 0 : n || 0)
      } catch { if (live) setCount(0) }
    })()
    return () => { live = false }
  }, [companyId, bump])
  return count
}

const ago = (iso: string) => {
  const m = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000))
  if (m < 1) return 'just now'
  if (m < 60) return `${m}m ago`
  const h = Math.round(m / 60)
  if (h < 24) return `${h}h ago`
  return new Date(iso).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })
}

export default function OrderDraftsPanel({ companyId, accent, onOpen, onClose, onChanged }: {
  companyId: string
  accent?: string
  onOpen: (draft: any) => void
  onClose: () => void
  onChanged?: () => void
}) {
  const ACCENT = accent || 'var(--coral)'
  const [drafts, setDrafts] = useState<any[] | null>(null)
  const [missing, setMissing] = useState(false)

  const load = async () => {
    try {
      const { data, error } = await (supabase as any).from('order_drafts').select('*').eq('company_id', companyId).order('updated_at', { ascending: false }).limit(200)
      if (error) { setMissing(/order_drafts/.test(error.message || '')); setDrafts([]); return }
      setDrafts(data || [])
    } catch { setDrafts([]) }
  }
  useEffect(() => { load() }, [companyId])  // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  const remove = async (d: any) => {
    if (!await confirmDialog({ title: 'Delete this draft?', message: `${d.customer_name || 'Draft order'} · ${d.item_count || 0} item${d.item_count === 1 ? '' : 's'}`, confirmLabel: 'Delete', tone: 'danger' })) return
    setDrafts(list => (list || []).filter(x => x.id !== d.id))
    try { await (supabase as any).from('order_drafts').delete().eq('id', d.id) } catch {}
    onChanged?.()
  }

  return (
    <div onClick={onClose} className="odr-backdrop" style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 10000, display: 'flex', justifyContent: 'flex-end' }}>
      <div onClick={e => e.stopPropagation()} className="odr-sheet" style={{ width: 440, maxWidth: '100%', height: '100%', background: '#fff', display: 'flex', flexDirection: 'column', boxShadow: '-8px 0 32px rgba(0,0,0,0.2)' }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 17, fontWeight: 800, color: 'var(--ink)' }}>Draft orders</h2>
            <p style={{ margin: '2px 0 0', fontSize: 12.5, color: 'var(--slate)' }}>Saved from Create Order. Open one to finish it.</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'var(--slate)', padding: 6, display: 'flex' }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
          </button>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: 12 }}>
          {drafts === null && <p style={{ padding: 16, textAlign: 'center', fontSize: 13, color: 'var(--slate)' }}>Loading drafts…</p>}
          {missing && <p style={{ padding: 16, fontSize: 13, color: 'var(--slate)', lineHeight: 1.5 }}>Drafts need a one-time database update. Run <strong>COLVY_V346_ORDER_DRAFTS.sql</strong> in Supabase, then reopen this.</p>}
          {drafts && drafts.length === 0 && !missing && (
            <div style={{ padding: '40px 16px', textAlign: 'center' }}>
              <div style={{ width: 48, height: 48, borderRadius: 14, margin: '0 auto 10px', background: 'var(--peach)', color: ACCENT, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><path d="M9 15h6" /></svg>
              </div>
              <p style={{ margin: 0, fontSize: 14, fontWeight: 700, color: 'var(--ink)' }}>No drafts</p>
              <p style={{ margin: '4px 0 0', fontSize: 12.5, color: 'var(--slate)' }}>Use &ldquo;Save as draft&rdquo; in Create Order to keep an order for later.</p>
            </div>
          )}
          {(drafts || []).map(d => (
            <div key={d.id} className="odr-row" onClick={() => onOpen(d)}
              style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 12px', borderRadius: 12, cursor: 'pointer', border: '1px solid var(--border)', marginBottom: 8, background: '#fff' }}>
              <span style={{ width: 36, height: 36, borderRadius: 10, background: 'var(--peach)', color: ACCENT, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 14, flexShrink: 0 }}>
                {String(d.customer_name || d.customer_email || '?').trim().charAt(0).toUpperCase()}
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ margin: 0, fontSize: 13.5, fontWeight: 700, color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.customer_name || d.customer_email || 'No customer yet'}</p>
                <p style={{ margin: '2px 0 0', fontSize: 12, color: 'var(--slate)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {d.item_count || 0} item{d.item_count === 1 ? '' : 's'} · {ago(d.updated_at || d.created_at)}{(d.updated_by_name || d.created_by_name) ? ` · ${d.updated_by_name || d.created_by_name}` : ''}
                </p>
              </div>
              <span style={{ fontSize: 14, fontWeight: 800, color: 'var(--ink)', flexShrink: 0 }}>${Number(d.total || 0).toFixed(2)}</span>
              <button type="button" title="Delete draft" aria-label="Delete draft" onClick={e => { e.stopPropagation(); remove(d) }}
                style={{ flexShrink: 0, width: 30, height: 30, borderRadius: 8, border: '1px solid var(--border)', background: '#fff', color: 'var(--slate)', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" /></svg>
              </button>
            </div>
          ))}
        </div>
      </div>
      <style>{`
        .odr-backdrop{animation:odrFade .2s ease}
        .odr-sheet{animation:odrIn .34s cubic-bezier(.32,.72,0,1)}
        @keyframes odrFade{from{opacity:0}to{opacity:1}}
        @keyframes odrIn{from{transform:translateX(24px);opacity:.6}to{transform:none;opacity:1}}
        .odr-row{transition:background .18s ease, box-shadow .18s ease, transform .12s ease}
        .odr-row:hover{background:#fafafa;box-shadow:0 2px 8px rgba(0,0,0,.05)}
        .odr-row:active{transform:scale(.99)}
        @media (prefers-reduced-motion: reduce){.odr-backdrop,.odr-sheet{animation:none}.odr-row{transition:none}}
      `}</style>
    </div>
  )
}
