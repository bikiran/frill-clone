import type { Metadata } from 'next'
import Client from './Client'

export const metadata: Metadata = {
  title: "About",
  description: "The team and story behind Colvy — the all-in-one customer platform.",
  alternates: { canonical: "/about" },
}

export default function Page() {
  return <Client />
}
