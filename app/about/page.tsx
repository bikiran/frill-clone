import type { Metadata } from 'next'
import Client from './Client'
import { pageMeta } from '@/lib/seo'

export const metadata: Metadata = pageMeta({
  title: 'About Colvy',
  description: 'Colvy is an Australian customer communication platform helping small businesses answer every customer across SMS, calls, social, email and chat from one inbox.',
  path: 'about',
})

export default function Page() {
  return <Client />
}
