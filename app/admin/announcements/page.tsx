'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import Link from 'next/link'

export default function AnnouncementsAdmin() {
  const [user, setUser] = useState<any>(null)
  const [announcements, setAnnouncements] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then((data: any) => {
      const u = data.data?.session?.user
      if (u?.email !== 'bishalstha76@gmail.com') {
        window.location.href = '/'
        return
      }
      setUser(u)
      fetchAnnouncements()
    })
  }, [])

  const fetchAnnouncements = async () => {
    const { data } = await (supabase as any).from('announcements').select('*').order('created_at', { ascending: false })
    setAnnouncements(data || [])
    setLoading(false)
  }

  if (!user) return <div className="p-8">Loading...</div>

  return (
    <div className="max-w-6xl mx-auto px-6 py-8">
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-3xl font-bold" style={{ color: 'var(--ink)' }}>Announcements</h1>
        <Link href="/admin/announcements/new" className="px-4 py-2.5 rounded-lg text-sm font-semibold text-white" style={{ background: 'var(--coral)' }}>
          + New
        </Link>
      </div>

      {loading ? (
        <p>Loading...</p>
      ) : announcements.length === 0 ? (
        <p style={{ color: 'var(--slate)' }}>No announcements yet</p>
      ) : (
        <div className="space-y-3">
          {announcements.map((a: any) => (
            <div key={a.id} className="bg-white rounded-2xl border p-6 flex items-center justify-between" style={{ borderColor: 'var(--border)' }}>
              <div>
                <h3 className="font-bold" style={{ color: 'var(--ink)' }}>{a.title}</h3>
                <p className="text-sm mt-1" style={{ color: 'var(--slate)' }}>{new Date(a.created_at).toLocaleDateString()}</p>
              </div>
              <Link href={`/admin/announcements/new?edit=${a.id}`} className="px-4 py-2 rounded-lg border text-sm" style={{ borderColor: 'var(--border)' }}>
                Edit
              </Link>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
