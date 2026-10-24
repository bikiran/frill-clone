import type { Metadata } from 'next'
import Client from './Client'
import { pageMeta } from '@/lib/seo'

export const metadata: Metadata = pageMeta({
  title: 'Shared Inbox & CRM for Small Business',
  description: 'Colvy’s shared inbox and simple CRM bring SMS, calls, Instagram, Messenger, email and live chat, plus every customer’s orders and history, into one place.',
  path: 'inbox-crm',
})

export default function Page() {
  return <Client />
}
