import type { Metadata } from 'next'
import Client from './Client'
import { pageMeta } from '@/lib/seo'

export const metadata: Metadata = pageMeta({
  title: 'Channels: SMS, Calls, Instagram, Messenger, Email & Chat',
  description: 'Connect SMS and calls on Australian numbers, Instagram, Facebook Messenger, email, live chat, forms and Google reviews to one shared inbox with Colvy.',
  path: 'channels',
})

export default function Page() {
  return <Client />
}
