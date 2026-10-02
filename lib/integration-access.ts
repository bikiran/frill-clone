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
