import type { Metadata } from 'next'
import Client from './Client'

export const metadata: Metadata = {
  title: "Compare Colvy",
  description: "See how Colvy compares to other inbox, help desk and customer-feedback tools.",
  alternates: { canonical: "/compare" },
}

export default function Page() {
  return <Client />
}
