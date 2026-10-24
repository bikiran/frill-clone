import type { Metadata } from 'next'
import Client from './Client'
import { pageMeta } from '@/lib/seo'

export const metadata: Metadata = pageMeta({
  title: 'Solutions for Support, Sales, Reviews & Bookings',
  description: 'How small businesses use Colvy for customer support, sales follow-ups, SMS marketing, Google reviews, online bookings, payments and customer feedback.',
  path: 'solutions',
})

export default function Page() {
  return <Client />
}
