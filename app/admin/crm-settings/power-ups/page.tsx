'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { Panel } from '@/components/ui/AdminKit'
import EmptyScroll from '@/components/EmptyScroll'
import { confirmDialog } from '@/components/ConfirmDialog'
import { useCompanyUser, SettingsPage, IconTile } from '../_shared'

// Time savers: the shortcuts that save the team typing and clicking. Saved
// replies and conversation categories are edited here; the tools for reaching
// many customers at once live in their own areas, so their cards open them.

const I = {
  reply: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /><path d="m13 7-3 4h4l-3 4" /></svg>,
  tag: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M20.59 13.41 13.42 20.58a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" /><circle cx="7" cy="7" r="1.5" fill="currentColor" /></svg>,
  megaphone: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="m3 11 18-5v12L3 13v-2z" /><path d="M11.6 16.8a3 3 0 1 1-5.8-1.6" /></svg>,
  people: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" /></svg>,
  star: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" /></svg>,
  arrow: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M5 12h14M13 6l6 6-6 6" /></svg>,
  out: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M7 17 17 7M8 7h9v9" /></svg>,
  edit: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M12 20h9" /><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z" /></svg>,
  trash: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></svg>,
  plus: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" aria-hidden><path d="M12 5v14M5 12h14" /></svg>,
}

const SWATCHES = ['#ff7a6b', '#f59e0b', '#10b981', '#0ea5e9', '#6366f1', '#8b5cf6', '#ec4899', '#71717a']

export default function PowerUpsSettings() {
  const { companyId, loading } = useCompanyUser()
  const [view, setView] = useState<string | null>(null)
  const [responses, setResponses] = useState<any[] | null>(null)
  const [categories, setCategories] = useState<any[] | null>(null)
  const [editing, setEditing] = useState<any>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => { if (companyId) { loadResponses(); loadCategories() } }, [companyId])
  // Deep link from the composer's "Manage templates": ?tool=quick-response
  useEffect(() => {
    try {
      const t = new URLSearchParams(window.location.search).get('tool')
      if (t === 'quick-response' || t === 'category') setView(t)
    } catch {}
  }, [])
  const open = (v: string | null) => { setView(v); setEditing(null); try { window.scrollTo({ top: 0 }) } catch {} }
  const loadResponses = async () => { const { data } = await (supabase as any).from('quick_responses').select('*').eq('company_id', companyId).order('created_at'); setResponses(data || []) }
  const loadCategories = async () => { const { data } = await (supabase as any).from('conversation_categories').select('*').eq('company_id', companyId).order('created_at'); setCategories(data || []) }

  const saveResponse = async () => {
    if (!companyId || !editing?.body?.trim() || saving) return
    setSaving(true)
    const sc = String(editing.shortcut || '').trim().replace(/^\/+/, '').replace(/\s+/g, '-')
    const payload = { company_id: companyId, shortcut: sc ? `/${sc}` : null, title: editing.title?.trim() || null, body: editing.body }
    if (editing.id) await (supabase as any).from('quick_responses').update(payload).eq('id', editing.id)
    else await (supabase as any).from('quick_responses').insert(payload)
    setSaving(false); setEditing(null); await loadResponses()
  }
  const saveCategory = async () => {
    if (!companyId || !editing?.name?.trim() || saving) return
    setSaving(true)
    const payload = { company_id: companyId, name: editing.name.trim(), color: editing.color || '#ff7a6b' }
    if (editing.id) await (supabase as any).from('conversation_categories').update(payload).eq('id', editing.id)
    else await (supabase as any).from('conversation_categories').insert(payload)
    setSaving(false); setEditing(null); await loadCategories()
  }
  const removeResponse = async (r: any) => {
    if (!await confirmDialog({ title: 'Delete this saved reply?', message: `“${r.title || r.shortcut || 'Untitled'}” will no longer be offered in the inbox.`, confirmLabel: 'Delete', tone: 'danger' })) return
    await (supabase as any).from('quick_responses').delete().eq('id', r.id); loadResponses()
  }
  const removeCategory = async (c: any) => {
    if (!await confirmDialog({ title: `Delete “${c.name}”?`, message: 'Conversations in it stay where they are.', confirmLabel: 'Delete', tone: 'danger' })) return
    await (supabase as any).from('conversation_categories').delete().eq('id', c.id); loadCategories()
  }

  if (loading) return <SettingsPage title="Time savers"><Panel><div className="ts-skel"><span /><span /><span /></div></Panel><style>{TS_CSS}</style></SettingsPage>

  // ── Saved replies ──
  if (view === 'quick-response') {
    return (
      <SettingsPage title="Saved replies" back={{ label: 'Time savers', onClick: () => open(null) }}
        sub={<>Answers you send often. In the inbox, type <kbd className="ts-kbd">/</kbd> and the shortcut, or pick one from Templates.</>}
        actions={!editing && <button type="button" className="ak-btn go" onClick={() => setEditing({})}>{I.plus} New reply</button>}>
        {editing && (
          <Panel title={editing.id ? 'Edit saved reply' : 'New saved reply'} className="ak-in">
            <div className="ts-form">
              <div className="ts-form-row">
                <div>
                  <label className="ak-label" htmlFor="ts-title">Title</label>
                  <input id="ts-title" className="ak-field" value={editing.title || ''} onChange={e => setEditing({ ...editing, title: e.target.value })} placeholder="Opening hours" autoFocus />
                </div>
                <div>
                  <label className="ak-label" htmlFor="ts-sc">Shortcut</label>
                  <div className="ts-sc">
                    <span aria-hidden>/</span>
                    <input id="ts-sc" className="ak-field" value={String(editing.shortcut || '').replace(/^\/+/, '')} onChange={e => setEditing({ ...editing, shortcut: e.target.value })} placeholder="hours" />
                  </div>
                </div>
              </div>
              <div>
                <label className="ak-label" htmlFor="ts-body">Message</label>
                <textarea id="ts-body" className="ak-field" rows={4} value={editing.body || ''} onChange={e => setEditing({ ...editing, body: e.target.value })} placeholder="We’re open 9am to 5pm, Monday to Saturday…" />
              </div>
              <div className="ts-form-acts">
                <button type="button" className="ak-btn ghost" onClick={() => setEditing(null)}>Cancel</button>
                <button type="button" className="ak-btn go" onClick={saveResponse} disabled={!editing.body?.trim() || saving}>{saving ? 'Saving…' : 'Save reply'}</button>
              </div>
            </div>
          </Panel>
        )}
        {responses === null ? (
          <Panel><div className="ts-skel"><span /><span /><span /></div></Panel>
        ) : responses.length === 0 ? (
          !editing && <Panel><EmptyScroll kinds={['chat', 'note']} title="No saved replies yet" line="Save the answers you type every day, then send them with a shortcut." /></Panel>
        ) : (
          <Panel flush>
            <ul className="ts-list">
              {responses.map(r => (
                <li key={r.id} className={editing?.id === r.id ? 'on' : ''}>
                  <IconTile color="#ff7a6b" size={36}>{I.reply}</IconTile>
                  <div className="ts-li-t">
                    <b>{r.title || r.shortcut || 'Saved reply'}{r.shortcut && <code>{r.shortcut}</code>}</b>
                    <p>{r.body}</p>
                  </div>
                  <div className="ts-li-acts">
                    <button type="button" className="ak-icon-btn" onClick={() => { setEditing(r); try { window.scrollTo({ top: 0, behavior: 'smooth' }) } catch {} }} aria-label={`Edit ${r.title || r.shortcut || 'saved reply'}`}>{I.edit}</button>
                    <button type="button" className="ak-icon-btn danger" onClick={() => removeResponse(r)} aria-label={`Delete ${r.title || r.shortcut || 'saved reply'}`}>{I.trash}</button>
                  </div>
                </li>
              ))}
            </ul>
          </Panel>
        )}
        <style>{TS_CSS}</style>
      </SettingsPage>
    )
  }

  // ── Conversation categories ──
  if (view === 'category') {
    return (
      <SettingsPage title="Conversation categories" back={{ label: 'Time savers', onClick: () => open(null) }}
        sub="Labels for sorting conversations, like VIP, Wholesale or Pond. Filter the inbox by them."
        actions={!editing && <button type="button" className="ak-btn go" onClick={() => setEditing({ color: SWATCHES[(categories?.length || 0) % SWATCHES.length] })}>{I.plus} New category</button>}>
        {editing && (
          <Panel title={editing.id ? 'Edit category' : 'New category'} className="ak-in">
            <div className="ts-form">
              <div>
                <label className="ak-label" htmlFor="ts-cat">Name</label>
                <input id="ts-cat" className="ak-field" value={editing.name || ''} onChange={e => setEditing({ ...editing, name: e.target.value })} placeholder="VIP" autoFocus onKeyDown={e => { if (e.key === 'Enter') saveCategory() }} />
              </div>
              <div>
                <span className="ak-label">Colour</span>
                <div className="ts-sw" role="radiogroup" aria-label="Colour">
                  {SWATCHES.map(c => (
                    <button key={c} type="button" role="radio" aria-checked={(editing.color || '').toLowerCase() === c} aria-label={c} className={(editing.color || '').toLowerCase() === c ? 'on' : ''} style={{ background: c }} onClick={() => setEditing({ ...editing, color: c })} />
                  ))}
                  <label className="ts-sw-custom" title="Pick any colour">
                    <input type="color" value={editing.color || '#ff7a6b'} onChange={e => setEditing({ ...editing, color: e.target.value })} aria-label="Pick any colour" />
                    {I.plus}
                  </label>
                </div>
              </div>
              <div className="ts-preview">
                <span className="ts-cat" style={{ '--c': editing.color || '#ff7a6b' } as React.CSSProperties}><i />{editing.name?.trim() || 'Category'}</span>
                <small>How it looks in the inbox</small>
              </div>
              <div className="ts-form-acts">
                <button type="button" className="ak-btn ghost" onClick={() => setEditing(null)}>Cancel</button>
                <button type="button" className="ak-btn go" onClick={saveCategory} disabled={!editing.name?.trim() || saving}>{saving ? 'Saving…' : 'Save category'}</button>
              </div>
            </div>
          </Panel>
        )}
        {categories === null ? (
          <Panel><div className="ts-skel"><span /><span /></div></Panel>
        ) : categories.length === 0 ? (
          !editing && <Panel><EmptyScroll kinds={['chat', 'task']} title="No categories yet" line="Add a few to sort conversations at a glance." /></Panel>
        ) : (
          <Panel flush>
            <ul className="ts-list">
              {categories.map(c => (
                <li key={c.id} className={editing?.id === c.id ? 'on' : ''}>
                  <span className="ts-cat" style={{ '--c': c.color || '#ff7a6b' } as React.CSSProperties}><i />{c.name}</span>
                  <span style={{ flex: 1 }} />
                  <div className="ts-li-acts">
                    <button type="button" className="ak-icon-btn" onClick={() => setEditing(c)} aria-label={`Edit ${c.name}`}>{I.edit}</button>
                    <button type="button" className="ak-icon-btn danger" onClick={() => removeCategory(c)} aria-label={`Delete ${c.name}`}>{I.trash}</button>
                  </div>
                </li>
              ))}
            </ul>
          </Panel>
        )}
        <style>{TS_CSS}</style>
      </SettingsPage>
    )
  }

  // ── The hub ──
  const n = (x: any[] | null, one: string, many: string) => x === null ? '…' : x.length === 0 ? `No ${many} yet` : `${x.length} ${x.length === 1 ? one : many}`
  return (
    <SettingsPage title="Time savers" sub="Shortcuts that save your team typing and clicking, every day.">
      <h2 className="ts-h">In the inbox</h2>
      <div className="ts-grid">
        <button type="button" className="ts-card" style={{ '--a': '#ff7a6b' } as React.CSSProperties} onClick={() => open('quick-response')}>
          <IconTile color="#ff7a6b" size={44}>{I.reply}</IconTile>
          <h3>Saved replies</h3>
          <p>Answers you send often, one shortcut away. Type <kbd className="ts-kbd">/</kbd> in the composer.</p>
          <div className="ts-pv">
            {(responses || []).slice(0, 3).map(r => <code key={r.id}>{r.shortcut || r.title || 'reply'}</code>)}
            {responses && responses.length > 3 && <span>+{responses.length - 3}</span>}
          </div>
          <div className="ts-foot"><span className="ts-count">{n(responses, 'reply', 'replies')}</span><span className="ts-go">{I.arrow}</span></div>
        </button>
        <button type="button" className="ts-card" style={{ '--a': '#8b5cf6' } as React.CSSProperties} onClick={() => open('category')}>
          <IconTile color="#8b5cf6" size={44}>{I.tag}</IconTile>
          <h3>Conversation categories</h3>
          <p>Labels like VIP or Wholesale, to sort and filter conversations.</p>
          <div className="ts-pv">
            {(categories || []).slice(0, 4).map(c => <span key={c.id} className="ts-cat sm" style={{ '--c': c.color || '#ff7a6b' } as React.CSSProperties}><i />{c.name}</span>)}
          </div>
          <div className="ts-foot"><span className="ts-count">{n(categories, 'category', 'categories')}</span><span className="ts-go">{I.arrow}</span></div>
        </button>
      </div>

      <h2 className="ts-h">Reach many customers</h2>
      <div className="ts-grid three">
        {[
          { href: '/admin/campaigns', color: '#0ea5e9', icon: I.megaphone, name: 'Bulk messages', desc: 'Send one SMS or email to many customers, like a closure notice or a new arrival.', where: 'Campaigns' },
          { href: '/admin/segments', color: '#10b981', icon: I.people, name: 'Audiences', desc: 'Saved groups of customers from simple rules, ready for any campaign.', where: 'Segments' },
          { href: '/admin/reviews', color: '#f59e0b', icon: I.star, name: 'Review requests', desc: 'Ask happy customers for a Google review, and see every review in one place.', where: 'Reviews' },
        ].map(t => (
          <Link key={t.href} href={t.href} className="ts-card" style={{ '--a': t.color } as React.CSSProperties}>
            <IconTile color={t.color} size={44}>{t.icon}</IconTile>
            <h3>{t.name}</h3>
            <p>{t.desc}</p>
            <div className="ts-foot"><span className="ts-where">Opens {t.where} {I.out}</span><span className="ts-go">{I.arrow}</span></div>
          </Link>
        ))}
      </div>
      <style>{TS_CSS}</style>
    </SettingsPage>
  )
}

const TS_CSS = `
.ts-h{margin:6px 0 10px 2px;font-size:13.5px;font-weight:650;color:var(--mut)}
.ts-h+.ts-grid{margin-bottom:26px}
.ts-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px}
.ts-grid.three{grid-template-columns:repeat(3,minmax(0,1fr))}
@media (max-width:1100px){.ts-grid.three{grid-template-columns:repeat(2,minmax(0,1fr))}}
@media (max-width:640px){.ts-grid,.ts-grid.three{grid-template-columns:minmax(0,1fr)}}
.ts-card{position:relative;display:flex;flex-direction:column;align-items:flex-start;gap:8px;min-width:0;padding:18px;border:none;border-radius:22px;background:var(--card,#fff);box-shadow:0 0 0 1px rgba(0,0,0,.05),0 1px 2px rgba(16,24,40,.04);font:inherit;color:var(--ink);text-align:left;text-decoration:none;cursor:pointer;overflow:hidden;isolation:isolate;transition:transform .25s cubic-bezier(.22,1,.36,1),box-shadow .25s}
.ts-card::after{content:'';position:absolute;z-index:-1;right:-46px;top:-46px;width:150px;height:150px;border-radius:50%;background:radial-gradient(circle,color-mix(in srgb,var(--a) 16%,transparent),transparent 70%);transition:transform .4s cubic-bezier(.22,1,.36,1)}
.ts-card:hover{transform:translateY(-3px);box-shadow:0 0 0 1px rgba(0,0,0,.06),0 16px 34px -16px rgba(16,24,40,.22)}
.ts-card:hover::after{transform:scale(1.25)}
.ts-card h3{margin:6px 0 0;font-family:var(--font-display),-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:17px;font-weight:700;letter-spacing:-.025em;color:var(--ink)}
.ts-card p{margin:0;font-size:13.5px;line-height:1.5;color:var(--mut)}
.ts-pv{display:flex;flex-wrap:wrap;gap:6px;min-height:0}
.ts-pv:empty{display:none}
.ts-pv code{display:inline-flex;align-items:center;height:24px;padding:0 9px;border-radius:8px;background:color-mix(in srgb,var(--a) 10%,var(--card,#fff));color:color-mix(in srgb,var(--a) 80%,#000);font:600 12px/1 ui-monospace,SFMono-Regular,Menlo,monospace}
.ts-pv>span:not(.ts-cat){font-size:12px;font-weight:600;color:var(--soft);align-self:center}
.ts-foot{display:flex;align-items:center;justify-content:space-between;gap:10px;width:100%;margin-top:auto;padding-top:6px}
.ts-count{display:inline-flex;align-items:center;height:26px;padding:0 10px;border-radius:999px;background:var(--f);font-size:12.5px;font-weight:650;color:var(--ink)}
.ts-where{display:inline-flex;align-items:center;gap:4px;font-size:12.5px;font-weight:650;color:var(--mut)}
.ts-go{width:32px;height:32px;flex-shrink:0;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;background:var(--f);color:var(--ink);transition:background .2s,color .2s,transform .25s cubic-bezier(.22,1,.36,1)}
.ts-card:hover .ts-go{background:var(--ink);color:var(--card,#fff);transform:translateX(2px)}
.ts-kbd{display:inline-flex;align-items:center;justify-content:center;min-width:18px;height:18px;padding:0 4px;border-radius:5px;background:var(--f);box-shadow:inset 0 -1px 0 rgba(0,0,0,.12);font:600 11.5px/1 ui-monospace,SFMono-Regular,Menlo,monospace;color:var(--ink);vertical-align:1px}
.ts-cat{display:inline-flex;align-items:center;gap:7px;height:30px;padding:0 12px 0 10px;border-radius:999px;background:color-mix(in srgb,var(--c) 12%,var(--card,#fff));color:color-mix(in srgb,var(--c) 75%,var(--ink));font-size:13.5px;font-weight:650;max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.ts-cat i{width:9px;height:9px;flex-shrink:0;border-radius:50%;background:var(--c)}
.ts-cat.sm{height:24px;padding:0 9px 0 8px;font-size:12px;gap:6px}
.ts-cat.sm i{width:7px;height:7px}
.ts-list{list-style:none;margin:0;padding:6px}
.ts-list li{display:flex;align-items:center;gap:12px;padding:12px;border-radius:16px;transition:background .15s}
.ts-list li:hover,.ts-list li.on{background:color-mix(in srgb,var(--f) 70%,transparent)}
.ts-list li+li{box-shadow:0 -1px 0 var(--line)}
.ts-list li:hover+li,.ts-list li+li:hover{box-shadow:none}
.ts-li-t{flex:1;min-width:0}
.ts-li-t b{display:flex;align-items:center;gap:8px;min-width:0;font-size:14.5px;font-weight:650;color:var(--ink)}
.ts-li-t b code{flex-shrink:0;height:20px;padding:0 7px;border-radius:6px;background:color-mix(in srgb,#ff7a6b 12%,var(--card,#fff));color:#e0533f;font:600 11.5px/20px ui-monospace,SFMono-Regular,Menlo,monospace}
.ts-li-t p{margin:3px 0 0;font-size:13px;line-height:1.45;color:var(--mut);display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;overflow-wrap:anywhere}
.ts-li-acts{display:flex;gap:2px;flex-shrink:0}
.ts-form{display:flex;flex-direction:column;gap:14px}
.ts-form-row{display:grid;grid-template-columns:minmax(0,1.4fr) minmax(0,1fr);gap:12px}
@media (max-width:560px){.ts-form-row{grid-template-columns:minmax(0,1fr)}}
.ts-sc{position:relative}
.ts-sc span{position:absolute;left:14px;top:50%;transform:translateY(-50%);font:600 14.5px ui-monospace,SFMono-Regular,Menlo,monospace;color:var(--soft);pointer-events:none}
.ak .ts-sc .ak-field{padding-left:28px;font-family:ui-monospace,SFMono-Regular,Menlo,monospace}
.ts-form-acts{display:flex;justify-content:flex-end;gap:8px}
.ts-sw{display:flex;flex-wrap:wrap;gap:8px}
.ts-sw button,.ts-sw-custom{width:32px;height:32px;padding:0;border:none;border-radius:50%;cursor:pointer;box-shadow:inset 0 0 0 1px rgba(0,0,0,.08);transition:transform .15s}
.ts-sw button:hover{transform:scale(1.08)}
.ts-sw button.on{box-shadow:0 0 0 2px var(--card,#fff),0 0 0 4px var(--ink)}
.ts-sw-custom{position:relative;display:inline-flex;align-items:center;justify-content:center;background:conic-gradient(#f43f5e,#f59e0b,#10b981,#0ea5e9,#8b5cf6,#f43f5e);color:#fff;overflow:hidden}
.ts-sw-custom input{position:absolute;inset:0;opacity:0;cursor:pointer}
.ts-sw-custom svg{filter:drop-shadow(0 1px 1px rgba(0,0,0,.3))}
.ts-preview{display:flex;align-items:center;gap:12px;padding:14px;border-radius:16px;background:var(--f)}
.ts-preview small{font-size:12.5px;color:var(--soft)}
.ts-skel{display:flex;flex-direction:column;gap:10px}
.ts-skel span{height:52px;border-radius:14px;background:linear-gradient(90deg,var(--f) 25%,var(--f2) 37%,var(--f) 63%);background-size:400% 100%;animation:tsSk 1.2s ease infinite}
@keyframes tsSk{0%{background-position:100% 50%}100%{background-position:0 50%}}
`
