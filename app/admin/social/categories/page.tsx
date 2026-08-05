'use client'
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
      const res = await fetch(`/api/social/categories?companyId=${companyId}`)
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
      await fetch('/api/social/categories', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ companyId, id: cat.id, ...changes }),
      })
      setSavedId(cat.id)
      setTimeout(() => setSavedId(s => s === cat.id ? null : s), 2000)
    } catch {} finally { setSavingId(s => s === cat.id ? null : s) }
  }

  if (loading || loadingData) return <div style={{ padding: 40, color: 'var(--slate)' }}>Loading categories…</div>

  return (
    <div style={{ padding: '28px 32px', maxWidth: 1200, margin: '0 auto' }}>
      <style>{`
        .sc-toggle { position: relative; width: 40px; height: 23px; border-radius: 999px; border: none; cursor: pointer; transition: background .18s; flex-shrink: 0; }
        .sc-toggle .knob { position: absolute; top: 2.5px; left: 2.5px; width: 18px; height: 18px; border-radius: 50%; background: #fff; transition: transform .18s; box-shadow: 0 1px 3px rgba(0,0,0,.25); }
        .sc-ta { width: 100%; box-sizing: border-box; margin-top: 8px; padding: 10px 12px; border-radius: 10px; border: 1px solid var(--border); font-size: 12.5px; line-height: 1.5; resize: vertical; outline: none; font-family: inherit; color: var(--ink); }
        .sc-ta:focus { border-color: var(--coral); }
        .sc-card { transition: box-shadow .16s ease, transform .16s ease; }
        .sc-card:hover { box-shadow: 0 8px 24px rgba(0,0,0,0.07); }
      `}</style>

      {/* Breadcrumb */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, color: 'var(--slate)', marginBottom: 10 }}>
        <Link href="/admin/social" style={{ color: 'var(--coral)', textDecoration: 'none', fontWeight: 600 }}>Social Engagement Manager</Link>
        <span>/</span>
        <span>Categories</span>
      </div>

      <h1 style={{ fontSize: 24, fontWeight: 800, color: 'var(--ink)', margin: '0 0 6px' }}>Social Comments Category</h1>
      <p style={{ margin: '0 0 18px', fontSize: 13.5, color: 'var(--slate)', lineHeight: 1.55, maxWidth: 760 }}>
        Manage and organize categories for your social comments to streamline your engagement workflow. Easily filter,
        group, and analyze comments by category to enhance your social media management experience.
      </p>

      <Link href="/admin/social" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 700, color: 'var(--ink)', textDecoration: 'none', border: '1px solid var(--border)', borderRadius: 10, padding: '8px 14px', marginBottom: 22 }}>
        ← Back to Social Engagement Manager
      </Link>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: 16 }}>
        {cats.map(cat => (
          <div key={cat.id} className="sc-card" style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 16, padding: '16px 18px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 4 }}>
              <span style={{ fontWeight: 800, fontSize: 15, color: 'var(--ink)' }}>{cat.name}</span>
              <span style={{ fontSize: 12, fontWeight: 800, padding: '2px 10px', borderRadius: 999, background: cat.count ? 'var(--peach)' : '#f3f4f6', color: cat.count ? 'var(--coral)' : 'var(--slate)' }}>{cat.count}</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--slate)', marginBottom: 12 }}>
              {savingId === cat.id ? 'Saving…' : savedId === cat.id ? <span style={{ color: '#16a34a', fontWeight: 700 }}>Saved ✓</span> : `${cat.count} comment${cat.count === 1 ? '' : 's'}`}
            </div>

            {/* Reply to comments */}
            <div style={{ borderTop: '1px solid var(--border)', paddingTop: 12 }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
                <div>
                  <p style={{ margin: '0 0 3px', fontSize: 13, fontWeight: 800, color: 'var(--ink)' }}>Reply to comments</p>
                  <p style={{ margin: 0, fontSize: 11.5, color: 'var(--slate)', lineHeight: 1.45 }}>
                    Use AI-powered responses to engage with customers, address concerns, and foster positive interactions.
                  </p>
                </div>
                <button className="sc-toggle" style={{ background: cat.reply_ai_enabled ? 'var(--coral)' : '#d1d5db' }}
                  onClick={() => save(cat, { reply_ai_enabled: !cat.reply_ai_enabled })}
                  aria-label="Toggle AI replies">
                  <span className="knob" style={{ transform: cat.reply_ai_enabled ? 'translateX(17px)' : 'none' }} />
                </button>
              </div>
              {cat.reply_ai_enabled && (
                <textarea className="sc-ta" rows={3} placeholder="How should AI reply to these comments? (tone, key info, do's & don'ts)"
                  value={cat.reply_guidelines || ''}
                  onChange={e => patch(cat.id, { reply_guidelines: e.target.value })}
                  onBlur={e => save(cat, { reply_guidelines: e.target.value })} />
              )}
            </div>

            {/* DM Users */}
            <div style={{ borderTop: '1px solid var(--border)', paddingTop: 12, marginTop: 12 }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
                <div>
                  <p style={{ margin: '0 0 3px', fontSize: 13, fontWeight: 800, color: 'var(--ink)' }}>DM Users</p>
                  <p style={{ margin: 0, fontSize: 11.5, color: 'var(--slate)', lineHeight: 1.45 }}>
                    Empower AI to DM users by providing detailed response guidelines — enhance engagement with intelligent, automated interactions.
                  </p>
                </div>
                <button className="sc-toggle" style={{ background: cat.dm_enabled ? 'var(--coral)' : '#d1d5db' }}
                  onClick={() => save(cat, { dm_enabled: !cat.dm_enabled })}
                  aria-label="Toggle AI DMs">
                  <span className="knob" style={{ transform: cat.dm_enabled ? 'translateX(17px)' : 'none' }} />
                </button>
              </div>
              {cat.dm_enabled && (
                <textarea className="sc-ta" rows={3} placeholder="How should AI DM these users? (what to offer, tone, when to escalate)"
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
