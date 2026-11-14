import type { Metadata } from 'next'

// A customer's private invoice link: never in search results.
export const metadata: Metadata = {
  title: 'Your invoice',
  robots: { index: false, follow: false, nocache: true, googleBot: { index: false, follow: false } },
  referrer: 'no-referrer',
}

export default function InvoiceLayout({ children }: { children: React.ReactNode }) {
  return children
}
