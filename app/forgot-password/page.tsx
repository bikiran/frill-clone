import type { Metadata } from 'next'
import Client from './Client'

// Utility / authenticated page — kept out of search results.
export const metadata: Metadata = {
  title: "Reset password",
  robots: { index: false, follow: false },
}

export default function Page() {
  return <Client />
}
