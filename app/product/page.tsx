import type { Metadata } from 'next'
import Client from './Client'
import { pageMeta } from '@/lib/seo'

export const metadata: Metadata = pageMeta({
  title: 'Features: Shared Inbox, Business Phone, CRM, AI Agents & Feedback',
  description: 'Everything in Colvy: a shared inbox for every channel, a CRM, business phone and SMS, store orders and payments, AI agents, and feedback boards, roadmaps and changelogs.',
  path: 'product',
})

export default function Page() {
  return <Client />
}
