import type { Metadata } from 'next'
import Client from './Client'

export const metadata: Metadata = {
  title: 'Who Colvy is for',
  description: 'See the real workflow Colvy runs for ecommerce stores, multi-location retailers, service businesses, restaurants and real estate agencies.',
  alternates: { canonical: '/for' },
}

export default function Page() {
  return <Client />
}
