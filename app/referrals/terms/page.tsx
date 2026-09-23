import type { Metadata } from 'next'
import Client from './Client'

export const metadata: Metadata = {
  title: 'Referral Program Terms',
  description: 'The rules of the Colvy referral program — how referrals qualify, when the $100 credit is earned, and the fine print.',
  alternates: { canonical: '/referrals/terms' },
}

export default function Page() {
  return <Client />
}
