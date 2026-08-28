import type { NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import type { AssistantContext } from '@/lib/ai-assistant/tools'

const PLATFORM_SUPER_ADMIN = 'bishalstha76@gmail.com'

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } },
)

type Resolved = { db: ReturnType<typeof admin>; ctx: AssistantContext }
type Failure = { error: string; status: number }

// Authenticate the caller and resolve which company they're acting in and with
// what role. This is the security gate for the assistant: the model runs under
// the service-role client, so membership + role MUST be established here from
// the verified user, never taken from the request body alone.
export async function resolveCaller(req: NextRequest, companyId?: string): Promise<Resolved | Failure> {
  const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '').trim()
  if (!token) return { error: 'Please sign in.', status: 401 }
  if (!companyId) return { error: 'No workspace selected.', status: 400 }

  const db = admin()

  const { data: userData, error: authErr } = await db.auth.getUser(token)
  const user = userData?.user
  if (authErr || !user) return { error: 'Your session has expired — please sign in again.', status: 401 }

  const { data: company } = await db.from('companies')
    .select('id, name, slug, owner_id').eq('id', companyId).maybeSingle()
  if (!company) return { error: 'Workspace not found.', status: 404 }

  // Establish role from the VERIFIED user, not the request.
  let role: string | null = null
  if (company.owner_id === user.id) role = 'owner'
  else {
    const { data: member } = await db.from('team_members')
      .select('role').eq('company_id', companyId).eq('user_id', user.id).maybeSingle()
    role = (member?.role as string) || null
  }
  // Platform super admin can operate in any workspace.
  if (!role && user.email === PLATFORM_SUPER_ADMIN) role = 'owner'
  if (!role) return { error: "You don't have access to this workspace.", status: 403 }

  const userName = (user.user_metadata?.display_name as string)
    || (user.email ? String(user.email).split('@')[0] : 'there')

  const origin = req.headers.get('origin')
    || (req.headers.get('host') ? `https://${req.headers.get('host')}` : '')
    || process.env.NEXT_PUBLIC_SITE_URL
    || 'https://colvy.com'

  const ctx: AssistantContext = {
    companyId: String(company.id),
    userId: user.id,
    userName,
    role,
    companyName: company.name || 'your business',
    siteOrigin: origin,
  }
  return { db, ctx }
}
