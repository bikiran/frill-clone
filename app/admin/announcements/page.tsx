'use client'

// Announcements list. Data and actions live here; the view is
// components/announcements/AdminList.tsx. Reads and writes go through
// /api/announcements (staff-checked, service role).

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { resolveCompanyUser } from '@/lib/client-cache'
import { confirmDialog } from '@/components/ConfirmDialog'
import AdminList, { type RowAction } from '@/components/announcements/AdminList'
import NotifyDialog from '@/components/announcements/NotifyDialog'
import { annAction, boardBase, loadAdmin, type AdminData } from '@/components/announcements/client'

const VIEW_KEY = 'colvy_announcements_view'

export default function AnnouncementsAdmin() {
  const router = useRouter()
  const [companyId, setCompanyId] = useState<string | null>(null)
  const [data, setData] = useState<AdminData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [now, setNow] = useState(() => Date.now())
  const [view, setView] = useState<'list' | 'grid'>('list')
  const [notifyFor, setNotifyFor] = useState<any | null>(null)
  const [toast, setToast] = useState<{ msg: string; href?: string; label?: string } | null>(null)

  useEffect(() => { try { const v = localStorage.getItem(VIEW_KEY); if (v === 'grid' || v === 'list') setView(v) } catch {} }, [])
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 60_000); return () => clearInterval(t) }, [])
  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(null), 4200); return () => clearTimeout(t) }, [toast])

  const load = useCallback(async () => {
    setError(null)
    try {
      const { companyId: cid } = await resolveCompanyUser()
      if (!cid) { setError('No workspace found for your account.'); return }
      setCompanyId(cid)
      setData(await loadAdmin(cid))
      setNow(Date.now())
    } catch (e: any) { setError(e.message || 'Couldn’t load announcements') }
  }, [])
  useEffect(() => { load() }, [load])

  const replace = (row: any) => setData(d => d && ({ ...d, announcements: d.announcements.map(a => (a.id === row.id ? row : a)) }))
  const board = boardBase(data?.company || null)

  const onAction = async (action: RowAction, a: any) => {
    if (!companyId) return
    try {
      if (action === 'edit') return router.push(`/admin/announcements/new?edit=${a.id}`)
      if (action === 'view') return void window.open(`${board}/announcements?id=${a.id}`, '_blank', 'noopener')
      if (action === 'copy') {
        await navigator.clipboard.writeText(`${board}/announcements?id=${a.id}`)
        return setToast({ msg: 'Link copied' })
      }
      if (action === 'notify') return setNotifyFor(a)
      if (action === 'publish') {
        const r = await annAction(companyId, 'publish', a.id)
        replace(r.announcement)
        return setNotifyFor(r.announcement)
      }
      if (action === 'unpublish') {
        if (!await confirmDialog({ title: 'Move to drafts?', message: 'It comes off your updates page and chat widget straight away. You can publish it again any time.', confirmLabel: 'Move to drafts' })) return
        const r = await annAction(companyId, 'unpublish', a.id)
        replace(r.announcement)
        return setToast({ msg: 'Moved to drafts' })
      }
      if (action === 'pin') {
        const r = await annAction(companyId, 'pin', a.id, { pinned: !a.is_pinned })
        replace(r.announcement)
        return setToast({ msg: a.is_pinned ? 'Unpinned' : 'Pinned to the top' })
      }
      if (action === 'duplicate') {
        const r = await annAction(companyId, 'duplicate', a.id)
        setData(d => d && ({ ...d, announcements: [r.announcement, ...d.announcements] }))
        return setToast({ msg: 'Copied as a draft', href: `/admin/announcements/new?edit=${r.announcement.id}`, label: 'Edit' })
      }
      if (action === 'sms') {
        const r = await annAction(companyId, 'sms_draft', a.id)
        return setToast({ msg: 'SMS campaign draft made', href: `/admin/campaigns/${r.campaignId}`, label: 'Review and send' })
      }
      if (action === 'delete') {
        if (!await confirmDialog({ title: `Delete “${a.title || 'this announcement'}”?`, message: 'It disappears from your updates page and widget, with its views and reactions. This can’t be undone.', confirmLabel: 'Delete', tone: 'danger' })) return
        await annAction(companyId, 'delete', a.id)
        setData(d => d && ({ ...d, announcements: d.announcements.filter(x => x.id !== a.id) }))
        return setToast({ msg: 'Deleted' })
      }
    } catch (e: any) { setToast({ msg: e.message || 'That didn’t work' }) }
  }

  return (
    <>
      <AdminList
        items={data?.announcements || []}
        loading={!data && !error}
        error={error}
        onRetry={load}
        now={now}
        schemaReady={data?.schemaReady !== false}
        boardUrl={board}
        outlets={data?.outlets || []}
        onAction={onAction}
        view={view}
        onView={v => { setView(v); try { localStorage.setItem(VIEW_KEY, v) } catch {} }}
      />
      {notifyFor && companyId && (
        <NotifyDialog companyId={companyId} post={notifyFor} onClose={() => { setNotifyFor(null); load() }} />
      )}
      {toast && (
        <div className="an-toast" role="status">
          <span>{toast.msg}</span>
          {toast.href && <a href={toast.href}>{toast.label}</a>}
        </div>
      )}
    </>
  )
}
