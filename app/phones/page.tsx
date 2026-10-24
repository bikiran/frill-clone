import type { Metadata } from 'next'
import Client from './Client'
import { pageMeta } from '@/lib/seo'

export const metadata: Metadata = pageMeta({
  title: 'Business Phone System & Call Inbox',
  description: 'Make and take business calls in your browser or the Colvy app on Australian numbers, with ring groups, voicemail, recordings and transcripts on every customer record.',
  path: 'phones',
})

export default function Page() {
  return <Client />
}
