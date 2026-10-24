import type { Metadata } from 'next'
import Client from './Client'
import { pageMeta } from '@/lib/seo'

export const metadata: Metadata = pageMeta({
  title: 'Changelog',
  description: 'The latest features, fixes and improvements shipped in Colvy.',
  path: 'changelog',
})

export default function Page() {
  return <Client />
}
