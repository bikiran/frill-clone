import type { Metadata } from 'next'
import Client from './Client'

export const metadata: Metadata = {
  title: "Help Center",
  description: "Guides and answers for getting the most out of Colvy.",
  alternates: { canonical: "/help" },
}

export default function Page() {
  return <Client />
}
