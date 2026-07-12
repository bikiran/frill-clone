'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

// Answer common questions automatically. The business defines the keywords and
// the exact answer — Colvy never invents a response.
export default function AutoRepliesPage() {
  const [companyId, setCompanyId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [rules, setRules] = useState<any[]>([])
  const [editing, setEditing] = useState<any>(null)
  const [msg, setMsg] = useState('')

  const blank = { name: '', keywords: '', reply: '', is_active: true, once_per_conversation: true }

  useEffect(() => {
    ;(async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { setLoading(false); return }
      let cid: string | null = null
      const { data: owned } = await (supabase as any).from('companies').select('id').eq('owner_id', user.id).order('created_at', { ascending: true }).limit(1)
      cid = owned?.[0]?.id || null
      if (!cid) {
        const { data: tm } = await (supabase as any).from('team_members').select('company_id').eq('user_id', user.id).limit(1)
        cid = tm?.[0]?.company_id || null
      }
      setCompanyId(cid)
      if (cid) await load(cid)
      setLoading(false)
    })()
  }, [])

  const load = async (cid: string) => {
    const { data } = await (supabase as any).from('keyword_replies')
      .select('*').eq('company_id', cid).order('created_at', { ascending: true })
    setRules(data || [])
  }

  const save = async () => {
    if (!companyId || !editing?.reply?.trim()) return
    const keywords = String(editing.keywords || '')
      .split(',').map((k: string) => k.trim().toLowerCase()).filter(Boolean)
    if (keywords.length === 0) { setMsg('Add at least one keyword.'); return }

    const payload = {
      company_id: companyId,
      name: editing.name || keywords[0],
      keywords,
      reply: editing.reply.trim(),
      is_active: editing.is_active !== false,
      once_per_conversation: editing.once_per_conversation !== false,
    }
    if (editing.id) await (supabase as any).from('keyword_replies').update(payload).eq('id', editing.id)
    else await (supabase as any).from('keyword_replies').insert(payload)

    setEditing(null); setMsg('Saved.')
    await load(companyId)
  }

  const remove = async (id: string) => {
    if (!companyId) return
    await (supabase as any).from('keyword_replies').delete().eq('id', id)
    await load(companyId)
  }

  const toggle = async (r: any) => {
    if (!companyId) return
    await (supabase as any).from('keyword_replies').update({ is_active: !r.is_active }).eq('id', r.id)
    await load(companyId)
  }

  const L: any = { display: 'block', fontSize: 12.5, fontWeight: 700, color: 'var(--ink)', marginBottom: 6 }
  const I: any = { width: '100%', padding: '10px 12px', borderRadius: 9, border: '1px solid var(--border)', fontSize: 14, boxSizing: 'border-box', marginBottom: 14 }

  if (loading) return <div style={{ padding: 28 }}>Loading…</div>

  return (
    <div style={{ maxWidth: 720, margin: '0 auto', padding: '28px 24px', fontFamily: '-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16, marginBottom: 8, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 800, color: 'var(--ink)', margin: '0 0 4px' }}>Automatic replies</h1>
          <p style={{ fontSize: 14, color: 'var(--slate)', margin: 0 }}>Answer common questions instantly, before an agent even sees them.</p>
        </div>
        {!editing && (
          <button onClick={() => setEditing({ ...blank })}
            style={{ padding: '10px 18px', borderRadius: 10, background: 'var(--coral)', color: '#fff', border: 'none', fontSize: 14, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }}>
            + Add reply
          </button>
        )}
      </div>

      {msg && <p style={{ fontSize: 13, color: 'var(--coral)', margin: '10px 0' }}>{msg}</p>}

      {editing && (
        <div style={{ border: '1px solid var(--border)', borderRadius: 14, padding: 20, background: '#fff', marginTop: 18, marginBottom: 20 }}>
          <label style={L}>Name</label>
          <input style={I} value={editing.name || ''} placeholder="Opening hours"
            onChange={e => setEditing({ ...editing, name: e.target.value })} />

          <label style={L}>Trigger keywords <span style={{ fontWeight: 400, color: 'var(--slate)' }}>— comma separated</span></label>
          <input style={I} value={editing.keywords || ''}
            placeholder="opening hours, what time do you close, are you open"
            onChange={e => setEditing({ ...editing, keywords: e.target.value })} />
          <p style={{ fontSize: 12, color: 'var(--slate)', margin: '-8px 0 14px', lineHeight: 1.5 }}>
            If a customer&rsquo;s message contains any of these phrases, Colvy sends the reply below. The most specific match wins.
          </p>

          <label style={L}>Reply</label>
          <textarea style={{ ...I, minHeight: 90, resize: 'vertical', fontFamily: 'inherit' }} value={editing.reply || ''}
            placeholder="We're open 10am – 6pm every day."
            onChange={e => setEditing({ ...editing, reply: e.target.value })} />

          <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
            <input type="checkbox" checked={editing.once_per_conversation !== false}
              onChange={e => setEditing({ ...editing, once_per_conversation: e.target.checked })}
              style={{ width: 17, height: 17, accentColor: 'var(--coral)' }} />
            <span style={{ fontSize: 13.5, color: 'var(--ink)' }}>Only answer once per conversation</span>
          </label>

          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={save}
              style={{ padding: '10px 20px', borderRadius: 9, background: 'var(--coral)', color: '#fff', border: 'none', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>Save</button>
            <button onClick={() => setEditing(null)}
              style={{ padding: '10px 20px', borderRadius: 9, background: '#fff', color: 'var(--slate)', border: '1px solid var(--border)', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>Cancel</button>
          </div>
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 20 }}>
        {rules.length === 0 && !editing && (
          <p style={{ fontSize: 14, color: 'var(--slate)', textAlign: 'center', padding: 30 }}>
            No automatic replies yet. Add one for your opening hours or location — the two things customers ask most.
          </p>
        )}
        {rules.map(r => (
          <div key={r.id} style={{ border: '1px solid var(--border)', borderRadius: 12, padding: 16, background: '#fff', opacity: r.is_active ? 1 : 0.6 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 8 }}>
              <span style={{ fontSize: 14.5, fontWeight: 700, color: 'var(--ink)' }}>{r.name}</span>
              <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                <button onClick={() => toggle(r)}
                  style={{ padding: '5px 11px', borderRadius: 7, border: '1px solid var(--border)', background: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer', color: r.is_active ? '#15803d' : 'var(--slate)' }}>
                  {r.is_active ? 'Active' : 'Paused'}
                </button>
                <button onClick={() => setEditing({ ...r, keywords: (r.keywords || []).join(', ') })}
                  style={{ padding: '5px 11px', borderRadius: 7, border: '1px solid var(--border)', background: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer', color: 'var(--ink)' }}>Edit</button>
                <button onClick={() => remove(r.id)}
                  style={{ padding: '5px 11px', borderRadius: 7, border: '1px solid var(--border)', background: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer', color: '#dc2626' }}>Delete</button>
              </div>
            </div>

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginBottom: 8 }}>
              {(r.keywords || []).map((k: string) => (
                <span key={k} style={{ fontSize: 11.5, color: 'var(--coral)', background: 'var(--peach)', padding: '2px 8px', borderRadius: 6 }}>{k}</span>
              ))}
            </div>

            <p style={{ fontSize: 13, color: 'var(--slate)', margin: 0, lineHeight: 1.5 }}>{r.reply}</p>
            {r.match_count > 0 && (
              <p style={{ fontSize: 11.5, color: '#9ca3af', margin: '8px 0 0' }}>Answered {r.match_count} time{r.match_count === 1 ? '' : 's'}</p>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
