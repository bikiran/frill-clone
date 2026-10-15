import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { hashInviteToken } from '@/lib/invite-token'
import { emailPattern, sameEmail, type TeamRow } from '@/lib/team-management'

export const dynamic = 'force-dynamic'

/**
 * GET /api/team/invite?email=&companySlug=&token=
 *
 * Whether there is an invitation waiting, for the join page's pre-flight.
 *
 * Deliberately thin: found, the status, and the company it belongs to. Not the
 * row. The page only needs to decide between "enter a password", "you are
 * already a member" and "this link is not valid", and the invite id it used to
 * read is no longer any use to it — activation happens server-side now.
 *
 * Anyone can call this without signing in, so it only answers for the invite
 * link's own code (`token`) and exactly that email. It used to take any email
 * and match it with LIKE, so 'j%', 'jo%', 'joh%'… spelled out every address on
 * a workspace's team, pending invites included, one letter at a time.
 */
export async function GET(req: NextRequest) {
  const email = (req.nextUrl.searchParams.get('email') || '').trim().toLowerCase()
  const slug = (req.nextUrl.searchParams.get('companySlug') || '').trim()
  const token = (req.nextUrl.searchParams.get('token') || '').trim()
  if (!email || !slug || !token) return NextResponse.json({ found: false }, { status: 400 })

  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!key) return NextResponse.json({ found: false }, { status: 500 })

  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  }) as any

  const { data: co } = await db.from('companies').select('id').eq('slug', slug).maybeSingle()
  if (!co) return NextResponse.json({ found: false, reason: 'company' })

  // Invited rows can carry a null company_id — the company was not always
  // resolved when the invite was written — so match the email and code first
  // and accept either this company or an unassigned row.
  const { data: found } = await db.from('team_members')
    .select('email, status, company_id').ilike('email', emailPattern(email))
    .eq('invite_token_hash', await hashInviteToken(token))
    .order('created_at', { ascending: false })
  const rows = (found || []).filter((r: TeamRow) => sameEmail(r.email, email))
  const inv = rows.find((r: any) => r.company_id === co.id)
    || rows.find((r: any) => r.company_id == null)
    || null

  if (!inv) return NextResponse.json({ found: false, reason: 'invite' })
  return NextResponse.json({ found: true, status: inv.status || 'invited' })
}
