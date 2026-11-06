'use client'

import { useParams } from 'next/navigation'
import PublicReceipt from '@/components/portal/PublicReceipt'

// A receipt / tax invoice the team sent a customer (Send receipt). The link is
// signed (lib/portal/receipt-link) and opens just this one receipt.
export default function ReceiptPage() {
  const params = useParams()
  return <PublicReceipt token={String(params?.token || '')} />
}
