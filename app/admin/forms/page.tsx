'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import ConfirmModal from '@/components/ConfirmModal'

const FormIcon = ({ size = 20, color = 'currentColor' }: { size?: number; color?: string }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="3" width="18" height="18" rx="3"/><line x1="7" y1="8" x2="17" y2="8"/><line x1="7" y1="12" x2="13" y2="12"/><line x1="7" y1="16" x2="11" y2="16"/>
  </svg>
)

export default function FormsAdmin() {
  const router = useRouter()
  const [user, setUser] = useState<any>(null)
  const [forms, setForms] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [confirmDelete, setConfirmDelete] = useState<{ id: string; title: string } | null>(null)
  const [shareModal, setShareModal] = useState<any>(null)
  const [copiedField, setCopiedField] = useState('')

  useEffect(() => {
    supabase.auth.getSession().then(({ data }: any) => setUser(data.session?.user))
    fetchForms()
  }, [])

  const fetchForms = async () => {
    try {
      // Get company_id from current subdomain first
      const h = typeof window !== 'undefined' ? window.location.hostname : ''
      let companyId: string | null = null
      if (h.endsWith('.colvy.com') && h !== 'colvy.com') {
        const slug = h.replace('.colvy.com', '')
        const { data: co } = await (supabase as any).from('companies').select('id').eq('slug', slug).maybeSingle()
        companyId = co?.id || null
      }
      if (!companyId) {
        // Fallback: look up by current user's owner_id
        const { data: { session } } = await supabase.auth.getSession()
        if (session?.user) {
          const { data: co } = await (supabase as any).from('companies').select('id').eq('owner_id', session.user.id).maybeSingle()
          companyId = co?.id || null
        }
      }
      let q = (supabase as any).from('forms').select('*').order('created_at', { ascending: false })
      if (companyId) q = q.eq('company_id', companyId)
      const { data } = await q
      const formsWithCounts = await Promise.all((data || []).map(async (f: any) => {
        const { count } = await (supabase as any).from('form_responses').select('*', { count: 'exact', head: true }).eq('form_id', f.id)
        return { ...f, response_count: count || 0 }
      }))
      setForms(formsWithCounts)
    } catch {}
    setLoading(false)
  }

  const createForm = async () => {
    const { data: { session } } = await supabase.auth.getSession()
    let companyId = null
    if (session?.user) {
      const { data: co } = await (supabase as any).from('companies').select('id').eq('owner_id', session.user.id).maybeSingle()
      companyId = co?.id || null
    }
    const { data, error } = await (supabase as any).from('forms').insert({
      title: 'Untitled Form',
      company_id: companyId,
      questions: [],
      theme: { color: '#ff7a6b', background: '#ffffff' },
      is_published: false,
    }).select().single()
    if (error) { alert('Failed to create form: ' + error.message); return }
    router.push(`/admin/forms/${data.id}`)
  }

  const duplicateForm = async (f: any) => {
    const { data, error } = await (supabase as any).from('forms').insert({
      title: f.title + ' (Copy)',
      company_id: f.company_id,
      questions: f.questions,
      theme: f.theme,
      is_published: false,
    }).select().single()
    if (!error && data) router.push(`/admin/forms/${data.id}`)
  }

  const deleteForm = async (id: string) => {
    await (supabase as any).from('forms').delete().eq('id', id)
    fetchForms()
    setConfirmDelete(null)
  }

  if (loading || !user) return <div className="p-8" style={{ color: 'var(--slate)' }}>Loading...</div>

  return (
    <div className="min-h-screen">
      <div className="max-w-6xl mx-auto px-4 md:px-6 py-8">
        <div className="flex items-center justify-between mb-8 flex-wrap gap-3">
          <div>
            <Link href="/admin" className="text-sm font-medium hover:opacity-70 transition-smooth" style={{ color: 'var(--coral)' }}>
              ← Back to admin
            </Link>
            <h1 className="text-3xl font-bold mt-3" style={{ color: 'var(--ink)' }}>Forms</h1>
            <p className="mt-1" style={{ color: 'var(--slate)' }}>Build beautiful, conversational forms for feedback and signups.</p>
          </div>
          <button
            onClick={createForm}
            className="px-5 py-2.5 rounded-xl font-semibold text-white text-sm transition-smooth press-effect cursor-pointer flex items-center gap-2"
            style={{ background: 'var(--coral)' }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            New Form
          </button>
        </div>

        {forms.length === 0 ? (
          <div className="text-center py-20 rounded-2xl border" style={{ borderColor: 'var(--border)' }}>
            <div className="inline-block mb-4"><FormIcon size={48} color="var(--slate)" /></div>
            <h3 className="text-lg font-semibold mb-2" style={{ color: 'var(--ink)' }}>No forms yet</h3>
            <p className="mb-6" style={{ color: 'var(--slate)' }}>Create your first form to collect responses beautifully.</p>
            <button onClick={createForm} className="px-5 py-2.5 rounded-xl font-semibold text-white text-sm cursor-pointer" style={{ background: 'var(--coral)' }}>
              Create your first form
            </button>
          </div>
        ) : (
          <div className="grid md:grid-cols-3 gap-4">
            {forms.map(f => (
              <div key={f.id} className="bg-white rounded-2xl border overflow-hidden hover:shadow-md transition-smooth" style={{ borderColor: 'var(--border)' }}>
                <div style={{ height: 80, background: f.theme?.color ? `linear-gradient(135deg, ${f.theme.color}, ${f.theme.color}cc)` : 'linear-gradient(135deg, #ff7a6b, #ff7a6bcc)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <FormIcon size={28} color="#fff" />
                </div>
                <div className="p-5">
                  <div className="flex items-center gap-2 mb-2">
                    <h3 className="text-base font-bold flex-1 truncate" style={{ color: 'var(--ink)' }}>{f.title}</h3>
                    <span className="text-xs px-2 py-0.5 rounded-full font-semibold shrink-0" style={{ background: f.is_published ? '#dcfce7' : '#f3f4f6', color: f.is_published ? '#16a34a' : '#6b7280' }}>
                      {f.is_published ? 'Live' : 'Draft'}
                    </span>
                  </div>
                  <p className="text-xs mb-4" style={{ color: 'var(--slate)' }}>{(f.questions || []).length} question{(f.questions || []).length !== 1 ? 's' : ''} · {f.response_count || 0} response{f.response_count !== 1 ? 's' : ''}</p>
                  <div className="flex gap-2">
                    <Link href={`/admin/forms/${f.id}`} className="flex-1 py-2 rounded-lg text-xs font-medium border text-center transition-smooth hover:bg-gray-50 cursor-pointer" style={{ borderColor: 'var(--border)', color: 'var(--ink)' }}>
                      Edit
                    </Link>
                    <Link href={`/admin/forms/${f.id}/results`} className="px-3 py-2 rounded-lg text-xs border transition-smooth hover:bg-gray-50 cursor-pointer" style={{ borderColor: 'var(--border)', color: 'var(--ink)' }} title="Results">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>
                    </Link>
                    <button onClick={() => setShareModal(f)} className="px-3 py-2 rounded-lg text-xs border transition-smooth hover:bg-gray-50 cursor-pointer" style={{ borderColor: 'var(--border)', color: 'var(--ink)' }} title="Share or embed">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>
                    </button>
                    <button onClick={() => duplicateForm(f)} className="px-3 py-2 rounded-lg text-xs border transition-smooth hover:bg-gray-50 cursor-pointer" style={{ borderColor: 'var(--border)', color: 'var(--ink)' }} title="Duplicate">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
                    </button>
                    <button onClick={() => setConfirmDelete({ id: f.id, title: f.title })} className="px-3 py-2 rounded-lg text-xs border transition-smooth text-red-600 hover:bg-red-50 cursor-pointer" style={{ borderColor: '#fca5a5' }}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#dc2626" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {shareModal && (() => {
        const formUrl = typeof window !== 'undefined' ? `${window.location.origin}/forms/${shareModal.id}` : ''
        const embedCode = `<iframe src="${formUrl}?embed=1" width="100%" height="600" frameborder="0" style="border-radius:16px;"></iframe>`
        const copy = (text: string, field: string) => {
          navigator.clipboard.writeText(text)
          setCopiedField(field)
          setTimeout(() => setCopiedField(''), 2000)
        }
        return (
          <>
            <div className="fixed inset-0 z-50 backdrop-blur-sm animate-backdrop" style={{ background: 'rgba(0,0,0,0.4)' }} onClick={() => setShareModal(null)} />
            <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-full max-w-lg bg-white rounded-2xl shadow-2xl animate-modal mx-4 max-h-[90vh] overflow-y-auto">
              <div className="p-6 border-b flex items-center justify-between" style={{ borderColor: 'var(--border)' }}>
                <h2 className="text-xl font-bold" style={{ color: 'var(--ink)' }}>Share Form</h2>
                <button onClick={() => setShareModal(null)} className="text-2xl cursor-pointer" style={{ color: 'var(--slate)' }}>×</button>
              </div>
              <div className="p-6 space-y-5">
                {!shareModal.is_published && (
                  <div className="p-3 rounded-lg text-sm" style={{ background: '#fef3c7', color: '#92400e' }}>
                    ⚠️ This form is still a draft. Publish it from the editor before sharing.
                  </div>
                )}
                <div>
                  <label className="block text-sm font-bold mb-2" style={{ color: 'var(--ink)' }}>Direct link</label>
                  <div className="flex gap-2">
                    <input readOnly value={formUrl} className="flex-1 px-3 py-2.5 rounded-lg border text-sm bg-gray-50" style={{ borderColor: 'var(--border)' }} />
                    <button onClick={() => copy(formUrl, 'link')} className="px-4 py-2.5 rounded-lg text-sm font-semibold text-white cursor-pointer" style={{ background: 'var(--coral)' }}>
                      {copiedField === 'link' ? '✓ Copied' : 'Copy'}
                    </button>
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-bold mb-2" style={{ color: 'var(--ink)' }}>Embed on your website</label>
                  <textarea readOnly value={embedCode} rows={3} className="w-full px-3 py-2.5 rounded-lg border text-xs font-mono bg-gray-50 resize-none" style={{ borderColor: 'var(--border)' }} />
                  <button onClick={() => copy(embedCode, 'embed')} className="mt-2 px-4 py-2 rounded-lg text-sm font-semibold text-white cursor-pointer" style={{ background: 'var(--coral)' }}>
                    {copiedField === 'embed' ? '✓ Copied' : 'Copy embed code'}
                  </button>
                </div>
              </div>
            </div>
          </>
        )
      })()}

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
    </div>
  )
}
