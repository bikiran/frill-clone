'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'


export default function HelpCategoriesPage() {
  const router = useRouter()
  const [company, setCompany] = useState<any>(null)
  const [categories, setCategories] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [showNew, setShowNew] = useState(false)
  const [newName, setNewName] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [saving, setSaving] = useState(false)
  const [draggedId, setDraggedId] = useState<string | null>(null)

  useEffect(() => {
    const init = async () => {
      const { data: authData } = await supabase.auth.getSession()
      if (!authData.session?.user) return

      const { data: co } = await (supabase as any)
        .from('companies')
        .select('*')
        .eq('owner_id', authData.session.user.id)
        .maybeSingle()

      setCompany(co)
      if (co?.id) {
        const { data: cats } = await (supabase as any)
          .from('help_categories')
          .select('*')
          .eq('company_id', co.id)
          .order('position', { ascending: true })
        setCategories(cats || [])
      }
      setLoading(false)
    }
    init()
  }, [])

  const handleAddCategory = async () => {
    if (!newName.trim() || !company?.id) return
    setSaving(true)
    const slug = newName.toLowerCase().replace(/\s+/g, '-')
    const { data, error } = await (supabase as any)
      .from('help_categories')
      .insert({
        company_id: company.id,
        name: newName.trim(),
        slug,
        position: categories.length,
      })
      .select()
    if (!error && data) {
      setCategories([...categories, data[0]])
      setNewName('')
      setShowNew(false)
    }
    setSaving(false)
  }

  const handleUpdateCategory = async (id: string) => {
    if (!editName.trim()) return
    setSaving(true)
    const { error } = await (supabase as any)
      .from('help_categories')
      .update({ name: editName.trim(), slug: editName.toLowerCase().replace(/\s+/g, '-') })
      .eq('id', id)
    if (!error) {
      setCategories(categories.map(c => c.id === id ? { ...c, name: editName.trim() } : c))
      setEditingId(null)
    }
    setSaving(false)
  }

  const handleDeleteCategory = async (id: string) => {
    if (!confirm('Delete this category? Articles in it will keep their category but the category will be removed.')) return
    setSaving(true)
    await (supabase as any)
      .from('help_categories')
      .delete()
      .eq('id', id)
    setCategories(categories.filter(c => c.id !== id))
    setSaving(false)
  }

  const handleReorder = async (id: string, direction: 'up' | 'down') => {
    const idx = categories.findIndex(c => c.id === id)
    if ((direction === 'up' && idx === 0) || (direction === 'down' && idx === categories.length - 1)) return

    const newIdx = direction === 'up' ? idx - 1 : idx + 1
    const newCategories = [...categories]
    [newCategories[idx], newCategories[newIdx]] = [newCategories[newIdx], newCategories[idx]]

    // Update positions in DB
    for (let i = 0; i < newCategories.length; i++) {
      await (supabase as any)
        .from('help_categories')
        .update({ position: i })
        .eq('id', newCategories[i].id)
    }
    setCategories(newCategories)
  }

  if (loading) return <div style={{ textAlign: 'center', padding: '20px' }}>Loading...</div>

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
        <Link href="/admin/settings" style={{ color: 'var(--slate)', display: 'flex' }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg>
        </Link>
        <h1 style={{ fontSize: 24, fontWeight: 700, color: 'var(--ink)', margin: 0 }}>Help Categories</h1>
        <button
          onClick={() => setShowNew(true)}
          style={{ marginLeft: 'auto', padding: '8px 16px', borderRadius: 8, border: 'none', background: 'var(--coral)', color: '#fff', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          Add Category
        </button>
      </div>

      {showNew && (
        <div style={{ marginBottom: 20, padding: 16, borderRadius: 12, border: '1px solid var(--border)', background: '#f9f9f9' }}>
          <input
            value={newName}
            onChange={e => setNewName(e.target.value)}
            placeholder="Category name..."
            style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid var(--border)', marginBottom: 12, fontSize: 13 }}
            onKeyDown={e => e.key === 'Enter' && handleAddCategory()}
          />
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={handleAddCategory} disabled={saving} style={{ padding: '8px 16px', borderRadius: 8, border: 'none', background: 'var(--coral)', color: '#fff', fontWeight: 600, cursor: 'pointer' }}>
              {saving ? 'Saving...' : 'Create'}
            </button>
            <button onClick={() => { setShowNew(false); setNewName('') }} style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid var(--border)', background: '#fff', color: 'var(--ink)', fontWeight: 600, cursor: 'pointer' }}>
              Cancel
            </button>
          </div>
        </div>
      )}

      <div>
        {categories.length === 0 ? (
          <p style={{ fontSize: 14, color: 'var(--slate)', textAlign: 'center', padding: 40 }}>No categories yet. Create one to organize your help articles!</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {categories.map((cat, idx) => (
              <div
                key={cat.id}
                draggable
                onDragStart={() => setDraggedId(cat.id)}
                onDragOver={e => e.preventDefault()}
                onDrop={() => {
                  if (draggedId && draggedId !== cat.id) {
                    const draggedIdx = categories.findIndex(c => c.id === draggedId)
                    const newCategories = [...categories]
                    const [draggedCat] = newCategories.splice(draggedIdx, 1)
                    newCategories.splice(idx, 0, draggedCat)
                    setCategories(newCategories)
                    // Update positions
                    newCategories.forEach((c, i) => {
                      (supabase as any).from('help_categories').update({ position: i }).eq('id', c.id).then()
                    })
                  }
                  setDraggedId(null)
                }}
                style={{
                  padding: 16,
                  borderRadius: 12,
                  border: '1px solid var(--border)',
                  background: '#fff',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  cursor: draggedId ? 'grabbing' : 'grab',
                  opacity: draggedId === cat.id ? 0.5 : 1,
                }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--slate)" strokeWidth="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>
                {editingId === cat.id ? (
                  <input
                    value={editName}
                    onChange={e => setEditName(e.target.value)}
                    style={{ flex: 1, padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border)', fontSize: 13 }}
                    onKeyDown={e => e.key === 'Enter' && handleUpdateCategory(cat.id)}
                    autoFocus
                  />
                ) : (
                  <div style={{ flex: 1 }}>
                    <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink)', margin: '0 0 2px 0' }}>{cat.name}</p>
                    <p style={{ fontSize: 12, color: 'var(--slate)', margin: 0 }}>ID: {cat.slug}</p>
                  </div>
                )}
                <div style={{ display: 'flex', gap: 8 }}>
                  {editingId === cat.id ? (
                    <>
                      <button onClick={() => handleUpdateCategory(cat.id)} disabled={saving} style={{ padding: '6px 12px', borderRadius: 6, border: 'none', background: 'var(--coral)', color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                        Save
                      </button>
                      <button onClick={() => setEditingId(null)} style={{ padding: '6px 12px', borderRadius: 6, border: '1px solid var(--border)', background: '#fff', color: 'var(--ink)', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                        Cancel
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        onClick={() => { setEditingId(cat.id); setEditName(cat.name) }}
                        style={{ padding: '6px 12px', borderRadius: 6, border: '1px solid var(--border)', background: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, fontSize: 12 }}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                        Edit
                      </button>
                      <button
                        onClick={() => handleReorder(cat.id, 'up')}
                        disabled={idx === 0}
                        style={{ padding: '6px 8px', borderRadius: 6, border: '1px solid var(--border)', background: idx === 0 ? '#f0f0f0' : '#fff', cursor: idx === 0 ? 'default' : 'pointer', opacity: idx === 0 ? 0.5 : 1 }}>
                        ↑
                      </button>
                      <button
                        onClick={() => handleReorder(cat.id, 'down')}
                        disabled={idx === categories.length - 1}
                        style={{ padding: '6px 8px', borderRadius: 6, border: '1px solid var(--border)', background: idx === categories.length - 1 ? '#f0f0f0' : '#fff', cursor: idx === categories.length - 1 ? 'default' : 'pointer', opacity: idx === categories.length - 1 ? 0.5 : 1 }}>
                        ↓
                      </button>
                      <button
                        onClick={() => handleDeleteCategory(cat.id)}
                        style={{ padding: '6px 12px', borderRadius: 6, border: '1px solid #fee2e2', background: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#dc2626" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>
                      </button>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
