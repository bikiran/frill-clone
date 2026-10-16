'use client'

// New / edit announcement (?edit=<id>, ?ai=1 opens Colvy AI). The editor is
// components/announcements/Editor.tsx; data comes from /api/announcements.

import { Suspense, useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { resolveCompanyUser } from '@/lib/client-cache'
import Editor from '@/components/announcements/Editor'
import { loadAdmin, type AdminData } from '@/components/announcements/client'
import { ADMIN_CSS } from '@/components/announcements/styles'

function EditorPage() {
  const params = useSearchParams()
  const editId = params?.get('edit') || null
  const [state, setState] = useState<{ companyId: string; data: AdminData } | null>(null)
  const [error, setError] = useState<string | null>(null)
  // Posts made in this editor: saving a new one moves the URL to ?edit=<id>
  // without starting the editor over.
  const [created, setCreated] = useState<string[]>([])

  useEffect(() => {
    let off = false
    ;(async () => {
      try {
        const { companyId } = await resolveCompanyUser()
        if (!companyId) throw new Error('No workspace found for your account.')
        const data = await loadAdmin(companyId)
        if (!off) setState({ companyId, data })
      } catch (e: any) { if (!off) setError(e.message || 'Couldn’t load') }
    })()
    return () => { off = true }
  }, [])

  if (error) return (
    <div className="an-root"><style>{ADMIN_CSS}</style>
      <div className="an-empty"><p className="an-empty-title">The editor didn’t load</p><p className="an-empty-text">{error}</p>
        <div className="an-empty-actions"><Link className="an-btn" href="/admin/announcements">Back to announcements</Link></div></div>
    </div>
  )
  if (!state) return (
    <div className="an-root"><style>{ADMIN_CSS}</style>
      <div className="an-list">{[0, 1, 2].map(i => <div key={i} className="an-skel-row"><span className="an-skel" style={{ height: 14, width: '50%' }} /></div>)}</div>
    </div>
  )
  const initial = editId ? state.data.announcements.find(a => a.id === editId) || null : null
  if (editId && !initial) return (
    <div className="an-root"><style>{ADMIN_CSS}</style>
      <div className="an-empty"><p className="an-empty-title">That announcement isn’t here</p><p className="an-empty-text">It may have been deleted.</p>
        <div className="an-empty-actions"><Link className="an-btn" href="/admin/announcements">Back to announcements</Link></div></div>
    </div>
  )
  // Keyed by the post so switching from new to saved keeps the editor, but
  // opening another post starts fresh.
  const onSaved = (row: any) => {
    setState(s => s && ({ ...s, data: { ...s.data, announcements: s.data.announcements.some(a => a.id === row.id) ? s.data.announcements.map(a => (a.id === row.id ? row : a)) : [row, ...s.data.announcements] } }))
    setCreated(c => (c.includes(row.id) || (editId === row.id) ? c : [...c, row.id]))
  }
  const key = editId && !created.includes(editId) ? `e-${editId}` : 'new'
  return <Editor key={key} companyId={state.companyId} data={state.data} initial={initial} startWithAi={params?.get('ai') === '1'} onSaved={onSaved} />
}

export default function NewAnnouncementPage() {
  return <Suspense fallback={null}><EditorPage /></Suspense>
}
