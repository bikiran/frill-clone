// Shared checks for the /api/integrations/* routes (server only).

import type { NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireCompanyAccess } from '@/lib/company-access'
import { INTEGRATIONS } from '@/lib/integrations-catalog'

export const adminDb = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

/** The general integrations whose settings live in integration_configs. */
export const GENERAL = INTEGRATIONS.filter(i => !i.isDedicated)
export const generalIntegration = (id: string) => GENERAL.find(i => i.id === id) || null

/** Caller must belong to the business; `edit` also needs owner/admin/editor. */
export async function integrationAccess(req: NextRequest, db: any, companyId: string, opts: { edit?: boolean } = {}): Promise<{ ok: boolean; userId?: string; error?: string; status?: number }> {
  const access = await requireCompanyAccess(req, db, companyId)
  if (!access.ok) return { ok: false, error: 'Not authorized', status: 403 }
  if (opts.edit) {
    const { data: co } = await db.from('companies').select('owner_id').eq('id', companyId).maybeSingle()
    if (co?.owner_id !== access.userId) {
      const { data: tm } = await db.from('team_members').select('role').eq('company_id', companyId).eq('user_id', access.userId).limit(1)
      if (tm?.length && !['owner', 'admin', 'editor'].includes(tm[0].role)) return { ok: false, error: "You don't have permission to change integrations.", status: 403 }
    }
  }
  return { ok: true, userId: access.userId }
}

/** "••••1234" for a stored secret. */
export const maskSecret = (v: any) => {
  const s = String(v || '')
  return s ? `••••${s.slice(-4)}` : ''
}

// Where a saved token is sent: the Jira site, the Zendesk subdomain, the
// webhook address. The browser never sees a saved token, so it may only be
// reused (a secret left blank) with the destination it was saved for —
// otherwise pointing the site at another host and pressing Test (or waiting
// for an event) would hand that host the token.
const DESTINATION_KEYS = ['domain', 'subdomain', 'url']

export function secretReuseProblem(def: { fields?: { key: string; label: string; secret?: boolean }[] } | null, saved: Record<string, any>, incoming: Record<string, any> | null | undefined): string | null {
  const fields = def?.fields || []
  const val = (o: any, k: string) => (typeof o?.[k] === 'string' || typeof o?.[k] === 'number' ? String(o[k]).trim() : '')
  const reused = fields.filter(f => f.secret && !val(incoming, f.key) && val(saved, f.key))
  if (!reused.length) return null
  const moved = fields.find(f => DESTINATION_KEYS.includes(f.key) && val(incoming, f.key).toLowerCase() !== val(saved, f.key).toLowerCase())
  return moved ? `Enter the ${reused[0].label.toLowerCase()} again to use a different ${moved.label.toLowerCase()}.` : null
}

// A Jira site or Zendesk subdomain typed in must stay a plain public host
// (lib/integration-events builds https://<site>/… and https://<sub>.zendesk.com
// from them, and calls them with the token).
export async function destinationProblem(cfg: Record<string, any>): Promise<string | null> {
  const sub = String(cfg?.subdomain || '').trim().replace(/^https?:\/\//, '').replace(/\.zendesk\.com.*$/i, '')
  if (sub && !/^[a-z0-9][a-z0-9-]*$/i.test(sub)) return 'Zendesk subdomain: use just the part before .zendesk.com.'
  const domain = String(cfg?.domain || '').trim().replace(/^https?:\/\//, '').replace(/\/.*$/, '')
  if (domain) {
    if (!/^[a-z0-9.-]+$/i.test(domain)) return 'Jira site: enter just the address, like yourcompany.atlassian.net.'
    const { checkPublicUrl } = await import('@/lib/integration-events')
    const bad = await checkPublicUrl(`https://${domain.includes('.') ? domain : `${domain}.atlassian.net`}`)
    if (bad) return `Jira site: ${bad}`
  }
  return null
}
