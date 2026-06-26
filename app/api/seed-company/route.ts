import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { seedCompanyData } from '@/lib/seedCompany'

export async function POST(req: NextRequest) {
  try {
    const { companyId, companyName, clearFirst } = await req.json()
    if (!companyId) return NextResponse.json({ error: 'companyId required' }, { status: 400 })

    // Optionally clear existing data first
    if (clearFirst) {
      const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
      const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, serviceKey, {
        auth: { autoRefreshToken: false, persistSession: false }
      }) as any
      await db.from('ideas').delete().eq('company_id', companyId)
      await db.from('announcements').delete().eq('company_id', companyId)
      await db.from('help_articles').delete().eq('company_id', companyId)
      await db.from('statuses').delete().eq('company_id', companyId)
      await db.from('topics').delete().eq('company_id', companyId)
    }

    const result = await seedCompanyData(companyId, companyName || 'Your Company')
    return NextResponse.json(result)
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
