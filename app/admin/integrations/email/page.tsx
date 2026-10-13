import { redirect } from 'next/navigation'

// Email lives under Business Settings → Channels now (one address, not two).
// Old links — bookmarks, and sign-in / checkout returns that still point here —
// are forwarded with their query string so they finish where they started.
export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const qs = new URLSearchParams()
  for (const [k, v] of Object.entries(await searchParams)) for (const x of [v].flat()) if (x != null) qs.append(k, x)
  const q = qs.toString()
  redirect(`/admin/crm-settings/channels/email${q ? `?${q}` : ''}`)
}
