'use client'

// "New job": what it is, who it's for (an existing contact, or a new one),
// where and when. One click makes one job: the dialog's createKey goes with
// every try, so a double click or a retry hands back the same job.

import { useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'
import DateTimeField from '@/components/ui/DateTimeField'
import AddressAutocomplete from '@/components/AddressAutocomplete'
import { api, Dialog, localToIso, newKey } from '@/components/jobs/shared'

type Contact = { id: string; name: string | null; phone: string | null; email: string | null }

export default function NewJobDialog({ companyId, onClose, onCreated }: { companyId: string; onClose: () => void; onCreated: (job: any) => void }) {
  const createKey = useMemo(() => newKey(), [])
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [address, setAddress] = useState('')
  const [start, setStart] = useState('')
  const [end, setEnd] = useState('')
  const [contact, setContact] = useState<Contact | null>(null)
  const [newContact, setNewContact] = useState({ name: '', phone: '', email: '' })
  const [mode, setMode] = useState<'find' | 'new'>('find')
  const [q, setQ] = useState('')
  const [hits, setHits] = useState<Contact[]>([])
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const titleRef = useRef<HTMLInputElement>(null)
  useEffect(() => { titleRef.current?.focus() }, [])

  useEffect(() => {
    const term = q.trim().replace(/[%,()]/g, ' ')
    if (term.length < 2) { setHits([]); return }
    let live = true
    const t = setTimeout(async () => {
      const { data } = await (supabase as any).from('contacts').select('id, name, phone, email').eq('company_id', companyId)
        .or(`name.ilike.%${term}%,phone.ilike.%${term}%,email.ilike.%${term}%`).limit(8)
      if (live) setHits(data || [])
    }, 220)
    return () => { live = false; clearTimeout(t) }
  }, [q, companyId])

  const save = async () => {
    setErr('')
    if (!title.trim()) { setErr('Give the job a title, like “3-bedroom move” or “Switchboard upgrade”.'); titleRef.current?.focus(); return }
    if (start && end && new Date(end) < new Date(start)) { setErr('The job can’t finish before it starts.'); return }
    setBusy(true)
    try {
      const d = await api('/api/jobs', {
        method: 'POST', json: {
          companyId, createKey, source: 'manual', title, description, address,
          scheduledStart: localToIso(start), scheduledEnd: localToIso(end),
          contactId: mode === 'find' ? contact?.id || null : null,
          contact: mode === 'new' && (newContact.name || newContact.phone || newContact.email) ? newContact : null,
        },
      })
      onCreated(d.job)
    } catch (e: any) { setErr(e.message) } finally { setBusy(false) }
  }

  return (
    <Dialog title="New job" onClose={onClose} width={560} footer={<>
      <button type="button" className="ak-btn ghost" onClick={onClose}>Cancel</button>
      <button type="button" className="ak-btn go" onClick={save} disabled={busy}>{busy ? 'Creating…' : 'Create job'}</button>
    </>}>
      <div>
        <label className="ak-label" htmlFor="nj-title">What’s the job?</label>
        <input id="nj-title" ref={titleRef} className="ak-field" value={title} onChange={e => setTitle(e.target.value)} maxLength={160} placeholder="e.g. 3-bedroom move, Richmond to Box Hill" />
      </div>

      <div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 7 }}>
          <span className="ak-label" style={{ margin: 0 }}>Customer</span>
          <div className="ak-seg" role="tablist" aria-label="Customer">
            <button type="button" className={mode === 'find' ? 'on' : ''} onClick={() => setMode('find')}>Existing</button>
            <button type="button" className={mode === 'new' ? 'on' : ''} onClick={() => setMode('new')}>New</button>
          </div>
        </div>
        {mode === 'find' ? (
          contact ? (
            <div className="jbn-picked">
              <div style={{ minWidth: 0 }}>
                <b>{contact.name || contact.phone || contact.email}</b>
                <span>{[contact.phone, contact.email].filter(Boolean).join(' · ')}</span>
              </div>
              <button type="button" className="ak-btn sm ghost" onClick={() => { setContact(null); setQ('') }}>Change</button>
            </div>
          ) : (
            <div style={{ position: 'relative' }}>
              <input className="ak-field" value={q} onChange={e => setQ(e.target.value)} placeholder="Search by name, phone or email" aria-label="Search contacts" />
              {hits.length > 0 && (
                <div className="jbn-hits" role="listbox">
                  {hits.map(h => (
                    <button key={h.id} type="button" role="option" aria-selected="false" onClick={() => { setContact(h); setHits([]) }}>
                      <b>{h.name || h.phone || h.email}</b>
                      <span>{[h.phone, h.email].filter(Boolean).join(' · ')}</span>
                    </button>
                  ))}
                </div>
              )}
              <p className="ak-hint">Optional. You can add the customer later.</p>
            </div>
          )
        ) : (
          <div className="jbn-grid">
            <input className="ak-field" value={newContact.name} onChange={e => setNewContact({ ...newContact, name: e.target.value })} placeholder="Name" aria-label="Customer name" maxLength={120} />
            <input className="ak-field" value={newContact.phone} onChange={e => setNewContact({ ...newContact, phone: e.target.value })} placeholder="Mobile" aria-label="Customer mobile" inputMode="tel" maxLength={40} />
            <input className="ak-field" style={{ gridColumn: '1 / -1' }} value={newContact.email} onChange={e => setNewContact({ ...newContact, email: e.target.value })} placeholder="Email" aria-label="Customer email" inputMode="email" maxLength={200} />
            <p className="ak-hint" style={{ gridColumn: '1 / -1', margin: 0 }}>If they’re already a contact (same email or mobile), the job goes on their record.</p>
          </div>
        )}
      </div>

      <div>
        <label className="ak-label" htmlFor="nj-addr">Address</label>
        <AddressAutocomplete id="nj-addr" className="ak-field" value={address} onChange={setAddress} onSelect={p => setAddress(p.formatted || address)} maxLength={300} placeholder="Where the work is" />
      </div>

      <div className="jbn-grid">
        <div>
          <span className="ak-label">Starts</span>
          <DateTimeField label="Job starts" value={start} onChange={setStart} placeholder="Not scheduled" />
        </div>
        <div>
          <span className="ak-label">Finishes</span>
          <DateTimeField label="Job finishes" value={end} onChange={setEnd} min={start || undefined} placeholder="Optional" />
        </div>
      </div>

      <div>
        <label className="ak-label" htmlFor="nj-desc">Details</label>
        <textarea id="nj-desc" className="ak-field" value={description} onChange={e => setDescription(e.target.value)} maxLength={8000} placeholder="What needs doing, access, parking, anything the team should know" />
      </div>

      {err && <div className="ak-note bad" role="alert">{err}</div>}
      <style>{`
        .jbn-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}
        @media(max-width:520px){.jbn-grid{grid-template-columns:minmax(0,1fr)}}
        .jbn-hits{position:absolute;left:0;right:0;top:48px;z-index:5;padding:6px;border-radius:16px;background:var(--card,#fff);box-shadow:0 0 0 1px rgba(0,0,0,.06),0 16px 40px rgba(0,0,0,.16)}
        .jbn-hits button,.jbn-picked{display:flex;flex-direction:column;align-items:flex-start;gap:1px;width:100%;padding:9px 11px;border:none;border-radius:11px;background:none;font:inherit;text-align:left;cursor:pointer;color:var(--ink)}
        .jbn-hits button:hover{background:var(--f)}
        .jbn-hits b,.jbn-picked b{font-size:14px;font-weight:650}
        .jbn-hits span,.jbn-picked span{font-size:12.5px;color:var(--mut)}
        .jbn-picked{flex-direction:row;align-items:center;justify-content:space-between;gap:10px;background:var(--f);border-radius:14px;cursor:default}
        .jbn-picked>div{display:flex;flex-direction:column;gap:1px}
      `}</style>
    </Dialog>
  )
}
