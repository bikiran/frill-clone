import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function GET(req: NextRequest) {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  const { searchParams } = new URL(req.url)
  const q = searchParams.get('q')?.toLowerCase().trim() || ''
  const companyId = searchParams.get('company_id')

  if (!companyId) {
    return NextResponse.json({ users: [] })
  }

  if (q.length < 1) {
    // Return all active members of the company, sorted by username
    const { data: members } = await (supabase as any)
      .from('team_members')
      .select('email, username, role')
      .eq('company_id', companyId)
      .eq('status', 'active')
      .order('username', { ascending: true })
      .limit(20)

    return NextResponse.json({
      users: members || [],
      specialGroups: [
        { type: 'group', name: '@everyone', description: 'All members' },
        { type: 'group', name: '@editors', description: 'All editors and admins' },
      ]
    })
  }

  // Search by username or email
  const { data: members } = await (supabase as any)
    .from('team_members')
    .select('email, username, role')
    .eq('company_id', companyId)
    .eq('status', 'active')
    .or(`username.ilike.%${q}%,email.ilike.%${q}%`)
    .limit(10)

  // Add matching special groups
  const specialGroups = [
    { type: 'group', name: '@everyone', description: 'All members' },
    { type: 'group', name: '@editors', description: 'All editors and admins' },
  ].filter(g => g.name.toLowerCase().includes(q))

  return NextResponse.json({
    users: members || [],
    specialGroups,
  })
}
