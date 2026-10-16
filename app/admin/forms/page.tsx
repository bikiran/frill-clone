'use client'

// Forms list: a Typeform-style workspace view across the full width of the
// admin. Data and actions live here; the view is components/forms-list, the
// pure helpers lib/forms-list.ts and the reads/writes lib/forms-list-data.ts.

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { resolveCompanyUser } from '@/lib/client-cache'
import { authFetch } from '@/lib/auth-fetch'
import ConfirmModal from '@/components/ConfirmModal'
import { confirmDialog } from '@/components/ConfirmDialog'
import { fetchStats } from '@/components/form-results/data'
import FormsListView, { Icon, type FormAction } from '@/components/forms-list/FormsListView'
import {
  FORMS_VIEW_KEY, completionFromStats, displayTitle, emptyDraftIds, cleanupList, formsSeenKey, mapLimit, pickSeenAt, readView, sortForms,
  type FormFilter, type FormListItem, type FormSort, type FormsView,
} from '@/lib/forms-list'
import { countNewSince, deleteEmptyDrafts, loadForms } from '@/lib/forms-list-data'

const db = supabase as any
// Completion needs one stats request per form, so only for live forms (the
// only ones people can open and start) and only so many, four at a time.
const STATS_MAX = 24

export default function FormsAdmin() {
  const router = useRouter()
  const [forms, setForms] = useState<FormListItem[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [now, setNow] = useState(() => Date.now())
  // List or grid, remembered on this device. Read once (try/catch inside; list
  // on the server). Safe for hydration: the toggle only renders after loading.
  const [view, setView] = useState<FormsView>(() => (typeof window === 'undefined' ? 'list' : readView(() => window.localStorage.getItem(FORMS_VIEW_KEY))))
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState<FormSort>('updated')
  const [status, setStatus] = useState<FormFilter>('all')
  const [creating, setCreating] = useState(false)
  const [cleaning, setCleaning] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState<{ id: string; title: string } | null>(null)
  const [shareModal, setShareModal] = useState<FormListItem | null>(null)
  const [renaming, setRenaming] = useState<{ id: string; title: string } | null>(null)
  const [copiedField, setCopiedField] = useState('')
  const [toast, setToast] = useState('')
  const started = useRef(false)

  // A short message at the bottom; a new one restarts the timer.
  const [toastId, setToastId] = useState(0)
  const say = useCallback((msg: string) => { setToast(msg); setToastId(n => n + 1) }, [])
  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(''), 2400)
    return () => clearTimeout(t)
  }, [toast, toastId])
  const changeView = (v: FormsView) => {
    setView(v)
    try { window.localStorage.setItem(FORMS_VIEW_KEY, v) } catch {}
  }

  // Keep "2 min ago" current while the page is open.
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 60_000)
    return () => clearInterval(t)
  }, [])

  const patch = (id: string, fields: Partial<FormListItem>) => setForms(prev => prev.map(f => (f.id === id ? { ...f, ...fields } : f)))

  const fetchForms = async () => {
    setLoadError(false)
    try {
      // The workspace the admin is open on (the layout works it out, staff
      // included — not just the owner). Without one, show nothing rather than
      // every form the database lets this account see.
      const { companyId } = await resolveCompanyUser()
      if (!companyId) { setForms([]); setLoading(false); return }
      const list = await loadForms(db, companyId)
      setForms(list)
      setNow(Date.now())
      setLoading(false)

      // "N new" since the last visit to this workspace's forms on this device.
      // The session keeps the last visit it started with (pickSeenAt), so
      // opening a form and coming back keeps the badges. This visit is recorded
      // only once the new counts have loaded; nothing is new on a first visit.
      const key = formsSeenKey(companyId)
      const visitAt = new Date().toISOString()
      let since: string | null = null
      try {
        const picked = pickSeenAt(window.sessionStorage.getItem(key), window.localStorage.getItem(key))
        since = picked.since
        if (picked.pin !== null) window.sessionStorage.setItem(key, picked.pin)
      } catch {}
      const recordVisit = () => { try { window.localStorage.setItem(key, visitAt) } catch {} }
      const answered = list.filter(f => f.response_count !== 0).map(f => f.id)
      if (since && answered.length) {
        countNewSince(db, answered, since).then(({ counts, more, ok }) => {
          if (ok) recordVisit()
          if (!Object.keys(counts).length) return
          setForms(prev => prev.map(f => (counts[f.id] ? { ...f, new_count: counts[f.id], new_more: more.has(f.id) } : f)))
        })
      } else {
        recordVisit()
      }

      // Completion rate from the V376 stats, only where they answer. Never
      // blocks the list. The most recently updated live forms are asked first;
      // if none of those is tracked (V376 not run, or nobody has opened them),
      // the rest aren't asked.
      const live = sortForms(list.filter(f => f.is_published), 'updated').slice(0, STATS_MAX)
      const ask = async (f: FormListItem) => {
        const c = completionFromStats(await fetchStats(authFetch, { formId: f.id }))
        if (c !== null) patch(f.id, { completion: c })
        return c !== null
      }
      void (async () => {
        const first = await mapLimit(live.slice(0, 4), 4, ask)
        if (first.some(Boolean)) await mapLimit(live.slice(4), 4, ask)
      })()
    } catch {
      setLoadError(true)
      setLoading(false)
    }
  }

  useEffect(() => {
    // Once per mount (React's dev double-run would otherwise record the visit twice).
    if (started.current) return
    started.current = true
    fetchForms()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const createForm = async (withAi = false) => {
    if (creating) return
    setCreating(true)
    try {
      // Forms belong to the workspace; only its staff may create one (V375).
      const { companyId } = await resolveCompanyUser()
      if (!companyId) { alert('Failed to create form: no workspace found for this account.'); return }
      const { data, error } = await db.from('forms').insert({
        title: 'Untitled Form',
        company_id: companyId,
        questions: [],
        theme: { color: '#ff7a6b', background: '#ffffff' },
        is_published: false,
      }).select().single()
      if (error) { alert('Failed to create form: ' + error.message); return }
      // The builder opens Colvy AI straight away for ?ai=1.
      router.push(`/admin/forms/${data.id}${withAi ? '?ai=1' : ''}`)
    } finally {
      setCreating(false)
    }
  }

  // One duplicate / rename / delete at a time per form: double-clicks do nothing.
  const busy = useRef(new Set<string>())
  const once = async (key: string, fn: () => Promise<void>) => {
    if (busy.current.has(key)) return
    busy.current.add(key)
    try { await fn() } finally { busy.current.delete(key) }
  }

  const duplicateForm = (f: any) => once(`dup:${f.id}`, async () => {
    // questions carry the logic and theme carries the welcome settings and
    // variables; question ids are kept, so every rule still points at the right
    // question. Copy the other settings too, but only columns this database has.
    const settings: Record<string, unknown> = {}
    for (const k of ['welcome_message', 'thank_you_message', 'end_actions', 'show_confetti', 'display_style', 'enable_piping']) {
      if (f && k in f) settings[k] = f[k]
    }
    const { data, error } = await db.from('forms').insert({
      ...settings,
      title: f.title + ' (Copy)',
      company_id: f.company_id,
      questions: f.questions,
      theme: f.theme,
      is_published: false,
    }).select().single()
    if (!error && data) router.push(`/admin/forms/${data.id}`)
    else say("Couldn't duplicate that form. Please try again.")
  })

  const deleteForm = (id: string) => once(`del:${id}`, async () => {
    setConfirmDelete(null)
    const { data, error } = await db.from('forms').delete().eq('id', id).select('id')
    if (error || !Array.isArray(data) || !data.length) { say("Couldn't delete that form. Please try again."); return }
    setForms(prev => prev.filter(f => f.id !== id))
    say('Form deleted')
  })

  const renameForm = (id: string, title: string) => once(`ren:${id}`, async () => {
    const clean = title.trim().slice(0, 200)
    if (!clean) return
    const updated_at = new Date().toISOString()
    const { error } = await db.from('forms').update({ title: clean, updated_at }).eq('id', id)
    if (error) { say("Couldn't rename that form. Please try again."); return }
    patch(id, { title: clean, updated_at })
    setRenaming(null)
  })

  const formUrl = (id: string) => (typeof window !== 'undefined' ? `${window.location.origin}/forms/${id}` : '')

  const copyText = async (text: string) => {
    try { await navigator.clipboard.writeText(text); return true } catch { return false }
  }

  const cleanUp = () => once('cleanup', async () => {
    const ids = emptyDraftIds(forms)
    if (!ids.length || cleaning) return
    const n = ids.length
    const ok = await confirmDialog({
      title: `Delete ${n} empty draft${n === 1 ? '' : 's'}?`,
      message: `${cleanupList(forms, Date.now())}\n\n${n === 1 ? 'This draft is' : 'These drafts are'} untitled, with no questions, no settings changed and no responses. Every other form is left alone. This can't be undone.`,
      confirmLabel: 'Delete',
      tone: 'danger',
    })
    if (!ok) return
    setCleaning(true)
    try {
      const { deleted, error } = await deleteEmptyDrafts(db, ids)
      const gone = new Set(deleted)
      if (gone.size) setForms(prev => prev.filter(f => !gone.has(f.id)))
      if (error) say(`Something went wrong${gone.size ? ` after deleting ${gone.size}` : ''}. Please try again.`)
      else say(gone.size ? `Deleted ${gone.size} empty draft${gone.size === 1 ? '' : 's'}` : 'Nothing to clean up')
    } finally {
      setCleaning(false)
    }
  })

  const onAction = (action: FormAction, f: FormListItem) => {
    if (action === 'share') setShareModal(f)
    else if (action === 'copy') {
      void copyText(formUrl(f.id)).then(ok => say(ok ? (f.is_published ? 'Link copied' : 'Link copied. Publish the form before sharing it.') : "Couldn't copy the link"))
    }
    else if (action === 'duplicate') void duplicateForm(f)
    else if (action === 'rename') setRenaming({ id: f.id, title: displayTitle(f) })
    else if (action === 'delete') setConfirmDelete({ id: f.id, title: displayTitle(f) })
  }

  return (
    <div className="min-h-screen">
      <FormsListView
        forms={forms}
        loading={loading}
        error={loadError}
        onRetry={() => { setLoading(true); void fetchForms() }}
        now={now}
        view={view}
        onView={changeView}
        query={query}
        onQuery={setQuery}
        sort={sort}
        onSort={setSort}
        status={status}
        onStatus={setStatus}
        creating={creating}
        onCreate={withAi => { void createForm(withAi) }}
        onAction={onAction}
        cleaning={cleaning}
        onCleanup={() => { void cleanUp() }}
      />

      {shareModal && (() => {
        const link = formUrl(shareModal.id)
        const embedCode = `<iframe src="${link}?embed=1" width="100%" height="600" frameborder="0" style="border-radius:16px;"></iframe>`
        const copy = async (text: string, field: string) => {
          if (!(await copyText(text))) { say("Couldn't copy. Select the text and copy it instead."); return }
          setCopiedField(field)
          setTimeout(() => setCopiedField(''), 2000)
        }
        return (
          <>
            <div className="fixed inset-0 z-50 backdrop-blur-sm animate-backdrop" style={{ background: 'rgba(0,0,0,0.4)' }} onClick={() => setShareModal(null)} />
            <div role="dialog" aria-modal="true" aria-label="Share form" className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-[calc(100%-32px)] max-w-lg rounded-2xl shadow-2xl animate-modal max-h-[90vh] overflow-y-auto" style={{ background: 'var(--card, #fff)', border: '1px solid var(--border)' }}>
              <div className="p-6 border-b flex items-center justify-between gap-3" style={{ borderColor: 'var(--border)' }}>
                <h2 className="text-xl font-bold truncate" style={{ color: 'var(--ink)' }}>Share {displayTitle(shareModal)}</h2>
                <button onClick={() => setShareModal(null)} aria-label="Close" className="cursor-pointer p-1 rounded-lg" style={{ color: 'var(--slate)' }}><Icon name="x" size={18} /></button>
              </div>
              <div className="p-6 space-y-5">
                {!shareModal.is_published && (
                  <div className="p-3 rounded-lg text-sm" style={{ background: '#fef3c7', color: '#92400e', border: '1px solid #fde68a' }}>
                    This form is still a draft. Publish it from the editor before sharing.
                  </div>
                )}
                <div>
                  <label className="block text-sm font-bold mb-2" style={{ color: 'var(--ink)' }}>Direct link</label>
                  <div className="flex gap-2">
                    <input readOnly value={link} onFocus={e => e.currentTarget.select()} className="flex-1 min-w-0 px-3 py-2.5 rounded-lg border text-sm" style={{ borderColor: 'var(--border)', background: 'var(--canvas)', color: 'var(--ink)' }} />
                    <button onClick={() => copy(link, 'link')} className="px-4 py-2.5 rounded-lg text-sm font-semibold text-white cursor-pointer shrink-0" style={{ background: 'var(--coral)' }}>
                      {copiedField === 'link' ? 'Copied' : 'Copy'}
                    </button>
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-bold mb-2" style={{ color: 'var(--ink)' }}>Embed on your website</label>
                  <textarea readOnly value={embedCode} rows={3} onFocus={e => e.currentTarget.select()} className="w-full px-3 py-2.5 rounded-lg border text-xs font-mono resize-none" style={{ borderColor: 'var(--border)', background: 'var(--canvas)', color: 'var(--ink)' }} />
                  <button onClick={() => copy(embedCode, 'embed')} className="mt-2 px-4 py-2 rounded-lg text-sm font-semibold text-white cursor-pointer" style={{ background: 'var(--coral)' }}>
                    {copiedField === 'embed' ? 'Copied' : 'Copy embed code'}
                  </button>
                </div>
              </div>
            </div>
          </>
        )
      })()}

      {renaming && <RenameDialog initial={renaming.title} onCancel={() => setRenaming(null)} onSave={t => renameForm(renaming.id, t)} />}

      {confirmDelete && (
        <ConfirmModal
          title="Delete Form"
          message={`Delete "${confirmDelete.title}"? All responses will also be deleted.`}
          confirmLabel="Delete"
          variant="danger"
          onConfirm={() => deleteForm(confirmDelete.id)}
          onCancel={() => setConfirmDelete(null)}
        />
      )}

      {toast && (
        <div role="status" aria-live="polite" className="fixed z-[60] left-1/2 -translate-x-1/2 px-4 py-3 rounded-xl text-sm font-medium" style={{ bottom: 20, maxWidth: 'calc(100% - 32px)', background: '#111827', color: '#fff', boxShadow: '0 10px 30px rgba(0,0,0,0.3)' }}>
          {toast}
        </div>
      )}
    </div>
  )
}

function RenameDialog({ initial, onCancel, onSave }: { initial: string; onCancel: () => void; onSave: (title: string) => Promise<void> | void }) {
  const [value, setValue] = useState(initial === 'Untitled form' ? '' : initial)
  const [saving, setSaving] = useState(false)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onCancel() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onCancel])
  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!value.trim() || saving) return
    setSaving(true)
    try { await onSave(value) } finally { setSaving(false) }
  }
  return (
    <>
      <div className="fixed inset-0 z-50 backdrop-blur-sm animate-backdrop" style={{ background: 'rgba(0,0,0,0.4)' }} onClick={onCancel} />
      <form onSubmit={submit} role="dialog" aria-modal="true" aria-label="Rename form" className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-[calc(100%-32px)] max-w-md rounded-2xl shadow-2xl animate-modal p-6" style={{ background: 'var(--card, #fff)', border: '1px solid var(--border)' }}>
        <h2 className="text-lg font-bold mb-3" style={{ color: 'var(--ink)' }}>Rename form</h2>
        <input autoFocus value={value} onChange={e => setValue(e.target.value)} maxLength={200} placeholder="Form name" aria-label="Form name"
          className="w-full px-3 py-2.5 rounded-lg border text-sm outline-none" style={{ borderColor: 'var(--border)', background: 'var(--canvas)', color: 'var(--ink)' }} />
        <div className="flex justify-end gap-2 mt-5">
          <button type="button" onClick={onCancel} className="px-4 py-2 rounded-lg text-sm font-semibold border cursor-pointer" style={{ borderColor: 'var(--border)', color: 'var(--ink)' }}>Cancel</button>
          <button type="submit" disabled={!value.trim() || saving} className="px-4 py-2 rounded-lg text-sm font-semibold text-white cursor-pointer disabled:opacity-60" style={{ background: 'var(--coral)' }}>{saving ? 'Saving…' : 'Save'}</button>
        </div>
      </form>
    </>
  )
}
