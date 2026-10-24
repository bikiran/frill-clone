import type { Metadata } from 'next'
import Client from './Client'
import { pageMeta } from '@/lib/seo'

export const metadata: Metadata = pageMeta({
  title: 'Customer Messaging Software by Industry',
  description: 'Colvy for SaaS, agencies, hospitality and healthcare: one shared inbox, CRM, bookings and reviews shaped around how each industry works.',
  path: 'industries',
})

export default function Page() {
  return <Client />
}
