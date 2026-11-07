import type { ReactNode } from 'react'
import { notFound } from 'next/navigation'
import { PHONE_SLUGS } from '@/lib/marketing-routes'

// The page is a client component, so the address is checked here: only the
// phone features that exist are built (lib/marketing-routes.ts mirrors PH in ./page.tsx),
// and any other address is a real 404, not a page with fallback copy.
export function generateStaticParams() {
  return PHONE_SLUGS.map(slug => ({ slug }))
}
export const dynamicParams = false

export default async function Layout({ children, params }: { children: ReactNode; params: Promise<{ slug: string }> }) {
  const { slug } = await params
  if (!PHONE_SLUGS.includes(slug)) notFound()
  return children
}
