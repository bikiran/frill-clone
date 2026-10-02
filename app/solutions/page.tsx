import type { Metadata } from 'next'
import Client from './Client'

export const metadata: Metadata = {
  title: "Solutions",
  description: "See how teams use Colvy for customer support, sales, marketing, reviews, feedback and payments.",
  alternates: { canonical: "/solutions" },
}

export default function Page() {
  return <Client />
}
