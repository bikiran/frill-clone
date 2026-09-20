import type { Metadata } from 'next'
import Client from './Client'

export const metadata: Metadata = {
  title: "Channels",
  description: "Connect Messenger, Instagram, WhatsApp, SMS, email, phone, live chat and Google reviews to one shared inbox with Colvy.",
  alternates: { canonical: "/channels" },
}

export default function Page() {
  return <Client />
}
