'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import ConfirmModal from '@/components/ConfirmModal'
import { TrashIcon, PlusIcon, PollIcon } from '@/components/Icons'


export default function PollsAdmin() {
  const router = useRouter()
  const [user, setUser] = useState<any>(null)
  const [polls, setPolls] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [question, setQuestion] = useState('')
  const [description, setDescription] = useState('')
  const [pollImage, setPollImage] = useState('')
  const [options, setOptions] = useState<{ text: string; image: string; description: string }[]>([{ text: '', image: '', description: '' }, { text: '', image: '', description: '' }])
  const [uploadingFor, setUploadingFor] = useState<string>('')
  const [confirmDelete, setConfirmDelete] = useState<{ id: string; question: string } | null>(null)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setUser(data.session.user)
    })
    fetchPolls()
  }, [router])

  const fetchPolls = async () => {
    try {
      const { data } = await supabase.from('polls').select('*').order('created_at', { ascending: false })
      if (data) setPolls(data)
    } catch {}
    setLoading(false)
  }

  const createPoll = async () => {
    if (!question.trim() || options.filter(o => o.text.trim()).length < 2) {
      alert('Please add a question and at least 2 options')
      return
    }
    const { error } = await supabase.from('polls').insert({
      question: question.trim(),
      description: description.trim() || null,
      image_url: pollImage || null,
      options: options.filter(o => o.text.trim()),
      is_active: true,
    })
    if (error) {
      alert('Failed to create poll. Run DATABASE_SETUP.sql\n' + error.message)
      return
    }
    setQuestion('')
    setDescription('')
    setPollImage('')
    setOptions([{ text: '', image: '', description: '' }, { text: '', image: '', description: '' }])
    setShowCreate(false)
    fetchPolls()
  }

  const uploadPollImage = async (file: File, target: string) => {
    setUploadingFor(target)
    try {
      const ext = file.name.split('.').pop()
      const fileName = `polls/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`
      let uploadBucket = 'idea-images'
      const { data, error } = await supabase.storage.from(uploadBucket).upload(fileName, file, { upsert: true })
      if (error) throw error
      const { data: { publicUrl } } = supabase.storage.from(uploadBucket).getPublicUrl(data.path)
      if (target === 'poll') {
        setPollImage(publicUrl)
      } else {
        const idx = parseInt(target.replace('option-', ''))
        setOptions(prev => prev.map((o, i) => i === idx ? { ...o, image: publicUrl } : o))
      }
    } catch (e: any) {
      alert('Image upload failed: ' + e.message)
    }
    setUploadingFor('')
  }

  const deletePoll = async (id: string) => {
    await supabase.from('polls').delete().eq('id', id)
    fetchPolls()
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
            <h1 className="text-3xl font-bold mt-3" style={{ color: 'var(--ink)' }}>Polls</h1>
            <p className="mt-1" style={{ color: 'var(--slate)' }}>Get instant opinions from your users.</p>
          </div>
          <button
            onClick={() => setShowCreate(true)}
            className="px-5 py-2.5 rounded-xl font-semibold text-white text-sm transition-smooth press-effect cursor-pointer flex items-center gap-2"
            style={{ background: 'var(--coral)' }}>
            <PlusIcon size={16} color="white" /> New Poll
          </button>
        </div>

        {polls.length === 0 ? (
          <div className="text-center py-20 rounded-2xl border" style={{ borderColor: 'var(--border)' }}>
            <div className="inline-block mb-4"><PollIcon size={48} color="var(--slate)" /></div>
            <h3 className="text-lg font-semibold mb-2" style={{ color: 'var(--ink)' }}>No polls yet</h3>
            <p className="mb-6" style={{ color: 'var(--slate)' }}>Create your first poll to gather opinions.</p>
          </div>
        ) : (
          <div className="grid md:grid-cols-2 gap-4">
            {polls.map(p => (
              <div key={p.id} className="bg-white rounded-2xl border p-5 hover:shadow-md transition-smooth" style={{ borderColor: 'var(--border)' }}>
                {p.image_url && <img src={p.image_url} alt="" className="w-full h-28 object-cover rounded-xl mb-3" />}
                <h3 className="text-lg font-bold mb-1" style={{ color: 'var(--ink)' }}>{p.question}</h3>
                {p.description && <p className="text-sm mb-3" style={{ color: 'var(--slate)' }}>{p.description}</p>}
                <div className="space-y-1 mb-4">
                  {(Array.isArray(p.options) ? p.options : (typeof p.options === 'string' ? (() => { try { return JSON.parse(p.options) } catch { return [] } })() : [])).map((opt: any, i: number) => (
                    <p key={i} className="text-sm flex items-center gap-2" style={{ color: 'var(--slate)' }}>
                      {opt.image && <img src={opt.image} alt="" className="w-5 h-5 rounded object-cover" />}
                      • {typeof opt === 'string' ? opt : opt.text}
                    </p>
                  ))}
                </div>
                <div className="flex gap-2 pt-3 border-t" style={{ borderColor: 'var(--border)' }}>
                  <Link href={`/admin/polls/${p.id}`} className="flex-1 py-2 rounded-lg text-xs font-medium border text-center transition-smooth hover:bg-gray-50 cursor-pointer" style={{ borderColor: 'var(--border)', color: 'var(--ink)' }}>
                    View Reports
                  </Link>
                  <button onClick={() => setConfirmDelete({ id: p.id, question: p.question })} className="px-3 py-2 rounded-lg text-xs border transition-smooth text-red-600 hover:bg-red-50 cursor-pointer" style={{ borderColor: '#fca5a5' }}>
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
          <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-full max-w-lg bg-white rounded-2xl shadow-2xl animate-modal mx-4 max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b" style={{ borderColor: 'var(--border)' }}>
              <h2 className="text-xl font-bold" style={{ color: 'var(--ink)' }}>Create Poll</h2>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-bold mb-2" style={{ color: 'var(--ink)' }}>Question</label>
                <input
                  type="text"
                  value={question}
                  onChange={e => setQuestion(e.target.value)}
                  placeholder="What's your favorite color?"
                  className="w-full px-4 py-2.5 rounded-lg border text-sm focus:outline-none"
                  style={{ borderColor: 'var(--border)', fontSize: '16px' }}
                />
              </div>

              <div>
                <label className="block text-sm font-bold mb-2" style={{ color: 'var(--ink)' }}>Description <span className="font-normal" style={{ color: 'var(--slate)' }}>(optional)</span></label>
                <textarea
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  placeholder="Add more context about this poll..."
                  rows={2}
                  className="w-full px-4 py-2.5 rounded-lg border text-sm focus:outline-none resize-none"
                  style={{ borderColor: 'var(--border)', fontSize: '16px' }}
                />
              </div>

              <div>
                <label className="block text-sm font-bold mb-2" style={{ color: 'var(--ink)' }}>Cover image <span className="font-normal" style={{ color: 'var(--slate)' }}>(optional)</span></label>
                {pollImage ? (
                  <div className="relative inline-block">
                    <img src={pollImage} alt="Poll cover" className="h-24 rounded-lg border object-cover" style={{ borderColor: 'var(--border)' }} />
                    <button onClick={() => setPollImage('')}
                      className="absolute -top-2 -right-2 w-6 h-6 rounded-full flex items-center justify-center text-xs"
                      style={{ background: '#ef4444', color: '#fff', border: 'none', cursor: 'pointer' }}>×</button>
                  </div>
                ) : (
                  <label className="flex items-center justify-center gap-2 px-4 py-3 rounded-lg border-2 border-dashed text-sm cursor-pointer hover:bg-gray-50"
                    style={{ borderColor: 'var(--border)', color: 'var(--slate)' }}>
                    {uploadingFor === 'poll' ? 'Uploading...' : '+ Add cover image'}
                    <input type="file" accept="image/*" className="hidden"
                      onChange={e => { const f = e.target.files?.[0]; if (f) uploadPollImage(f, 'poll') }} />
                  </label>
                )}
              </div>

              <div>
                <label className="block text-sm font-bold mb-2" style={{ color: 'var(--ink)' }}>Options</label>
                <div className="space-y-3">
                  {options.map((opt, i) => (
                    <div key={i} className="p-3 rounded-lg border" style={{ borderColor: 'var(--border)' }}>
                      <div className="flex gap-2 mb-2">
                        <input
                          type="text"
                          value={opt.text}
                          onChange={e => {
                            const newOpts = [...options]
                            newOpts[i] = { ...newOpts[i], text: e.target.value }
                            setOptions(newOpts)
                          }}
                          placeholder={`Option ${i + 1}`}
                          className="flex-1 px-3 py-2 rounded-lg border text-sm focus:outline-none"
                          style={{ borderColor: 'var(--border)', fontSize: '16px' }}
                        />
                        {options.length > 2 && (
                          <button
                            onClick={() => setOptions(options.filter((_, idx) => idx !== i))}
                            className="px-3 py-2 rounded-lg border text-red-600 hover:bg-red-50 transition-smooth cursor-pointer"
                            style={{ borderColor: '#fca5a5' }}>
                            ×
                          </button>
                        )}
                      </div>
                      <input
                        type="text"
                        value={opt.description}
                        onChange={e => {
                          const newOpts = [...options]
                          newOpts[i] = { ...newOpts[i], description: e.target.value }
                          setOptions(newOpts)
                        }}
                        placeholder="Short description (optional)"
                        className="w-full px-3 py-1.5 rounded-lg border text-xs focus:outline-none mb-2"
                        style={{ borderColor: 'var(--border)' }}
                      />
                      {opt.image ? (
                        <div className="relative inline-block">
                          <img src={opt.image} alt="" className="h-16 rounded-md border object-cover" style={{ borderColor: 'var(--border)' }} />
                          <button onClick={() => setOptions(prev => prev.map((o, idx) => idx === i ? { ...o, image: '' } : o))}
                            className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full flex items-center justify-center text-xs"
                            style={{ background: '#ef4444', color: '#fff', border: 'none', cursor: 'pointer' }}>×</button>
                        </div>
                      ) : (
                        <label className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-dashed text-xs cursor-pointer hover:bg-gray-50"
                          style={{ borderColor: 'var(--border)', color: 'var(--slate)' }}>
                          {uploadingFor === `option-${i}` ? 'Uploading...' : '+ Image'}
                          <input type="file" accept="image/*" className="hidden"
                            onChange={e => { const f = e.target.files?.[0]; if (f) uploadPollImage(f, `option-${i}`) }} />
                        </label>
                      )}
                    </div>
                  ))}
                  <button
                    onClick={() => setOptions([...options, { text: '', image: '', description: '' }])}
                    className="text-sm font-medium hover:opacity-70 transition-smooth cursor-pointer"
                    style={{ color: 'var(--coral)' }}>
                    + Add option
                  </button>
                </div>
              </div>
            </div>
            <div className="flex gap-3 p-6 border-t" style={{ borderColor: 'var(--border)' }}>
              <button onClick={() => setShowCreate(false)} className="flex-1 py-2.5 rounded-xl text-sm font-medium border transition-smooth cursor-pointer" style={{ borderColor: 'var(--border)', color: 'var(--ink)' }}>
                Cancel
              </button>
              <button onClick={createPoll} className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white transition-smooth cursor-pointer" style={{ background: 'var(--coral)' }}>
                Create Poll
              </button>
            </div>
          </div>
        </>
      )}

      {confirmDelete && (
        <ConfirmModal
          title="Delete Poll"
          message={`Delete "${confirmDelete.question}"? All votes will also be deleted.`}
          confirmLabel="Delete"
          variant="danger"
          onConfirm={() => deletePoll(confirmDelete.id)}
          onCancel={() => setConfirmDelete(null)}
        />
      )}
    </div>
  )
}
