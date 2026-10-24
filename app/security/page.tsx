import type { Metadata } from 'next'
import Client from './Client'
import { pageMeta } from '@/lib/seo'

export const metadata: Metadata = pageMeta({
  title: 'Security',
  description: 'How Colvy protects your data — encryption, access controls and privacy by design.',
  path: 'security',
})

export default function Page() {
  return <Client />
}
