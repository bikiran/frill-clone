'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { SkeletonList } from '@/components/Skeleton'

type Contact = { id: string; name: string | null; email: string | null; phone: string | null; address: string | null; city: string | null; country: string | null; source: string; tags: string[]; subscribed_to_marketing: boolean; created_at: string }

const SOURCE_COLORS: Record<string, string> = { widget: '#dbeafe', woocommerce: '#ede9fe', import: '#dcfce7', manual: '#fef9c3', email: '#ffedd5' }

export default function ContactsPage() {
  const [companyId, setCompanyId] = useState<string | null>(null)
  const [contacts, setContacts] = useState<Contact[]>([])
  const [search, setSearch] = useState('')

  // ── Duplicate contacts ────────────────────────────────────────────────────
  const [dupGroups, setDupGroups] = useState<any[] | null>(null)
  const [dupBusy, setDupBusy] = useState(false)
  const [linkBusy, setLinkBusy] = useState(false)

  const linkChannels = async () => {
    if (!companyId) return
    setLinkBusy(true)
    try {
      const res = await fetch('/api/contacts/backfill-identity', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ companyId }),
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error || 'Link failed')
      alert(d.linkedGroups
        ? `Linked ${d.linkedContacts} contacts into ${d.linkedGroups} people across their channels.`
        : 'No cross-channel matches found — everyone is already distinct.')
    } catch (e: any) {
      alert(e.message || 'Could not link channels')
    } finally { setLinkBusy(false) }
  }

  const findDuplicates = async () => {
    if (!companyId) return
    setDupBusy(true)
    try {
      const res = await fetch(`/api/contacts/duplicates?companyId=${companyId}`)
      const d = await res.json()
      if (!res.ok) throw new Error(d.error || 'Could not check')
      setDupGroups(d.groups || [])
    } catch (e: any) { alert(e.message) }
    finally { setDupBusy(false) }
  }

  const mergeGroup = async (group: any[], keepId: string) => {
    if (!companyId) return
    const mergeIds = group.filter(c => c.id !== keepId).map(c => c.id)
    if (!confirm(`Merge ${mergeIds.length} duplicate${mergeIds.length === 1 ? '' : 's'} into this contact? All their conversations and history move across — nothing is lost.`)) return
    setDupBusy(true)
    try {
      const res = await fetch('/api/contacts/duplicates', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ companyId, keepId, mergeIds }),
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error || 'Merge failed')
      await findDuplicates()
      if (companyId) await loadContacts(companyId)
    } catch (e: any) { alert(e.message) }
    finally { setDupBusy(false) }
  }
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<Contact | null>(null)
  const [editMode, setEditMode] = useState(false)
  const [editData, setEditData] = useState<Partial<Contact>>({})
  const [saving, setSaving] = useState(false)
  const [totalCount, setTotalCount] = useState(0)

  useEffect(() => {
    const init = async () => {
      let cid: string | null = null
      if (typeof window !== 'undefined') {
        const h = window.location.hostname
        if (h.endsWith('.colvy.com') && h !== 'colvy.com') {
          const { data: co } = await (supabase as any).from('companies').select('id').eq('slug', h.replace('.colvy.com', '')).maybeSingle()
          if (co) cid = co.id
        }
      }
      if (!cid) {
        const { data: { session } } = await supabase.auth.getSession()
        if (session?.user) {
          const { data: ownCo } = await (supabase as any).from('companies').select('id').eq('owner_id', session.user.id).maybeSingle()
          if (ownCo?.id) cid = ownCo.id
        }
      }
      setCompanyId(cid)
      if (cid) loadContacts(cid)
    }
    init()
  }, [])

  const loadContacts = async (cid?: string | null, q?: string) => {
    const id = cid || companyId
    if (!id) return
    setLoading(true)
    let query = (supabase as any).from('contacts').select('*', { count: 'exact' }).eq('company_id', id)
    if (q && q.trim()) {
      // Match each word of the query against name/email/phone, so searching a
      // last name ("Wongyarit") or a full name ("Panadda Wongyarit") both work.
      // Escape PostgREST's reserved characters so odd input can't break the query.
      const clean = (s: string) => s.replace(/[,()%\\]/g, ' ').trim()
      const words = clean(q).split(/\s+/).filter(Boolean)
      for (const w of words) {
        query = query.or(`name.ilike.%${w}%,email.ilike.%${w}%,phone.ilike.%${w}%`)
      }
    }
    const { data, count } = await query.order('created_at', { ascending: false }).limit(200)
    setContacts(data || [])
    setTotalCount(count || 0)
    setLoading(false)
  }

  useEffect(() => {
    const t = setTimeout(() => { if (companyId) loadContacts(companyId, search) }, 350)
    return () => clearTimeout(t)
  }, [search])

  const saveContact = async () => {
    if (!companyId) return
    setSaving(true)
    if (selected?.id && editMode) {
      await (supabase as any).from('contacts').update({ ...editData, updated_at: new Date().toISOString() }).eq('id', selected.id)
      setContacts(cs => cs.map(c => c.id === selected.id ? { ...c, ...editData } : c))
      setSelected(c => c ? { ...c, ...editData } : c)
    } else {
      const { data } = await (supabase as any).from('contacts').insert({ ...editData, company_id: companyId, source: 'manual' }).select().maybeSingle()
      if (data) { setContacts(cs => [data, ...cs]); setSelected(data) }
    }
    setEditMode(false)
    setSaving(false)
  }

  const inp: React.CSSProperties = { width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid var(--border)', fontSize: 13, outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box' }
  const labelStyle: React.CSSProperties = { fontSize: 10, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: 0.5, display: 'block', marginBottom: 4 }

  // Group by first letter
  const grouped: Record<string, Contact[]> = {}
  contacts.forEach(c => {
    const letter = ((c.name || c.email || '?')[0] || '?').toUpperCase()
    if (!grouped[letter]) grouped[letter] = []
    grouped[letter].push(c)
  })

  return (
    <div style={{ display: 'flex', height: 'calc(100vh - 56px)', overflow: 'hidden', fontFamily: '-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif' }}>
      {/* List */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border)', background: '#fff', display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ flex: 1 }}>
            <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: 'var(--ink)' }}>Contacts</h1>
            <p style={{ margin: '2px 0 0', fontSize: 13, color: 'var(--slate)' }}>{totalCount.toLocaleString()} contacts</p>
          </div>
          <input placeholder="Search contacts…" value={search} onChange={e => setSearch(e.target.value)}
            style={{ ...inp, maxWidth: 280, background: 'var(--canvas)' }} />
          <button type="button" onClick={findDuplicates} disabled={dupBusy}
            title="Find contacts that are the same person"
            style={{ padding: '9px 15px', borderRadius: 10, background: '#fff', color: 'var(--ink)', border: '1px solid var(--border)', fontSize: 13, fontWeight: 700, cursor: 'pointer', flexShrink: 0 }}>
            {dupBusy ? 'Checking…' : 'Find duplicates'}
          </button>
          <button type="button" onClick={linkChannels} disabled={linkBusy}
            title="Link the same person across live chat, SMS, Messenger, Instagram and WooCommerce by shared email/phone"
            style={{ padding: '9px 15px', borderRadius: 10, background: '#fff', color: 'var(--ink)', border: '1px solid var(--border)', fontSize: 13, fontWeight: 700, cursor: 'pointer', flexShrink: 0 }}>
            {linkBusy ? 'Linking…' : 'Link channels'}
          </button>
          <button type="button" onClick={() => { setSelected(null); setEditData({}); setEditMode(true) }}            style={{ padding: '9px 18px', borderRadius: 10, background: 'var(--coral)', color: '#fff', border: 'none', fontSize: 13, fontWeight: 700, cursor: 'pointer', flexShrink: 0 }}>
            + New Contact
          </button>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', background: '#fff' }}>
          {loading ? (
            <SkeletonList rows={6} />
          ) : contacts.length === 0 ? (
            <div style={{ padding: 60, textAlign: 'center', color: '#9ca3af' }}>
              <p style={{ fontSize: 16, fontWeight: 600, marginBottom: 6 }}>No contacts yet</p>
              <p style={{ fontSize: 13 }}>Contacts are created automatically when users chat, or you can import/add them manually.</p>
            </div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead style={{ position: 'sticky', top: 0, background: '#fff', zIndex: 1 }}>
                <tr style={{ borderBottom: '2px solid var(--border)' }}>
                  {['Name', 'Phone', 'Email', 'Marketing', 'Source', 'Created', 'Actions'].map(h => (
                    <th key={h} style={{ textAlign: 'left', padding: '10px 16px', fontSize: 11, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: 0.5 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {contacts.map(c => (
                  <tr key={c.id} onClick={() => { setSelected(c); setEditData(c); setEditMode(false) }}
                    style={{ borderBottom: '1px solid var(--border)', cursor: 'pointer', background: selected?.id === c.id ? 'var(--peach)' : '#fff', transition: 'background 0.1s' }}>
                    <td style={{ padding: '11px 16px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                        <div style={{ width: 30, height: 30, borderRadius: '50%', background: 'var(--peach)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, color: 'var(--coral)', flexShrink: 0 }}>
                          {((c.name || c.email || '?')[0] || '?').toUpperCase()}
                        </div>
                        <a
                          href={`/admin/customers/profile?id=${c.id}`}
                          onClick={e => e.stopPropagation()}
                          title="Open the full customer profile"
                          style={{ fontWeight: 600, color: 'var(--ink)', textDecoration: 'none', borderBottom: '1px solid transparent' }}
                          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = 'var(--coral)'; (e.currentTarget as HTMLElement).style.borderBottomColor = 'var(--coral)' }}
                          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'var(--ink)'; (e.currentTarget as HTMLElement).style.borderBottomColor = 'transparent' }}>
                          {c.name || <span style={{ color: '#9ca3af', fontStyle: 'italic' }}>No name</span>}
                        </a>
                      </div>
                    </td>
                    <td style={{ padding: '11px 16px', color: 'var(--slate)' }}>{c.phone || '—'}</td>
                    <td style={{ padding: '11px 16px', color: 'var(--slate)' }}>{c.email || '—'}</td>
                    <td style={{ padding: '11px 16px' }}>
                      <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 20, background: c.subscribed_to_marketing ? '#dcfce7' : '#f3f4f6', color: c.subscribed_to_marketing ? '#059669' : '#6b7280' }}>
                        {c.subscribed_to_marketing ? 'Subscribed' : 'Not subscribed'}
                      </span>
                    </td>
                    <td style={{ padding: '11px 16px' }}>
                      <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 6, background: SOURCE_COLORS[c.source] || '#f3f4f6', color: '#374151', textTransform: 'capitalize' }}>
                        {c.source}
                      </span>
                    </td>
                    <td style={{ padding: '11px 16px', color: 'var(--slate)' }}>{new Date(c.created_at).toLocaleDateString()}</td>
                    <td style={{ padding: '11px 16px' }}>
                      <button onClick={e => { e.stopPropagation(); setSelected(c); setEditData(c); setEditMode(true) }}
                        style={{ fontSize: 12, color: 'var(--coral)', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600 }}>Edit</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Contact detail panel */}
      {(selected || (editMode && !selected)) && (
        <div style={{ width: 320, borderLeft: '1px solid var(--border)', background: '#fff', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <div style={{ padding: '16px 18px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: 'var(--ink)' }}>{!selected ? 'New Contact' : editMode ? 'Edit Contact' : 'Contact'}</h3>
            <div style={{ display: 'flex', gap: 8 }}>
              {selected && !editMode && <button type="button" onClick={() => setEditMode(true)} style={{ fontSize: 12, color: 'var(--coral)', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600 }}>Edit</button>}
              <button type="button" onClick={() => { setSelected(null); setEditMode(false) }} style={{ fontSize: 16, color: '#9ca3af', background: 'none', border: 'none', cursor: 'pointer' }}>✕</button>
            </div>
          </div>
          <div style={{ flex: 1, overflowY: 'auto', padding: '18px' }}>
            {editMode ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {[['name', 'Full Name', 'text'], ['email', 'Email', 'email'], ['phone', 'Phone', 'tel'], ['address', 'Address', 'text'], ['city', 'City', 'text'], ['country', 'Country', 'text']].map(([field, label, type]) => (
                  <div key={field}>
                    <label style={labelStyle}>{label}</label>
                    <input type={type} value={(editData as any)[field] || ''} onChange={e => setEditData(d => ({ ...d, [field]: e.target.value }))} style={inp} />
                  </div>
                ))}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <input type="checkbox" id="mkt" checked={!!(editData as any).subscribed_to_marketing} onChange={e => setEditData(d => ({ ...d, subscribed_to_marketing: e.target.checked }))} />
                  <label htmlFor="mkt" style={{ fontSize: 13 }}>Subscribed to marketing</label>
                </div>
                <textarea placeholder="Notes…" value={(editData as any).notes || ''} onChange={e => setEditData(d => ({ ...d, notes: e.target.value }))} rows={3} style={{ ...inp, resize: 'vertical' }} />
                <button type="button" onClick={saveContact} disabled={saving}
                  style={{ padding: '10px 0', borderRadius: 10, background: 'var(--coral)', color: '#fff', border: 'none', fontWeight: 700, fontSize: 14, cursor: 'pointer', marginTop: 4 }}>
                  {saving ? 'Saving…' : 'Save Contact'}
                </button>
              </div>
            ) : selected && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 0', borderBottom: '1px solid var(--border)' }}>
                  <div style={{ width: 48, height: 48, borderRadius: '50%', background: 'var(--peach)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, fontWeight: 700, color: 'var(--coral)' }}>
                    {((selected.name || selected.email || '?')[0] || '?').toUpperCase()}
                  </div>
                  <div>
                    <p style={{ margin: 0, fontWeight: 700, fontSize: 15, color: 'var(--ink)' }}>{selected.name || 'No name'}</p>
                    <p style={{ margin: 0, fontSize: 12, color: '#9ca3af' }}>Since {new Date(selected.created_at).toLocaleDateString()}</p>
                  </div>
                </div>
                {[['Email', selected.email], ['Phone', selected.phone], ['Address', [selected.address, selected.city, selected.country].filter(Boolean).join(', ') || null]]
                  .filter(([, v]) => v)
                  .map(([label, value]) => (
                    <div key={label as string}>
                      <p style={{ ...labelStyle, marginBottom: 2 }}>{label as string}</p>
                      <p style={{ margin: 0, fontSize: 14, color: 'var(--ink)' }}>{value as string}</p>
                    </div>
                  ))
                }
                <div>
                  <p style={labelStyle}>Marketing</p>
                  <span style={{ fontSize: 12, fontWeight: 700, padding: '3px 10px', borderRadius: 20, background: selected.subscribed_to_marketing ? '#dcfce7' : '#f3f4f6', color: selected.subscribed_to_marketing ? '#059669' : '#6b7280' }}>
                    {selected.subscribed_to_marketing ? 'Subscribed' : 'Not subscribed'}
                  </span>
                </div>
                <div>
                  <p style={labelStyle}>Source</p>
                  <span style={{ fontSize: 12, fontWeight: 600, padding: '2px 8px', borderRadius: 6, background: SOURCE_COLORS[selected.source] || '#f3f4f6', color: '#374151', textTransform: 'capitalize' }}>{selected.source}</span>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Duplicate contacts */}
      {dupGroups !== null && (
        <div onClick={() => setDupGroups(null)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 300, padding: 20 }}>
          <div onClick={e => e.stopPropagation()}
            style={{ width: 620, maxWidth: '95vw', maxHeight: '85vh', overflowY: 'auto', background: '#fff', borderRadius: 18, padding: 24 }}>
            <h2 style={{ margin: '0 0 4px', fontSize: 19, fontWeight: 800, color: 'var(--ink)' }}>Duplicate contacts</h2>
            <p style={{ margin: '0 0 18px', fontSize: 13, color: 'var(--slate)', lineHeight: 1.5 }}>
              Matched on email or phone only. Two people with the same name are <strong>not</strong> merged — silently combining two real customers would be far worse than leaving a duplicate.
            </p>

            {dupGroups.length === 0 ? (
              <p style={{ fontSize: 14, color: '#15803d', textAlign: 'center', padding: 30, fontWeight: 600 }}>
                No duplicates found.
              </p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                {dupGroups.map((g: any[], i: number) => (
                  <div key={i} style={{ border: '1px solid var(--border)', borderRadius: 12, padding: 14 }}>
                    <p style={{ margin: '0 0 10px', fontSize: 11.5, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--slate)' }}>
                      Same {g[0].matched_on}: {g[0].matched_value}
                    </p>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                      {g.map((c: any) => (
                        <div key={c.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '9px 11px', borderRadius: 9, background: 'var(--canvas)' }}>
                          <div style={{ minWidth: 0 }}>
                            <p style={{ margin: 0, fontSize: 13.5, fontWeight: 700, color: 'var(--ink)' }}>{c.name || 'No name'}</p>
                            <p style={{ margin: '2px 0 0', fontSize: 12, color: 'var(--slate)' }}>
                              {[c.email, c.phone].filter(Boolean).join(' · ')} · {c.conversation_count} chat{c.conversation_count === 1 ? '' : 's'}
                            </p>
                          </div>
                          <button onClick={() => mergeGroup(g, c.id)} disabled={dupBusy}
                            style={{ padding: '6px 12px', borderRadius: 8, background: 'var(--coral)', color: '#fff', border: 'none', fontSize: 12, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0 }}>
                            Keep this one
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}

            <button onClick={() => setDupGroups(null)}
              style={{ width: '100%', marginTop: 18, padding: '11px 0', borderRadius: 10, background: '#fff', color: 'var(--ink)', border: '1px solid var(--border)', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>Close</button>
          </div>
        </div>
      )}

    </div>
  )
}
