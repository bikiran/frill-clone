import type { Metadata } from 'next'
import Client from './Client'

export const metadata: Metadata = {
  title: "Customer Stories",
  description: "How real teams grow with Colvy — testimonials and results.",
  alternates: { canonical: "/testimonials" },
}

export default function Page() {
  return <Client />
}
