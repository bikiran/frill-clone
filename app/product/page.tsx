import type { Metadata } from 'next'
import Client from './Client'

export const metadata: Metadata = {
  title: "Features: Shared Inbox, CRM, Phone, AI Agents & Feedback",
  description: "Everything in Colvy: a shared inbox for every channel, a CRM, business phone and SMS, store orders and payments, AI agents, and feedback boards, roadmaps and changelogs.",
  alternates: { canonical: "/product" },
}

export default function Page() {
  return <Client />
}
