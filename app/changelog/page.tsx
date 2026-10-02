import type { Metadata } from 'next'
import Client from './Client'

export const metadata: Metadata = {
  title: "Changelog",
  description: "The latest features, fixes and improvements shipped in Colvy.",
  alternates: { canonical: "/changelog" },
}

export default function Page() {
  return <Client />
}
