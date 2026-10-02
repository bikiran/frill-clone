import type { Metadata } from 'next'
import Client from './Client'

export const metadata: Metadata = {
  title: "Industries",
  description: "Colvy for SaaS, agencies, ecommerce, hospitality, real estate and healthcare.",
  alternates: { canonical: "/industries" },
}

export default function Page() {
  return <Client />
}
