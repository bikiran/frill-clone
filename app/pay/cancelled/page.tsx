'use client'

import { Suspense } from 'react'
import PayResult from '@/components/PayResult'

export default function PayCancelled() {
  return <Suspense fallback={null}><PayResult kind="cancelled" /></Suspense>
}
