'use client'

import CustomerTimeline from '@/components/CustomerTimeline'

// The customer timeline as a slide-over (the inbox's "Customer timeline"
// button). The timeline itself — every channel, orders, bookings, calls,
// payments, tasks and notes — lives in components/CustomerTimeline.tsx.
export default function ContactTimeline({ contactId, contactName, onClose, onOpenConversation }: {
  contactId: string
  contactName?: string
  onClose: () => void
  onOpenConversation?: (conversationId: string) => void
}) {
  return (
    <CustomerTimeline mode="drawer" contactId={contactId} contactName={contactName} onClose={onClose}
      profileHref={`/admin/customers/profile?id=${contactId}`} onOpenConversation={onOpenConversation} />
  )
}
