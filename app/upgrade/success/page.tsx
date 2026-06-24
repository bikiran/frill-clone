'use client'
import { useEffect, useState, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'

function SuccessContent() {
  const searchParams = useSearchParams()
  const sessionId = searchParams?.get('session_id')

  return (
    <div className="min-h-screen flex items-center justify-center px-6" style={{ background: 'var(--canvas)' }}>
      <div className="text-center max-w-md">
        <div className="w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-6" style={{ background: 'var(--peach)' }}>
          <span className="text-4xl">🎉</span>
        </div>
        <h1 className="text-3xl font-black mb-3" style={{ color: 'var(--ink)' }}>You're on Pro!</h1>
        <p className="mb-8" style={{ color: 'var(--slate)' }}>
          Your subscription is now active. All Pro features are unlocked.
        </p>
        <div className="space-y-3">
          <Link href="/admin" className="block w-full py-3 rounded-xl font-semibold text-white" style={{ background: 'var(--coral)' }}>
            Go to Dashboard →
          </Link>
          <Link href="/admin/settings" className="block w-full py-3 rounded-xl font-semibold border" style={{ borderColor: 'var(--border)', color: 'var(--ink)' }}>
            Configure Settings
          </Link>
        </div>
      </div>
    </div>
  )
}

export default function UpgradeSuccessPage() {
  return <Suspense><SuccessContent /></Suspense>
}
