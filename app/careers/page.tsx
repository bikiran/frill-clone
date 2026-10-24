import type { Metadata } from 'next'
import Client from './Client'
import { pageMeta } from '@/lib/seo'

export const metadata: Metadata = pageMeta({
  title: 'Careers',
  description: 'Join the team building Colvy, the all-in-one customer platform.',
  path: 'careers',
})

export default function Page() {
  return <Client />
}
