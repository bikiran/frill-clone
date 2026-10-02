import type { Metadata } from 'next'
import Client from './Client'

export const metadata: Metadata = {
  title: "AI Assistant",
  description: "Colvy’s AI assistant drafts replies, summarises conversations and helps your team move faster.",
  alternates: { canonical: "/ai-assistant" },
}

export default function Page() {
  return <Client />
}
