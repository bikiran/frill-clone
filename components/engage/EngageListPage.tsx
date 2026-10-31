'use client'

// The Polls and Surveys list pages (one component, two kinds): data, actions
// and dialogs. The view is EngageListView. Reads and writes go through
// components/engage/data.ts as the signed-in member.

import { useCallback, useEffect, useRef, useState } from 'react'
import { alertDialog } from '@/components/ConfirmDialog'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { resolveCompanyUser } from '@/lib/client-cache'
import { useEntitlements } from '@/lib/entitlements-client'
import ConfirmModal from '@/components/ConfirmModal'
import { readView, type FormsView } from '@/lib/forms-list'
import { reopenFields, statusFields, type EngageFilter, type EngageKind, type EngageListItem, type EngageSort } from '@/lib/engage-core'
import { POLL_TEMPLATES, SURVEY_TEMPLATES, pollFromTemplate, surveyFromTemplate } from '@/lib/engage-templates'
import EngageListView, { type EngageAction } from './EngageListView'
import { TemplatePicker } from './TemplatePicker'
import { SharePanel } from './SharePanel'
import { EngageStyles } from './styles'
import { ResultsStyles } from '@/components/form-results/styles'
import { EngageIcon } from './icons'
import { createCampaignDraft, deleteItem, duplicateItem, insertItem, loadList, publicUrl, updateItem } from './data'

const db = supabase as any

export const aiPrompt = (kind: EngageKind) => kind === 'poll'
  ? 'Draft a poll (keep it as a draft) asking our customers '
  : 'Draft a survey (keep it as a draft) to find out '

export function openColvyAi(prompt: string) {
  try { window.dispatchEvent(new CustomEvent('colvy:ai-open', { detail: { prompt } })) } catch {}
}

export default function EngageListPage({ kind }: { kind: EngageKind }) {
  const router = useRouter()
  const { limitOf } = useEntitlements()
  const noun = kind === 'poll' ? 'poll' : 'survey'
  const viewKey = `colvy-${noun}s-view`
  const [items, setItems] = useState<EngageListItem[]>([])
  const [companyId, setCompanyId] = useState<string | null>(null)
  const [slug, setSlug] = useState<string | null>(null)
  const [user, setUser] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [now, setNow] = useState(() => Date.now())
  const [view, setView] = useState<FormsView>(() => (typeof window === 'undefined' ? 'list' : readView(() => window.localStorage.getItem(viewKey))))
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState<EngageSort>('updated')
  const [status, setStatus] = useState<EngageFilter>('all')
  const [picking, setPicking] = useState(false)
  const [creating, setCreating] = useState(false)
  const [share, setShare] = useState<EngageListItem | null>(null)
  const [smsBusy, setSmsBusy] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState<EngageListItem | null>(null)
  const [toast, setToast] = useState('')
  const [toastId, setToastId] = useState(0)
  const started = useRef(false)
  const busy = useRef(new Set<string>())

  const say = useCallback((msg: string) => { setToast(msg); setToastId(n => n + 1) }, [])
  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(''), 2600)
    return () => clearTimeout(t)
  }, [toast, toastId])
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 60_000)
    return () => clearInterval(t)
  }, [])

  const changeView = (v: FormsView) => {
    setView(v)
    try { window.localStorage.setItem(viewKey, v) } catch {}
  }

  const fetchList = async () => {
    setLoadError(false)
    try {
      // The workspace the admin is open on (staff included, not just the owner).
      const { companyId: cid, user: u } = await resolveCompanyUser()
      setUser(u)
      if (!cid) { setItems([]); setLoading(false); return }
      setCompanyId(cid)
      db.from('companies').select('slug').eq('id', cid).maybeSingle().then(({ data }: any) => setSlug(data?.slug || null), () => {})
      setItems(await loadList(db, kind, cid))
      setNow(Date.now())
    } catch {
      setLoadError(true)
    }
    setLoading(false)
  }

  useEffect(() => {
    if (started.current) return
    started.current = true
    void fetchList()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const once = async (key: string, fn: () => Promise<void>) => {
    if (busy.current.has(key)) return
    busy.current.add(key)
    try { await fn() } finally { busy.current.delete(key) }
  }

  const underCap = () => {
    const limit = limitOf(kind === 'poll' ? 'polls' : 'surveys')
    if (typeof limit === 'number' && isFinite(limit) && items.length >= limit) {
      alertDialog(limit === 0
        ? `${kind === 'poll' ? 'Polls' : 'Surveys'} aren’t included in your plan. Upgrade to the Feedback or Everything plan to create them.`
        : `You’ve reached your plan’s limit of ${limit} ${noun}${limit === 1 ? '' : 's'}. Upgrade to add more.`)
      return false
    }
    return true
  }

  const create = (key: string) => once('create', async () => {
    if (!companyId || !underCap()) return
    setCreating(true)
    try {
      const row = kind === 'poll'
        ? pollFromTemplate(POLL_TEMPLATES.find(t => t.key === key) || POLL_TEMPLATES[0], companyId)
        : surveyFromTemplate(SURVEY_TEMPLATES.find(t => t.key === key) || SURVEY_TEMPLATES[0], companyId)
      const { data, error } = await insertItem(db, kind, row)
      if (error || !data?.id) { say(`Couldn’t create the ${noun}: ${error?.message || 'please try again'}`); return }
      router.push(`/admin/${noun}s/${data.id}?tab=edit`)
    } finally {
      setCreating(false)
    }
  })

  const startAi = () => {
    setPicking(false)
    openColvyAi(aiPrompt(kind))
  }

  const setStatusOf = (i: EngageListItem, next: 'live' | 'closed') => once(`st:${i.id}`, async () => {
    // Reopening also clears a close date that has passed (same helper as the detail page).
    const fields: Record<string, any> = next === 'live' ? reopenFields(i.row) : statusFields(next)
    const { data, error } = await updateItem(db, kind, i.id, fields)
    if (error || !data) { say('Couldn’t change that. Please try again.'); return }
    await fetchList()
    say(next === 'live' ? (i.status === 'draft' ? 'Published. The link is live.' : 'Reopened') : 'Closed. No more answers will be taken.')
  })

  const duplicate = (i: EngageListItem) => once(`dup:${i.id}`, async () => {
    if (!underCap()) return
    const { data, error } = await duplicateItem(db, kind, i.row)
    if (error || !data?.id) { say(`Couldn’t duplicate that ${noun}.`); return }
    router.push(`/admin/${noun}s/${data.id}?tab=edit`)
  })

  const remove = (i: EngageListItem) => once(`del:${i.id}`, async () => {
    setConfirmDelete(null)
    if (!(await deleteItem(db, kind, i.id))) { say(`Couldn’t delete that ${noun}. Please try again.`); return }
    setItems(prev => prev.filter(x => x.id !== i.id))
    say(`${kind === 'poll' ? 'Poll' : 'Survey'} deleted`)
  })

  const sendSms = (i: EngageListItem) => once(`sms:${i.id}`, async () => {
    if (!companyId) return
    if (i.status === 'draft') { say(`Publish the ${noun} before sending it.`); return }
    setSmsBusy(true)
    try {
      const out = await createCampaignDraft(db, { companyId, kind, id: i.id, title: i.title, url: publicUrl(kind, i.id, slug), user })
      if (out.error || !out.id) { say(`Couldn’t start the campaign: ${out.error || 'please try again'}`); return }
      router.push(`/admin/campaigns/${out.id}`)
    } finally { setSmsBusy(false) }
  })

  const copyLink = async (i: EngageListItem) => {
    const url = publicUrl(kind, i.id, slug)
    let ok = true
    try { await navigator.clipboard.writeText(url) } catch { ok = false }
    say(ok ? (i.status === 'draft' ? `Link copied. Publish the ${noun} before sharing it.` : 'Link copied') : 'Couldn’t copy the link')
  }

  const onAction = (a: EngageAction, i: EngageListItem) => {
    if (a === 'share') setShare(i)
    else if (a === 'copy') void copyLink(i)
    else if (a === 'sms') void sendSms(i)
    else if (a === 'duplicate') void duplicate(i)
    else if (a === 'publish' || a === 'reopen') void setStatusOf(i, 'live')
    else if (a === 'close') void setStatusOf(i, 'closed')
    else if (a === 'delete') setConfirmDelete(i)
  }

  return (
    <div className="min-h-screen">
      <ResultsStyles />
      <EngageStyles />
      <EngageListView
        kind={kind} items={items} loading={loading} error={loadError}
        onRetry={() => { setLoading(true); void fetchList() }}
        now={now} view={view} onView={changeView}
        query={query} onQuery={setQuery} sort={sort} onSort={setSort} status={status} onStatus={setStatus}
        creating={creating} onCreate={() => setPicking(true)} onAi={startAi} onAction={onAction}
      />

      {picking && <TemplatePicker kind={kind} busy={creating} onPick={k => { void create(k) }} onAi={startAi} onClose={() => setPicking(false)} />}

      {share && (
        <>
          <div className="eg-modal-back" onClick={() => setShare(null)} />
          <div className="eg-modal" role="dialog" aria-modal="true" aria-label={`Share ${noun}`}>
            <div className="eg-modal-head">
              <h2 className="eg-h2" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>Share “{share.title}”</h2>
              <button type="button" className="fr-icon-btn" aria-label="Close" onClick={() => setShare(null)}><EngageIcon name="x" size={18} /></button>
            </div>
            <div className="eg-modal-body">
              <SharePanel kind={kind} url={publicUrl(kind, share.id, slug)} title={share.title} status={share.status} onSms={() => void sendSms(share)} smsBusy={smsBusy} compact />
            </div>
          </div>
        </>
      )}

      {confirmDelete && (
        <ConfirmModal
          title={`Delete ${kind === 'poll' ? 'Poll' : 'Survey'}`}
          message={`Delete “${confirmDelete.title}”? All ${kind === 'poll' ? 'votes' : 'responses'} will also be deleted.`}
          confirmLabel="Delete"
          variant="danger"
          onConfirm={() => remove(confirmDelete)}
          onCancel={() => setConfirmDelete(null)}
        />
      )}

      {toast && <div role="status" aria-live="polite" className="eg-toast">{toast}</div>}
    </div>
  )
}
