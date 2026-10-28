'use client'
import { authFetch } from '@/lib/auth-fetch'
import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { useCompanyUser } from '../../crm-settings/_shared'

type Category = {
  id: string
  name: string
  slug: string
  count: number
  reply_ai_enabled: boolean
  reply_guidelines: string | null
  dm_enabled: boolean
  dm_guidelines: string | null
}

export default function SocialCategoriesPage() {
  const { companyId, loading } = useCompanyUser()
  const [cats, setCats] = useState<Category[]>([])
  const [loadingData, setLoadingData] = useState(true)
  const [savingId, setSavingId] = useState<string | null>(null)
  const [savedId, setSavedId] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!companyId) return
    setLoadingData(true)
    try {
      const res = await authFetch(`/api/social/categories?companyId=${companyId}`)
      const d = await res.json()
      setCats(d.categories || [])
    } catch {} finally { setLoadingData(false) }
  }, [companyId])

  useEffect(() => { load() }, [load])

  const patch = (id: string, changes: Partial<Category>) =>
    setCats(cs => cs.map(c => c.id === id ? { ...c, ...changes } : c))

  const save = async (cat: Category, changes: Partial<Category>) => {
    if (!companyId) return
    patch(cat.id, changes)
    setSavingId(cat.id); setSavedId(null)
    try {
      await authFetch('/api/social/categories', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ companyId, id: cat.id, ...changes }),
      })
      setSavedId(cat.id)
      setTimeout(() => setSavedId(s => s === cat.id ? null : s), 2000)
    } catch {} finally { setSavingId(s => s === cat.id ? null : s) }
  }

  if (loading || loadingData) return <div style={{ padding: 40, color: '#8e8e93' }}>Loading categories…</div>

  const toggle = (on: boolean, onClick: () => void, label: string) => (
    <button type="button" role="switch" aria-checked={on} aria-label={label} className={'sc-switch' + (on ? ' on' : '')} onClick={onClick}><span /></button>
  )

  return (
    <div className="sc">
      <style>{`
        .sc { padding: 24px 28px 48px; max-width: 1200px; margin: 0 auto; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; color: var(--ink); }
        .sc button::before { display: none; }
        .sc-back { display: inline-flex; align-items: center; gap: 4px; height: 32px; padding: 0 14px 0 10px; margin-bottom: 14px; border-radius: 999px; background: #f4f4f5; color: #3f3f46; font-size: 13.5px; font-weight: 600; text-decoration: none; }
        .sc-back:hover { background: #ececef; color: #18181b; }
        .sc h1 { margin: 0; font-size: 30px; font-weight: 800; letter-spacing: -.025em; line-height: 1.15; }
        .sc-lead { margin: 6px 0 22px; font-size: 14px; color: #71717a; line-height: 1.55; max-width: 720px; }
        .sc-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(340px, 1fr)); gap: 14px; }
        .sc-card { background: #fff; border-radius: 20px; padding: 18px 20px; box-shadow: 0 0 0 1px rgba(0,0,0,.06), 0 1px 2px rgba(16,24,40,.04); transition: box-shadow .16s ease; }
        .sc-card:hover { box-shadow: 0 0 0 1px rgba(0,0,0,.07), 0 10px 24px -14px rgba(0,0,0,.3); }
        .sc-top { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
        .sc-top b { font-size: 16px; font-weight: 700; }
        .sc-count { display: inline-flex; align-items: center; justify-content: center; min-width: 24px; height: 24px; padding: 0 9px; border-radius: 999px; background: #f4f4f5; color: #52525b; font-size: 12.5px; font-weight: 700; }
        .sc-count.on { background: color-mix(in srgb, var(--coral) 12%, #fff); color: color-mix(in srgb, var(--coral) 85%, #000); }
        .sc-state { margin: 3px 0 14px; font-size: 12.5px; color: #8e8e93; }
        .sc-opt { padding: 14px 0 0; border-top: 1px solid #f0f0f2; }
        .sc-opt + .sc-opt { margin-top: 14px; }
        .sc-opt-row { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; }
        .sc-opt-row b { display: block; margin-bottom: 3px; font-size: 14px; font-weight: 600; }
        .sc-opt-row small { display: block; font-size: 12.5px; color: #71717a; line-height: 1.45; }
        .sc-switch { position: relative; width: 44px; height: 26px; flex-shrink: 0; border: none; border-radius: 999px; background: #d4d4d8; cursor: pointer; padding: 0; transition: background-color .2s; }
        .sc-switch span { position: absolute; top: 2px; left: 2px; width: 22px; height: 22px; border-radius: 50%; background: #fff; box-shadow: 0 1px 2px rgba(0,0,0,.25); transition: transform .2s cubic-bezier(.22,1,.36,1); }
        .sc-switch.on { background: #34c759; }
        .sc-switch.on span { transform: translateX(18px); }
        .sc-switch:focus-visible { outline: none; box-shadow: 0 0 0 3px color-mix(in srgb, var(--coral) 28%, transparent); }
        .sc-ta { width: 100%; box-sizing: border-box; margin-top: 10px; padding: 11px 14px; border-radius: 14px; border: 1.5px solid transparent; background-color: #f4f4f5; font-size: 13.5px; line-height: 1.5; resize: vertical; outline: none; font-family: inherit; color: var(--ink); transition: background-color .15s, border-color .15s, box-shadow .15s; }
        .sc-ta:focus { background-color: #fff; border-color: #d4d4d8 !important; box-shadow: 0 0 0 3px color-mix(in srgb, var(--coral) 16%, transparent); }
        @media (max-width: 560px) { .sc { padding: 16px 14px 36px; } .sc h1 { font-size: 25px; } .sc-grid { grid-template-columns: 1fr; } }
      `}</style>

      <Link href="/admin/social" className="sc-back">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m15 18-6-6 6-6" /></svg>
        Social engagement
      </Link>
      <h1>Comment categories</h1>
      <p className="sc-lead">
        Colvy sorts each comment into a category. For each one, choose whether AI replies publicly or messages the person privately, and tell it how.
      </p>

      <div className="sc-grid">
        {cats.map(cat => (
          <div key={cat.id} className="sc-card">
            <div className="sc-top">
              <b>{cat.name}</b>
              <span className={'sc-count' + (cat.count ? ' on' : '')}>{cat.count}</span>
            </div>
            <p className="sc-state">
              {savingId === cat.id ? 'Saving…' : savedId === cat.id ? <span style={{ color: '#16a34a', fontWeight: 600 }}>Saved</span> : `${cat.count} comment${cat.count === 1 ? '' : 's'}`}
            </p>

            {/* Reply to comments */}
            <div className="sc-opt">
              <div className="sc-opt-row">
                <div>
                  <b>Reply to comments</b>
                  <small>AI replies publicly to answer questions, handle concerns and keep things positive.</small>
                </div>
                {toggle(cat.reply_ai_enabled, () => save(cat, { reply_ai_enabled: !cat.reply_ai_enabled }), 'AI replies')}
              </div>
              {cat.reply_ai_enabled && (
                <textarea className="sc-ta" rows={3} placeholder="How should AI reply to these comments? Tone, key info, things to avoid."
                  value={cat.reply_guidelines || ''}
                  onChange={e => patch(cat.id, { reply_guidelines: e.target.value })}
                  onBlur={e => save(cat, { reply_guidelines: e.target.value })} />
              )}
            </div>

            {/* DM Users */}
            <div className="sc-opt">
              <div className="sc-opt-row">
                <div>
                  <b>Message the commenter</b>
                  <small>AI sends the person a private message, following the guidelines you give it.</small>
                </div>
                {toggle(cat.dm_enabled, () => save(cat, { dm_enabled: !cat.dm_enabled }), 'AI private messages')}
              </div>
              {cat.dm_enabled && (
                <textarea className="sc-ta" rows={3} placeholder="How should AI message these people? What to offer, tone, when to hand over to you."
                  value={cat.dm_guidelines || ''}
                  onChange={e => patch(cat.id, { dm_guidelines: e.target.value })}
                  onBlur={e => save(cat, { dm_guidelines: e.target.value })} />
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
