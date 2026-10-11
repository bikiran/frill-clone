'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

// Terminology lives in Settings now (per workspace, with a live preview). This
// old page wrote to a single table shared by every workspace; it just forwards.
export default function TerminologyRedirect() {
  const router = useRouter()
  useEffect(() => { router.replace('/admin/settings#terminology') }, [router])
  return (
    <div className="p-8 flex items-center justify-center min-h-64">
      <div className="w-8 h-8 rounded-full border-2 animate-spin" style={{ borderColor: 'var(--coral)', borderTopColor: 'transparent' }} />
    </div>
  )
}
