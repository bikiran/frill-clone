import type { Metadata } from 'next'
import Client from './Client'

// Utility / authenticated page — kept out of search results.
export const metadata: Metadata = {
  title: "Upgrade",
  robots: { index: false, follow: false },
}

export default function Page() {
  return <Client />
}
