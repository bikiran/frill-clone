'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { Panel, Toggle } from '@/components/ui/AdminKit'
import EmptyScroll from '@/components/EmptyScroll'
import { confirmDialog } from '@/components/ConfirmDialog'
import { useCompanyUser, SettingsPage, IconTile } from '../_shared'

// What's hidden from the inbox: conversations marked as spam, archived ones,
// and the customers the team has blocked (contacts.is_blocked, set from the
// inbox's contact menu). Each can be brought back from here.

type Tab = 'spam' | 'archived' | 'blocked'
const TABS: { key: Tab; label: string }[] = [
  { key: 'spam', label: 'Spam' },
  { key: 'archived', label: 'Archived' },
  { key: 'blocked', label: 'Blocked' },
]
const HUES = ['#ff7a6b', '#f59e0b', '#10b981', '#0ea5e9', '#6366f1', '#8b5cf6', '#ec4899', '#14b8a6']
const hueOf = (s: string) => HUES[[...String(s || '?')].reduce((a, c) => a + c.charCodeAt(0), 0) % HUES.length]
const initials = (s: string) => String(s || '?').replace(/[^\p{L}\p{N} ]/gu, '').trim().split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase() || '#'
const ago = (iso?: string | null) => {
  if (!iso) return ''
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m}m ago`
  const h = Math.round(m / 60); if (h < 24) return `${h}h ago`
  const d = Math.round(h / 24); if (d < 30) return `${d}d ago`
  return new Date(iso).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })
}

export default function ArchivedSpamSettings() {
  const { companyId, loading } = useCompanyUser()
  const [tab, setTab] = useState<Tab>('spam')
  const [items, setItems] = useState<any[] | null>(null)
  const [names, setNames] = useState<Record<string, string>>({})
  const [counts, setCounts] = useState<Partial<Record<Tab, number>>>({})
  const [busy, setBusy] = useState<string | null>(null)
  const [protection, setProtection] = useState<boolean | null>(null)
  const [msg, setMsg] = useState('')

  useEffect(() => {
    try { const t = new URLSearchParams(window.location.search).get('tab'); if (t === 'archived' || t === 'blocked' || t === 'spam') setTab(t) } catch {}
  }, [])
  useEffect(() => { if (companyId) load() }, [companyId, tab])
  useEffect(() => { if (companyId) loadCounts() }, [companyId])
  useEffect(() => {
    if (!companyId) return
    ;(supabase as any).from('companies').select('inbox_settings').eq('id', companyId).maybeSingle()
      .then(({ data }: any) => setProtection(data?.inbox_settings?.protection?.enabled !== false))
  }, [companyId])

  const loadCounts = async () => {
    const head = (q: any) => q.then((r: any) => (typeof r?.count === 'number' ? r.count : undefined)).catch(() => undefined)
    const [spam, archived, blocked] = await Promise.all([
      head((supabase as any).from('conversations').select('id', { count: 'exact', head: true }).eq('company_id', companyId).eq('is_spam', true)),
      head((supabase as any).from('conversations').select('id', { count: 'exact', head: true }).eq('company_id', companyId).eq('is_archived', true)),
      head((supabase as any).from('contacts').select('id', { count: 'exact', head: true }).eq('company_id', companyId).eq('is_blocked', true)),
    ])
    setCounts({ spam, archived, blocked })
  }

  const load = async () => {
    setItems(null)
    if (tab === 'blocked') {
      const { data } = await (supabase as any).from('contacts').select('*').eq('company_id', companyId).eq('is_blocked', true)
        .order('blocked_at', { ascending: false, nullsFirst: false }).limit(100)
      setItems(data || [])
      return
    }
    const col = tab === 'spam' ? 'is_spam' : 'is_archived'
    const { data } = await (supabase as any).from('conversations').select('*').eq('company_id', companyId).eq(col, true).order('updated_at', { ascending: false }).limit(50)
    setItems(data || [])
    // Who each conversation is with, from its contact.
    const ids = [...new Set((data || []).map((c: any) => c.contact_id).filter(Boolean))] as string[]
    if (ids.length) {
      try {
        const { data: cs } = await (supabase as any).from('contacts').select('*').in('id', ids.slice(0, 80))
        setNames(n => ({ ...n, ...Object.fromEntries((cs || []).map((c: any) => [c.id, c.name || c.email || c.phone || ''])) }))
      } catch { /* names are a nicety */ }
    }
  }

  const restore = async (id: string) => {
    setBusy(id)
    try {
      if (tab === 'spam') {
        // "Not spam": clears anything Colvy held back and trusts the customer
        // (lib/conversation-protection), as the inbox button does.
        try {
          const { data: { session } } = await supabase.auth.getSession()
          const res = await fetch('/api/inbox/protection', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}) },
            body: JSON.stringify({ companyId, conversationId: id, action: 'not_spam' }),
          })
          if (res.ok) return
        } catch {}
      }
      const col = tab === 'spam' ? 'is_spam' : 'is_archived'
      await (supabase as any).from('conversations').update({ [col]: false }).eq('id', id)
    } finally {
      setBusy(null)
      setItems(x => (x || []).filter(i => i.id !== id))
      setCounts(c => ({ ...c, [tab]: Math.max(0, (c[tab] || 1) - 1) }))
    }
  }

  const unblock = async (c: any) => {
    const who = c.name || c.email || c.phone || 'this customer'
    if (!await confirmDialog({ title: `Unblock ${who}?`, message: 'Their messages and calls reach your inbox again, and automatic messages can go to them.', confirmLabel: 'Unblock' })) return
    setBusy(c.id)
    const { error } = await (supabase as any).from('contacts').update({ is_blocked: false, blocked_at: null, blocked_by: null }).eq('id', c.id)
    setBusy(null)
    if (error) { setMsg('Couldn’t unblock. Try again.'); return }
    setItems(x => (x || []).filter(i => i.id !== c.id))
    setCounts(k => ({ ...k, blocked: Math.max(0, (k.blocked || 1) - 1) }))
  }

  const saveProtection = async (on: boolean) => {
    setProtection(on); setMsg('')
    const { data } = await (supabase as any).from('companies').select('inbox_settings').eq('id', companyId).maybeSingle()
    const next = { ...(data?.inbox_settings || {}), protection: { ...(data?.inbox_settings?.protection || {}), enabled: on } }
    const { error } = await (supabase as any).from('companies').update({ inbox_settings: next }).eq('id', companyId)
    if (error) { setProtection(!on); setMsg('Couldn’t save. Try again.') } else setMsg(on ? 'Spam protection is on.' : 'Spam protection is off.')
  }

  const empty = {
    spam: { title: 'No spam', line: 'Conversations marked as spam land here.' },
    archived: { title: 'Nothing archived', line: 'Conversations you archive land here, so you can bring them back.' },
    blocked: { title: 'Nobody blocked', line: 'Block a customer from their contact menu in the inbox. They show up here.' },
  }[tab]

  return (
    <SettingsPage title="Archived & spam" sub="What’s kept out of your inbox: spam, archived conversations and blocked customers. Bring any of them back from here.">
      <Panel>
        <div className="as-prot">
          <IconTile color={protection === false ? '#a1a1aa' : '#10b981'} size={44}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /><path d="m9 12 2 2 4-4" /></svg>
          </IconTile>
          <div className="as-prot-t">
            <b>Spam protection <span className={`ak-tag ${protection === false ? '' : 'green'}`}>{protection === null ? '…' : protection ? 'On' : 'Off'}</span></b>
            <p>Holds back messages that look like spam or inappropriate content: they wait behind “Review message”, get no automatic replies, and notifications hide their text. Obvious spam goes straight to Spam.</p>
            <ul className="as-facts">
              <li>Customers you’ve replied to, or who’ve ordered, get the benefit of the doubt</li>
              <li>“Not spam” trusts a customer from then on</li>
            </ul>
          </div>
          <Toggle on={protection !== false} onChange={saveProtection} label="Spam protection" disabled={protection === null} />
        </div>
        {msg && <p className="as-msg" role="status">{msg}</p>}
      </Panel>

      <div className="as-bar">
        <div className="ak-seg" role="tablist" aria-label="What to show">
          {TABS.map(t => (
            <button key={t.key} type="button" role="tab" aria-selected={tab === t.key} className={tab === t.key ? 'on' : ''} onClick={() => setTab(t.key)}>
              {t.label}{typeof counts[t.key] === 'number' && <span className="as-n">{counts[t.key]}</span>}
            </button>
          ))}
        </div>
      </div>

      {loading || items === null ? (
        <Panel><div className="as-skel">{[0, 1, 2].map(i => <span key={i} />)}</div></Panel>
      ) : items.length === 0 ? (
        <Panel><EmptyScroll kinds={tab === 'blocked' ? ['contact'] : ['chat', 'email']} title={empty.title} line={empty.line} /></Panel>
      ) : (
        <Panel flush>
          <ul className="as-list">
            {items.map((c: any) => {
              if (tab === 'blocked') {
                const who = c.name || c.email || c.phone || 'Customer'
                const sub = [c.name && c.phone, c.name && c.email].filter(Boolean).join(' · ') || (c.phone && c.email ? `${c.phone} · ${c.email}` : '')
                return (
                  <li key={c.id} className="ak-in">
                    <span className="as-av" style={{ '--h': hueOf(who) } as React.CSSProperties} aria-hidden>{initials(who)}<i className="as-blk" /></span>
                    <div className="as-t">
                      <b>{who}</b>
                      <p>{sub || 'No other details'}</p>
                      <small>Blocked {c.blocked_at ? ago(c.blocked_at) : ''}{c.blocked_by ? ` by ${c.blocked_by}` : ''}</small>
                    </div>
                    <div className="as-acts">
                      <Link className="ak-btn ghost sm" href={`/admin/customers/profile?id=${c.id}`}>Profile</Link>
                      <button type="button" className="ak-btn sm" onClick={() => unblock(c)} disabled={busy === c.id}>{busy === c.id ? 'Unblocking…' : 'Unblock'}</button>
                    </div>
                  </li>
                )
              }
              const who = names[c.contact_id] || c.customer_name || c.customer_email || c.sms_number || c.subject || 'Conversation'
              return (
                <li key={c.id} className="ak-in">
                  <span className="as-av" style={{ '--h': hueOf(who) } as React.CSSProperties} aria-hidden>{initials(who)}</span>
                  <div className="as-t">
                    <b>{who}</b>
                    <p>{c.last_message || 'No messages'}</p>
                    <small>{[c.channel && String(c.channel).replace(/^./, (x: string) => x.toUpperCase()), ago(c.last_message_at || c.updated_at)].filter(Boolean).join(' · ')}</small>
                  </div>
                  <div className="as-acts">
                    <Link className="ak-btn ghost sm" href={`/admin/inbox?conversation=${c.id}`}>Open</Link>
                    <button type="button" className="ak-btn sm" onClick={() => restore(c.id)} disabled={busy === c.id}>{busy === c.id ? '…' : tab === 'spam' ? 'Not spam' : 'Restore'}</button>
                  </div>
                </li>
              )
            })}
          </ul>
        </Panel>
      )}
      <style>{AS_CSS}</style>
    </SettingsPage>
  )
}

const AS_CSS = `
.as-prot{display:flex;align-items:flex-start;gap:14px}
.as-prot-t{flex:1;min-width:0}
.as-prot-t b{display:flex;align-items:center;gap:8px;font-family:var(--font-display),-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:17px;font-weight:700;letter-spacing:-.025em;color:var(--ink)}
.as-prot-t p{margin:4px 0 0;font-size:13.5px;line-height:1.5;color:var(--mut)}
.as-facts{display:flex;flex-wrap:wrap;gap:6px;margin:10px 0 0;padding:0;list-style:none}
.as-facts li{display:inline-flex;align-items:center;gap:6px;padding:5px 10px;border-radius:999px;background:var(--f);font-size:12.5px;font-weight:550;color:var(--mut)}
.as-facts li::before{content:'';width:6px;height:6px;border-radius:50%;background:#10b981}
.as-msg{margin:12px 0 0 58px;font-size:12.5px;color:var(--mut)}
@media (max-width:560px){.as-prot{flex-wrap:wrap}.as-prot-t{order:3;flex-basis:100%}.as-prot .ak-switch{margin-left:auto}.as-msg{margin-left:0}}
.as-bar{margin:4px 0 12px}
.as-n{display:inline-flex;align-items:center;justify-content:center;min-width:20px;height:20px;padding:0 6px;border-radius:999px;background:rgba(0,0,0,.06);font-size:11.5px;font-weight:700;color:var(--mut)}
[data-theme="dark"] .as-n{background:rgba(255,255,255,.1)}
.ak-seg button.on .as-n{background:var(--ink);color:var(--card,#fff)}
.as-list{list-style:none;margin:0;padding:6px}
.as-list li{display:flex;align-items:center;gap:12px;padding:12px;border-radius:16px;transition:background .15s}
.as-list li:hover{background:color-mix(in srgb,var(--f) 60%,transparent)}
.as-list li+li{box-shadow:0 -1px 0 var(--line)}
.as-list li:hover+li,.as-list li+li:hover{box-shadow:none}
.as-av{position:relative;width:40px;height:40px;flex-shrink:0;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;background:color-mix(in srgb,var(--h) 16%,var(--card,#fff));color:color-mix(in srgb,var(--h) 80%,#000);font-size:14px;font-weight:700}
[data-theme="dark"] .as-av{color:color-mix(in srgb,var(--h) 70%,#fff)}
.as-blk{position:absolute;right:-2px;bottom:-2px;width:16px;height:16px;border-radius:50%;background:#ef4444;box-shadow:0 0 0 2px var(--card,#fff)}
.as-blk::after{content:'';position:absolute;left:3.5px;right:3.5px;top:7px;height:2px;border-radius:2px;background:#fff}
.as-t{flex:1;min-width:0}
.as-t b{display:block;font-size:14.5px;font-weight:650;color:var(--ink);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.as-t p{margin:1px 0 0;font-size:13px;color:var(--mut);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.as-t small{display:block;margin-top:2px;font-size:12px;color:var(--soft)}
.as-acts{display:flex;gap:6px;flex-shrink:0}
@media (max-width:560px){.as-list li{flex-wrap:wrap}.as-acts{width:100%;padding-left:52px}}
.as-skel{display:flex;flex-direction:column;gap:10px}
.as-skel span{height:58px;border-radius:14px;background:linear-gradient(90deg,var(--f) 25%,var(--f2) 37%,var(--f) 63%);background-size:400% 100%;animation:asSk 1.2s ease infinite}
@keyframes asSk{0%{background-position:100% 50%}100%{background-position:0 50%}}
`
