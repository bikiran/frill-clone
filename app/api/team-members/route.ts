import { createClient } from '@supabase/supabase-js'
import { companyLimit } from '@/lib/plan'

export async function POST(req: Request) {
  try {
    // Create client at runtime, not at module load time
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    const { userId, companyId, role, email } = await req.json()

    if (!userId || !companyId || !role || !email) {
      return new Response(JSON.stringify({ error: 'Missing required fields' }), { status: 400 })
    }

    // Enforce the effective team-member limit (plan default + any super-admin
    // override). Only NEW members beyond the cap are blocked; updating an
    // existing member's role, and plans with no cap, are unaffected.
    const limit = await companyLimit(supabase, companyId, 'teamMembers')
    if (typeof limit === 'number' && isFinite(limit) && limit > 0) {
      const { data: existing } = await supabase.from('team_members').select('id').eq('company_id', companyId).eq('email', email).limit(1)
      if (!existing || existing.length === 0) {
        const { count } = await supabase.from('team_members').select('id', { count: 'exact', head: true }).eq('company_id', companyId)
        if ((count || 0) >= limit) {
          return new Response(JSON.stringify({ error: `Team member limit reached (${limit}). Upgrade the plan or raise the limit to add more.` }), { status: 403 })
        }
      }
    }

    // Insert or update team member (scoped per company)
    const { data, error } = await supabase
      .from('team_members')
      .upsert({
        user_id: userId,
        email,
        role,
        company_id: companyId,
        status: 'active', // Auto-activate for direct signups
      }, {
        onConflict: 'company_id,email',
      })
      .select()

    if (error) {
      console.error('Team member error:', error)
      return new Response(JSON.stringify({ error: error.message }), { status: 500 })
    }

    return new Response(JSON.stringify({ success: true, data }), { status: 200 })
  } catch (err: any) {
    console.error('Team member API error:', err)
    return new Response(JSON.stringify({ error: err.message }), { status: 500 })
  }
}
