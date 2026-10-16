'use client'

// One poll or survey, full width: Results / Responses / Edit / Share tabs
// (the form Results layout and styles). Reads as the signed-in member (RLS);
// answers are deleted through /api/engage/responses. Results update live
// while the page is open.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { resolveCompanyUser } from '@/lib/client-cache'
import { confirmDialog } from '@/components/ConfirmDialog'
import { ResultsStyles } from '@/components/form-results/styles'
import { Icon } from '@/components/form-results/icons'
import { settingsWithoutClose, settingsOf, statusFields, statusOf, tallyPoll, closeNote, type EngageKind } from '@/lib/engage-core'
import { pollLines, surveyLines } from '@/lib/engage-table'
import { EngageStyles } from './styles'
import { EngageIcon } from './icons'
import { SharePanel } from './SharePanel'
import { PollResults } from './PollResults'
import { SurveyResults } from './SurveyResults'
import { AnswersTable } from './AnswersTable'
import { PollEditor, pollDraftOf, pollFields, type PollDraft } from './PollEditor'
import { SurveyEditor, surveyDraftOf, surveyFields, type SurveyDraft } from './SurveyEditor'
import { createCampaignDraft, deleteAnswers, loadAnswers, publicUrl, updateItem, TABLE, ANSWERS } from './data'

const db = supabase as any
type Tab = 'results' | 'responses' | 'edit' | 'share'
const TABS: Tab[] = ['results', 'responses', 'edit', 'share']
const LIVE_MS = 15_000

export default function EngageDetailPage({ kind }: { kind: EngageKind }) {
  const params = useParams()
  const router = useRouter()
  const id = String(params?.id || '')
  const noun = kind === 'poll' ? 'poll' : 'survey'
  const Noun = kind === 'poll' ? 'Poll' : 'Survey'
  const [row, setRow] = useState<any>(null)
  const [state, setState] = useState<'loading' | 'ready' | 'missing'>('loading')
  const [answers, setAnswers] = useState<any[]>([])
  const [answersState, setAnswersState] = useState<'loading' | 'ready' | 'error'>('loading')
  const [capped, setCapped] = useState(false)
  const [companyId, setCompanyId] = useState<string | null>(null)
  const [company, setCompany] = useState<any>(null)
  const [user, setUser] = useState<any>(null)
  const [tab, setTab] = useState<Tab>('results')
  const [now, setNow] = useState(() => Date.now())
  const [pollDraft, setPollDraft] = useState<PollDraft | null>(null)
  const [surveyDraft, setSurveyDraft] = useState<SurveyDraft | null>(null)
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [savedAt, setSavedAt] = useState<number | null>(null)
  const [problems, setProblems] = useState<string[]>([])
  const [notice, setNotice] = useState<string | null>(null)
  const [hasSettingsColumn, setHasSettingsColumn] = useState(true)
  const [deleting, setDeleting] = useState(false)
  const [smsBusy, setSmsBusy] = useState(false)
  const [toast, setToast] = useState('')
  const latest = useRef<string | null>(null)

  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(''), 2600); return () => clearTimeout(t) }, [toast])
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 30_000); return () => clearInterval(t) }, [])

  // ── Tab in ?tab= ──
  useEffect(() => {
    try {
      const t = new URLSearchParams(window.location.search).get('tab') as Tab | null
      if (t && TABS.includes(t)) setTab(t)
    } catch {}
  }, [])
  const changeTab = useCallback((t: Tab) => {
    setTab(t)
    try {
      const url = new URL(window.location.href)
      if (t === 'results') url.searchParams.delete('tab'); else url.searchParams.set('tab', t)
      window.history.replaceState(window.history.state, '', url.toString())
    } catch {}
  }, [])

  const resetDraft = useCallback((r: any) => {
    if (kind === 'poll') setPollDraft(pollDraftOf(r)); else setSurveyDraft(surveyDraftOf(r))
    setDirty(false); setProblems([])
    setHasSettingsColumn(!r || 'settings' in r)
  }, [kind])

  // ── The poll / survey (members-only read) ──
  useEffect(() => {
    let live = true
    ;(async () => {
      const [{ companyId: cid, user: u }, { data }] = await Promise.all([
        resolveCompanyUser(),
        db.from(TABLE[kind]).select('*').eq('id', id).maybeSingle(),
      ])
      if (!live) return
      setUser(u)
      // Only this workspace's: RLS already says so after V386; before it, check here.
      if (!data || (cid && data.company_id && data.company_id !== cid)) { setState('missing'); return }
      setCompanyId(data.company_id || cid || null)
      setRow(data); resetDraft(data); setState('ready')
      const co = data.company_id || cid
      if (co) db.from('companies').select('name, logo_url, accent_color, slug').eq('id', co).maybeSingle().then(({ data: c }: any) => { if (live) setCompany(c || null) }, () => {})
    })().catch(() => { if (live) setState('missing') })
    return () => { live = false }
  }, [id, kind, resetDraft])

  // ── Answers ──
  const loadAll = useCallback(async () => {
    setAnswersState('loading')
    const res = await loadAnswers(db, kind, id)
    setAnswers(res.rows); setCapped(res.capped)
    latest.current = res.rows[0]?.created_at || null
    setAnswersState(res.error ? 'error' : 'ready')
  }, [id, kind])
  useEffect(() => { void loadAll() }, [loadAll])

  // Live: newer rows every 15 seconds while the results or responses are on screen.
  const status = row ? statusOf(row, now) : 'draft'
  useEffect(() => {
    if (status !== 'live' || (tab !== 'results' && tab !== 'responses') || answersState !== 'ready') return
    const t = setInterval(async () => {
      if (document.visibilityState !== 'visible') return
      const { table, col } = ANSWERS[kind]
      let q = db.from(table).select('*').eq(col, id).order('created_at', { ascending: false }).limit(500)
      if (latest.current) q = q.gt('created_at', latest.current)
      const { data, error } = await q
      if (error || !data?.length) return
      latest.current = data[0].created_at
      setAnswers(prev => { const seen = new Set(prev.map(r => r.id)); return [...data.filter((r: any) => !seen.has(r.id)), ...prev] })
    }, LIVE_MS)
    return () => clearInterval(t)
  }, [status, tab, answersState, id, kind])

  const url = useMemo(() => publicUrl(kind, id, company?.slug), [kind, id, company?.slug])
  const title = kind === 'poll' ? String(row?.question || 'Untitled poll') : String(row?.title || 'Untitled survey')
  const table = useMemo(() => (row ? (kind === 'poll' ? pollLines(row, answers) : surveyLines(row, answers)) : { header: [], lines: [] }), [row, answers, kind])
  const votedOptions = useMemo(() => (kind === 'poll' && row ? new Set(tallyPoll(row, answers).rows.filter(r => r.count > 0 || (r.points || 0) > 0).map(r => r.label)) : new Set<string>()), [row, answers, kind])

  // ── Save / publish / close ──
  const save = useCallback(async (extra: Record<string, any> = {}, opts: { publish?: boolean } = {}): Promise<boolean> => {
    if (!row || saving) return false
    const { fields, problems: p } = kind === 'poll' ? pollFields(pollDraft!) : surveyFields(surveyDraft!)
    if (opts.publish && p.length) { setProblems(p); changeTab('edit'); return false }
    setSaving(true); setProblems([])
    try {
      const { data, error, dropped } = await updateItem(db, kind, id, { ...fields, ...extra })
      if (error || !data) { setToast(`Couldn’t save: ${error?.message || 'please try again'}`); return false }
      setRow(data); resetDraft(data); setSavedAt(Date.now())
      if (dropped.includes('settings')) setNotice('Saved. Close dates, results visibility and the other settings need the latest database update (V386) before they can be saved.')
      return true
    } finally { setSaving(false) }
  }, [row, saving, kind, pollDraft, surveyDraft, id, resetDraft, changeTab])

  const setLive = async (next: 'live' | 'closed') => {
    if (!row) return
    if (next === 'live' && dirty) { if (await save(statusFields('live'), { publish: true })) setToast(status === 'draft' ? 'Published. The link is live.' : 'Saved and reopened'); return }
    if (next === 'live' && status === 'draft') {
      const { problems: p } = kind === 'poll' ? pollFields(pollDraft!) : surveyFields(surveyDraft!)
      if (p.length) { setProblems(p); changeTab('edit'); return }
    }
    // Reopening a poll whose close date has passed: clear the date, or it closes again straight away.
    const extra: Record<string, any> = { ...statusFields(next) }
    const st = settingsOf(row)
    if (next === 'live' && 'settings' in row && st.closes_at && Date.parse(st.closes_at) <= Date.now()) {
      extra.settings = settingsWithoutClose(row)
    }
    const { data, error } = await updateItem(db, kind, id, extra)
    if (error || !data) { setToast('Couldn’t change that. Please try again.'); return }
    setRow(data); resetDraft(data)
    setToast(next === 'live' ? (status === 'draft' ? 'Published. The link is live.' : 'Reopened') : 'Closed. No more answers will be taken.')
  }

  // Unsaved changes: warn before leaving; Ctrl/Cmd+S saves.
  useEffect(() => {
    if (!dirty) return
    const before = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = '' }
    const key = (e: KeyboardEvent) => { if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') { e.preventDefault(); void save() } }
    window.addEventListener('beforeunload', before)
    window.addEventListener('keydown', key)
    return () => { window.removeEventListener('beforeunload', before); window.removeEventListener('keydown', key) }
  }, [dirty, save])

  const doDelete = async (ids: string[], count: number) => {
    if (!companyId || deleting) return
    const ok = await confirmDialog({ title: count === 1 ? `Delete this ${kind === 'poll' ? 'vote' : 'response'}?` : `Delete ${count} ${kind === 'poll' ? 'votes' : 'responses'}?`, message: 'This can’t be undone.', confirmLabel: 'Delete', tone: 'danger' })
    if (!ok) return
    setDeleting(true)
    const res = await deleteAnswers(kind, id, companyId, { ids })
    setDeleting(false)
    if (res.error) setToast(res.error)
    else setToast(`Deleted ${count} ${kind === 'poll' ? (count === 1 ? 'vote' : 'votes') : (count === 1 ? 'response' : 'responses')}`)
    const gone = new Set(ids)
    if (res.deleted) setAnswers(prev => prev.filter(r => !gone.has(r.id)))
  }

  const doReset = async () => {
    if (!companyId || deleting) return
    const ok = await confirmDialog({ title: 'Reset all votes?', message: `Every vote on this poll is deleted and the count starts again from zero. This can’t be undone.`, confirmLabel: 'Reset votes', tone: 'danger' })
    if (!ok) return
    setDeleting(true)
    const res = await deleteAnswers(kind, id, companyId, { all: true })
    setDeleting(false)
    if (res.error) { setToast(res.error); return }
    setAnswers([]); latest.current = null
    setToast('Votes reset')
  }

  const sendSms = async () => {
    if (!companyId || smsBusy) return
    if (status === 'draft') { setToast(`Publish the ${noun} before sending it.`); return }
    setSmsBusy(true)
    const out = await createCampaignDraft(db, { companyId, kind, id, title, url, user })
    setSmsBusy(false)
    if (out.error || !out.id) { setToast(`Couldn’t start the campaign: ${out.error || 'please try again'}`); return }
    router.push(`/admin/campaigns/${out.id}`)
  }

  const copyLink = async () => {
    try { await navigator.clipboard.writeText(url); setToast(status === 'draft' ? `Link copied. Publish the ${noun} before sharing it.` : 'Link copied') } catch { setToast('Couldn’t copy the link') }
  }

  // ── Render ──
  if (state === 'missing') {
    return (
      <div className="fr-root"><ResultsStyles /><EngageStyles />
        <div className="fr-card" style={{ padding: 40, textAlign: 'center' }}>
          <h1 style={{ fontSize: 18, fontWeight: 700, margin: '0 0 8px' }}>{Noun} not found</h1>
          <p className="fr-muted" style={{ margin: '0 0 16px' }}>It may have been deleted, or it belongs to another workspace.</p>
          <Link href={`/admin/${noun}s`} className="fr-btn">Back to {noun}s</Link>
        </div>
      </div>
    )
  }

  const count = kind === 'poll' ? table.lines.length : answers.length
  const closes = status === 'live' && row ? closeNote(settingsOf(row).closes_at, now) : ''
  const sub = row ? (kind === 'poll' ? (row.description || '') : (row.question || row.description || '')) : ''

  return (
    <div className="fr-root" data-wide="1">
      <ResultsStyles />
      <EngageStyles />
      {state === 'loading' ? (
        <div aria-hidden><div className="fr-skel" style={{ width: 'min(360px, 60%)', height: 26 }} /><div className="fr-skel" style={{ width: 260, height: 18, margin: '22px 0 26px' }} /></div>
      ) : (
        <div>
          <div className="fr-head">
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0, flex: '1 1 320px' }}>
              <Link href={`/admin/${noun}s`} className="fr-icon-btn" aria-label={`Back to ${noun}s`} title={`${Noun}s`}><Icon name="back" size={18} /></Link>
              <h1 className="fr-title" title={title}>{title}</h1>
              <span className={`eg-pill is-${status}`}>{status === 'live' ? 'Live' : status === 'closed' ? 'Closed' : 'Draft'}</span>
              {status === 'live' && (tab === 'results' || tab === 'responses') && <span className="eg-live" title="New answers appear here as they arrive"><span className="eg-live-dot" />Updating live</span>}
            </div>
            <div className="eg-actions">
              {status !== 'draft'
                ? <a href={url} target="_blank" rel="noopener noreferrer" className="fr-btn"><Icon name="external" size={15} />View {noun}</a>
                : <span className="fr-btn" aria-disabled="true" title="Publish it to share it"><Icon name="external" size={15} />View {noun}</span>}
              <button type="button" className="fr-btn" onClick={copyLink}><Icon name="link" size={15} />Copy link</button>
              {status === 'draft' && <button type="button" className="fr-btn eg-btn-coral" onClick={() => void setLive('live')} disabled={saving}><EngageIcon name="play" size={14} />Publish</button>}
              {status === 'live' && <button type="button" className="fr-btn" onClick={() => void setLive('closed')}><EngageIcon name="lock" size={15} />Close</button>}
              {status === 'closed' && <button type="button" className="fr-btn" onClick={() => void setLive('live')}><EngageIcon name="unlock" size={15} />Reopen</button>}
            </div>
          </div>
          {(sub || closes) && <p className="eg-sub">{sub}{sub && closes ? ' · ' : ''}{closes}</p>}
          <div className="fr-tabs" role="tablist" aria-label={`${Noun} views`}>
            {TABS.map(t => (
              <button key={t} type="button" role="tab" id={`eg-tab-${t}`} aria-selected={tab === t} aria-controls={`eg-panel-${t}`} className="fr-tab" onClick={() => changeTab(t)}>
                {t === 'results' ? 'Results' : t === 'responses' ? (kind === 'poll' ? 'Votes' : 'Responses') : t === 'edit' ? 'Edit' : 'Share'}
                {t === 'responses' && <span className="fr-tab-count">({count.toLocaleString('en-AU')})</span>}
                {t === 'edit' && dirty && <span className="fr-tab-count" aria-label="unsaved changes"> •</span>}
              </button>
            ))}
          </div>
          <div style={{ height: 20 }} />
        </div>
      )}

      {notice && (
        <div className="eg-note is-warn" role="status"><Icon name="info" size={15} /><span style={{ flex: 1 }}>{notice}</span>
          <button type="button" className="fr-icon-btn" aria-label="Dismiss" onClick={() => setNotice(null)}><Icon name="x" size={14} /></button></div>
      )}
      {capped && <div className="fr-banner" role="status"><Icon name="info" size={15} />Showing the newest 10,000.</div>}
      {answersState === 'error' && (
        <div className="fr-banner fr-banner-warn" role="alert"><Icon name="alert" size={15} />
          <span style={{ flex: 1 }}>Couldn&apos;t load all the {kind === 'poll' ? 'votes' : 'responses'}.</span>
          <button type="button" className="fr-btn fr-btn-sm" onClick={() => void loadAll()}>Try again</button>
        </div>
      )}

      {state === 'ready' && row && (
        <>
          {tab === 'results' && (
            <div role="tabpanel" id="eg-panel-results" aria-labelledby="eg-tab-results">
              {status === 'draft' && (
                <div className="eg-note"><EngageIcon name="lock" size={15} /><span>This {noun} is a draft. Finish it on the Edit tab, then publish to start collecting {kind === 'poll' ? 'votes' : 'answers'}.</span></div>
              )}
              {answersState === 'loading' && !answers.length ? <div className="fr-kpis">{[0, 1, 2, 3].map(i => <div key={i} className="fr-card fr-kpi"><div className="fr-skel" style={{ width: '60%', height: 24 }} /></div>)}</div>
                : kind === 'poll' ? <PollResults poll={row} votes={answers} now={now} />
                  : <SurveyResults survey={row} rows={answers} now={now} companyId={companyId} />}
            </div>
          )}

          {tab === 'responses' && (
            <div role="tabpanel" id="eg-panel-responses" aria-labelledby="eg-tab-responses">
              <AnswersTable kind={kind} title={title} table={table} now={now} onDelete={(ids, n) => void doDelete(ids, n)} onReset={kind === 'poll' && answers.length ? () => void doReset() : undefined} deleting={deleting} />
            </div>
          )}

          {tab === 'edit' && (
            <div role="tabpanel" id="eg-panel-edit" aria-labelledby="eg-tab-edit">
              {problems.length > 0 && (
                <div className="eg-note is-warn" role="alert"><Icon name="alert" size={15} /><span>{problems.join(' ')}</span></div>
              )}
              {kind === 'poll' && pollDraft && (
                <PollEditor draft={pollDraft} onChange={d => { setPollDraft(d); setDirty(true) }} votedOptions={votedOptions} hasVotes={answers.length > 0}
                  hasSettingsColumn={hasSettingsColumn} status={status} company={company} />
              )}
              {kind === 'survey' && surveyDraft && (
                <SurveyEditor draft={surveyDraft} onChange={d => { setSurveyDraft(d); setDirty(true) }} hasResponses={answers.length > 0}
                  hasSettingsColumn={hasSettingsColumn} status={status} company={company} />
              )}
              <div className="eg-savebar">
                <span className="eg-saved">{saving ? 'Saving…' : dirty ? 'Unsaved changes' : savedAt ? 'All changes saved' : ''}</span>
                {dirty && <button type="button" className="fr-btn" onClick={() => resetDraft(row)} disabled={saving}>Discard</button>}
                <button type="button" className={`fr-btn${status === 'draft' ? '' : ' eg-btn-coral'}`} onClick={() => void save()} disabled={saving || !dirty}>Save changes</button>
                {status === 'draft' && <button type="button" className="fr-btn eg-btn-coral" onClick={() => void setLive('live')} disabled={saving}><EngageIcon name="play" size={14} />Save and publish</button>}
              </div>
            </div>
          )}

          {tab === 'share' && (
            <div role="tabpanel" id="eg-panel-share" aria-labelledby="eg-tab-share">
              <SharePanel kind={kind} url={url} title={title} status={status} onSms={() => void sendSms()} smsBusy={smsBusy} />
            </div>
          )}
        </>
      )}

      {toast && <div role="status" aria-live="polite" className="eg-toast">{toast}</div>}
    </div>
  )
}
