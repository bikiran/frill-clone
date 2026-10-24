'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { useCompanyUser, S, ToggleRow } from '../_shared'

export default function ArchivedSpamSettings() {
  const { companyId, loading } = useCompanyUser()
  const [tab, setTab] = useState<'spam' | 'archived'>('spam')
  const [items, setItems] = useState<any[]>([])
  const [protection, setProtection] = useState<boolean | null>(null)
  const [msg, setMsg] = useState('')

  useEffect(() => { if (companyId) load() }, [companyId, tab])
  useEffect(() => {
    if (!companyId) return
    ;(supabase as any).from('companies').select('inbox_settings').eq('id', companyId).maybeSingle()
      .then(({ data }: any) => setProtection(data?.inbox_settings?.protection?.enabled !== false))
  }, [companyId])

  const load = async () => {
    const col = tab === 'spam' ? 'is_spam' : 'is_archived'
    const { data } = await (supabase as any).from('conversations').select('*').eq('company_id', companyId).eq(col, true).order('updated_at', { ascending: false }).limit(50)
    setItems(data || [])
  }
  const restore = async (id: string) => {
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
        if (res.ok) { load(); return }
      } catch {}
    }
    const col = tab === 'spam' ? 'is_spam' : 'is_archived'
    await (supabase as any).from('conversations').update({ [col]: false }).eq('id', id); load()
  }

  const saveProtection = async (on: boolean) => {
    setProtection(on); setMsg('')
    const { data } = await (supabase as any).from('companies').select('inbox_settings').eq('id', companyId).maybeSingle()
    const next = { ...(data?.inbox_settings || {}), protection: { ...(data?.inbox_settings?.protection || {}), enabled: on } }
    const { error } = await (supabase as any).from('companies').update({ inbox_settings: next }).eq('id', companyId)
    if (error) { setProtection(!on); setMsg('Couldn’t save. Try again.') } else setMsg(on ? 'Spam protection is on.' : 'Spam protection is off.')
  }

  if (loading) return <div style={{ color: 'var(--slate)' }}>Loading…</div>

  return (
    <div style={{ maxWidth: 760 }}>
      <h1 style={S.h1}>Archived &amp; Spam</h1>
      <p style={S.sub}>Enquiries here are hidden from your inbox. Click restore to bring one back.</p>

      <div style={{ ...S.card, marginBottom: 22 }}>
        <ToggleRow
          title="Spam protection"
          desc="Holds back messages that look like spam or inappropriate content: they’re hidden behind “Review message” in your inbox, get no automatic replies, and notifications don’t show their text. Obvious spam goes straight to Spam. Customers you’ve replied to or who have ordered are given the benefit of the doubt, and “Not spam” trusts a customer from then on."
          checked={protection !== false}
          onChange={saveProtection}
        />
        {msg && <p style={{ margin: '8px 0 0', fontSize: 12.5, color: 'var(--slate)' }}>{msg}</p>}
      </div>

      <div style={{ display: 'flex', gap: 4, marginBottom: 18, borderBottom: '1px solid var(--border)' }}>
        {(['spam', 'archived'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)} style={{ padding: '10px 18px', border: 'none', background: 'none', cursor: 'pointer', fontSize: 14, fontWeight: tab === t ? 700 : 500, color: tab === t ? 'var(--coral)' : 'var(--slate)', borderBottom: tab === t ? '2px solid var(--coral)' : '2px solid transparent', textTransform: 'capitalize' }}>{t}</button>
        ))}
      </div>

      {items.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 48, color: 'var(--slate)', border: '1px dashed var(--border)', borderRadius: 14 }}>Nothing here.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {items.map(c => (
            <div key={c.id} style={{ ...S.card, marginBottom: 0, padding: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: 'var(--ink)' }}>{c.subject || 'Conversation'}</p>
                <p style={{ margin: '2px 0 0', fontSize: 13, color: 'var(--slate)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.last_message}</p>
              </div>
              <button onClick={() => restore(c.id)} style={{ ...S.btnGhost, padding: '7px 16px', fontSize: 13 }}>{tab === 'spam' ? 'Not spam' : 'Restore'}</button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
