import type { Metadata } from 'next'
import Client from './Client'

export const metadata: Metadata = {
  title: "Blog",
  description: "Product news, guides and playbooks from the Colvy team.",
  alternates: { canonical: "/blog" },
}

export default function Page() {
  return <Client />
}
