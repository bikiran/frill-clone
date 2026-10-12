'use client'

import { Suspense } from 'react'
import PayResult from '@/components/PayResult'

// After a customer saves their card (Stripe setup mode) from a "Save card" link.
export default function PayCardSaved() {
  return <Suspense fallback={null}><PayResult kind="card-saved" /></Suspense>
}
