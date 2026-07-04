import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function POST(req: NextRequest) {
  try {
    const { customerId, companyId, content } = await req.json()

    if (!customerId || !companyId || !content) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    const sb = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL || '',
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
    )

    const { data: { user } } = await sb.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: note, error } = await sb
      .from('customer_notes')
      .insert({
        customer_id: customerId,
        company_id: companyId,
        created_by: user.id,
        content
      })
      .select()
      .single()

    if (error) {
      return NextResponse.json({ error: 'Failed to save note' }, { status: 500 })
    }

    return NextResponse.json({ note }, { status: 201 })
  } catch (error: any) {
    console.error('[Customer Notes] Error:', error)
    return NextResponse.json({ error: error.message || 'Failed to create note' }, { status: 500 })
  }
}

export async function GET(req: NextRequest) {
  try {
    const customerId = req.nextUrl.searchParams.get('customerId')
    const companyId = req.nextUrl.searchParams.get('companyId')

    if (!customerId || !companyId) {
      return NextResponse.json({ error: 'Missing required parameters' }, { status: 400 })
    }

    const sb = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL || '',
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
    )

    const { data: notes } = await sb
      .from('customer_notes')
      .select('*')
      .eq('customer_id', customerId)
      .eq('company_id', companyId)
      .order('created_at', { ascending: false })

    return NextResponse.json({ notes: notes || [] })
  } catch (error: any) {
    console.error('[Customer Notes] Error:', error)
    return NextResponse.json({ error: error.message || 'Failed to fetch notes' }, { status: 500 })
  }
}
