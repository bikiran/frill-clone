import type { Metadata } from 'next'

// A customer's private quote link: never in search results.
export const metadata: Metadata = {
  title: 'Your quote',
  robots: { index: false, follow: false, nocache: true, googleBot: { index: false, follow: false } },
  referrer: 'no-referrer',
}

export default function QuoteLayout({ children }: { children: React.ReactNode }) {
  return children
}
