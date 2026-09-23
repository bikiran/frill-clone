import type { Metadata } from 'next'
import Client from './Client'

export const metadata: Metadata = {
  title: 'Referrals — earn $100 for every business you refer',
  description: 'Refer a business to Colvy. When they subscribe and pay their first month, you get $100 account credit — every time, no cap.',
  alternates: { canonical: '/referrals' },
}

export default function Page() {
  return <Client />
}
