import type { Metadata } from 'next'
import Client from './Client'
import { pageMeta } from '@/lib/seo'

export const metadata: Metadata = pageMeta({
  title: 'AI Assistant for Customer Messages',
  description: 'Colvy’s AI assistant drafts replies from your own knowledge, summarises conversations and takes actions like payment links and bookings, so your team replies faster.',
  path: 'ai-assistant',
})

export default function Page() {
  return <Client />
}
