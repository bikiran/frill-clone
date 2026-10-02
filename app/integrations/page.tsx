import type { Metadata } from 'next'
import Client from './Client'

export const metadata: Metadata = {
  title: "Integrations",
  description: "Connect Colvy to the tools you already use — WooCommerce, Stripe, Google and more.",
  alternates: { canonical: "/integrations" },
}

export default function Page() {
  return <Client />
}
