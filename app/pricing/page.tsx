import type { Metadata } from 'next'
import Client from './Client'

export const metadata: Metadata = {
  title: "Pricing",
  description: "Simple, transparent pricing for Colvy — the omnichannel inbox, CRM and customer-feedback platform. Start free.",
  alternates: { canonical: "/pricing" },
}

export default function Page() {
  return <Client />
}
