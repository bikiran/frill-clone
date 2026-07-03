import { createClient } from '@supabase/supabase-js'

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
