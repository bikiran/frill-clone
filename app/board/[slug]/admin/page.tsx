'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { getCompanyBySlug } from '@/lib/board'
import Link from 'next/link'

// Board admin redirects to the main /admin with company context
// This page just verifies ownership then sends to /admin
export default function BoardAdminRedirect() {
  const params = useParams()
  const slug = params?.slug as string
  const [status, setStatus] = useState('Verifying...')

  useEffect(() => {
    if (!slug) return
    const check = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.user) {
        window.location.href = `/signin`
        return
      }
      const company = await getCompanyBySlug(slug)
      if (!company) {
        setStatus('Board not found')
        return
      }
      if (company.owner_id !== session.user.id) {
        setStatus('Access denied — you are not the owner of this board')
        return
      }
      // Owner confirmed — go to admin
      window.location.href = '/admin'
    }
    check()
  }, [slug])

  return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--canvas)' }}>
      <div className="text-center">
        <div className="w-8 h-8 rounded-full border-2 animate-spin mx-auto mb-3"
          style={{ borderColor: 'var(--coral)', borderTopColor: 'transparent' }} />
        <p style={{ color: 'var(--slate)' }}>{status}</p>
        {status.includes('denied') && (
          <Link href="/" className="mt-4 inline-block text-sm" style={{ color: 'var(--coral)' }}>← Back to board</Link>
        )}
      </div>
    </div>
  )
}
