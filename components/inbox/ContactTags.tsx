'use client'

// Tags on the customer, from the inbox contact panel. The same contacts.tags
// the Contacts page shows and campaign audiences use ("Has these tags"), so a
// tag added mid-conversation ("Wholesale", "Planted tanks") is there to filter
// and target later. Suggests the business's existing tags as you type.

import { useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'

const MAX_TAG = 40
const clean = (t: string) => t.replace(/\s+/g, ' ').trim().slice(0, MAX_TAG)

// The business's tags, most used first: once per business per page load.
const known = new Map<string, Promise<string[]>>()
function companyTags(companyId: string): Promise<string[]> {
  let p = known.get(companyId)
  if (!p) {
    p = (async () => {
      const { data } = await (supabase as any).from('contacts').select('tags').eq('company_id', companyId).not('tags', 'is', null).limit(3000)
      const count = new Map<string, { tag: string; n: number }>()
      for (const r of data || []) for (const t of Array.isArray(r.tags) ? r.tags : []) {
        const tag = clean(String(t || '')); if (!tag) continue
        const k = tag.toLowerCase(); const c = count.get(k)
        if (c) c.n++; else count.set(k, { tag, n: 1 })
      }
      return [...count.values()].sort((a, b) => b.n - a.n || a.tag.localeCompare(b.tag)).map(c => c.tag)
    })().catch(() => [])
    known.set(companyId, p)
  }
  return p
}

export default function ContactTags({ companyId, contact, onChange, showToast }: {
  companyId: string
  contact: { id: string; tags?: string[] | null }
  onChange: (tags: string[]) => void
  showToast: (msg: string) => void
}) {
  const tags = useMemo(() => (Array.isArray(contact.tags) ? contact.tags.filter(Boolean) : []), [contact.tags])
  const [adding, setAdding] = useState(false)
  const [draft, setDraft] = useState('')
  const [all, setAll] = useState<string[]>([])
  const [hi, setHi] = useState(0)
  const input = useRef<HTMLInputElement>(null)

  useEffect(() => { if (adding) companyTags(companyId).then(setAll) }, [adding, companyId])
  useEffect(() => { if (adding) input.current?.focus() }, [adding])

  const has = (t: string) => tags.some(x => x.toLowerCase() === t.toLowerCase())
  const q = clean(draft).toLowerCase()
  const suggestions = all.filter(t => !has(t) && (!q || t.toLowerCase().includes(q))).slice(0, 6)
  const canCreate = !!q && !has(q) && !all.some(t => t.toLowerCase() === q)
  const options = [...suggestions, ...(canCreate ? [clean(draft)] : [])]

  const save = async (next: string[], undo: string[], msg?: string) => {
    onChange(next)
    const { error } = await (supabase as any).from('contacts').update({ tags: next, updated_at: new Date().toISOString() }).eq('id', contact.id)
    if (error) { onChange(undo); showToast('Couldn’t save the tags'); return }
    if (msg) showToast(msg)
  }
  const add = (raw: string) => {
    const tag = clean(raw)
    if (!tag || has(tag)) { setDraft(''); return }
    // The business's own spelling when it exists ("Wholesale", not "wholesale").
    const same = all.find(t => t.toLowerCase() === tag.toLowerCase()) || tag
    save([...tags, same], tags)
    if (!all.some(t => t.toLowerCase() === same.toLowerCase())) { const nextAll = [same, ...all]; setAll(nextAll); known.set(companyId, Promise.resolve(nextAll)) }
    setDraft(''); setHi(0)
  }
  const remove = (t: string) => save(tags.filter(x => x !== t), tags, `Removed “${t}”`)

  return (
    <div className="ctg">
      <style href="colvy-contact-tags" precedence="default">{CTG_CSS}</style>
      <div className="ctg-h"><span>Tags</span>{tags.length > 0 && <small>{tags.length}</small>}</div>
      <div className="ctg-list">
        {tags.map(t => (
          <span key={t} className="ctg-tag">
            {t}
            <button type="button" onClick={() => remove(t)} aria-label={`Remove tag ${t}`}>
              <svg width="9" height="9" viewBox="0 0 10 10" aria-hidden="true"><path d="M2 2l6 6M8 2 2 8" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" /></svg>
            </button>
          </span>
        ))}
        {!adding && (
          <button type="button" className="ctg-add" onClick={() => setAdding(true)}>
            <svg width="11" height="11" viewBox="0 0 10 10" aria-hidden="true"><path d="M5 1.5v7M1.5 5h7" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" /></svg>
            {tags.length ? 'Add' : 'Add a tag'}
          </button>
        )}
      </div>
      {adding && (
        <div className="ctg-pick">
          <input ref={input} value={draft} maxLength={MAX_TAG} placeholder="Type a tag…" aria-label="Add a tag"
            role="combobox" aria-expanded={options.length > 0} aria-controls="ctg-options" aria-autocomplete="list"
            onChange={e => { const v = e.target.value; if (v.includes(',')) { v.split(',').slice(0, -1).forEach(add); setDraft(v.split(',').pop() || '') } else { setDraft(v); setHi(0) } }}
            onKeyDown={e => {
              if (e.key === 'Enter') { e.preventDefault(); if (options[hi]) add(options[hi]); else if (q) add(draft) }
              else if (e.key === 'ArrowDown') { e.preventDefault(); setHi(i => Math.min(options.length - 1, i + 1)) }
              else if (e.key === 'ArrowUp') { e.preventDefault(); setHi(i => Math.max(0, i - 1)) }
              else if (e.key === 'Escape') { e.preventDefault(); setAdding(false); setDraft('') }
              else if (e.key === 'Backspace' && !draft && tags.length) remove(tags[tags.length - 1])
            }}
            onBlur={() => setTimeout(() => { setAdding(false); setDraft('') }, 150)} />
          {options.length > 0 && (
            <ul id="ctg-options" className="ctg-opts" role="listbox">
              {options.map((t, i) => (
                <li key={t} role="option" aria-selected={i === hi} className={i === hi ? 'on' : ''} onMouseDown={e => { e.preventDefault(); add(t) }} onMouseEnter={() => setHi(i)}>
                  {canCreate && i === options.length - 1 ? <>Create <b>“{t}”</b></> : t}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}

const CTG_CSS = `
.ctg{margin:0 0 18px}
.ctg button::before{display:none!important}
.ctg-h{display:flex;align-items:center;gap:6px;margin:0 0 8px}.ctg-h span{font-size:13px;font-weight:700;color:var(--ink)}
.ctg-h small{font-size:11.5px;font-weight:700;color:#a1a1aa}
.ctg-list{display:flex;flex-wrap:wrap;gap:6px}
.ctg-tag{display:inline-flex;align-items:center;gap:4px;height:28px;padding:0 4px 0 11px;border-radius:999px;background:color-mix(in srgb,var(--coral) 10%,#fff);box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--coral) 22%,transparent);font-size:12.5px;font-weight:650;color:var(--ink);max-width:100%}
.ctg-tag button{width:20px;height:20px;display:flex;align-items:center;justify-content:center;border:none;border-radius:50%;background:transparent;color:#71717a;cursor:pointer;padding:0}
.ctg-tag button:hover{background:rgba(0,0,0,.06);color:#18181b}
.ctg-add{display:inline-flex;align-items:center;gap:5px;height:28px;padding:0 12px;border:none;border-radius:999px;background:#f4f4f5;color:#3f3f46;font:inherit;font-size:12.5px;font-weight:650;cursor:pointer}
.ctg-add:hover{background:#ececef;color:#18181b}
.ctg-pick{position:relative;margin-top:8px}
.ctg .ctg-pick input,.ctg .ctg-pick input:focus{width:100%;box-sizing:border-box;height:38px;padding:0 14px;border:1.5px solid #ececef!important;border-radius:999px;background:#fff;font:inherit;font-size:13px;color:var(--ink);outline:none!important;box-shadow:0 0 0 3px color-mix(in srgb,var(--coral) 12%,transparent)!important}
.ctg-opts{position:absolute;z-index:20;left:0;right:0;top:calc(100% + 6px);list-style:none;margin:0;padding:5px;border-radius:14px;background:#fff;box-shadow:0 0 0 1px rgba(0,0,0,.06),0 14px 30px -12px rgba(16,24,40,.25)}
.ctg-opts li{padding:8px 10px;border-radius:9px;font-size:13px;color:var(--ink);cursor:pointer;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.ctg-opts li.on{background:#f4f4f5}.ctg-opts li b{font-weight:700}
[data-theme="dark"] .ctg-tag{background:color-mix(in srgb,var(--coral) 16%,#1c1c1f)}
[data-theme="dark"] .ctg-tag button{color:#a1a1aa}[data-theme="dark"] .ctg-tag button:hover{background:rgba(255,255,255,.08);color:#fff}
[data-theme="dark"] .ctg-add{background:#2a2a2e;color:#d4d4d8}[data-theme="dark"] .ctg-add:hover{background:#3a3a40;color:#fff}
[data-theme="dark"] .ctg .ctg-pick input{background:#1c1c1f;border-color:#3a3a40!important}
[data-theme="dark"] .ctg-opts{background:#232327;box-shadow:0 0 0 1px rgba(255,255,255,.08),0 14px 30px -12px rgba(0,0,0,.6)}
[data-theme="dark"] .ctg-opts li.on{background:#2e2e33}
`
