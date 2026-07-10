'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { useCompanyUser, S, ToggleRow } from '../_shared'

export default function AiSettings() {
  const { companyId, loading } = useCompanyUser()
  const [s, setS] = useState<any>({ auto_reply: false, auto_reply_mode: 'off', draft_messages: false, contact_enrichment: false, qa_content: '' })
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    if (!companyId) return
    ;(async () => {
      const { data } = await (supabase as any).from('ai_settings').select('*').eq('company_id', companyId).maybeSingle()
      if (data) setS({ ...s, ...data })
    })()
  }, [companyId])

  const set = (k: string, v: any) => setS((p: any) => ({ ...p, [k]: v }))
  const save = async () => {
    if (!companyId) return
    setSaving(true)
    const payload = { ...s, company_id: companyId, updated_at: new Date().toISOString() }
    delete payload.id; delete payload.created_at
    const { data: existing } = await (supabase as any).from('ai_settings').select('id').eq('company_id', companyId).maybeSingle()
    if (existing) await (supabase as any).from('ai_settings').update(payload).eq('id', existing.id)
    else await (supabase as any).from('ai_settings').insert(payload)
    setSaving(false); setSaved(true); setTimeout(() => setSaved(false), 2000)
  }

  if (loading) return <div style={{ color: 'var(--slate)' }}>Loading…</div>

  return (
    <div style={{ maxWidth: 680 }}>
      <h1 style={S.h1}>AI</h1>
      <p style={S.sub}>Let Colvy AI handle routine work so your team can focus on the conversations that matter.</p>

      <div style={S.card}>
        <h2 style={S.h2}>AI Reply Preference</h2>
        <p style={{ ...S.sub, marginBottom: 12 }}>Allow Colvy AI to automatically respond to customers, but only when their questions are clearly generic or commonly asked — and only if the answers are in your Q&A section below. Routine queries get instant replies without your team responding manually.</p>
        <div>
          <label style={S.label}>AI Response Mode</label>
          <select value={s.auto_reply_mode} onChange={e => { set('auto_reply_mode', e.target.value); set('auto_reply', e.target.value !== 'off') }} style={S.input}>
            <option value="off">Off</option>
            <option value="draft">Draft replies for me to approve</option>
            <option value="send">Auto-send replies</option>
          </select>
        </div>
      </div>

      <div style={S.card}>
        <ToggleRow title="AI Draft Message" desc="Allow Colvy AI to automatically draft messages for your customers." checked={s.draft_messages} onChange={v => set('draft_messages', v)} />
        <ToggleRow title="AI Contact Enrichment" desc="Allow Colvy AI to automatically enrich your contact profiles with additional information." checked={s.contact_enrichment} onChange={v => set('contact_enrichment', v)} />
      </div>

      <div style={S.card}>
        <h2 style={S.h2}>Q&A Content</h2>
        <p style={{ ...S.hint, marginBottom: 8 }}>Add the questions and answers the AI is allowed to respond with. One Q&A per line works well.</p>
        <textarea value={s.qa_content || ''} onChange={e => set('qa_content', e.target.value)} rows={8} placeholder={"Q: What are your opening hours?\nA: We're open 9am–5pm Monday to Friday.\n\nQ: Where are you located?\nA: 1 Fleet Street, Somerton VIC."} style={{ ...S.input, resize: 'vertical', fontFamily: 'inherit' }} />
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <button onClick={save} disabled={saving} style={S.btn}>{saving ? 'Saving…' : 'Save changes'}</button>
        {saved && <span style={{ fontSize: 13, color: '#059669', fontWeight: 600 }}>✓ Saved</span>}
      </div>
    </div>
  )
}
