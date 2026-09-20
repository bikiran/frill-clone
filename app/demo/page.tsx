import type { Metadata } from 'next'
import Client from './Client'

export const metadata: Metadata = {
  title: "Book a Demo",
  description: "See Colvy in action — book a personalised demo of the omnichannel inbox, CRM and feedback platform.",
  alternates: { canonical: "/demo" },
}

export default function Page() {
  return <Client />
}
