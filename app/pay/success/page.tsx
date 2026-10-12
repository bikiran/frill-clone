'use client'

import { Suspense } from 'react'
import PayResult from '@/components/PayResult'

// After a pay link: branded with the business the customer paid.
export default function PaySuccess() {
  return <Suspense fallback={null}><PayResult kind="success" /></Suspense>
}
