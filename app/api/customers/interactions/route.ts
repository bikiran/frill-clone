import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function POST(req: NextRequest) {
  try {
    const { customerId, companyId, interactionType, details } = await req.json()

    if (!customerId || !companyId || !interactionType) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    const sb = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL || '',
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
    )

    const { data: { user } } = await sb.auth.getUser()

    const { data: interaction, error } = await sb
      .from('customer_interactions')
      .insert({
        customer_id: customerId,
        company_id: companyId,
        user_id: user?.id || null,
        interaction_type: interactionType,
        details: details || {}
      })
      .select()
      .single()

    if (error) {
      return NextResponse.json({ error: 'Failed to save interaction' }, { status: 500 })
    }

    return NextResponse.json({ interaction }, { status: 201 })
  } catch (error: any) {
    console.error('[Customer Interactions] Error:', error)
    return NextResponse.json({ error: error.message || 'Failed to log interaction' }, { status: 500 })
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

    const { data: interactions } = await sb
      .from('customer_interactions')
      .select('*')
      .eq('customer_id', customerId)
      .eq('company_id', companyId)
      .order('created_at', { ascending: false })
      .limit(50)

    return NextResponse.json({ interactions: interactions || [] })
  } catch (error: any) {
    console.error('[Customer Interactions] Error:', error)
    return NextResponse.json({ error: error.message || 'Failed to fetch interactions' }, { status: 500 })
  }
}
