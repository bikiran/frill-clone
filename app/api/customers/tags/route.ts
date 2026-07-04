import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function POST(req: NextRequest) {
  try {
    const { customerId, companyId, tag } = await req.json()

    if (!customerId || !companyId || !tag) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    const sb = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL || '',
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
    )

    const { data, error } = await sb
      .from('customer_tags')
      .insert({
        customer_id: customerId,
        company_id: companyId,
        tag
      })
      .select()
      .single()

    if (error) {
      return NextResponse.json({ error: 'Failed to add tag' }, { status: 500 })
    }

    return NextResponse.json({ tag: data }, { status: 201 })
  } catch (error: any) {
    console.error('[Customer Tags] Error:', error)
    return NextResponse.json({ error: error.message || 'Failed to add tag' }, { status: 500 })
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

    const { data: tags } = await sb
      .from('customer_tags')
      .select('tag')
      .eq('customer_id', customerId)
      .eq('company_id', companyId)

    return NextResponse.json({ tags: tags?.map(t => t.tag) || [] })
  } catch (error: any) {
    console.error('[Customer Tags] Error:', error)
    return NextResponse.json({ error: error.message || 'Failed to fetch tags' }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { customerId, companyId, tag } = await req.json()

    if (!customerId || !companyId || !tag) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    const sb = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL || '',
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
    )

    const { error } = await sb
      .from('customer_tags')
      .delete()
      .eq('customer_id', customerId)
      .eq('company_id', companyId)
      .eq('tag', tag)

    if (error) {
      return NextResponse.json({ error: 'Failed to remove tag' }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('[Customer Tags] Error:', error)
    return NextResponse.json({ error: error.message || 'Failed to remove tag' }, { status: 500 })
  }
}
