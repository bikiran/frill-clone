'use client'

import { useParams } from 'next/navigation'
import ManageBooking from '@/components/booking/ManageBooking'

// A customer's booking, from the link in their confirmation.
export default function BookingManagePage() {
  const params = useParams()
  return <ManageBooking token={String(params?.token || '')} />
}
