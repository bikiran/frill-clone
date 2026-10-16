'use client'

// Form Results: full-width, Typeform-style Summary / Responses / Paths.
// Data loading, state, filters and tabs live here; everything else is in
// components/form-results (pure helpers in aggregate.ts, reads in data.ts).
// All reads are members-only (RLS); deletes go through /api/forms/responses.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { authFetch } from '@/lib/auth-fetch'
import { confirmDialog } from '@/components/ConfirmDialog'
import { readFormLogic, hasAnyLogic } from '@/lib/form-logic'
import {
  applyFilters, averageDuration, buildVerifyContext, completionRate, dateBounds, dateFilterOf, prep,
  sideEffectIds, summariseRows, textOf, variableAverages, EMPTY_VERIFY, RESPONSE_CAP,
  type ResultRow, type ResultsFilter, type StatsResult, type VerifyState,
} from '@/components/form-results/aggregate'
import { loadResponses, loadVerification, fetchStats, deleteInChunks } from '@/components/form-results/data'
import { exportCsv, exportExcel, exportPdf } from '@/components/form-results/exporters'
import { ResultsStyles } from '@/components/form-results/styles'
import { ResultsHeader, type ResultsTab } from '@/components/form-results/ResultsHeader'
import { KpiStrip } from '@/components/form-results/KpiStrip'
import { FilterBar, type ExportFormat } from '@/components/form-results/FilterBar'
import { QuestionCard } from '@/components/form-results/QuestionCard'
import { ResponsesTable } from '@/components/form-results/ResponsesTable'
import { ResponseDrawer } from '@/components/form-results/ResponseDrawer'
import { PathsPanel } from '@/components/form-results/PathsPanel'
import { Icon } from '@/components/form-results/icons'

type LoadState = { state: 'loading' | 'more' | 'done' | 'error'; capped: boolean; total: number | null; error?: string; gen: number }

const TABS: ResultsTab[] = ['summary', 'responses', 'paths']
const isoRange = (f: { from?: string; to?: string } | null) => {
  const b = dateBounds(f)
  return {
    ...(Number.isFinite(b.from) ? { from: new Date(b.from).toISOString() } : {}),
    ...(Number.isFinite(b.to) ? { to: new Date(b.to).toISOString() } : {}),
  }
}

export default function FormResults() {
  const params = useParams()
  const formId = String(params.id || '')

  const [form, setForm] = useState<any>(null)
  const [formState, setFormState] = useState<'loading' | 'ready' | 'missing'>('loading')
  const [accent, setAccent] = useState<string | null>(null)
  const [rows, setRows] = useState<ResultRow[]>([])
  const [load, setLoad] = useState<LoadState>({ state: 'loading', capped: false, total: null, gen: 0 })
  const [cappedEver, setCappedEver] = useState(false)
  const [serverRange, setServerRange] = useState<{ from?: string; to?: string }>({})
  const [retry, setRetry] = useState(0)
  const [filters, setFilters] = useState<ResultsFilter[]>([])
  const [tab, setTab] = useState<ResultsTab>('summary')
  const [selected, setSelected] = useState<Set<string>>(() => new Set())
  const [openId, setOpenId] = useState<string | null>(null)
  const [sortDesc, setSortDesc] = useState(true)
  const [stats, setStats] = useState<StatsResult | null>(null)
  const [verifyState, setVerifyState] = useState<VerifyState>(EMPTY_VERIFY)
  const [verifyRetry, setVerifyRetry] = useState(0)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [exportBusy, setExportBusy] = useState<ExportFormat | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [wide, setWide] = useState(false)
  const rootRef = useRef<HTMLDivElement | null>(null)
  const loadGen = useRef(0)

  // ── Tab in ?tab= (no useSearchParams, so no Suspense boundary) ──
  useEffect(() => {
    try {
      const t = new URLSearchParams(window.location.search).get('tab') as ResultsTab | null
      if (t && TABS.includes(t)) setTab(t)
    } catch {}
  }, [])
  const changeTab = useCallback((t: ResultsTab) => {
    setTab(t)
    try {
      const url = new URL(window.location.href)
      if (t === 'summary') url.searchParams.delete('tab'); else url.searchParams.set('tab', t)
      window.history.replaceState(window.history.state, '', url.toString())
    } catch {}
  }, [])

  // ── Width: two-column Paths and double-width cards from 1100px of content ──
  useEffect(() => {
    const el = rootRef.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(entries => { for (const e of entries) setWide(e.contentRect.width >= 1100) })
    ro.observe(el)
    return () => ro.disconnect()
  }, [formState])

  // ── Form (members-only read) and the company's accent for the PDF ──
  useEffect(() => {
    let live = true
    ;(async () => {
      const { data } = await (supabase as any).from('forms').select('*').eq('id', formId).maybeSingle()
      if (!live) return
      if (!data) { setFormState('missing'); return }
      setForm(data); setFormState('ready')
      if (data.company_id) {
        const { data: co } = await (supabase as any).from('companies').select('accent_color').eq('id', data.company_id).maybeSingle()
        if (live && co?.accent_color) setAccent(co.accent_color)
      }
    })().catch(() => { if (live) setFormState('missing') })
    return () => { live = false }
  }, [formId])

  // ── Responses: paged, de-duplicated, capped; renders after the first page ──
  useEffect(() => {
    const gen = ++loadGen.current
    setRows([]); setSelected(new Set()); setOpenId(null)
    setLoad(l => ({ state: 'loading', capped: false, total: null, gen: l.gen }))
    setVerifyState(EMPTY_VERIFY)
    loadResponses(supabase as any, formId, {
      ...serverRange,
      isCancelled: () => gen !== loadGen.current,
      onPage: (list, info) => {
        if (gen !== loadGen.current) return
        setRows(list)
        if (!info.done) setLoad(l => ({ ...l, state: 'more' }))
      },
    }).then(res => {
      if (gen !== loadGen.current) return
      setRows(res.rows)
      setLoad(l => ({ state: res.error ? 'error' : 'done', capped: res.capped, total: res.total, error: res.error, gen: l.gen + 1 }))
      if (res.capped) setCappedEver(true)
    }).catch((e: any) => {
      if (gen !== loadGen.current) return
      setLoad(l => ({ state: 'error', capped: false, total: null, error: e?.message || 'Could not load responses', gen: l.gen + 1 }))
    })
  }, [formId, serverRange, retry])

  const logic = useMemo(() => readFormLogic(form), [form])
  const dateFilter = dateFilterOf(filters)
  const dateKey = JSON.stringify(dateFilter ? isoRange(dateFilter) : {})

  // Once the cap has been hit, the date filter narrows the query on the server so older responses stay reachable.
  useEffect(() => {
    const want = cappedEver ? JSON.parse(dateKey) : {}
    setServerRange(prev => (JSON.stringify(prev) === JSON.stringify(want) ? prev : want))
  }, [cappedEver, dateKey])

  // ── Views / starts (V376). Never blocks: tiles appear when (and if) this answers. ──
  useEffect(() => {
    let live = true
    const r = JSON.parse(dateKey) as { from?: string; to?: string }
    let tz = 'UTC'
    try { tz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC' } catch {}
    fetchStats(authFetch, { formId, ...r, tz }).then(s => { if (live) setStats(s) })
    return () => { live = false }
  }, [formId, dateKey])

  // ── Payment / booking verification (section G): one batched members-only read per table ──
  const loadDone = load.state === 'done' || load.state === 'error'
  useEffect(() => {
    if (!loadDone || !form) return
    let live = true
    const ids = sideEffectIds(rows, logic)
    if (!ids.paymentIds.length && !ids.eventIds.length) { setVerifyState({ status: 'done', payments: {}, events: {}, claims: { payments: {}, events: {} } }); return }
    setVerifyState(v => ({ ...v, status: 'loading' }))
    loadVerification(supabase as any, form.company_id || null, ids, { fetcher: authFetch, formId }).then(v => { if (live) setVerifyState(v) })
    return () => { live = false }
    // Rows only shrink after loading (deletes), so re-checking on every delete isn't needed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadDone, load.gen, form, logic, verifyRetry])

  // ── Derived data ──
  const filtered = useMemo(() => applyFilters(rows, filters, logic), [rows, filters, logic])
  const ordered = useMemo(() => (sortDesc ? filtered : [...filtered].reverse()), [filtered, sortDesc])
  const dateRows = useMemo(() => applyFilters(rows, dateFilter ? [dateFilter] : [], logic), [rows, dateFilter, logic])
  const verify = useMemo(() => buildVerifyContext(form, logic, verifyState), [form, logic, verifyState])
  const hasLogic = useMemo(() => hasAnyLogic(logic), [logic])
  const tracked = !!(stats && stats.tracked)
  const showPaths = hasLogic || tracked
  const activeTab: ResultsTab = tab === 'paths' && !showPaths ? 'summary' : tab
  // "Seen by", branches and drop-off: only for the tabs that show them, and only
  // once every page has arrived (older rows' estimated paths are cached per row).
  const wantSummary = loadDone && (activeTab === 'summary' || activeTab === 'paths')
  const summary = useMemo(() => (wantSummary ? summariseRows(logic, filtered) : null), [wantSummary, logic, filtered])
  const answerFiltered = filters.some(f => f.kind !== 'date')
  const totalKnown = Math.max(load.total ?? rows.length, rows.length)
  const completion = useMemo(() => completionRate(stats, dateRows, load.capped), [stats, dateRows, load.capped])
  const kpi = useMemo(() => ({
    responses: filtered.length,
    total: totalKnown,
    filtered: filters.length > 0,
    answerFiltered,
    avgSeconds: averageDuration(filtered),
    lastAt: filtered.length ? filtered.reduce((a, r) => (prep(r).time > prep(a).time ? r : a), filtered[0]).created_at : null,
    stats,
    completion,
    variables: variableAverages(filtered, logic),
  }), [filtered, totalKnown, filters.length, answerFiltered, stats, completion, logic])
  const selectedVisible = useMemo(() => ordered.filter(r => selected.has(r.id)), [ordered, selected])
  const themeColor = typeof form?.theme?.color === 'string' && /^#[0-9a-f]{6}$/i.test(form.theme.color) ? form.theme.color : '#ff7a6b'
  const questions = useMemo(() => logic.questions.map((q, index) => ({ q, index })).filter(x => x.q.type !== 'statement'), [logic])

  const hasSideEffects = useMemo(() => logic.questions.some(q => q.type === 'payment' || q.type === 'scheduler'), [logic])
  const exportNote = !loadDone ? 'Still loading responses. Exports include everything once loading finishes.'
    : hasSideEffects && (verifyState.status === 'loading' || verifyState.status === 'idle') ? 'Checking payments and bookings…' : null

  // ── Actions ──
  const removeRows = useCallback((ids: string[]) => {
    const gone = new Set(ids)
    setRows(prev => prev.filter(r => !gone.has(r.id)))
    setSelected(prev => { const n = new Set(prev); ids.forEach(id => n.delete(id)); return n })
    setLoad(l => (l.total === null ? l : { ...l, total: Math.max(0, l.total - ids.length) }))
  }, [])

  const doDelete = useCallback(async (ids: string[]) => {
    if (!ids.length || !form?.company_id || deleting) return
    const n = ids.length
    const ok = await confirmDialog({
      title: n === 1 ? 'Delete this response?' : `Delete ${n.toLocaleString('en-AU')} responses?`,
      message: "This can't be undone.", confirmLabel: 'Delete', tone: 'danger',
    })
    if (!ok) return
    // Where the drawer goes if its response is deleted: the next one in the current order.
    const after = openId && ids.includes(openId) ? ordered.slice(ordered.findIndex(r => r.id === openId) + 1).find(r => !ids.includes(r.id))?.id ?? null : openId
    let done = 0
    setDeleting(n > 200 ? `Deleting 0 of ${n}…` : 'Deleting…')
    // Rows leave the page once at the end (not per chunk), so a big delete
    // doesn't rebuild every card and the summary 50 times.
    const res = await deleteInChunks(authFetch, {
      formId, companyId: form.company_id, ids,
      onChunk: chunk => { done += chunk.length; if (n > 200) setDeleting(`Deleting ${done} of ${n}…`) },
    })
    if (res.deleted.length) removeRows(res.deleted)
    setDeleting(null)
    if (res.error) setNotice(`Deleted ${res.deleted.length.toLocaleString('en-AU')} of ${n.toLocaleString('en-AU')} responses, then stopped: ${res.error}`)
    if (openId && res.deleted.includes(openId)) setOpenId(after)
  }, [form, deleting, openId, ordered, formId, removeRows])

  const doExport = useCallback(async (format: ExportFormat, selectedOnly: boolean) => {
    const list = selectedOnly ? selectedVisible : ordered
    if (!list.length || exportBusy) return
    setExportBusy(format)
    const args = { title: textOf(form?.title) || 'Form', rows: list, logic, verify, accent: accent || themeColor }
    try {
      if (format === 'csv') exportCsv(args)
      else if (format === 'excel') await exportExcel(args)
      else await exportPdf(args)
    } catch (e: any) {
      setNotice(`Export failed: ${e?.message || 'unknown error'}`)
    } finally {
      setExportBusy(null)
    }
  }, [selectedVisible, ordered, exportBusy, form, logic, verify, accent, themeColor])

  const addVariableFilter = useCallback((variableId: string, min?: number, max?: number) => {
    setFilters(f => [...f.filter(x => !(x.kind === 'variable' && x.variableId === variableId)), { kind: 'variable', variableId, min, max }])
  }, [])

  // ── Drawer ──
  const openIndex = openId ? ordered.findIndex(r => r.id === openId) : -1
  const openRow = openIndex >= 0 ? ordered[openIndex] : openId ? rows.find(r => r.id === openId) || null : null
  const closeDrawer = useCallback(() => setOpenId(null), [])

  // ── Render ──
  if (formState === 'missing') {
    return (
      <div className="fr-root"><ResultsStyles />
        <div className="fr-card" style={{ padding: 40, textAlign: 'center' }}>
          <h1 style={{ fontSize: 18, fontWeight: 700, margin: '0 0 8px' }}>Form not found</h1>
          <p className="fr-muted" style={{ margin: '0 0 16px' }}>It may have been deleted, or it belongs to another workspace.</p>
          <Link href="/admin/forms" className="fr-btn">Back to forms</Link>
        </div>
      </div>
    )
  }

  const firstPageLoading = formState === 'loading' || (load.state === 'loading' && rows.length === 0)
  const noResponsesAtAll = !firstPageLoading && loadDone && rows.length === 0 && !load.error && Object.keys(serverRange).length === 0

  return (
    <div className="fr-root" ref={rootRef} data-wide={wide ? '1' : undefined}>
      <ResultsStyles />
      {formState === 'loading' ? <HeaderSkeleton /> : (
        <ResultsHeader formId={formId} title={textOf(form?.title)} isPublished={!!form?.is_published}
          tab={activeTab} onTab={changeTab} responseCount={filtered.length} showPaths={showPaths} />
      )}

      {formState === 'ready' && !noResponsesAtAll && (
        <FilterBar filters={filters} onChange={setFilters} logic={logic} shown={filtered.length} total={totalKnown}
          loadingMore={load.state === 'more'} onExport={doExport} selectedCount={selectedVisible.length} exportBusy={exportBusy} exportNote={exportNote} />
      )}
      {formState === 'ready' && noResponsesAtAll && <div style={{ height: 18 }} />}

      {load.capped && (
        <div className="fr-banner" role="status"><Icon name="info" size={15} />
          Showing the newest {RESPONSE_CAP.toLocaleString('en-AU')} responses{load.total ? ` of ${load.total.toLocaleString('en-AU')}` : ''}. Narrow the date range to see older ones.
        </div>
      )}
      {load.state === 'error' && (
        <div className="fr-banner fr-banner-warn" role="alert"><Icon name="alert" size={15} />
          <span style={{ flex: 1 }}>Couldn't load {rows.length ? 'all ' : ''}responses{rows.length ? ` (showing ${rows.length.toLocaleString('en-AU')})` : ''}. {load.error}</span>
          <button type="button" className="fr-btn fr-btn-sm" onClick={() => setRetry(n => n + 1)}>Try again</button>
        </div>
      )}
      {verifyState.status === 'error' && (
        <div className="fr-banner fr-banner-warn" role="alert"><Icon name="alert" size={15} />
          <span style={{ flex: 1 }}>Couldn't check payments and bookings just now, so they show as unverified.</span>
          <button type="button" className="fr-btn fr-btn-sm" onClick={() => setVerifyRetry(n => n + 1)}>Check again</button>
        </div>
      )}
      {notice && (
        <div className="fr-banner fr-banner-warn" role="alert"><Icon name="alert" size={15} />
          <span style={{ flex: 1 }}>{notice}</span>
          <button type="button" className="fr-icon-btn" aria-label="Dismiss" onClick={() => setNotice(null)}><Icon name="x" size={14} /></button>
        </div>
      )}

      {firstPageLoading ? <BodySkeleton /> : noResponsesAtAll ? (
        <div className="fr-card" style={{ padding: '56px 24px', textAlign: 'center' }}>
          <Icon name="users" size={40} stroke="var(--slate)" strokeWidth={1.5} style={{ marginBottom: 12 }} />
          <h2 style={{ fontSize: 18, fontWeight: 700, margin: '0 0 6px' }}>No responses yet</h2>
          <p className="fr-muted" style={{ margin: 0 }}>{form?.is_published ? 'Share your form to start collecting responses.' : 'Publish your form in the builder, then share it to start collecting responses.'}</p>
        </div>
      ) : (
        <>
          <KpiStrip data={kpi} color={themeColor} />

          {activeTab === 'summary' && (
            <div role="tabpanel" id="fr-panel-summary" aria-labelledby="fr-tab-summary">
              {summary && summary.legacy > 0 && hasLogic && (
                <p className="fr-muted" style={{ fontSize: 12.5, margin: '-6px 0 14px', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Icon name="info" size={13} />{summary.legacy.toLocaleString('en-AU')} older {summary.legacy === 1 ? 'response was' : 'responses were'} submitted before paths were recorded; who saw each question is estimated for {summary.legacy === 1 ? 'it' : 'them'}.
                </p>
              )}
              {questions.length === 0 ? (
                <div className="fr-card" style={{ padding: 32, textAlign: 'center' }}><p className="fr-muted" style={{ margin: 0 }}>This form has no questions.</p></div>
              ) : (
                <div className="fr-grid">
                  {questions.map(({ q, index }) => (
                    <QuestionCard key={q.id} q={q} index={index} rows={filtered} summary={summary} verify={verify} color={themeColor} onOpenRow={setOpenId} />
                  ))}
                </div>
              )}
            </div>
          )}

          {activeTab === 'responses' && (
            <div role="tabpanel" id="fr-panel-responses" aria-labelledby="fr-tab-responses">
              <ResponsesTable key={JSON.stringify(filters)} rows={ordered} logic={logic} verify={verify} selected={selected} onSelect={setSelected}
                onOpen={setOpenId} openId={openId} sortDesc={sortDesc} onSort={() => setSortDesc(s => !s)} onDelete={doDelete} deleting={deleting} />
            </div>
          )}

          {activeTab === 'paths' && (
            <div role="tabpanel" id="fr-panel-paths" aria-labelledby="fr-tab-paths">
              {summary ? (
                <PathsPanel logic={logic} summary={summary} stats={stats} submittedSince={completion ? completion.submitted : null}
                  color={themeColor} onVariableFilter={addVariableFilter} />
              ) : (
                <div className="fr-card" style={{ padding: 32, textAlign: 'center' }}><p className="fr-muted" style={{ margin: 0 }}>Counting paths once every response has loaded…</p></div>
              )}
            </div>
          )}
        </>
      )}

      {openRow && (
        <ResponseDrawer row={openRow} logic={logic} verify={verify} color={themeColor} onClose={closeDrawer}
          onPrev={openIndex > 0 ? () => setOpenId(ordered[openIndex - 1].id) : null}
          onNext={openIndex >= 0 && openIndex < ordered.length - 1 ? () => setOpenId(ordered[openIndex + 1].id) : null}
          onDelete={id => doDelete([id])} deleting={!!deleting}
          position={openIndex >= 0 ? { index: openIndex, total: ordered.length } : undefined} />
      )}
    </div>
  )
}

function HeaderSkeleton() {
  return (
    <div aria-hidden>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div className="fr-skel" style={{ width: 32, height: 32 }} />
        <div className="fr-skel" style={{ width: 'min(360px, 60%)', height: 26 }} />
      </div>
      <div className="fr-skel" style={{ width: 260, height: 18, margin: '22px 0 26px' }} />
    </div>
  )
}

function BodySkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading responses">
      <div className="fr-kpis">
        {[0, 1, 2, 3].map(i => <div key={i} className="fr-card fr-kpi"><div className="fr-skel" style={{ width: 16, height: 16 }} /><div className="fr-skel" style={{ width: '60%', height: 24, marginTop: 10 }} /><div className="fr-skel" style={{ width: '40%', height: 12, marginTop: 8 }} /></div>)}
      </div>
      <div className="fr-grid">
        {[0, 1].map(i => <div key={i} className="fr-card fr-qcard"><div className="fr-skel" style={{ width: '50%', height: 18 }} /><div className="fr-skel" style={{ width: '30%', height: 12, margin: '12px 0 20px' }} />{[0, 1, 2].map(j => <div key={j} className="fr-skel" style={{ height: 10, marginBottom: 16 }} />)}</div>)}
      </div>
    </div>
  )
}
