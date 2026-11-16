import type { Viewport } from 'next'
import AdminShell from './AdminShell'

// The app (not the marketing site) asks phones to shrink the page for the
// on-screen keyboard instead of drawing it over the bottom, where the inbox's
// reply box and the Colvy AI box are (components/KeyboardAware). Only here: on
// a long marketing page, shrinking for the keyboard re-lays out every
// screen-tall section, so typing in a field jumps the page around.
// `viewport` has to come from a server file; the admin's shell is a client one.
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  interactiveWidget: 'resizes-content',
}

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <AdminShell>{children}</AdminShell>
}
