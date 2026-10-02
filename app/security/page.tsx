import type { Metadata } from 'next'
import Client from './Client'

export const metadata: Metadata = {
  title: "Security",
  description: "How Colvy protects your data — encryption, access controls and privacy by design.",
  alternates: { canonical: "/security" },
}

export default function Page() {
  return <Client />
}
