import type { ReactNode } from 'react'
import { notFound } from 'next/navigation'
import { AI_SLUGS } from '@/lib/marketing-routes'

// The page is a client component, so the address is checked here: only the
// AI assistant pages that exist are built (lib/marketing-routes.ts mirrors AI in ./page.tsx),
// and any other address is a real 404, not a page with fallback copy.
export function generateStaticParams() {
  return AI_SLUGS.map(slug => ({ slug }))
}
export const dynamicParams = false

export default async function Layout({ children, params }: { children: ReactNode; params: Promise<{ slug: string }> }) {
  const { slug } = await params
  if (!AI_SLUGS.includes(slug)) notFound()
  return children
}
