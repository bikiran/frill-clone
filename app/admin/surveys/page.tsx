'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import ConfirmModal from '@/components/ConfirmModal'
import { TrashIcon, PlusIcon, SurveyIcon } from '@/components/Icons'
import { SkeletonList } from '@/components/Skeleton'


const SURVEY_TYPES = [
  { type: 'nps', title: 'NPS Survey', desc: 'Gather customer insights with an NPS survey.' },
  { type: 'csat', title: 'CSAT Survey', desc: 'Quickly collect feedback with a short survey.' },
  { type: 'open_feedback', title: 'Open feedback', desc: 'Capture responses from your customers.' },
  { type: 'quick_poll', title: 'Quick poll', desc: 'Get instant opinions with a one-question poll.' },
  { type: 'idea_poll', title: 'Idea poll', desc: 'Let customers rank the ideas that matter most.' },
]

export default function SurveysAdmin() {
  // Get company_id from hostname slug (most reliable approach)
  const getMyCompanyId = async () => {
    if (typeof window !== 'undefined') {
      const h = window.location.hostname
      if (h.endsWith('.colvy.com') && h !== 'colvy.com') {
        const slug = h.replace('.colvy.com', '')
        const { data: co } = await (supabase as any).from('companies').select('id').eq('slug', slug).maybeSingle()
        if (co?.id) return co.id
      }
    }
    const { data: { session } } = await supabase.auth.getSession()
    if (session?.user) {
      const { data: co } = await (supabase as any).from('companies').select('id').eq('owner_id', session.user.id).maybeSingle()
      return co?.id || null
    }
    return null
  }

  const router = useRouter()
  const [user, setUser] = useState<any>(null)
  const [surveys, setSurveys] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [selectedType, setSelectedType] = useState('nps')
  const [newTitle, setNewTitle] = useState('')
  const [confirmDelete, setConfirmDelete] = useState<{ id: string; title: string } | null>(null)
  const [shareModal, setShareModal] = useState<any>(null)
  const [copiedField, setCopiedField] = useState('')

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      const u = data.session?.user
      setUser(u)
    })
    fetchSurveys()
  }, [router])

  const fetchSurveys = async () => {
    try {
      const companyId = await getMyCompanyId()
      if (!companyId) {
        // No company context — never show other companies' surveys
        setSurveys([])
        setLoading(false)
        return
      }
      let q = supabase.from('surveys').select('*').order('created_at', { ascending: false })
      q = (q as any).eq('company_id', companyId)
      const { data, error } = await q
      if (!error && data) setSurveys(data)
    } catch {}
    setLoading(false)
  }

  const createSurvey = async () => {
    if (!newTitle.trim()) return
    const defaultQuestion = selectedType === 'nps' ? 'How likely are you to recommend us?' : 'How would you rate your experience?'
    // Attach the survey to THIS company — without company_id surveys leak across boards
    const companyId = await getMyCompanyId()
    const { error } = await supabase.from('surveys').insert({
      title: newTitle.trim(),
      type: selectedType,
      question: defaultQuestion,
      is_active: true,
      company_id: companyId,
    })
    if (error) {
      alert('Failed to create survey. Make sure DATABASE_SETUP.sql has been run.\n' + error.message)
      return
    }
    setNewTitle('')
    setShowCreate(false)
    fetchSurveys()
  }

  const deleteSurvey = async (id: string) => {
    await supabase.from('surveys').delete().eq('id', id)
    fetchSurveys()
    setConfirmDelete(null)
  }

  if (loading || !user) return <SkeletonList rows={6} />

  return (
    <div className="min-h-screen">
      <div className="max-w-6xl mx-auto px-4 md:px-6 py-8">
        <div className="flex items-center justify-between mb-8 flex-wrap gap-3">
          <div>
            <Link href="/admin" className="text-sm font-medium hover:opacity-70 transition-smooth" style={{ color: 'var(--coral)' }}>
              ← Back to admin
            </Link>
            <h1 className="text-3xl font-bold mt-3" style={{ color: 'var(--ink)' }}>Surveys</h1>
            <p className="mt-1" style={{ color: 'var(--slate)' }}>Create surveys and polls to gather customer insights.</p>
          </div>
          <button
            onClick={() => setShowCreate(true)}
            className="px-5 py-2.5 rounded-xl font-semibold text-white text-sm transition-smooth press-effect cursor-pointer flex items-center gap-2"
            style={{ background: 'var(--coral)' }}>
            <PlusIcon size={16} color="white" /> New Survey
          </button>
        </div>

        {surveys.length === 0 ? (
          <div className="text-center py-20 rounded-2xl border" style={{ borderColor: 'var(--border)' }}>
            <div className="inline-block mb-4">
              <SurveyIcon size={48} color="var(--slate)" />
            </div>
            <h3 className="text-lg font-semibold mb-2" style={{ color: 'var(--ink)' }}>No surveys yet</h3>
            <p className="mb-6" style={{ color: 'var(--slate)' }}>Create your first survey to start collecting feedback.</p>
            <button
              onClick={() => setShowCreate(true)}
              className="px-6 py-3 rounded-xl font-semibold text-white text-sm transition-smooth press-effect cursor-pointer"
              style={{ background: 'var(--coral)' }}>
              Create Survey
            </button>
          </div>
        ) : (
          <div className="grid md:grid-cols-2 gap-4">
            {surveys.map(s => (
              <div key={s.id} className="bg-white rounded-2xl border p-5 hover:shadow-md transition-smooth" style={{ borderColor: 'var(--border)' }}>
                <div className="flex items-start justify-between mb-3">
                  <span className="text-xs font-semibold uppercase tracking-wider px-2 py-1 rounded" style={{ background: 'var(--peach)', color: 'var(--coral)' }}>
                    {s.type}
                  </span>
                  <span className="text-xs px-2 py-1 rounded font-medium" style={{ 
                    background: s.is_active ? '#d1fae5' : '#f3f4f6',
                    color: s.is_active ? '#065f46' : '#6b7280',
                  }}>
                    {s.is_active ? '● Active' : '○ Inactive'}
                  </span>
                </div>
                <h3 className="text-lg font-bold mb-2" style={{ color: 'var(--ink)' }}>{s.title}</h3>
                <p className="text-sm mb-4" style={{ color: 'var(--slate)' }}>{s.question}</p>
                <div className="flex gap-2 pt-3 border-t" style={{ borderColor: 'var(--border)' }}>
                  <Link
                    href={`/admin/surveys/${s.id}`}
                    className="flex-1 py-2 rounded-lg text-xs font-medium border text-center transition-smooth hover:bg-gray-50 cursor-pointer"
                    style={{ borderColor: 'var(--border)', color: 'var(--ink)' }}>
                    View Reports
                  </Link>
                  <button onClick={() => setShareModal(s)} className="px-3 py-2 rounded-lg text-xs border transition-smooth hover:bg-gray-50 cursor-pointer" style={{ borderColor: 'var(--border)', color: 'var(--ink)' }} title="Share or embed">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>
                  </button>
                  <button
                    onClick={() => setConfirmDelete({ id: s.id, title: s.title })}
                    className="px-3 py-2 rounded-lg text-xs border transition-smooth text-red-600 hover:bg-red-50 cursor-pointer"
                    style={{ borderColor: '#fca5a5' }}>
                    <TrashIcon size={14} color="#dc2626" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {showCreate && (
        <>
          <div className="fixed inset-0 z-50 backdrop-blur-sm animate-backdrop" style={{ background: 'rgba(0,0,0,0.4)' }} onClick={() => setShowCreate(false)} />
          <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-full max-w-2xl bg-white rounded-2xl shadow-2xl animate-modal mx-4 max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b" style={{ borderColor: 'var(--border)' }}>
              <h2 className="text-2xl font-bold" style={{ color: 'var(--ink)' }}>Choose your Survey</h2>
            </div>
            <div className="p-6 space-y-3">
              {SURVEY_TYPES.map(t => (
                <button
                  key={t.type}
                  onClick={() => setSelectedType(t.type)}
                  className="w-full text-left p-4 rounded-xl border-2 transition-smooth cursor-pointer"
                  style={{
                    borderColor: selectedType === t.type ? '#3b82f6' : 'var(--border)',
                    background: selectedType === t.type ? '#eff6ff' : 'white',
                  }}>
                  <p className="font-bold text-base" style={{ color: 'var(--ink)' }}>{t.title}</p>
                  <p className="text-sm mt-1" style={{ color: 'var(--slate)' }}>{t.desc}</p>
                </button>
              ))}

              {/* Live Preview */}
              <div className="mt-4 p-4 rounded-xl border-2 border-dashed" style={{ borderColor: '#3b82f6', background: '#f8faff' }}>
                <p className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: '#3b82f6' }}>Preview</p>
                <div className="bg-white rounded-lg p-5 shadow-sm">
                  <h3 className="font-bold text-lg mb-1" style={{ color: 'var(--ink)' }}>
                    {newTitle || SURVEY_TYPES.find(t => t.type === selectedType)?.title || 'Your Survey'}
                  </h3>
                  <p className="text-sm mb-4" style={{ color: 'var(--slate)' }}>
                    {selectedType === 'nps' ? 'How likely are you to recommend us?' : 
                     selectedType === 'csat' ? 'How would you rate your experience?' :
                     selectedType === 'open_feedback' ? 'We\'d love to hear your thoughts!' :
                     selectedType === 'quick_poll' ? 'Quick question for you:' :
                     'Which ideas matter most to you?'}
                  </p>
                  {selectedType === 'nps' ? (
                    <div className="flex gap-1">
                      {Array.from({ length: 11 }, (_, i) => (
                        <div key={i} className="w-8 h-8 rounded-lg border flex items-center justify-center text-xs font-medium cursor-pointer hover:shadow-md transition-smooth"
                          style={{ 
                            borderColor: i <= 6 ? '#fca5a5' : i <= 8 ? '#fde68a' : '#86efac',
                            background: i <= 6 ? '#fef2f2' : i <= 8 ? '#fefce8' : '#f0fdf4',
                            color: i <= 6 ? '#dc2626' : i <= 8 ? '#ca8a04' : '#16a34a',
                          }}>
                          {i}
                        </div>
                      ))}
                    </div>
                  ) : selectedType === 'csat' ? (
                    <div className="flex gap-2">
                      {['😡', '😕', '😐', '🙂', '😄'].map((emoji, i) => (
                        <div key={i} className="w-10 h-10 rounded-lg border flex items-center justify-center text-lg cursor-pointer hover:shadow-md transition-smooth"
                          style={{ borderColor: 'var(--border)' }}>
                          {emoji}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <div className="w-full px-3 py-2 rounded-lg border text-sm" style={{ borderColor: 'var(--border)', color: 'var(--slate)' }}>
                        Type your response here...
                      </div>
                    </div>
                  )}
                  <div className="flex items-center justify-between mt-4 pt-3 border-t" style={{ borderColor: 'var(--border)' }}>
                    <span className="text-xs" style={{ color: 'var(--slate)' }}>Powered by YourApp</span>
                    <div className="px-4 py-1.5 rounded-lg text-xs font-semibold text-white" style={{ background: 'var(--coral)' }}>Submit</div>
                  </div>
                </div>
              </div>

              <div className="pt-4 border-t" style={{ borderColor: 'var(--border)' }}>
                <input
                  type="text"
                  value={newTitle}
                  onChange={e => setNewTitle(e.target.value)}
                  placeholder="Survey title..."
                  className="w-full px-4 py-2.5 rounded-lg border text-sm focus:outline-none"
                  style={{ borderColor: 'var(--border)', fontSize: '16px' }}
                />
              </div>
            </div>
            <div className="flex gap-3 p-6 border-t" style={{ borderColor: 'var(--border)' }}>
              <button
                onClick={() => setShowCreate(false)}
                className="flex-1 py-2.5 rounded-xl text-sm font-medium border transition-smooth cursor-pointer"
                style={{ borderColor: 'var(--border)', color: 'var(--ink)' }}>
                Cancel
              </button>
              <button
                onClick={createSurvey}
                disabled={!newTitle.trim()}
                className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white transition-smooth disabled:opacity-50 cursor-pointer"
                style={{ background: 'var(--coral)' }}>
                Continue
              </button>
            </div>
          </div>
        </>
      )}

      {shareModal && (() => {
        const surveyUrl = typeof window !== 'undefined' ? `${window.location.origin}/surveys/${shareModal.id}` : ''
        const embedCode = `<iframe src="${surveyUrl}?embed=1" width="100%" height="480" frameborder="0" style="border-radius:16px;"></iframe>`
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
                <h2 className="text-xl font-bold" style={{ color: 'var(--ink)' }}>Share Survey</h2>
                <button onClick={() => setShareModal(null)} className="text-2xl cursor-pointer" style={{ color: 'var(--slate)' }}>×</button>
              </div>
              <div className="p-6 space-y-5">
                <div>
                  <label className="block text-sm font-bold mb-2" style={{ color: 'var(--ink)' }}>Direct link</label>
                  <div className="flex gap-2">
                    <input readOnly value={surveyUrl} className="flex-1 px-3 py-2.5 rounded-lg border text-sm bg-gray-50" style={{ borderColor: 'var(--border)' }} />
                    <button onClick={() => copy(surveyUrl, 'link')} className="px-4 py-2.5 rounded-lg text-sm font-semibold text-white cursor-pointer" style={{ background: 'var(--coral)' }}>
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
          title="Delete Survey"
          message={`Are you sure you want to delete "${confirmDelete.title}"? All responses will also be deleted.`}
          confirmLabel="Delete"
          variant="danger"
          onConfirm={() => deleteSurvey(confirmDelete.id)}
          onCancel={() => setConfirmDelete(null)}
        />
      )}
    </div>
  )
}
