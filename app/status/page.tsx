import type { Metadata } from 'next'
import Client from './Client'

export const metadata: Metadata = {
  title: "Status",
  description: "Colvy system status and uptime.",
  alternates: { canonical: "/status" },
}

export default function Page() {
  return <Client />
}
