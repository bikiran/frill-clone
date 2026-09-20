import type { Metadata } from 'next'
import Client from './Client'

export const metadata: Metadata = {
  title: "Business Phone & Calls",
  description: "Make and take business calls in Colvy, with click-to-dial, notes and recordings tied to every customer.",
  alternates: { canonical: "/phones" },
}

export default function Page() {
  return <Client />
}
