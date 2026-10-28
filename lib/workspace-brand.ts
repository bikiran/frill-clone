// A new workspace's branding from the set-up screens (creating a workspace,
// and signing up): the logo (a website's icon, copied into Colvy's storage so
// it doesn't depend on that site), the website, and the teams they picked.
// Server only (service-role client). Never throws: a workspace is made
// whether or not its branding could be saved.

import { publicUrlProblem } from '@/lib/site-crawl'

const IMAGE_TYPES: Record<string, string> = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/svg+xml': 'svg', 'image/gif': 'gif', 'image/x-icon': 'ico', 'image/vnd.microsoft.icon': 'ico' }

/** Copy a website's icon into Colvy's storage, so the workspace logo doesn't
 *  depend on that site. Public addresses only (checked on every redirect),
 *  images only, up to 1 MB. Returns the stored address, or null. */
async function copyIcon(admin: any, companyId: string, url: string): Promise<string | null> {
  let current = url
  for (let hop = 0; hop < 4; hop++) {
    if (await publicUrlProblem(current)) return null
    const ctrl = new AbortController()
    const t = setTimeout(() => ctrl.abort(), 6000)
    try {
      const res = await fetch(current, { redirect: 'manual', signal: ctrl.signal, headers: { 'User-Agent': 'ColvyBot/1.0 (+https://colvy.com)' } })
      if (res.status >= 300 && res.status < 400 && res.headers.get('location')) { current = new URL(res.headers.get('location')!, current).toString(); continue }
      const type = (res.headers.get('content-type') || '').split(';')[0].trim().toLowerCase()
      const ext = IMAGE_TYPES[type]
      if (!res.ok || !ext) return null
      const bytes = new Uint8Array(await res.arrayBuffer())
      if (!bytes.length || bytes.length > 1_000_000) return null
      const path = `logos/${companyId}-${Date.now()}.${ext}`
      for (const bucket of ['settings', 'idea-images']) {
        const { error } = await admin.storage.from(bucket).upload(path, bytes, { contentType: type, upsert: true })
        if (!error) return admin.storage.from(bucket).getPublicUrl(path).data?.publicUrl || null
      }
      return null
    } catch { return null } finally { clearTimeout(t) }
  }
  return null
}

/** Save the logo (an upload, or the website's icon) and the website, if given.
 *  Best effort: a workspace is never refused over its branding. */
export async function applyBrand(admin: any, company: any, body: any) {
  try {
    const logo = typeof body?.logoUrl === 'string' ? body.logoUrl.trim() : ''
    if (/^https:\/\//i.test(logo) && logo.length <= 600) {
      const ours = !!process.env.NEXT_PUBLIC_SUPABASE_URL && logo.startsWith(process.env.NEXT_PUBLIC_SUPABASE_URL)
      const stored = ours ? logo : await copyIcon(admin, company.id, logo)
      if (stored) { await admin.from('companies').update({ logo_url: stored }).eq('id', company.id); company.logo_url = stored }
    }
    const site = typeof body?.website === 'string' ? body.website.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '') : ''
    if (/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(site) && site.length <= 120) {
      await admin.from('companies').update({ website: `https://${site}` }).eq('id', company.id)
    }
    // The teams they picked, as the workspace's departments (the Team page
    // offers these when grouping people).
    const teams = Array.isArray(body?.teams)
      ? [...new Set((body.teams as unknown[]).map(t => String(t ?? '').replace(/\s+/g, ' ').trim().slice(0, 40)).filter(Boolean))].slice(0, 12)
      : []
    if (teams.length) await admin.from('companies').update({ inbox_settings: { ...(company.inbox_settings || {}), teams } }).eq('id', company.id)
  } catch (e: any) { console.warn('[companies] branding not saved:', e?.message || e) }
}
