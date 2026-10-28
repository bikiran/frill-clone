import type { Metadata } from 'next'
import Client from './Client'

export const metadata: Metadata = {
  title: "Testimonials",
  description: "What customers say about Colvy: real quotes from people who agreed to be named, with the rating they gave.",
  alternates: { canonical: "/testimonials" },
}

export default function Page() {
  return <Client />
}
