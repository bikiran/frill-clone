'use client'

import { useEffect, useMemo, useState } from 'react'

// Page through a list that's already loaded and filtered client-side.
//
//   const pg = usePagination(filtered, { key: 'social', resetOn: [filterA, filterB] })
//   pg.items          → the rows for this page
//   <Pagination {...pg} noun="comments" />
//
// Same look as the Reviews page: ‹ 1 … 4 5 6 … 12 ›, "Showing 21–30 of 112"
// and a per-page picker (remembered per list on this device).

const SIZES = [10, 25, 50, 100]

export function usePagination<T>(rows: T[], opts: { key: string; defaultSize?: number; resetOn?: any[] }) {
  const storeKey = `colvy-page-size:${opts.key}`
  const [page, setPage] = useState(1)
  const [pageSize, setPageSizeState] = useState(opts.defaultSize ?? 25)

  useEffect(() => {
    try { const n = Number(localStorage.getItem(storeKey)); if (SIZES.includes(n)) setPageSizeState(n) } catch {}
  }, [storeKey])
  // A new filter or search starts again at page 1.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { setPage(1) }, opts.resetOn || [])

  const total = rows.length
  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  const current = Math.min(page, totalPages)
  const items = useMemo(() => rows.slice((current - 1) * pageSize, current * pageSize), [rows, current, pageSize])

  const setPageSize = (n: number) => {
    setPageSizeState(n); setPage(1)
    try { localStorage.setItem(storeKey, String(n)) } catch {}
  }
  const goTo = (n: number, scroll = true) => {
    setPage(Math.min(Math.max(1, n), totalPages))
    if (scroll && typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' })
  }
  return { items, page: current, pageSize, total, totalPages, goTo, setPageSize }
}

export default function Pagination({ page, pageSize, total, totalPages, goTo, setPageSize, noun = 'items' }: {
  page: number; pageSize: number; total: number; totalPages: number
  goTo: (n: number, scroll?: boolean) => void; setPageSize: (n: number) => void; noun?: string
}) {
  if (total <= SIZES[0]) return null
  const list: (number | '…')[] = []
  for (let n = 1; n <= totalPages; n++) {
    if (n === 1 || n === totalPages || Math.abs(n - page) <= 1) list.push(n)
    else if (list[list.length - 1] !== '…') list.push('…')
  }
  const from = (page - 1) * pageSize + 1
  const to = Math.min(page * pageSize, total)
  return (
    <nav aria-label="Pagination" className="cv-pg">
      <style>{`
        .cv-pg { display:flex; align-items:center; justify-content:space-between; gap:10px; flex-wrap:wrap; margin-top:18px; }
        .cv-pg-info { font-size:13px; color:var(--slate); }
        .cv-pg-btns { display:flex; align-items:center; gap:6px; flex-wrap:wrap; }
        .cv-pg-b { min-width:36px; height:36px; padding:0 10px; border-radius:10px; border:1px solid var(--border); background:#fff; color:var(--ink); font-size:13.5px; font-weight:700; cursor:pointer; transition:border-color .15s, color .15s, background .15s; }
        .cv-pg-b:hover:not(:disabled):not(.on) { border-color:var(--coral); color:var(--coral); }
        .cv-pg-b.on { background:var(--coral); border-color:var(--coral); color:#fff; }
        .cv-pg-b:disabled { opacity:.4; cursor:default; }
        .cv-pg-sel { height:36px; padding:0 10px; border-radius:10px; border:1px solid var(--border); background:#fff; color:var(--ink); font-size:13px; outline:none; margin-left:4px; }
        @media (max-width: 560px) { .cv-pg { justify-content:center; } .cv-pg-info { width:100%; text-align:center; } }
      `}</style>
      <span className="cv-pg-info">Showing {from}–{to} of {total} {noun}</span>
      <div className="cv-pg-btns">
        <button type="button" className="cv-pg-b" disabled={page <= 1} onClick={() => goTo(page - 1)} aria-label="Previous page">‹</button>
        {totalPages > 1 && list.map((n, i) => n === '…'
          ? <span key={`e${i}`} style={{ color: 'var(--slate)', padding: '0 2px' }}>…</span>
          : <button type="button" key={n} className={'cv-pg-b' + (n === page ? ' on' : '')} aria-current={n === page ? 'page' : undefined} onClick={() => goTo(n)}>{n}</button>)}
        <button type="button" className="cv-pg-b" disabled={page >= totalPages} onClick={() => goTo(page + 1)} aria-label="Next page">›</button>
        <select className="cv-pg-sel" value={pageSize} onChange={e => setPageSize(Number(e.target.value))} aria-label="Items per page">
          {SIZES.map(s => <option key={s} value={s}>{s} / page</option>)}
        </select>
      </div>
    </nav>
  )
}
