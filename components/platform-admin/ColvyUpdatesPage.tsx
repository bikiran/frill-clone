'use client'

// Super admin → Colvy chat updates. The posts that appear in everyone's
// private Colvy chat (lib/colvy-chat), the way WhatsApp and Telegram announce
// what's new: write one, keep it as a draft, publish it (it shows in every
// chat at once, newest people included for 30 days), edit, unpublish or
// delete. Replies people send from their chat arrive in Colvy's own inbox,
// tagged "Colvy app". Uses /api/platform-admin/colvy-updates (audit-logged).

import { useEffect, useState } from 'react'
import { authFetch } from '@/lib/auth-fetch'
import { confirmDialog } from '@/components/ConfirmDialog'

const card: React.CSSProperties = { background: 'var(--sa-card)', border: '1px solid var(--sa-border)', borderRadius: 14, padding: 16, minWidth: 0 }
const label: React.CSSProperties = { fontSize: 10.5, fontWeight: 800, color: 'var(--sa-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', margin: '0 0 4px', display: 'block' }
const input: React.CSSProperties = { width: '100%', boxSizing: 'border-box', padding: '8px 10px', borderRadius: 8, border: '1px solid var(--sa-border)', background: 'var(--sa-bg)', color: 'var(--sa-text)', fontSize: 13, fontFamily: 'inherit' }
const btn = (color: string, filled = false): React.CSSProperties => ({
  display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 12px', borderRadius: 9, cursor: 'pointer', fontSize: 12.5, fontWeight: 700,
  border: filled ? 'none' : '1px solid var(--sa-border)', background: filled ? color : 'var(--sa-card)', color: filled ? '#fff' : color, whiteSpace: 'nowrap',
})
const when = (d?: string | null) => (d ? new Date(d).toLocaleString('en-AU', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' }) : '')

type Update = { id: string; title: string; body: string; link_url: string | null; link_label: string | null; published_at: string | null; created_at: string }
type Draft = { id?: string; title: string; body: string; linkUrl: string; linkLabel: string }
const blank: Draft = { title: '', body: '', linkUrl: '', linkLabel: '' }

async function api(body?: any): Promise<{ ok: boolean; data: any }> {
  try {
    const res = await authFetch('/api/platform-admin/colvy-updates', body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : undefined)
    return { ok: res.ok, data: await res.json().catch(() => ({})) }
  } catch (e: any) { return { ok: false, data: { error: e?.message || 'Network error' } } }
}

// How it will look in someone's chat.
function Preview({ d }: { d: Draft }) {
  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/icon-192.png" alt="" width={26} height={26} style={{ borderRadius: 7 }} />
      <div style={{ maxWidth: 420, padding: '10px 13px', borderRadius: 16, borderBottomLeftRadius: 6, background: '#fff', border: '1px solid #e5e5ea', color: '#1c1c1e', fontSize: 13.5, lineHeight: 1.5 }}>
        <span style={{ display: 'block', fontSize: 10.5, fontWeight: 800, letterSpacing: '.04em', textTransform: 'uppercase', color: '#e2553f', marginBottom: 4 }}>What’s new</span>
        <p style={{ margin: '0 0 4px', fontSize: 14, fontWeight: 700 }}>{d.title || 'Title'}</p>
        {d.body && <p style={{ margin: 0, whiteSpace: 'pre-wrap', color: '#3a3a3c' }}>{d.body}</p>}
        {d.linkUrl && <span style={{ display: 'inline-block', marginTop: 10, padding: '6px 12px', borderRadius: 9, background: '#fff1ee', color: '#e2553f', fontSize: 12.5, fontWeight: 700 }}>{d.linkLabel || 'Open'}</span>}
      </div>
    </div>
  )
}

function Editor({ initial, busy, onSave, onCancel }: { initial: Draft; busy: boolean; onSave: (d: Draft, publish: boolean | undefined) => void; onCancel: () => void }) {
  const [d, setD] = useState<Draft>(initial)
  const set = (k: keyof Draft) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setD(x => ({ ...x, [k]: e.target.value }))
  return (
    <div style={{ ...card, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(280px, 100%), 1fr))', gap: 18 }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, minWidth: 0 }}>
        <label><span style={label}>Title</span><input style={input} value={d.title} onChange={set('title')} maxLength={120} placeholder="SMS is now live" /></label>
        <label><span style={label}>Message</span><textarea style={{ ...input, minHeight: 120, resize: 'vertical' }} value={d.body} onChange={set('body')} maxLength={4000} placeholder="What’s new and why it helps. Plain text; links work." /></label>
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 8 }}>
          <label><span style={label}>Button link (optional)</span><input style={input} value={d.linkUrl} onChange={set('linkUrl')} placeholder="/admin/crm-settings/channels or https://…" /></label>
          <label><span style={label}>Button text</span><input style={input} value={d.linkLabel} onChange={set('linkLabel')} maxLength={40} placeholder="Open Channels" /></label>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 4 }}>
          {!initial.id && <button type="button" disabled={busy || !d.title.trim()} onClick={() => onSave(d, true)} style={btn('#ff7a6b', true)}>Publish to everyone</button>}
          <button type="button" disabled={busy || !d.title.trim()} onClick={() => onSave(d, undefined)} style={btn('var(--sa-text)')}>{initial.id ? 'Save changes' : 'Save as draft'}</button>
          <button type="button" onClick={onCancel} style={btn('var(--sa-muted)')}>Cancel</button>
        </div>
      </div>
      <div style={{ minWidth: 0 }}>
        <span style={label}>Preview</span>
        <div style={{ padding: 14, borderRadius: 12, background: '#f9f9f9' }}><Preview d={d} /></div>
      </div>
    </div>
  )
}

export default function ColvyUpdatesPage() {
  const [updates, setUpdates] = useState<Update[] | null>(null)
  const [missing, setMissing] = useState(false)
  const [editing, setEditing] = useState<Draft | null>(null)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')

  const load = async () => {
    const r = await api()
    if (!r.ok) { setMsg(r.data.error || 'Could not load the updates'); setUpdates([]); return }
    setUpdates(r.data.updates || []); setMissing(!!r.data.missing)
  }
  useEffect(() => { load() }, [])

  const save = async (d: Draft, publish: boolean | undefined) => {
    if (publish && !(await confirmDialog({ title: 'Publish to everyone?', message: `“${d.title.trim()}” appears in every person’s Colvy chat straight away.`, confirmLabel: 'Publish' }))) return
    setBusy(true); setMsg('')
    const r = await api({ action: d.id ? 'update' : 'create', id: d.id, title: d.title, body: d.body, linkUrl: d.linkUrl, linkLabel: d.linkLabel, ...(publish !== undefined ? { publish } : {}) })
    setBusy(false)
    if (!r.ok) { setMsg(r.data.error || 'Could not save'); return }
    setEditing(null); setMsg(publish ? 'Published. It’s in everyone’s Colvy chat now.' : 'Saved.'); load()
  }
  const setPublished = async (u: Update, publish: boolean) => {
    if (!(await confirmDialog({
      title: publish ? 'Publish to everyone?' : 'Unpublish this update?',
      message: publish ? `“${u.title}” appears in every person’s Colvy chat straight away.` : `“${u.title}” disappears from everyone’s Colvy chat.`,
      confirmLabel: publish ? 'Publish' : 'Unpublish',
    }))) return
    const r = await api({ action: 'update', id: u.id, publish })
    if (!r.ok) { setMsg(r.data.error || 'Could not change it'); return }
    setMsg(publish ? 'Published.' : 'Unpublished.'); load()
  }
  const remove = async (u: Update) => {
    if (!(await confirmDialog({ title: 'Delete this update?', message: `“${u.title}” is removed for good${u.published_at ? ', including from everyone’s Colvy chat' : ''}.`, confirmLabel: 'Delete', tone: 'danger' }))) return
    const r = await api({ action: 'delete', id: u.id })
    if (!r.ok) { setMsg(r.data.error || 'Could not delete'); return }
    setMsg('Deleted.'); load()
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14, maxWidth: 980 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ minWidth: 0 }}>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: 'var(--sa-text)' }}>Colvy chat updates</h2>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--sa-muted)', maxWidth: 620, lineHeight: 1.5 }}>
            Everyone has a private “Colvy” chat pinned in their inbox. Updates posted here appear in it, and replies come to Colvy’s own inbox tagged “Colvy app”.
          </p>
        </div>
        {!editing && !missing && <button type="button" onClick={() => setEditing({ ...blank })} style={btn('#ff7a6b', true)}>New update</button>}
      </div>

      {msg && <div style={{ ...card, padding: '10px 14px', fontSize: 13, color: 'var(--sa-text)' }}>{msg}</div>}
      {missing && <div style={{ ...card, fontSize: 13, color: 'var(--sa-text)' }}>Run <b>migrations/COLVY_V420_COLVY_CHAT.sql</b> in Supabase first. Until then the Colvy chat doesn’t appear.</div>}
      {editing && <Editor initial={editing} busy={busy} onSave={save} onCancel={() => setEditing(null)} />}

      {updates === null ? <p style={{ fontSize: 13, color: 'var(--sa-muted)' }}>Loading…</p>
        : !updates.length && !missing ? <div style={{ ...card, fontSize: 13, color: 'var(--sa-muted)' }}>No updates yet. Everyone sees the welcome message until you post one.</div>
        : updates.map(u => (
          <div key={u.id} style={{ ...card, display: 'flex', gap: 14, alignItems: 'flex-start', flexWrap: 'wrap' }}>
            <div style={{ flex: '1 1 320px', minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 14.5, fontWeight: 800, color: 'var(--sa-text)' }}>{u.title}</span>
                <span style={{ fontSize: 11.5, fontWeight: 800, padding: '2px 9px', borderRadius: 999, background: u.published_at ? '#10b98122' : '#64748b22', color: u.published_at ? '#10b981' : '#64748b' }}>{u.published_at ? 'Published' : 'Draft'}</span>
              </div>
              <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--sa-muted)' }}>{u.published_at ? `Published ${when(u.published_at)}` : `Drafted ${when(u.created_at)}`}</p>
              {u.body && <p style={{ margin: '8px 0 0', fontSize: 13, color: 'var(--sa-text)', whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>{u.body}</p>}
              {u.link_url && <p style={{ margin: '6px 0 0', fontSize: 12.5, color: 'var(--sa-muted)' }}>Button: {u.link_label || 'Open'} → {u.link_url}</p>}
            </div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              <button type="button" onClick={() => setPublished(u, !u.published_at)} style={btn(u.published_at ? 'var(--sa-muted)' : '#ff7a6b', !u.published_at)}>{u.published_at ? 'Unpublish' : 'Publish'}</button>
              <button type="button" onClick={() => setEditing({ id: u.id, title: u.title, body: u.body || '', linkUrl: u.link_url || '', linkLabel: u.link_label || '' })} style={btn('var(--sa-text)')}>Edit</button>
              <button type="button" onClick={() => remove(u)} style={btn('#ef4444')}>Delete</button>
            </div>
          </div>
        ))}
    </div>
  )
}
