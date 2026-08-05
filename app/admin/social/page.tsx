'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { useCompanyUser } from '../crm-settings/_shared'

export default function SocialEngagementPage() {
  const { companyId, loading } = useCompanyUser()
  const [connected, setConnected] = useState<{ page_name?: string } | null>(null)
  const [checked, setChecked] = useState(false)
  const [stats, setStats] = useState({ posts: 0, comments: 0, replied: 0, unreplied: 0 })

  useEffect(() => {
    if (!companyId) return
    let active = true
    ;(async () => {
      const [{ data: chans }, posts, comments, replied] = await Promise.all([
        (supabase as any).from('meta_channels').select('page_name, platform').eq('company_id', companyId).eq('platform', 'facebook').eq('is_active', true).limit(1),
        (supabase as any).from('social_posts').select('*', { count: 'exact', head: true }).eq('company_id', companyId),
        (supabase as any).from('social_comments').select('*', { count: 'exact', head: true }).eq('company_id', companyId).eq('is_archived', false),
        (supabase as any).from('social_comments').select('*', { count: 'exact', head: true }).eq('company_id', companyId).eq('is_archived', false).eq('is_replied', true),
      ])
      if (!active) return
      setConnected(chans?.[0] || null)
      const c = comments.count || 0, r = replied.count || 0
      setStats({ posts: posts.count || 0, comments: c, replied: r, unreplied: Math.max(0, c - r) })
      setChecked(true)
    })()
    return () => { active = false }
  }, [companyId])

  if (loading) return <div style={{ padding: 40, color: 'var(--slate)' }}>Loading…</div>

  const Chip = ({ label, value, tone }: { label: string; value: number; tone: string }) => (
    <div style={{ border: '1px solid var(--border)', borderRadius: 12, padding: '10px 16px', background: '#fff', display: 'flex', alignItems: 'center', gap: 10 }}>
      <span style={{ fontSize: 12.5, color: 'var(--slate)', fontWeight: 600 }}>{label}</span>
      <span style={{ fontSize: 15, fontWeight: 800, color: tone }}>{value}</span>
    </div>
  )

  return (
    <div style={{ padding: '28px 32px', maxWidth: 1400, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 18 }}>
        <h1 style={{ fontSize: 24, fontWeight: 800, color: 'var(--ink)', margin: 0 }}>Social Engagement Manager</h1>
        <Link href="/admin/social/categories" style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '10px 16px', borderRadius: 12, border: '1px solid var(--border)', background: '#fff', color: 'var(--ink)', fontWeight: 700, fontSize: 13, textDecoration: 'none' }}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></svg>
          Comment Categories
        </Link>
      </div>

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 20 }}>
        <Chip label="Total Posts" value={stats.posts} tone="var(--ink)" />
        <Chip label="Total Comments" value={stats.comments} tone="var(--ink)" />
        <Chip label="Replied" value={stats.replied} tone="#16a34a" />
        <Chip label="Unreplied" value={stats.unreplied} tone={stats.unreplied ? '#dc2626' : 'var(--ink)'} />
      </div>

      {/* Connection state */}
      {!checked ? null : !connected ? (
        <div style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 18, padding: '40px 28px', textAlign: 'center' }}>
          <div style={{ width: 64, height: 64, margin: '0 auto 16px', borderRadius: 18, background: 'var(--peach)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="var(--coral)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>
          </div>
          <p style={{ fontSize: 17, fontWeight: 800, color: 'var(--ink)', margin: '0 0 6px' }}>Connect your Facebook page to access this feature</p>
          <p style={{ fontSize: 13.5, color: 'var(--slate)', margin: '0 0 20px', lineHeight: 1.55, maxWidth: 560, marginInline: 'auto' }}>
            Colvy unifies comments from Facebook and Instagram into one dashboard so you can reply to everything in one place —
            no switching between apps. Connect a page to start bringing comments in.
          </p>
          <Link href="/admin/integrations" style={{ display: 'inline-block', padding: '11px 22px', borderRadius: 12, background: 'var(--coral)', color: '#fff', border: 'none', fontSize: 13.5, fontWeight: 700, textDecoration: 'none' }}>
            Connect Facebook
          </Link>
        </div>
      ) : (
        <div style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 18, padding: '32px 28px', textAlign: 'center' }}>
          <p style={{ fontSize: 13, color: '#16a34a', fontWeight: 700, margin: '0 0 8px' }}>
            ● Connected · {connected.page_name || 'Facebook page'}
          </p>
          <p style={{ fontSize: 16, fontWeight: 800, color: 'var(--ink)', margin: '0 0 6px' }}>
            {stats.comments > 0 ? 'Your comments dashboard' : 'No comments synced yet'}
          </p>
          <p style={{ fontSize: 13.5, color: 'var(--slate)', margin: '0 0 18px', lineHeight: 1.55, maxWidth: 620, marginInline: 'auto' }}>
            Your page is connected. Comment sync and the AI-classified comment feed (risk level, category, sentiment, reply &amp; DM)
            arrive in the next update — meanwhile, set up how AI should handle each category so it's ready to go.
          </p>
          <Link href="/admin/social/categories" style={{ display: 'inline-block', padding: '11px 22px', borderRadius: 12, background: 'var(--coral)', color: '#fff', fontSize: 13.5, fontWeight: 700, textDecoration: 'none' }}>
            Set up comment categories
          </Link>
        </div>
      )}
    </div>
  )
}
