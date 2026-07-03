import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function GET(req: NextRequest) {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  const { searchParams } = new URL(req.url)
  const username = searchParams.get('username')?.toLowerCase().trim()
  const companyId = searchParams.get('company_id')

  if (!username || username.length < 3 || username.length > 30) {
    return NextResponse.json({ available: false, reason: 'Invalid username length' }, { status: 400 })
  }

  if (!/^[a-z0-9_-]+$/.test(username)) {
    return NextResponse.json({ available: false, reason: 'Only letters, numbers, - and _ allowed' }, { status: 400 })
  }

  const { data: exists } = await (supabase as any)
    .from('team_members')
    .select('id')
    .eq('username', username)
    .maybeSingle()

  return NextResponse.json({ available: !exists })
}

export async function POST(req: NextRequest) {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  const { data: session } = await supabase.auth.getSession()
  if (!session?.session?.user?.id) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const { username, companyId } = await req.json()
  const userId = session.session.user.id
  const userEmail = session.session.user.email

  if (!username || username.length < 3 || username.length > 30) {
    return NextResponse.json({ error: 'Invalid username' }, { status: 400 })
  }

  if (!/^[a-z0-9_-]+$/.test(username)) {
    return NextResponse.json({ error: 'Only letters, numbers, - and _ allowed' }, { status: 400 })
  }

  // Check if username already taken
  const { data: taken } = await (supabase as any)
    .from('team_members')
    .select('id')
    .eq('username', username.toLowerCase())
    .maybeSingle()

  if (taken) {
    return NextResponse.json({ error: 'Username already taken' }, { status: 409 })
  }

  // Update team member with username
  const { data, error } = await (supabase as any)
    .from('team_members')
    .update({
      username: username.toLowerCase(),
      username_locked: true,
    })
    .eq('user_id', userId)
    .eq('company_id', companyId)
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 })
  }

  return NextResponse.json({ success: true, member: data })
}
