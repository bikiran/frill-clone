import type { Metadata } from 'next'
import Client from './Client'

export const metadata: Metadata = {
  title: "Product",
  description: "Everything in Colvy: an omnichannel shared inbox, a lightweight CRM, and feedback boards, roadmaps and changelogs.",
  alternates: { canonical: "/product" },
}

export default function Page() {
  return <Client />
}
