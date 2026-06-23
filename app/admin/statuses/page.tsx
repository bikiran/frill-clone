'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import ConfirmModal from '@/components/ConfirmModal'
import { TrashIcon, PlusIcon } from '@/components/Icons'

const ADMIN_EMAIL = 'bishalstha76@gmail.com'

const COLORS = [
  '#f97316', '#ea580c', '#dc2626', '#ec4899', 
  '#7c3aed', '#3b82f6', '#06b6d4', '#10b981',
  '#84cc16', '#eab308', '#9ca3af', '#1f2937',
]

export default function StatusesPage() {
  const router = useRouter()
  const [user, setUser] = useState<any>(null)
  const [statuses, setStatuses] = useState<any[]>([])
  const [newLabel, setNewLabel] = useState('')
  const [newColor, setNewColor] = useState(COLORS[5])
  const [confirmDelete, setConfirmDelete] = useState<{ id: string; label: string } | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      const u = data.session?.user
      if (u?.email !== ADMIN_EMAIL) {
        router.push('/')
        return
      }
      setUser(u)
    })
    fetchStatuses()
  }, [router])

  const fetchStatuses = async () => {
    try {
      const { data, error } = await supabase.from('statuses').select('*').order('order_index', { ascending: true })
      if (!error && data) setStatuses(data)
    } catch {}
    setLoading(false)
  }

  const addStatus = async () => {
    if (!newLabel.trim()) return
    setSaving(true)
    const key = newLabel.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_')
    const { error } = await supabase.from('statuses').insert({
      key,
      label: newLabel.trim(),
      color: newColor,
      order_index: statuses.length,
    })
    if (error) {
      alert('Failed to add status. Run DATABASE_SETUP.sql to create the statuses table.\n\n' + error.message)
    } else {
      setNewLabel('')
      fetchStatuses()
    }
    setSaving(false)
  }

  const deleteStatus = async (id: string) => {
    await supabase.from('statuses').delete().eq('id', id)
    fetchStatuses()
    setConfirmDelete(null)
  }

  if (loading || !user) return <div className="p-8" style={{ color: 'var(--slate)' }}>Loading...</div>

  return (
    <div className="max-w-4xl mx-auto px-4 md:px-6 py-8">
      <div className="mb-8">
        <Link href="/admin" className="text-sm font-medium hover:opacity-70 transition-smooth" style={{ color: 'var(--coral)' }}>
          ← Back to admin
        </Link>
        <h1 className="text-3xl font-bold mt-3 mb-2" style={{ color: 'var(--ink)' }}>
          Statuses
        </h1>
        <p style={{ color: 'var(--slate)' }}>
          Use statuses to track ideas on your roadmap.
        </p>
      </div>

      <div className="bg-white rounded-2xl border p-4 md:p-6 mb-6" style={{ borderColor: 'var(--border)' }}>
        <h3 className="text-sm font-bold mb-4" style={{ color: 'var(--ink)' }}>Add Status</h3>
        
        <div className="flex flex-col sm:flex-row gap-3 mb-4">
          <input
            type="text"
            value={newLabel}
            onChange={e => setNewLabel(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && addStatus()}
            placeholder="Status name"
            className="flex-1 px-4 py-2.5 rounded-lg border text-sm focus:outline-none transition-smooth"
            style={{ borderColor: 'var(--border)', fontSize: '16px' }}
          />
          <button
            onClick={addStatus}
            disabled={!newLabel.trim() || saving}
            className="px-5 py-2.5 rounded-lg font-semibold text-white text-sm transition-smooth press-effect disabled:opacity-50 cursor-pointer flex items-center justify-center gap-1"
            style={{ background: 'var(--coral)' }}>
            <PlusIcon size={16} color="white" />
            {saving ? 'Adding...' : 'Add Status'}
          </button>
        </div>

        <div>
          <p className="text-xs font-semibold mb-2" style={{ color: 'var(--slate)' }}>Color</p>
          <div className="flex flex-wrap gap-2">
            {COLORS.map(c => (
              <button
                key={c}
                onClick={() => setNewColor(c)}
                className="w-7 h-7 rounded-full transition-smooth cursor-pointer"
                style={{
                  background: c,
                  border: newColor === c ? '3px solid white' : '3px solid transparent',
                  boxShadow: newColor === c ? `0 0 0 2px ${c}` : 'none',
                }}
              />
            ))}
          </div>
        </div>
      </div>

      {statuses.length === 0 ? (
        <div className="text-center py-12 rounded-2xl border" style={{ borderColor: 'var(--border)' }}>
          <p style={{ color: 'var(--slate)' }}>No custom statuses yet. Add one above to get started.</p>
          <p className="text-xs mt-2" style={{ color: 'var(--slate)' }}>
            Defaults shown on the roadmap: Under consideration, Planned, In Development, Shipped
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {statuses.map(s => (
            <div key={s.id} className="bg-white rounded-xl border p-4 flex items-center gap-3 hover:shadow-md transition-smooth" style={{ borderColor: 'var(--border)' }}>
              <span className="w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0" style={{ borderColor: s.color }}>
                <span className="w-2 h-2 rounded-full" style={{ background: s.color }} />
              </span>
              <span className="flex-1 text-sm font-medium" style={{ color: 'var(--ink)' }}>
                {s.label}
              </span>
              <span className="text-xs px-2 py-0.5 rounded" style={{ color: 'var(--slate)', background: 'var(--canvas)' }}>
                {s.key}
              </span>
              <button
                onClick={() => setConfirmDelete({ id: s.id, label: s.label })}
                className="p-2 rounded-lg hover:bg-red-50 transition-smooth cursor-pointer"
                title="Delete status">
                <TrashIcon size={16} color="#dc2626" />
              </button>
            </div>
          ))}
        </div>
      )}

      {confirmDelete && (
        <ConfirmModal
          title="Delete Status"
          message={`Are you sure you want to delete "${confirmDelete.label}"? Ideas using this status will keep the value but the column won't appear on the roadmap.`}
          confirmLabel="Delete"
          variant="danger"
          onConfirm={() => deleteStatus(confirmDelete.id)}
          onCancel={() => setConfirmDelete(null)}
        />
      )}
    </div>
  )
}
