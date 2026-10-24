import type { Metadata } from 'next'
import { connection } from 'next/server'
import Client from './Client'
import { getPublicStatus } from '@/lib/status-cached'
import { pageMeta } from '@/lib/seo'

export const metadata: Metadata = pageMeta({
  title: 'Status',
  description: 'Colvy system status, incidents and uptime.',
  path: 'status',
})

// Rendered per request (never at build time, which would freeze a stale
// status into the page), from the status computed at most once a minute
// (lib/status-cached.ts). The client then refreshes it from /api/status.
export default async function Page() {
  await connection()
  const initial = await getPublicStatus().catch(() => null)
  return <Client initial={initial} />
}
