import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function POST(req: NextRequest) {
  try {
    const { email, password, name, role } = await req.json()
    if (!email || !password) return NextResponse.json({ error: 'Email and password required' }, { status: 400 })

    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    )

    let userId: string | null = null
    let userEmail = email.trim().toLowerCase()

    if (process.env.SUPABASE_SERVICE_ROLE_KEY) {
      const { data, error } = await (supabaseAdmin.auth.admin as any).createUser({
        email: userEmail, password, email_confirm: true,
        user_metadata: { display_name: name || email.split('@')[0] },
      })
      if (error) return NextResponse.json({ error: error.message }, { status: 400 })
      userId = data.user?.id
      userEmail = data.user?.email || email
    } else {
      const { data, error } = await supabaseAdmin.auth.signUp({
        email: userEmail, password,
        options: { data: { display_name: name || email.split('@')[0] } },
      })
      if (error) return NextResponse.json({ error: error.message }, { status: 400 })
      userId = data.user?.id
    }

    try {
      await (supabaseAdmin as any).from('team_members').insert({
        email: userEmail, role: role || 'editor', status: 'active', user_id: userId,
      })
    } catch {}

    return NextResponse.json({ success: true, email: userEmail })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
