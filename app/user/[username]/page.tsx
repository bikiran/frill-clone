'use client'

import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { getRelativeTime } from '@/lib/time-utils'

type ActivityItem = {
  id: string
  type: 'idea' | 'announcement' | 'help'
  title: string
  created_at: string
  status?: string
  votes?: number
}

export default function UserProfilePage() {
  const params = useParams()
  const username = (params.username as string)?.toLowerCase()
  const company_slug = (params.board as string)?.toLowerCase()

  const [member, setMember] = useState<any>(null)
  const [company, setCompany] = useState<any>(null)
  const [ideas, setIdeas] = useState<any[]>([])
  const [announcements, setAnnouncements] = useState<any[]>([])
  const [helpArticles, setHelpArticles] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)

  useEffect(() => {
    load()
  }, [username, company_slug])

  const load = async () => {
    setLoading(true)
    setNotFound(false)

    try {
      // Fetch company by slug from board URL context
      let companyId: string | null = null
      if (typeof window !== 'undefined') {
        const h = window.location.hostname
        if (h.endsWith('.colvy.com') && h !== 'colvy.com' && h !== 'www.colvy.com' && !h.includes('localhost')) {
          const slug = h.split('.')[0]
          const { data: co } = await (supabase as any)
            .from('companies')
            .select('id, name, accent_color')
            .eq('slug', slug)
            .maybeSingle()
          if (co) {
            setCompany(co)
            companyId = co.id
          }
        }
      }

      if (!companyId || !username) {
        setNotFound(true)
        setLoading(false)
        return
      }

      // Fetch team member by username
      const { data: tm } = await (supabase as any)
        .from('team_members')
        .select('email, username, role, created_at')
        .eq('username', username)
        .eq('company_id', companyId)
        .maybeSingle()

      if (!tm) {
        setNotFound(true)
        setLoading(false)
        return
      }

      setMember(tm)

      // Fetch user's public ideas (non-private)
      const { data: userIdeas } = await (supabase as any)
        .from('ideas')
        .select('id, title, created_at, status, votes')
        .eq('company_id', companyId)
        .eq('created_by_name', tm.email)
        .eq('is_private', false)
        .order('created_at', { ascending: false })
        .limit(20)

      setIdeas(userIdeas || [])

      // Fetch user's public announcements
      const { data: userAnnouncements } = await (supabase as any)
        .from('announcements')
        .select('id, title, created_at, status')
        .eq('company_id', companyId)
        .eq('created_by_name', tm.email)
        .order('created_at', { ascending: false })
        .limit(20)

      setAnnouncements(userAnnouncements || [])

      // Fetch user's help articles (if they can create them)
      if (['editor', 'admin'].includes(tm.role)) {
        const { data: userHelp } = await (supabase as any)
          .from('help_articles')
          .select('id, title, created_at')
          .eq('company_id', companyId)
          .eq('created_by', tm.email)
          .order('created_at', { ascending: false })
          .limit(20)

        setHelpArticles(userHelp || [])
      }
    } catch (e) {
      console.error('Profile load error:', e)
      setNotFound(true)
    }

    setLoading(false)
  }

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#fff' }}>
        <div style={{ width: 32, height: 32, border: '3px solid #f0f0f0', borderTopColor: '#ff7a6b', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    )
  }

  if (notFound) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, background: '#fff' }}>
        <div style={{ maxWidth: 420, textAlign: 'center' }}>
          <h1 style={{ fontSize: 20, fontWeight: 800, color: '#0d0d0d', marginBottom: 8 }}>User not found</h1>
          <p style={{ fontSize: 14, color: '#6b6b70', marginBottom: 24 }}>This user doesn't exist on this board.</p>
          <Link href="/" style={{ display: 'inline-block', padding: '10px 20px', borderRadius: 8, background: '#ff7a6b', color: 'white', textDecoration: 'none', fontSize: 14, fontWeight: 600 }}>
            Back to board
          </Link>
        </div>
      </div>
    )
  }

  const accentColor = company?.accent_color || '#ff7a6b'
  const totalContributions = ideas.length + announcements.length + helpArticles.length
  const initials = (member?.email || 'U')[0].toUpperCase()

  return (
    <div style={{ minHeight: '100vh', background: '#fafafa', padding: '40px 24px' }}>
      <div style={{ maxWidth: 720, margin: '0 auto' }}>
        {/* Profile header */}
        <div style={{ background: '#fff', borderRadius: 20, padding: '40px 24px', marginBottom: 24, textAlign: 'center', border: '1px solid #f0f0f0' }}>
          <div style={{
            width: 80,
            height: 80,
            borderRadius: '50%',
            background: accentColor,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'white',
            fontSize: 32,
            fontWeight: 800,
            margin: '0 auto 16px'
          }}>
            {initials}
          </div>

          <h1 style={{ fontSize: 24, fontWeight: 800, color: '#0d0d0d', marginBottom: 4 }}>@{member?.username}</h1>
          <p style={{ fontSize: 14, color: '#6b6b70', marginBottom: 16 }}>{member?.email}</p>

          <div style={{ display: 'flex', justifyContent: 'center', gap: 32, marginTop: 24, paddingTop: 24, borderTop: '1px solid #f0f0f0' }}>
            <div>
              <p style={{ fontSize: 24, fontWeight: 800, color: accentColor }}>{ideas.length}</p>
              <p style={{ fontSize: 12, color: '#6b6b70' }}>Ideas</p>
            </div>
            <div>
              <p style={{ fontSize: 24, fontWeight: 800, color: accentColor }}>{announcements.length}</p>
              <p style={{ fontSize: 12, color: '#6b6b70' }}>Announcements</p>
            </div>
            {helpArticles.length > 0 && (
              <div>
                <p style={{ fontSize: 24, fontWeight: 800, color: accentColor }}>{helpArticles.length}</p>
                <p style={{ fontSize: 12, color: '#6b6b70' }}>Help Articles</p>
              </div>
            )}
          </div>

          <p style={{ fontSize: 12, color: '#9ca3af', marginTop: 16 }}>Joined {new Date(member?.created_at).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</p>
        </div>

        {/* Ideas section */}
        {ideas.length > 0 && (
          <div style={{ marginBottom: 24 }}>
            <h2 style={{ fontSize: 18, fontWeight: 800, color: '#0d0d0d', marginBottom: 16 }}>Ideas</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {ideas.map(idea => (
                <div key={idea.id} style={{ background: '#fff', borderRadius: 12, padding: 16, border: '1px solid #f0f0f0', cursor: 'pointer', transition: 'all 0.2s', hover: { borderColor: accentColor } }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', gap: 12 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ fontSize: 14, fontWeight: 600, color: '#0d0d0d', marginBottom: 4 }}>{idea.title}</p>
                      <div style={{ display: 'flex', gap: 8, fontSize: 12, color: '#6b6b70' }}>
                        <span>{getRelativeTime(idea.created_at)}</span>
                        <span>•</span>
                        <span>{idea.votes || 0} votes</span>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Announcements section */}
        {announcements.length > 0 && (
          <div style={{ marginBottom: 24 }}>
            <h2 style={{ fontSize: 18, fontWeight: 800, color: '#0d0d0d', marginBottom: 16 }}>Announcements</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {announcements.map(ann => (
                <div key={ann.id} style={{ background: '#fff', borderRadius: 12, padding: 16, border: '1px solid #f0f0f0' }}>
                  <p style={{ fontSize: 14, fontWeight: 600, color: '#0d0d0d', marginBottom: 4 }}>{ann.title}</p>
                  <p style={{ fontSize: 12, color: '#6b6b70' }}>{getRelativeTime(ann.created_at)}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Help articles section */}
        {helpArticles.length > 0 && (
          <div style={{ marginBottom: 24 }}>
            <h2 style={{ fontSize: 18, fontWeight: 800, color: '#0d0d0d', marginBottom: 16 }}>Help Articles</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {helpArticles.map(article => (
                <div key={article.id} style={{ background: '#fff', borderRadius: 12, padding: 16, border: '1px solid #f0f0f0' }}>
                  <p style={{ fontSize: 14, fontWeight: 600, color: '#0d0d0d', marginBottom: 4 }}>{article.title}</p>
                  <p style={{ fontSize: 12, color: '#6b6b70' }}>{getRelativeTime(article.created_at)}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {totalContributions === 0 && (
          <div style={{ background: '#fff', borderRadius: 12, padding: 32, textAlign: 'center', border: '1px solid #f0f0f0' }}>
            <p style={{ fontSize: 14, color: '#6b6b70' }}>No public contributions yet.</p>
          </div>
        )}
      </div>
    </div>
  )
}
