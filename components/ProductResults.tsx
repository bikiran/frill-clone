'use client'

import { useEffect, useState } from 'react'
import {
  type CatalogProduct, type Variation, fmtPrice, isVariable, loadCatalog, loadVariations,
  searchCatalog, searchServer, stockColor, stockLabel,
} from '@/lib/product-catalog'

const EASE = 'cubic-bezier(.32,.72,0,1)'

/**
 * Product search as you type: on the device from the synced catalogue, or the
 * server search (debounced) until a catalogue exists.
 */
export function useProductSearch(companyId: string | null | undefined, query: string, opts: { integrationId?: string | null; enabled?: boolean } = {}) {
  const { integrationId = null, enabled = true } = opts
  const [catalog, setCatalog] = useState<CatalogProduct[] | null>(null)
  const [results, setResults] = useState<CatalogProduct[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!enabled || !companyId) return
    let live = true
    setCatalog(null)
    loadCatalog(companyId, integrationId).then(list => { if (live) setCatalog(list) })
    return () => { live = false }
  }, [companyId, integrationId, enabled])

  useEffect(() => {
    if (!enabled || !companyId) return
    const s = query.trim()
    if (s.length < 2) { setResults([]); setLoading(false); setError(''); return }
    if (catalog?.length) { setResults(searchCatalog(catalog, s)); setLoading(false); setError(''); return }
    setLoading(true)
    const t = setTimeout(async () => {
      try { setResults(await searchServer(companyId, s, integrationId)); setError('') }
      catch (e: any) { setError(e?.message || 'Search failed'); setResults([]) }
      finally { setLoading(false) }
    }, 300)
    return () => clearTimeout(t)
  }, [query, catalog, companyId, integrationId, enabled])

  return { results, loading, error, ready: catalog !== null }
}

function AddBtn({ added, onClick, size = 34 }: { added: boolean; onClick: () => void; size?: number }) {
  return (
    <button type="button" onClick={e => { e.stopPropagation(); onClick() }} aria-label={added ? 'Add another' : 'Add'} title={added ? 'Added — add another' : 'Add'}
      style={{ flexShrink: 0, width: size, height: size, borderRadius: '50%', border: added ? 'none' : '1.5px solid var(--coral)', background: added ? '#059669' : 'transparent', color: added ? '#fff' : 'var(--coral)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'background .2s ease, transform .12s ease' }}>
      {added
        ? <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
        : <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>}
    </button>
  )
}

/**
 * Search results: a simple product has a + button; a variable product opens to
 * list its variations (size, colour…), each with its own price, stock and +.
 */
export default function ProductResults({ results, companyId, integrationId, addedIds, onAdd, dense = false }: {
  results: CatalogProduct[]
  companyId: string
  integrationId?: string | null
  addedIds?: Set<string>
  onAdd: (p: CatalogProduct, v?: Variation) => void
  dense?: boolean
}) {
  const [expanded, setExpanded] = useState<string | null>(null)
  const [vars, setVars] = useState<Record<string, Variation[] | 'loading'>>({})
  const img = dense ? 38 : 44
  const btn = dense ? 30 : 34

  const toggle = async (p: CatalogProduct) => {
    const key = String(p.id)
    if (expanded === key) { setExpanded(null); return }
    setExpanded(key)
    if (Array.isArray(vars[key])) return
    setVars(v => ({ ...v, [key]: 'loading' }))
    try { const list = await loadVariations(companyId, p.id, integrationId); setVars(v => ({ ...v, [key]: list })) }
    catch { setVars(v => ({ ...v, [key]: [] })) }
  }

  return (
    <>
      {results.map(p => {
        const key = String(p.id)
        const variable = isVariable(p)
        const open = expanded === key
        const list = vars[key]
        return (
          <div key={key} style={{ borderRadius: 12, background: open ? 'color-mix(in srgb, var(--slate) 5%, transparent)' : 'transparent', transition: `background .25s ${EASE}` }}>
            <div className="prd-row" onClick={variable ? () => toggle(p) : () => onAdd(p)}
              style={{ display: 'flex', alignItems: 'center', gap: dense ? 10 : 12, padding: dense ? '8px 10px' : '10px 10px', borderRadius: 12, cursor: 'pointer' }}>
              {p.image
                ? <img src={p.image} alt="" style={{ width: img, height: img, borderRadius: 9, objectFit: 'cover', flexShrink: 0, border: '1px solid var(--border)', background: '#fff' }} />
                : <div style={{ width: img, height: img, borderRadius: 9, background: 'var(--canvas)', flexShrink: 0 }} />}
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ margin: 0, fontSize: dense ? 13 : 14, fontWeight: 700, color: 'var(--ink)', lineHeight: 1.3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: dense ? 'nowrap' : 'normal' }}>{p.name}</p>
                <p style={{ margin: '2px 0 0', fontSize: dense ? 11.5 : 12, color: 'var(--slate)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {variable
                    ? <span style={{ display: 'inline-block', padding: '1px 8px', borderRadius: 20, background: 'var(--peach)', color: 'var(--coral)', fontWeight: 700, fontSize: 11 }}>{Array.isArray(list) ? `${list.length} option${list.length === 1 ? '' : 's'}` : 'Choose an option'}</span>
                    : <>{p.sku ? `SKU ${p.sku} · ` : ''}<span style={{ color: stockColor(p), fontWeight: 600 }}>{stockLabel(p)}</span>{p.stock_quantity != null ? ` · ${p.stock_quantity} available` : ''}</>}
                </p>
              </div>
              {fmtPrice(p.price) && (
                <span style={{ fontSize: dense ? 13 : 14, fontWeight: 800, color: 'var(--ink)', flexShrink: 0, textAlign: 'right', lineHeight: 1.15 }}>
                  {variable && <span style={{ display: 'block', fontSize: 10.5, fontWeight: 600, color: 'var(--slate)' }}>from</span>}
                  {fmtPrice(p.price)}
                </span>
              )}
              {variable ? (
                <span aria-hidden style={{ flexShrink: 0, width: btn, height: btn, borderRadius: '50%', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--slate)', background: 'var(--card,#fff)' }}>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" style={{ transform: open ? 'rotate(180deg)' : 'none', transition: `transform .3s ${EASE}` }}><path d="m6 9 6 6 6-6" /></svg>
                </span>
              ) : <AddBtn size={btn} added={!!addedIds?.has(key)} onClick={() => onAdd(p)} />}
            </div>
            {variable && (
              <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr)', gridTemplateRows: open ? '1fr' : '0fr', transition: `grid-template-rows .34s ${EASE}` }}>
                <div style={{ overflow: 'hidden', minHeight: 0 }}>
                  <div style={{ padding: `0 10px 6px ${img + 22}px` }}>
                    {list === 'loading' && <p style={{ margin: '2px 0 8px', fontSize: 12.5, color: 'var(--slate)' }}>Loading options…</p>}
                    {Array.isArray(list) && list.length === 0 && <p style={{ margin: '2px 0 8px', fontSize: 12.5, color: 'var(--slate)' }}>No options found for this product.</p>}
                    {Array.isArray(list) && list.map(v => (
                      <div key={String(v.id)} className="prd-row" onClick={() => onAdd(p, v)}
                        style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 6px', margin: '0 -6px', borderTop: '1px solid var(--border)', cursor: 'pointer', borderRadius: 8 }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <span style={{ display: 'inline-block', maxWidth: '100%', padding: '2px 9px', borderRadius: 20, background: 'var(--peach)', color: 'var(--coral)', fontSize: 12, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{v.attributes || 'Option'}</span>
                          <p style={{ margin: '3px 0 0', fontSize: 11.5, color: 'var(--slate)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {v.sku ? `SKU ${v.sku} · ` : ''}<span style={{ color: stockColor(v), fontWeight: 600 }}>{stockLabel(v)}</span>{v.stock_quantity != null ? ` · ${v.stock_quantity} available` : ''}
                          </p>
                        </div>
                        {fmtPrice(v.price) && <span style={{ fontSize: 13.5, fontWeight: 800, color: 'var(--ink)', flexShrink: 0 }}>{fmtPrice(v.price)}</span>}
                        <AddBtn size={btn} added={!!addedIds?.has(String(v.id))} onClick={() => onAdd(p, v)} />
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        )
      })}
      <style>{`.prd-row{transition:background .18s ease}.prd-row:hover{background:color-mix(in srgb, var(--slate) 6%, transparent)}`}</style>
    </>
  )
}
