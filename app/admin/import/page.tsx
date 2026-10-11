'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { authFetch } from '@/lib/auth-fetch'
import { resolveCompanyUser, peekCompanyUser } from '@/lib/client-cache'
import { confirmDialog } from '@/components/ConfirmDialog'
import { parseCsv, guessMapping, csvToPayload, MAPPING_FIELDS, type CsvMapping, type ImportKind } from '@/lib/import/normalize'

// Import Data. Real sources only — a CSV export from any tool, Canny (API key)
// or a public Zendesk help centre; other help-centre websites go to the AI
// importer at /admin/help/import. Every import is previewed first (real counts,
// duplicates, status mapping), runs as a background job (lib/import/engine)
// that keeps going if this page is closed, and can be undone in one click.

type Source = 'csv' | 'canny' | 'zendesk'
type Stage = 'pick' | 'setup' | 'preview'
type Include = { ideas: boolean; comments: boolean; announcements: boolean; articles: boolean }

const EASE = 'cubic-bezier(.22,1,.36,1)'
const MAX_UPLOAD = 4_000_000
const CSV_TOOLS = ['Frill', 'Featurebase', 'UserVoice', 'Productboard', 'Typeform', 'Upvoty', 'Nolt', 'Google Sheets', 'Excel']
const SITE_TOOLS = ['Intercom', 'Help Scout', 'GitBook', 'Notion', 'Confluence', 'Document360', 'Freshdesk', 'HubSpot']
const SOURCE_NAME: Record<string, string> = { csv: 'Spreadsheet', canny: 'Canny', zendesk: 'Zendesk' }
const KIND_LABEL: Record<string, string> = { ideas: 'Ideas', comments: 'Comments', announcements: 'Updates', articles: 'Help articles' }

// ── Icons ────────────────────────────────────────────────────────────────────
const I = {
  sheet: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="3" /><line x1="3" y1="9" x2="21" y2="9" /><line x1="3" y1="15" x2="21" y2="15" /><line x1="9" y1="9" x2="9" y2="21" /></svg>,
  key: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="7.5" cy="15.5" r="4.5" /><path d="M10.7 12.3 21 2" /><path d="m16 7 3 3" /><path d="m19 4 2 2" /></svg>,
  book: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" /><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" /></svg>,
  globe: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><line x1="2" y1="12" x2="22" y2="12" /><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" /></svg>,
  upload: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" /></svg>,
  back: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6" /></svg>,
  arrow: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><line x1="5" y1="12" x2="19" y2="12" /><polyline points="12 5 19 12 12 19" /></svg>,
  check: <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>,
  alert: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" /></svg>,
  undo: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 7v6h6" /><path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13" /></svg>,
  stop: <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="6" width="12" height="12" rx="2" /></svg>,
  file: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /></svg>,
}
const SRC_ICON: Record<string, React.ReactNode> = { csv: I.sheet, canny: I.key, zendesk: I.book }

const fmt = (n: number) => (n || 0).toLocaleString()
const plural = (n: number, one: string, many = one + 's') => `${fmt(n)} ${n === 1 ? one : many}`
function when(iso?: string | null) {
  if (!iso) return ''
  const d = new Date(iso), s = (Date.now() - d.getTime()) / 1000
  if (s < 60) return 'just now'
  if (s < 3600) return `${Math.floor(s / 60)} min ago`
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: d.getFullYear() === new Date().getFullYear() ? undefined : 'numeric' })
}
const created = (c: any) => (c?.ideas || 0) + (c?.comments || 0) + (c?.announcements || 0) + (c?.articles || 0)
const isActive = (j: any) => j && (j.status === 'queued' || j.status === 'running')

export default function ImportPage() {
  const [companyId, setCompanyId] = useState<string | null>(peekCompanyUser()?.companyId || null)
  const [ready, setReady] = useState(!!peekCompanyUser())
  const [stage, setStage] = useState<Stage>('pick')
  const [source, setSource] = useState<Source>('csv')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  // Source settings
  const [apiKey, setApiKey] = useState('')
  const [zdUrl, setZdUrl] = useState('')
  const [publish, setPublish] = useState(true)
  const [include, setInclude] = useState<Include>({ ideas: true, comments: true, announcements: true, articles: true })
  const [csvKind, setCsvKind] = useState<ImportKind>('ideas')
  const [csvName, setCsvName] = useState('')
  const [csvText, setCsvText] = useState('')
  const [mapping, setMapping] = useState<CsvMapping>({})
  const [dragOver, setDragOver] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const [preview, setPreview] = useState<any>(null)
  const [jobs, setJobs] = useState<any[]>([])
  const [needsMigration, setNeedsMigration] = useState(false)
  const [live, setLive] = useState<any>(null)     // the job being watched

  useEffect(() => {
    resolveCompanyUser().then(({ companyId }) => { setCompanyId(companyId); setReady(true) }).catch(() => setReady(true))
  }, [])

  const loadJobs = useCallback(async () => {
    if (!companyId) return
    try {
      const r = await authFetch(`/api/import/jobs?companyId=${companyId}`)
      const d = await r.json()
      setJobs(d.jobs || [])
      setNeedsMigration(!!d.needsMigration)
      const running = (d.jobs || []).find(isActive)
      if (running) setLive((cur: any) => cur && cur.id === running.id ? cur : running)
    } catch {}
  }, [companyId])
  useEffect(() => { loadJobs() }, [loadJobs])

  // Watch the live job; the poll also nudges a waiting job along (drive=1).
  useEffect(() => {
    if (!live || !companyId || !isActive(live)) return
    let stop = false
    const tick = async () => {
      try {
        const r = await authFetch(`/api/import/jobs/${live.id}?companyId=${companyId}&drive=1`)
        const d = await r.json()
        if (!stop && d.job) {
          setLive(d.job)
          if (!isActive(d.job)) loadJobs()
        }
      } catch {}
    }
    const t = setInterval(tick, 1500)
    return () => { stop = true; clearInterval(t) }
  }, [live?.id, live?.status, companyId, loadJobs])

  // ── CSV ──
  const parsed = useMemo(() => (csvText ? parseCsv(csvText) : null), [csvText])
  useEffect(() => { if (parsed) setMapping(guessMapping(parsed.headers, csvKind)) }, [parsed, csvKind])
  const readFile = async (f?: File | null) => {
    if (!f) return
    setError('')
    if (f.size > 25_000_000) { setError('That file is over 25 MB. Split it into smaller files.'); return }
    const text = await f.text()
    const p = parseCsv(text)
    if (!p.headers.length || !p.rows.length) { setError('That file has no rows. Export it as CSV (comma-separated) and try again.'); return }
    setCsvName(f.name); setCsvText(text)
  }
  const csvPayload = () => csvToPayload(csvText, csvKind, mapping, { publishArticles: publish })
  const csvInclude = (): Include => ({ ideas: csvKind === 'ideas', comments: false, announcements: false, articles: csvKind === 'articles' })
  const missingRequired = MAPPING_FIELDS[csvKind].filter(f => f.required && !mapping[f.key]).map(f => f.label)

  const requestBody = () => {
    if (source === 'csv') {
      const payload = csvPayload()
      return { source, payload, label: csvName, include: csvInclude(), publishArticles: publish }
    }
    if (source === 'canny') return { source, apiKey, include: { ...include, articles: false } }
    return { source, url: zdUrl, include: { ideas: false, comments: false, announcements: false, articles: true }, publishArticles: publish }
  }

  const runPreview = async () => {
    setError('')
    const body: any = requestBody()
    if (source === 'csv') {
      if (missingRequired.length) { setError(`Choose a column for ${missingRequired.join(' and ')}.`); return }
      if (JSON.stringify(body.payload).length > MAX_UPLOAD) { setError('This file is too big to import in one go. Split it into a few smaller files.'); return }
      if (!body.payload.ideas.length && !body.payload.articles.length) { setError('No rows had a title in the column you picked.'); return }
    }
    if (source === 'canny' && !apiKey.trim()) { setError('Paste your Canny API key.'); return }
    if (source === 'zendesk' && !zdUrl.trim()) { setError('Paste your help centre address.'); return }
    setBusy(true)
    try {
      const r = await authFetch('/api/import/preview', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ companyId, ...body }) })
      const d = await r.json()
      if (!r.ok || d.error) { setError(d.error || 'Couldn’t read the source.'); return }
      setPreview(d); setStage('preview')
    } catch { setError('Couldn’t reach Colvy. Check your connection and try again.') }
    finally { setBusy(false) }
  }

  const start = async () => {
    setError(''); setBusy(true)
    try {
      const r = await authFetch('/api/import/jobs', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ companyId, ...requestBody(), label: source === 'csv' ? csvName : preview?.label }) })
      const d = await r.json()
      if (!r.ok || d.error) { setError(d.error || 'Couldn’t start the import.'); return }
      setLive(d.job); setStage('pick'); setPreview(null); setApiKey(''); setCsvText(''); setCsvName('')
      loadJobs()
      window.scrollTo({ top: 0, behavior: 'smooth' })
    } catch { setError('Couldn’t reach Colvy. Check your connection and try again.') }
    finally { setBusy(false) }
  }

  const act = async (job: any, action: 'cancel' | 'undo') => {
    if (action === 'undo') {
      const n = created(job.counts)
      const ok = await confirmDialog({
        title: 'Undo this import?',
        message: `This removes the ${plural(n, 'item')} it added${job.counts?.comments ? ', including comments' : ''}. Anything you changed or added yourself since stays.`,
        confirmLabel: 'Undo import', tone: 'danger',
      })
      if (!ok) return
    }
    if (action === 'cancel' && !(await confirmDialog({ title: 'Stop this import?', message: 'What’s already been imported stays (you can undo it after).', confirmLabel: 'Stop import', tone: 'danger' }))) return
    try {
      const r = await authFetch(`/api/import/jobs/${job.id}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ companyId, action }) })
      const d = await r.json()
      if (!r.ok || d.error) { setError(d.error || 'That didn’t work. Try again.'); return }
      if (live?.id === job.id) setLive(d.job)
      loadJobs()
    } catch { setError('Couldn’t reach Colvy. Check your connection and try again.') }
  }

  const choose = (s: Source) => { setSource(s); setError(''); setStage('setup') }
  const anyActive = isActive(live) || jobs.some(isActive)

  if (ready && !companyId) {
    return <div style={{ padding: '60px 16px', textAlign: 'center', color: 'var(--slate)', fontSize: 14 }}>Set up your workspace first, then come back to import.</div>
  }

  return (
    <div style={{ minHeight: '100%', background: 'var(--canvas, #f6f7f9)' }}>
      <style>{CSS}</style>
      <div style={{ maxWidth: 860, margin: '0 auto', padding: '24px 16px 120px' }}>
        <div style={{ marginBottom: 20 }}>
          <h1 style={{ margin: 0, fontSize: 'clamp(22px, 3.4vw, 28px)', fontWeight: 800, letterSpacing: '-0.02em', color: 'var(--ink)' }}>Import</h1>
          <p style={{ margin: '4px 0 0', fontSize: 14, color: 'var(--slate)' }}>Bring your ideas, roadmap, updates and help articles into Colvy.</p>
        </div>

        {needsMigration && (
          <div className="im-note warn im-fade" style={{ marginBottom: 16 }}>{I.alert}<span>Imports need a one-time database update (<b>COLVY_V350_IMPORT_JOBS.sql</b>) before they can run.</span></div>
        )}

        {live && <LiveCard job={live} onStop={() => act(live, 'cancel')} onUndo={() => act(live, 'undo')} onDismiss={() => setLive(null)} />}

        {error && <div className="im-note err im-fade" style={{ marginBottom: 16 }} role="alert">{I.alert}<span>{error}</span></div>}

        {/* ── Pick a source ── */}
        {stage === 'pick' && (
          <div className="im-fade">
            <div className="im-grid">
              <SourceCard icon={I.sheet} title="Spreadsheet (CSV)" text="Ideas or help articles from any tool that exports CSV. You choose which column is which." onClick={() => choose('csv')} disabled={anyActive} />
              <SourceCard icon={I.key} title="Canny" text="Posts, votes, comments, tags and your changelog, using your Canny API key." onClick={() => choose('canny')} disabled={anyActive} />
              <SourceCard icon={I.book} title="Zendesk Help Center" text="Articles and sections from a public Zendesk help centre." onClick={() => choose('zendesk')} disabled={anyActive} />
              <Link href="/admin/help/import" className="im-src" style={{ textDecoration: 'none' }}>
                <span className="im-src-ic">{I.globe}</span>
                <span style={{ minWidth: 0 }}>
                  <span className="im-src-t">Any help centre website</span>
                  <span className="im-src-d">Colvy AI reads your help site and drafts articles for you to review.</span>
                </span>
              </Link>
            </div>
            {anyActive && <p style={{ fontSize: 12.5, color: 'var(--slate)', margin: '10px 2px 0' }}>You can start another import when this one finishes.</p>}

            <div className="im-card" style={{ marginTop: 16 }}>
              <p className="im-h">Moving from another tool?</p>
              <p className="im-p" style={{ marginTop: 4 }}>Export your ideas (they may be called posts, suggestions or features) as a CSV file from the tool’s settings or ideas list, then upload it as a spreadsheet.</p>
              <div className="im-chips">{CSV_TOOLS.map(t => <span key={t} className="im-chip">{t}</span>)}</div>
              <p className="im-p" style={{ marginTop: 14 }}>For a help centre on another platform, use <b>Any help centre website</b>:</p>
              <div className="im-chips">{SITE_TOOLS.map(t => <span key={t} className="im-chip">{t}</span>)}</div>
            </div>
          </div>
        )}

        {/* ── Set up the source ── */}
        {stage === 'setup' && (
          <div className="im-fade">
            <button type="button" className="im-back" onClick={() => { setStage('pick'); setError('') }}>{I.back} All sources</button>
            <div className="im-card">
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
                <span className="im-src-ic">{SRC_ICON[source]}</span>
                <div>
                  <p className="im-h" style={{ fontSize: 16 }}>{source === 'csv' ? 'Import a spreadsheet' : source === 'canny' ? 'Import from Canny' : 'Import from Zendesk'}</p>
                  <p className="im-p">{source === 'csv' ? 'CSV files from any tool, Google Sheets or Excel.' : source === 'canny' ? 'Nothing is imported until you’ve seen the preview.' : 'Public help centres only.'}</p>
                </div>
              </div>

              {source === 'csv' && (
                <>
                  <p className="im-label">What’s in the file?</p>
                  <div className="im-seg" role="tablist">
                    {(['ideas', 'articles'] as ImportKind[]).map(k => (
                      <button key={k} type="button" role="tab" aria-selected={csvKind === k} className={csvKind === k ? 'on' : ''} onClick={() => setCsvKind(k)}>{k === 'ideas' ? 'Ideas' : 'Help articles'}</button>
                    ))}
                  </div>
                  {!csvText ? (
                    <div className={`im-drop ${dragOver ? 'over' : ''}`} onClick={() => fileRef.current?.click()} role="button" tabIndex={0}
                      onKeyDown={e => (e.key === 'Enter' || e.key === ' ') && fileRef.current?.click()}
                      onDragOver={e => { e.preventDefault(); setDragOver(true) }} onDragLeave={() => setDragOver(false)}
                      onDrop={e => { e.preventDefault(); setDragOver(false); readFile(e.dataTransfer.files?.[0]) }}>
                      <span style={{ color: 'var(--coral)' }}>{I.upload}</span>
                      <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--ink)' }}>Choose a CSV file</span>
                      <span style={{ fontSize: 12.5, color: 'var(--slate)' }}>or drop it here</span>
                    </div>
                  ) : (
                    <>
                      <div className="im-file">
                        <span style={{ color: 'var(--slate)' }}>{I.file}</span>
                        <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 600 }}>{csvName}</span>
                        <span style={{ color: 'var(--slate)', fontSize: 12.5, flexShrink: 0 }}>{plural(parsed?.rows.length || 0, 'row')}</span>
                        <button type="button" className="im-link" onClick={() => { setCsvText(''); setCsvName('') }}>Change</button>
                      </div>
                      <p className="im-label" style={{ marginTop: 18 }}>Match the columns</p>
                      <div className="im-map">
                        {MAPPING_FIELDS[csvKind].map(f => {
                          const col = mapping[f.key]
                          const sample = col && parsed ? (parsed.rows.find(r => (r[parsed.headers.indexOf(col)] || '').trim())?.[parsed.headers.indexOf(col)] || '') : ''
                          return (
                            <div key={f.key} className="im-map-row">
                              <label htmlFor={`map-${f.key}`} className="im-map-l">{f.label}{f.required && <span style={{ color: 'var(--coral)' }}> *</span>}</label>
                              <select id={`map-${f.key}`} value={col || ''} onChange={e => setMapping(m => ({ ...m, [f.key]: e.target.value || null }))} className="im-select">
                                <option value="">{f.required ? 'Choose a column' : 'Don’t import'}</option>
                                {parsed?.headers.map(h => <option key={h} value={h}>{h}</option>)}
                              </select>
                              <span className="im-map-s">{sample ? sample.replace(/<[^>]+>/g, ' ').slice(0, 60) : ''}</span>
                            </div>
                          )
                        })}
                      </div>
                    </>
                  )}
                  <input ref={fileRef} type="file" accept=".csv,.tsv,text/csv,text/tab-separated-values" hidden onChange={e => { readFile(e.target.files?.[0]); e.target.value = '' }} />
                  {csvKind === 'articles' && <Toggle on={publish} onChange={setPublish} label="Publish articles straight away" hint="Off saves them as drafts for you to review." />}
                </>
              )}

              {source === 'canny' && (
                <>
                  <label className="im-label" htmlFor="canny-key">Canny API key</label>
                  <input id="canny-key" type="password" autoComplete="off" value={apiKey} onChange={e => setApiKey(e.target.value)} placeholder="Paste your API key" className="im-input" />
                  <p className="im-hint">In Canny, open <b>Settings → API</b> and copy the secret key. It’s only used to read your data and is deleted as soon as the import has read it.</p>
                  <p className="im-label" style={{ marginTop: 16 }}>Bring in</p>
                  <Check on={include.ideas} onChange={v => setInclude(i => ({ ...i, ideas: v, comments: v && i.comments }))} label="Posts as ideas" hint="With votes, status and tags" />
                  <Check on={include.comments && include.ideas} disabled={!include.ideas} onChange={v => setInclude(i => ({ ...i, comments: v }))} label="Comments" hint="Internal comments stay private" />
                  <Check on={include.announcements} onChange={v => setInclude(i => ({ ...i, announcements: v }))} label="Changelog as updates" />
                </>
              )}

              {source === 'zendesk' && (
                <>
                  <label className="im-label" htmlFor="zd-url">Help centre address</label>
                  <input id="zd-url" value={zdUrl} onChange={e => setZdUrl(e.target.value)} placeholder="yourcompany.zendesk.com" className="im-input" inputMode="url" onKeyDown={e => e.key === 'Enter' && runPreview()} />
                  <p className="im-hint">The address your customers visit. Custom help domains work too. Each Zendesk section becomes a help category.</p>
                  <Toggle on={publish} onChange={setPublish} label="Publish articles straight away" hint="Off saves them as drafts for you to review." />
                </>
              )}

              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 20 }}>
                <button type="button" className="im-primary" onClick={runPreview} disabled={busy || (source === 'csv' && !csvText) || (source === 'canny' && !include.ideas && !include.announcements)}>
                  {busy ? <><span className="im-spin" /> {source === 'csv' ? 'Checking…' : 'Reading…'}</> : <>Preview import {I.arrow}</>}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── Preview ── */}
        {stage === 'preview' && preview && <Preview p={preview} busy={busy} onBack={() => setStage('setup')} onStart={start} />}

        {/* ── History ── */}
        {jobs.some(j => !isActive(j)) && (
          <div style={{ marginTop: 28 }}>
            <p className="im-label" style={{ margin: '0 2px 8px' }}>Past imports</p>
            <div className="im-card" style={{ padding: 0, overflow: 'hidden' }}>
              {jobs.filter(j => !isActive(j)).map(j => <HistoryRow key={j.id} job={j} onUndo={() => act(j, 'undo')} />)}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Pieces ───────────────────────────────────────────────────────────────────
function SourceCard({ icon, title, text, onClick, disabled }: { icon: React.ReactNode; title: string; text: string; onClick: () => void; disabled?: boolean }) {
  return (
    <button type="button" className="im-src" onClick={onClick} disabled={disabled}>
      <span className="im-src-ic">{icon}</span>
      <span style={{ minWidth: 0 }}>
        <span className="im-src-t">{title}</span>
        <span className="im-src-d">{text}</span>
      </span>
    </button>
  )
}

function Check({ on, onChange, label, hint, disabled }: { on: boolean; onChange: (v: boolean) => void; label: string; hint?: string; disabled?: boolean }) {
  return (
    <label className="im-check" style={{ opacity: disabled ? 0.45 : 1 }}>
      <input type="checkbox" checked={on} disabled={disabled} onChange={e => onChange(e.target.checked)} />
      <span className={`im-box ${on ? 'on' : ''}`}>{on && I.check}</span>
      <span><span style={{ fontWeight: 600, color: 'var(--ink)' }}>{label}</span>{hint && <span style={{ color: 'var(--slate)' }}> · {hint}</span>}</span>
    </label>
  )
}

function Toggle({ on, onChange, label, hint }: { on: boolean; onChange: (v: boolean) => void; label: string; hint?: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginTop: 16 }}>
      <div><p style={{ margin: 0, fontSize: 13.5, fontWeight: 600, color: 'var(--ink)' }}>{label}</p>{hint && <p className="im-hint" style={{ margin: '2px 0 0' }}>{hint}</p>}</div>
      <button type="button" role="switch" aria-checked={on} aria-label={label} onClick={() => onChange(!on)} className={`im-switch ${on ? 'on' : ''}`}><span /></button>
    </div>
  )
}

function Preview({ p, busy, onBack, onStart }: { p: any; busy: boolean; onBack: () => void; onStart: () => void }) {
  const t = p.toImport || {}
  const dup = p.duplicates || {}
  const total = (t.ideas || 0) + (t.comments || 0) + (t.announcements || 0) + (t.articles || 0)
  const dupTotal = (dup.ideas || 0) + (dup.announcements || 0) + (dup.articles || 0)
  const tiles = (['ideas', 'comments', 'announcements', 'articles'] as const).filter(k => (p.found?.[k] || 0) > 0)
  return (
    <div className="im-fade">
      <button type="button" className="im-back" onClick={onBack}>{I.back} Back</button>
      <div className="im-card">
        <p className="im-h" style={{ fontSize: 16 }}>Here’s what will be imported</p>
        <p className="im-p">From {p.label || 'your file'}. Nothing has changed in Colvy yet.</p>
        {!p.complete && <div className="im-note warn" style={{ marginTop: 12 }}>{I.alert}<span>This source is large, so the preview counted what it could read in 40 seconds. The import itself reads everything.</span></div>}
        {(p.warnings || []).map((w: string) => <div key={w} className="im-note warn" style={{ marginTop: 12 }}>{I.alert}<span>{w}</span></div>)}

        <div className="im-tiles">
          {tiles.length === 0 && <p className="im-p">The source had nothing of the kinds you picked.</p>}
          {tiles.map((k, i) => (
            <div key={k} className="im-tile" style={{ animationDelay: `${i * 60}ms` }}>
              <span className="im-tile-n">{fmt(t[k] || 0)}</span>
              <span className="im-tile-l">{KIND_LABEL[k]}</span>
              {(dup[k] || 0) > 0 && <span className="im-tile-s">{fmt(dup[k])} already in Colvy</span>}
              {k === 'comments' && (p.found.comments - (t.comments || 0)) > 0 && <span className="im-tile-s">{fmt(p.found.comments - (t.comments || 0))} on skipped ideas</span>}
            </div>
          ))}
        </div>

        {dupTotal > 0 && (
          <div className="im-sec">
            <p className="im-label">Skipped — already in Colvy ({fmt(dupTotal)})</p>
            <p className="im-hint" style={{ marginTop: 0 }}>Items with the same title as something you already have aren’t imported again.</p>
            <ul className="im-list">{(p.samples?.duplicates || []).map((s: string, i: number) => <li key={i} style={{ color: 'var(--slate)' }}>{s}</li>)}</ul>
          </div>
        )}

        {(p.statusMap || []).length > 0 && (
          <div className="im-sec">
            <p className="im-label">How statuses map</p>
            <div className="im-table">
              {p.statusMap.map((r: any, i: number) => (
                <div key={i} className="im-tr"><span className="im-td-from">{r.from}</span><span style={{ color: 'var(--slate)' }}>{I.arrow}</span><span className="im-td-to">{r.to}</span><span className="im-td-n">{fmt(r.count)}</span></div>
              ))}
            </div>
          </div>
        )}

        {(p.samples?.ideas || []).length > 0 && (
          <div className="im-sec">
            <p className="im-label">First ideas</p>
            <ul className="im-list">{p.samples.ideas.map((s: any, i: number) => (
              <li key={i}><span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.title}</span><span className="im-pill">{s.status}</span>{s.votes > 0 && <span className="im-votes">{plural(s.votes, 'vote')}</span>}</li>
            ))}</ul>
          </div>
        )}

        {(p.samples?.articles || []).length > 0 && (
          <div className="im-sec">
            <p className="im-label">First articles</p>
            <ul className="im-list">{p.samples.articles.map((s: any, i: number) => (
              <li key={i}><span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.title}</span><span className="im-pill">{s.category}</span>{s.status === 'draft' && <span className="im-votes">Draft</span>}</li>
            ))}</ul>
            {(p.categories || []).length > 0 && <p className="im-hint">Categories: {p.categories.map((c: any) => `${c.name} (${c.count})`).join(', ')}</p>}
          </div>
        )}

        {(p.samples?.announcements || []).length > 0 && (
          <div className="im-sec">
            <p className="im-label">First updates</p>
            <ul className="im-list">{p.samples.announcements.map((s: any, i: number) => <li key={i}>{s.title}</li>)}</ul>
          </div>
        )}

        <div className="im-foot">
          <p className="im-hint" style={{ margin: 0, flex: '1 1 220px' }}>It runs in the background, so you can leave this page. You can undo it afterwards.</p>
          <button type="button" className="im-primary" onClick={onStart} disabled={busy || total === 0}>
            {busy ? <><span className="im-spin" /> Starting…</> : total === 0 ? 'Nothing new to import' : <>Import {plural(total, 'item')}</>}
          </button>
        </div>
      </div>
    </div>
  )
}

function LiveCard({ job, onStop, onUndo, onDismiss }: { job: any; onStop: () => void; onUndo: () => void; onDismiss: () => void }) {
  const c = job.counts || {}
  const done = created(c) + (c.skipped || 0)
  const pct = job.total ? Math.min(100, Math.round((done / job.total) * 100)) : 0
  const reading = job.stage === 'fetch'
  const active = isActive(job)
  const name = SOURCE_NAME[job.source] || 'source'
  const title = active ? (reading ? `Reading from ${name}…` : 'Importing…')
    : job.status === 'done' ? 'Import complete' : job.status === 'cancelled' ? 'Import stopped' : job.status === 'undone' ? 'Import undone' : 'Import didn’t finish'
  const parts = (['ideas', 'comments', 'announcements', 'articles'] as const).filter(k => c[k] > 0).map(k => plural(c[k], KIND_LABEL[k].toLowerCase().replace(/s$/, ''), KIND_LABEL[k].toLowerCase()))
  return (
    <div className="im-card im-live im-fade" style={{ marginBottom: 16 }} aria-live="polite">
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
        <span className={`im-orb ${active ? 'on' : job.status === 'done' ? 'ok' : ''}`}>{active ? <span className="im-spin light" /> : job.status === 'done' ? I.check : SRC_ICON[job.source]}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p key={title} className="im-h im-swap">{title}</p>
          <p className="im-p">
            {reading ? (c.fetched ? `${fmt(c.fetched)} items read so far` : 'Connecting…')
              : active ? `${fmt(done)} of ${fmt(job.total)} done`
              : job.status === 'undone' ? 'Everything it added has been removed.'
              : parts.length ? `Added ${parts.join(', ')}` : 'Nothing was added.'}
            {!active && c.skipped > 0 && job.status !== 'undone' && ` · ${fmt(c.skipped)} skipped`}
          </p>
        </div>
        {active && <button type="button" className="im-ghost" onClick={onStop}>{I.stop} Stop</button>}
        {!active && <button type="button" className="im-ghost" onClick={onDismiss} aria-label="Dismiss">Done</button>}
      </div>
      {active && (
        <>
          <div className="im-bar"><span className={reading ? 'indet' : ''} style={reading ? undefined : { width: `${Math.max(pct, 3)}%` }} /></div>
          <p className="im-hint" style={{ marginBottom: 0 }}>You can close this page. The import keeps going.</p>
        </>
      )}
      {(job.errors || []).length > 0 && (
        <ul className="im-errs">{job.errors.slice(0, 4).map((e: string, i: number) => <li key={i}>{e}</li>)}</ul>
      )}
      {!active && job.status !== 'undone' && created(c) > 0 && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 14 }}>
          {c.ideas > 0 && <Link href="/admin" className="im-secondary">View ideas</Link>}
          {c.articles > 0 && <Link href="/admin/help" className="im-secondary">View articles</Link>}
          <button type="button" className="im-secondary" onClick={onUndo}>{I.undo} Undo import</button>
        </div>
      )}
    </div>
  )
}

function HistoryRow({ job, onUndo }: { job: any; onUndo: () => void }) {
  const c = job.counts || {}
  const n = created(c)
  const status = job.status === 'done' ? 'Done' : job.status === 'cancelled' ? 'Stopped' : job.status === 'undone' ? 'Undone' : 'Failed'
  const tone = job.status === 'done' ? 'ok' : job.status === 'failed' ? 'bad' : ''
  return (
    <div className="im-row">
      <span className="im-row-ic">{SRC_ICON[job.source]}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{job.label || SOURCE_NAME[job.source]}</p>
        <p style={{ margin: '2px 0 0', fontSize: 12.5, color: 'var(--slate)' }}>
          {when(job.created_at)}{job.created_by_name ? ` · ${job.created_by_name}` : ''} · {job.status === 'undone' ? `${plural(n, 'item')} removed` : `${plural(n, 'item')} added`}{c.skipped ? `, ${fmt(c.skipped)} skipped` : ''}
        </p>
        {job.status === 'failed' && job.errors?.[0] && <p style={{ margin: '4px 0 0', fontSize: 12.5, color: '#b42318' }}>{job.errors[0]}</p>}
      </div>
      <span className={`im-status ${tone}`}>{status}</span>
      {job.status !== 'undone' && n > 0 && <button type="button" className="im-ghost" onClick={onUndo} title="Remove everything this import added">{I.undo} Undo</button>}
    </div>
  )
}

const CSS = `
.im-fade{animation:imFade .5s ${EASE} both}
.im-swap{animation:imSwap .4s ${EASE} both}
@keyframes imFade{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}
@keyframes imSwap{from{opacity:0;transform:translateY(4px);filter:blur(3px)}to{opacity:1;transform:none;filter:none}}
@media (prefers-reduced-motion: reduce){.im-fade,.im-swap,.im-tile{animation:none!important}}
.im-card{background:#fff;border:1px solid var(--border);border-radius:20px;padding:20px}
@media (min-width:640px){.im-card{padding:24px}}
.im-h{margin:0;font-size:15px;font-weight:700;color:var(--ink)}
.im-p{margin:2px 0 0;font-size:13.5px;color:var(--slate);line-height:1.5}
.im-label{display:block;margin:0 0 8px;font-size:12px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;color:var(--slate)}
.im-hint{margin:8px 0 0;font-size:12.5px;color:var(--slate);line-height:1.5}
.im-grid{display:grid;grid-template-columns:minmax(0,1fr);gap:10px}
@media (min-width:640px){.im-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}
.im-src{display:flex;align-items:flex-start;gap:12px;text-align:left;padding:16px;border-radius:18px;border:1px solid var(--border);background:#fff;cursor:pointer;font-family:inherit;transition:transform .25s ${EASE},box-shadow .25s ${EASE},border-color .2s ease}
.im-src:hover:not(:disabled){transform:translateY(-2px);box-shadow:0 12px 28px rgba(15,23,42,.08);border-color:color-mix(in srgb,var(--coral) 35%,var(--border))}
.im-src:active:not(:disabled){transform:scale(.985)}
.im-src:disabled{opacity:.5;cursor:default}
.im-src-ic{width:40px;height:40px;flex-shrink:0;border-radius:12px;display:inline-flex;align-items:center;justify-content:center;background:var(--peach);color:var(--coral)}
.im-src-t{display:block;font-size:14.5px;font-weight:700;color:var(--ink)}
.im-src-d{display:block;margin-top:3px;font-size:12.5px;line-height:1.45;color:var(--slate)}
.im-chips{display:flex;flex-wrap:wrap;gap:6px;margin-top:10px}
.im-chip{padding:4px 10px;border-radius:999px;background:var(--canvas,#f6f7f9);font-size:12px;font-weight:600;color:var(--ink)}
.im-back{display:inline-flex;align-items:center;gap:4px;margin:0 0 12px;padding:0;border:none;background:none;color:var(--coral);font-size:13.5px;font-weight:600;cursor:pointer;font-family:inherit}
.im-seg{display:inline-flex;padding:3px;border-radius:12px;background:var(--canvas,#f3f4f6);margin-bottom:14px}
.im-seg button{padding:7px 14px;border:none;border-radius:9px;background:transparent;font-size:13px;font-weight:600;color:var(--slate);cursor:pointer;font-family:inherit;transition:background .25s ${EASE},color .2s ease,box-shadow .25s ${EASE}}
.im-seg button.on{background:#fff;color:var(--ink);box-shadow:0 1px 3px rgba(15,23,42,.12)}
.im-drop{display:flex;flex-direction:column;align-items:center;gap:6px;padding:28px 16px;border-radius:16px;border:1.5px dashed var(--border);background:#fcfcfd;cursor:pointer;transition:border-color .2s ease,background .2s ease,transform .25s ${EASE}}
.im-drop:hover,.im-drop.over{border-color:var(--coral);background:color-mix(in srgb,var(--coral) 5%,#fff)}
.im-drop.over{transform:scale(1.01)}
.im-file{display:flex;align-items:center;gap:10px;padding:11px 14px;border-radius:14px;border:1px solid var(--border);font-size:13.5px;color:var(--ink)}
.im-link{border:none;background:none;color:var(--coral);font-size:13px;font-weight:700;cursor:pointer;padding:0;font-family:inherit;flex-shrink:0}
.im-map{display:flex;flex-direction:column;gap:8px}
.im-map-row{display:grid;grid-template-columns:minmax(0,1fr);gap:4px}
@media (min-width:640px){.im-map-row{grid-template-columns:130px 220px minmax(0,1fr);align-items:center;gap:12px}}
.im-map-l{font-size:13.5px;font-weight:600;color:var(--ink)}
.im-map-s{font-size:12px;color:var(--slate);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.im-select,.im-input{width:100%;box-sizing:border-box;padding:10px 12px;border-radius:12px;border:1px solid var(--border);background:#fff;font-size:14px;color:var(--ink);font-family:inherit;outline:none;transition:border-color .2s ease,box-shadow .2s ease}
.im-select:focus,.im-input:focus{border-color:var(--coral);box-shadow:0 0 0 3px color-mix(in srgb,var(--coral) 15%,transparent)}
.im-check{display:flex;align-items:center;gap:10px;padding:8px 0;font-size:13.5px;cursor:pointer}
.im-check input{position:absolute;opacity:0;pointer-events:none}
.im-box{width:18px;height:18px;flex-shrink:0;border-radius:6px;border:1.5px solid var(--border);display:inline-flex;align-items:center;justify-content:center;color:#fff;transition:background .2s ease,border-color .2s ease}
.im-box.on{background:var(--coral);border-color:var(--coral)}
.im-check input:focus-visible + .im-box{box-shadow:0 0 0 3px color-mix(in srgb,var(--coral) 25%,transparent)}
.im-switch{position:relative;width:44px;height:26px;flex-shrink:0;border-radius:999px;border:none;background:color-mix(in srgb,var(--slate) 28%,transparent);cursor:pointer;transition:background .3s ${EASE}}
.im-switch span{position:absolute;top:3px;left:3px;width:20px;height:20px;border-radius:50%;background:#fff;box-shadow:0 1px 3px rgba(0,0,0,.2);transition:transform .3s ${EASE}}
.im-switch.on{background:var(--coral)}.im-switch.on span{transform:translateX(18px)}
.im-primary{display:inline-flex;align-items:center;justify-content:center;gap:7px;padding:11px 20px;border-radius:13px;border:none;background:var(--coral);color:#fff;font-size:14px;font-weight:700;cursor:pointer;white-space:nowrap;font-family:inherit;transition:transform .15s ${EASE},opacity .2s ease;box-shadow:0 6px 16px color-mix(in srgb,var(--coral) 28%,transparent)}
.im-primary:hover:not(:disabled){transform:translateY(-1px)}.im-primary:active:not(:disabled){transform:scale(.97)}.im-primary:disabled{opacity:.45;cursor:default}
.im-secondary{display:inline-flex;align-items:center;gap:6px;padding:9px 14px;border-radius:12px;border:1px solid var(--border);background:#fff;color:var(--ink);font-size:13px;font-weight:700;cursor:pointer;text-decoration:none;font-family:inherit;transition:background .2s ease,transform .15s ${EASE}}
.im-secondary:hover{background:#fafafa}.im-secondary:active{transform:scale(.97)}
.im-ghost{display:inline-flex;align-items:center;gap:5px;flex-shrink:0;padding:7px 10px;border-radius:10px;border:none;background:none;color:var(--slate);font-size:13px;font-weight:600;cursor:pointer;font-family:inherit;transition:background .2s ease,color .2s ease}
.im-ghost:hover{background:var(--canvas,#f3f4f6);color:var(--ink)}
.im-spin{width:14px;height:14px;border-radius:50%;border:2px solid color-mix(in srgb,#fff 40%,transparent);border-top-color:#fff;animation:imSpin .8s linear infinite;display:inline-block}
.im-spin.light{width:18px;height:18px}
@keyframes imSpin{to{transform:rotate(360deg)}}
.im-note{display:flex;gap:10px;align-items:flex-start;padding:12px 14px;border-radius:14px;font-size:13.5px;line-height:1.45}
.im-note svg{flex-shrink:0;margin-top:2px}
.im-note.warn{background:#fffaeb;color:#93370d;border:1px solid #fedf89}
.im-note.err{background:#fef3f2;color:#b42318;border:1px solid #fecdca}
.im-tiles{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;margin-top:18px}
@media (min-width:640px){.im-tiles{grid-template-columns:repeat(4,minmax(0,1fr))}}
.im-tile{display:flex;flex-direction:column;padding:14px;border-radius:16px;background:var(--canvas,#f6f7f9);animation:imFade .5s ${EASE} both}
.im-tile-n{font-size:24px;font-weight:800;letter-spacing:-.02em;color:var(--ink)}
.im-tile-l{font-size:13px;font-weight:600;color:var(--ink)}
.im-tile-s{margin-top:4px;font-size:11.5px;color:var(--slate)}
.im-sec{margin-top:20px;padding-top:18px;border-top:1px solid var(--border)}
.im-list{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:2px}
.im-list li{display:flex;align-items:center;gap:8px;padding:7px 0;font-size:13.5px;color:var(--ink);min-width:0}
.im-pill{flex-shrink:0;padding:2px 9px;border-radius:999px;background:var(--peach);color:var(--coral);font-size:11.5px;font-weight:700;max-width:40%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.im-votes{flex-shrink:0;font-size:12px;color:var(--slate)}
.im-table{display:flex;flex-direction:column;gap:2px;max-width:560px}
.im-tr{display:grid;grid-template-columns:minmax(0,1fr) 16px minmax(0,1fr) auto;align-items:center;gap:10px;padding:7px 0;font-size:13.5px}
.im-td-from{color:var(--ink);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.im-td-to{font-weight:600;color:var(--ink);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.im-td-n{font-size:12.5px;color:var(--slate);font-variant-numeric:tabular-nums}
.im-foot{display:flex;align-items:center;justify-content:space-between;gap:14px;flex-wrap:wrap;margin-top:22px;padding-top:18px;border-top:1px solid var(--border)}
.im-live{box-shadow:0 14px 36px rgba(15,23,42,.07)}
.im-orb{width:40px;height:40px;flex-shrink:0;border-radius:13px;display:inline-flex;align-items:center;justify-content:center;background:var(--peach);color:var(--coral);transition:background .4s ${EASE},color .4s ${EASE}}
.im-orb.on{background:var(--coral);color:#fff}
.im-orb.ok{background:#12b76a;color:#fff}
.im-orb.ok svg{width:18px;height:18px}
.im-bar{position:relative;height:6px;margin-top:16px;border-radius:6px;background:color-mix(in srgb,var(--slate) 14%,transparent);overflow:hidden}
.im-bar span{position:absolute;left:0;top:0;bottom:0;border-radius:6px;background:var(--coral);transition:width .8s ${EASE}}
.im-bar span.indet{width:35%;animation:imIndet 1.4s ${EASE} infinite}
@keyframes imIndet{from{transform:translateX(-100%)}to{transform:translateX(290%)}}
.im-errs{margin:12px 0 0;padding:0 0 0 18px;font-size:12.5px;color:#93370d;line-height:1.5}
.im-row{display:flex;align-items:center;gap:12px;padding:14px 16px;border-top:1px solid var(--border)}
.im-row:first-child{border-top:none}
.im-row-ic{width:34px;height:34px;flex-shrink:0;border-radius:10px;display:inline-flex;align-items:center;justify-content:center;background:var(--canvas,#f6f7f9);color:var(--slate)}
.im-row-ic svg{width:17px;height:17px}
.im-status{flex-shrink:0;padding:3px 9px;border-radius:999px;font-size:11.5px;font-weight:700;background:var(--canvas,#f3f4f6);color:var(--slate)}
.im-status.ok{background:#ecfdf3;color:#067647}
.im-status.bad{background:#fef3f2;color:#b42318}
@media (max-width:480px){.im-row{flex-wrap:wrap}.im-row .im-ghost{margin-left:auto}}
`
