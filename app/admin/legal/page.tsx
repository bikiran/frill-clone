'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

type Section = { heading: string; body: string }

export default function LegalAdminPage() {
  const [slug, setSlug] = useState<'privacy' | 'terms'>('privacy')
  const [title, setTitle] = useState('')
  const [sections, setSections] = useState<Section[]>([])
  const [updatedAt, setUpdatedAt] = useState<string | null>(null)
  const [updatedBy, setUpdatedBy] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState('')

  const load = async (s: 'privacy' | 'terms') => {
    setLoading(true); setMsg('')
    try {
      const res = await fetch(`/api/legal?slug=${s}`)
      const { page } = await res.json()
      setTitle(page?.title || (s === 'privacy' ? 'Privacy Policy' : 'Terms of Service'))
      setSections(page?.sections?.length ? page.sections : [{ heading: '', body: '' }])
      setUpdatedAt(page?.updated_at || null)
      setUpdatedBy(page?.updated_by || null)
    } catch {} finally { setLoading(false) }
  }
  useEffect(() => { load(slug) }, [slug])

  const save = async () => {
    setSaving(true); setMsg('')
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch('/api/legal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session?.access_token}` },
        body: JSON.stringify({ slug, title, sections: sections.filter(s => s.heading || s.body) }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Save failed')
      setMsg('Saved.')
      setUpdatedAt(new Date().toISOString())
      setUpdatedBy(session?.user?.email || null)
    } catch (e: any) { setMsg(e.message) } finally { setSaving(false) }
  }

  const setSection = (i: number, patch: Partial<Section>) => setSections(prev => prev.map((s, j) => j === i ? { ...s, ...patch } : s))
  const addSection = () => setSections(prev => [...prev, { heading: '', body: '' }])
  const removeSection = (i: number) => setSections(prev => prev.filter((_, j) => j !== i))
  const move = (i: number, dir: -1 | 1) => setSections(prev => {
    const next = [...prev]; const t = i + dir
    if (t < 0 || t >= next.length) return prev
    ;[next[i], next[t]] = [next[t], next[i]]; return next
  })

  const inp: React.CSSProperties = { width: '100%', padding: '10px 12px', borderRadius: 9, border: '1px solid var(--border)', fontSize: 14, boxSizing: 'border-box', fontFamily: 'inherit' }

  return (
    <div style={{ padding: '28px 32px', maxWidth: 860, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginBottom: 6 }}>
        <h1 style={{ fontSize: 24, fontWeight: 800, color: 'var(--ink)', margin: 0 }}>Legal pages</h1>
        <button onClick={save} disabled={saving} style={{ padding: '9px 20px', borderRadius: 9, background: 'var(--coral)', color: '#fff', border: 'none', fontSize: 13.5, fontWeight: 700, cursor: 'pointer' }}>{saving ? 'Saving…' : 'Save'}</button>
      </div>
      <p style={{ fontSize: 14, color: 'var(--slate)', margin: '0 0 20px' }}>Edit the public Privacy and Terms pages shown on colvy.com.</p>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 18 }}>
        {(['privacy', 'terms'] as const).map(s => (
          <button key={s} onClick={() => setSlug(s)} style={{ padding: '8px 16px', borderRadius: 9, border: slug === s ? '2px solid var(--coral)' : '1px solid var(--border)', background: slug === s ? 'var(--peach)' : '#fff', color: slug === s ? 'var(--coral)' : 'var(--ink)', fontSize: 13.5, fontWeight: 600, cursor: 'pointer', textTransform: 'capitalize' }}>{s === 'privacy' ? 'Privacy Policy' : 'Terms of Service'}</button>
        ))}
        <a href={`/${slug}`} target="_blank" rel="noopener" style={{ marginLeft: 'auto', alignSelf: 'center', fontSize: 13, color: '#6366f1' }}>View page ↗</a>
      </div>

      {msg && <div style={{ padding: '9px 13px', borderRadius: 9, background: msg === 'Saved.' ? '#ecfdf5' : '#fee2e2', color: msg === 'Saved.' ? '#059669' : '#dc2626', fontSize: 13, marginBottom: 16 }}>{msg}</div>}
      {updatedAt && <p style={{ fontSize: 12.5, color: 'var(--slate)', margin: '0 0 16px' }}>Last edited {new Date(updatedAt).toLocaleString()}{updatedBy ? ` by ${updatedBy}` : ''}</p>}

      {loading ? <p style={{ color: 'var(--slate)' }}>Loading…</p> : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div>
            <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--slate)', display: 'block', marginBottom: 5 }}>Page title</label>
            <input value={title} onChange={e => setTitle(e.target.value)} style={inp} />
          </div>

          {sections.map((s, i) => (
            <div key={i} style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 12, padding: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: '#9ca3af' }}>SECTION {i + 1}</span>
                <div style={{ marginLeft: 'auto', display: 'flex', gap: 4 }}>
                  <button onClick={() => move(i, -1)} title="Move up" style={miniBtn}>↑</button>
                  <button onClick={() => move(i, 1)} title="Move down" style={miniBtn}>↓</button>
                  <button onClick={() => removeSection(i)} title="Remove" style={{ ...miniBtn, color: '#dc2626' }}>✕</button>
                </div>
              </div>
              <input value={s.heading} onChange={e => setSection(i, { heading: e.target.value })} placeholder="Heading (e.g. Information we collect)" style={{ ...inp, fontWeight: 700, marginBottom: 8 }} />
              <textarea value={s.body} onChange={e => setSection(i, { body: e.target.value })} placeholder="Section text… (blank line separates paragraphs)" rows={5} style={{ ...inp, resize: 'vertical' }} />
            </div>
          ))}

          <button onClick={addSection} style={{ padding: '10px', borderRadius: 9, border: '1px dashed var(--border)', background: '#fff', color: 'var(--coral)', fontSize: 13.5, fontWeight: 600, cursor: 'pointer' }}>+ Add section</button>
        </div>
      )}
    </div>
  )
}

const miniBtn: React.CSSProperties = { width: 26, height: 26, borderRadius: 6, border: '1px solid var(--border)', background: '#fff', cursor: 'pointer', fontSize: 13, color: 'var(--slate)', lineHeight: 1 }
