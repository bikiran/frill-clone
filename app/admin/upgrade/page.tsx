'use client'
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

export default function UpgradePage() {
  const router = useRouter()
  useEffect(() => { router.replace('/admin/billing') }, [])
  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="w-8 h-8 rounded-full border-2 animate-spin" style={{ borderColor: 'var(--coral)', borderTopColor: 'transparent' }} />
    </div>
  )
}
