import type { Metadata } from 'next'
import Client from './Client'
import { pageMeta } from '@/lib/seo'

export const metadata: Metadata = pageMeta({
  title: 'Who Colvy is for',
  description: 'See the real workflow Colvy runs for ecommerce stores, multi-location retailers, service businesses, restaurants and real estate agencies.',
  path: 'for',
})

export default function Page() {
  return <Client />
}
