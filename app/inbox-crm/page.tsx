import type { Metadata } from 'next'
import Client from './Client'

export const metadata: Metadata = {
  title: "Inbox & CRM",
  description: "Colvy’s shared inbox and lightweight CRM bring Messenger, Instagram, WhatsApp, SMS, email and live chat — plus every customer’s history — into one place.",
  alternates: { canonical: "/inbox-crm" },
}

export default function Page() {
  return <Client />
}
