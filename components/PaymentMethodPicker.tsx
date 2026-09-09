'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'

// A searchable Select for payment methods, backed by a managed per-company list
// (payment_methods, COLVY_V296) — the same idea as Order Tags. Users can search,
// pick, add a new method inline, or open "Manage payment methods" to rename and
// delete. The value stored on a sale is still the method NAME (a string).

const DEFAULT_METHODS = ['Bank transfer', 'Card', 'Cash', 'Stripe', 'PayPal', 'Other']

type Method = { id: string | null; name: string }

export default function PaymentMethodPicker({
  companyId, value, onChange, accent = 'var(--coral)',
}: {
  companyId: string
  value: string
  onChange: (name: string) => void
  accent?: string
}) {
  const [methods, setMethods] = useState<Method[]>([])   // persisted palette
  const [used, setUsed] = useState<string[]>([])          // seen on past sales, maybe unregistered
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [manage, setManage] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)

  const load = async () => {
    try {
      const { data } = await (supabase as any).from('payment_methods')
        .select('id, name').eq('company_id', companyId).order('name')
      setMethods((data || []).map((m: any) => ({ id: m.id, name: m.name })))
    } catch { setMethods([]) }
    try {
      const { data } = await (supabase as any).from('conversation_sales')
        .select('payment_method').eq('company_id', companyId).not('payment_method', 'is', null).limit(500)
      setUsed(Array.from(new Set((data || []).map((r: any) => String(r.payment_method || '').trim()).filter(Boolean))))
    } catch { setUsed([]) }
  }
  useEffect(() => { if (companyId) load() }, [companyId])

  // Close on outside click.
  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => { if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])

  // The full suggestion list: persisted palette + methods seen on past sales +
  // sensible defaults, deduped case-insensitively.
  const allNames = useMemo(() => {
    const seen = new Map<string, string>()
    for (const m of methods) seen.set(m.name.toLowerCase(), m.name)
    for (const u of used) if (!seen.has(u.toLowerCase())) seen.set(u.toLowerCase(), u)
    for (const d of DEFAULT_METHODS) if (!seen.has(d.toLowerCase())) seen.set(d.toLowerCase(), d)
    return Array.from(seen.values()).sort((a, b) => a.localeCompare(b))
  }, [methods, used])

  const q = query.trim().toLowerCase()
  const filtered = q ? allNames.filter(n => n.toLowerCase().includes(q)) : allNames
  const exact = allNames.some(n => n.toLowerCase() === q)

  const addMethod = async (name: string): Promise<void> => {
    const n = name.trim()
    if (!n) return
    // If it's already in the palette, nothing to persist.
    if (!methods.some(m => m.name.toLowerCase() === n.toLowerCase())) {
      try {
        const { data } = await (supabase as any).from('payment_methods')
          .insert({ company_id: companyId, name: n }).select('id, name').maybeSingle()
        if (data) setMethods(m => [...m, { id: data.id, name: data.name }].sort((a, b) => a.name.localeCompare(b.name)))
      } catch { /* unique clash or table missing — still usable as a plain string */ }
    }
  }

  const pick = (name: string) => { onChange(name); setOpen(false); setQuery('') }
  const addAndPick = async (name: string) => { await addMethod(name); pick(name) }

  const input: React.CSSProperties = { width: '100%', padding: '9px 11px', borderRadius: 9, border: '1px solid var(--border)', fontSize: 13.5, outline: 'none', boxSizing: 'border-box' }

  return (
    <div ref={wrapRef} style={{ position: 'relative' }}>
      {/* Trigger */}
      <button type="button" onClick={() => { setOpen(o => !o); setQuery('') }}
        style={{ ...input, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, cursor: 'pointer', textAlign: 'left', background: '#fff', borderColor: open ? accent : 'var(--border)' }}>
        <span style={{ color: value ? 'var(--ink)' : 'var(--slate)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {value || 'Select or type a new method'}
        </span>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--slate)', flexShrink: 0 }}><polyline points="6 9 12 15 18 9" /></svg>
      </button>

      {/* Dropdown */}
      {open && (
        <div style={{ position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0, zIndex: 50, background: '#fff', border: '1px solid var(--border)', borderRadius: 10, boxShadow: '0 12px 32px rgba(0,0,0,0.16)', overflow: 'hidden' }}>
          <div style={{ padding: 8, borderBottom: '1px solid var(--border)' }}>
            <input autoFocus value={query} onChange={e => setQuery(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && query.trim()) { e.preventDefault(); addAndPick(query) } }}
              placeholder="Search or add…" style={{ ...input, padding: '7px 9px', fontSize: 13 }} />
          </div>
          <div style={{ maxHeight: 220, overflowY: 'auto', padding: 4 }}>
            {filtered.map(n => (
              <button key={n} type="button" onClick={() => pick(n)}
                style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', textAlign: 'left', padding: '8px 9px', borderRadius: 7, border: 'none', background: value === n ? `color-mix(in srgb, ${accent} 10%, transparent)` : 'none', fontSize: 13, color: 'var(--ink)', cursor: 'pointer', fontWeight: value === n ? 700 : 500 }}>
                <span style={{ width: 14, display: 'inline-flex', flexShrink: 0, color: accent }}>
                  {value === n ? <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg> : null}
                </span>
                {n}
              </button>
            ))}
            {q && !exact && (
              <button type="button" onClick={() => addAndPick(query)}
                style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', textAlign: 'left', padding: '8px 9px', borderRadius: 7, border: 'none', background: 'none', fontSize: 13, color: accent, cursor: 'pointer', fontWeight: 700 }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
                Add “{query.trim()}”
              </button>
            )}
            {filtered.length === 0 && !q && (
              <p style={{ margin: 0, padding: '10px 9px', fontSize: 12.5, color: 'var(--slate)' }}>No methods yet — type to add one.</p>
            )}
          </div>
          <button type="button" onClick={() => { setOpen(false); setManage(true) }}
            style={{ display: 'flex', alignItems: 'center', gap: 7, width: '100%', textAlign: 'left', padding: '9px 11px', borderTop: '1px solid var(--border)', background: 'none', border: 'none', fontSize: 12.5, fontWeight: 700, color: accent, cursor: 'pointer' }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" /></svg>
            Manage payment methods…
          </button>
        </div>
      )}

      {manage && (
        <ManagePaymentMethodsModal companyId={companyId} accent={accent} methods={methods} used={used}
          onChanged={load} onClose={() => setManage(false)} />
      )}
    </div>
  )
}

// ── Manage payment methods: add / rename / delete ────────────────────────────
function ManagePaymentMethodsModal({
  companyId, accent, methods, used, onChanged, onClose,
}: {
  companyId: string
  accent: string
  methods: Method[]
  used: string[]
  onChanged: () => void | Promise<void>
  onClose: () => void
}) {
  const [editingKey, setEditingKey] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [newName, setNewName] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  // Show the palette plus any method already used on sales that isn't registered
  // yet, so it can be adopted or tidied up.
  const rowKey = (m: Method) => m.id || `n:${m.name.toLowerCase()}`
  const rows: (Method & { unregistered: boolean })[] = [
    ...methods.map(m => ({ ...m, unregistered: false })),
    ...used.filter(u => !methods.some(m => m.name.toLowerCase() === u.toLowerCase()))
      .map(name => ({ id: null, name, unregistered: true })),
  ].sort((a, b) => a.name.localeCompare(b.name))

  const create = async () => {
    const n = newName.trim(); if (!n) return
    if (methods.some(m => m.name.toLowerCase() === n.toLowerCase())) { setErr('That method already exists.'); return }
    setBusy(true); setErr('')
    try { await (supabase as any).from('payment_methods').insert({ company_id: companyId, name: n }); setNewName(''); await onChanged() }
    catch (e: any) { setErr(e?.message?.includes('payment_methods') ? 'Run COLVY_V296 on Supabase to manage methods.' : 'Could not add method.') }
    setBusy(false)
  }

  const startEdit = (m: Method) => { setEditingKey(rowKey(m)); setEditName(m.name); setErr('') }

  const saveEdit = async (m: Method & { unregistered: boolean }) => {
    const n = editName.trim() || m.name
    setBusy(true); setErr('')
    try {
      if (m.id) {
        await (supabase as any).from('payment_methods').update({ name: n }).eq('id', m.id)
      } else {
        // Adopt an unregistered method into the palette.
        await (supabase as any).from('payment_methods').insert({ company_id: companyId, name: n })
      }
      // Keep historical sales consistent with the renamed method.
      if (n.toLowerCase() !== m.name.toLowerCase()) {
        try { await (supabase as any).from('conversation_sales').update({ payment_method: n }).eq('company_id', companyId).eq('payment_method', m.name) } catch {}
      }
      await onChanged()
    } catch { setErr('Could not save.') }
    setEditingKey(null); setBusy(false)
  }

  const del = async (m: Method) => {
    if (!m.id) { setEditingKey(null); return }  // unregistered — nothing stored to delete
    if (!window.confirm(`Delete payment method “${m.name}”? Past sales keep their recorded method; it's just removed from the list.`)) return
    setBusy(true); setErr('')
    try { await (supabase as any).from('payment_methods').delete().eq('id', m.id); await onChanged() }
    catch { setErr('Could not delete.') }
    setBusy(false)
  }

  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 10010 }} />
      <div style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', width: 440, maxWidth: '94vw', maxHeight: '86vh', display: 'flex', flexDirection: 'column', background: '#fff', borderRadius: 16, zIndex: 10011, boxShadow: '0 24px 60px rgba(0,0,0,0.28)' }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: 'var(--ink)' }}>Manage payment methods</h2>
          <button type="button" onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 20, color: 'var(--slate)', cursor: 'pointer' }}>✕</button>
        </div>
        <div style={{ padding: '4px 20px', overflowY: 'auto', flex: 1 }}>
          {err && <div style={{ margin: '10px 0 0', padding: '8px 11px', borderRadius: 9, background: '#fef2f2', border: '1px solid #fecaca', color: '#dc2626', fontSize: 12.5 }}>{err}</div>}
          {rows.length === 0 && <p style={{ fontSize: 13, color: 'var(--slate)', padding: '14px 0' }}>No methods yet. Add one below.</p>}
          {rows.map(m => {
            const editing = editingKey === rowKey(m)
            return (
              <div key={rowKey(m)} style={{ padding: '10px 0', borderTop: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                {editing ? (
                  <input value={editName} autoFocus onChange={e => setEditName(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') saveEdit(m) }}
                    style={{ flex: 1, padding: '7px 9px', borderRadius: 8, border: '1px solid var(--border)', fontSize: 13, outline: 'none' }} />
                ) : (
                  <span style={{ fontSize: 13.5, color: 'var(--ink)', display: 'flex', alignItems: 'center', gap: 8 }}>
                    {m.name}
                    {m.unregistered && <span title="Used on past sales but not in your list" style={{ fontSize: 10, fontWeight: 700, color: '#a16207', background: '#fef3c7', padding: '2px 6px', borderRadius: 5 }}>Unlisted</span>}
                  </span>
                )}
                <div style={{ display: 'flex', gap: 14, flexShrink: 0 }}>
                  {editing
                    ? <><button type="button" disabled={busy} onClick={() => saveEdit(m)} style={{ background: 'none', border: 'none', color: accent, fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>Save</button><button type="button" onClick={() => setEditingKey(null)} style={{ background: 'none', border: 'none', color: 'var(--slate)', fontSize: 13, cursor: 'pointer' }}>Cancel</button></>
                    : <>
                        <button type="button" onClick={() => startEdit(m)} style={{ background: 'none', border: 'none', color: accent, fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>{m.unregistered ? 'Add to list' : 'Edit'}</button>
                        {!m.unregistered && <button type="button" onClick={() => del(m)} style={{ background: 'none', border: 'none', color: '#dc2626', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>Delete</button>}
                      </>}
                </div>
              </div>
            )
          })}
        </div>
        <div style={{ padding: '14px 20px', borderTop: '1px solid var(--border)' }}>
          <p style={{ margin: '0 0 8px', fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--slate)' }}>Add method</p>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input value={newName} onChange={e => setNewName(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') create() }} placeholder="e.g. Afterpay, EFTPOS…"
              style={{ flex: 1, padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)', fontSize: 13, outline: 'none' }} />
            <button type="button" onClick={create} disabled={busy || !newName.trim()} style={{ padding: '8px 16px', borderRadius: 8, border: 'none', background: newName.trim() ? accent : 'var(--border)', color: '#fff', fontSize: 13, fontWeight: 700, cursor: newName.trim() ? 'pointer' : 'default' }}>Add</button>
          </div>
        </div>
      </div>
    </>
  )
}
