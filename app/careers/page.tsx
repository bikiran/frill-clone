import type { Metadata } from 'next'
import Client from './Client'

export const metadata: Metadata = {
  title: "Careers",
  description: "Join the team building Colvy, the all-in-one customer platform.",
  alternates: { canonical: "/careers" },
}

export default function Page() {
  return <Client />
}
