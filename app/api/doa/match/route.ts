import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

// GET: does this contact (by email or phone) match a synced e-commerce customer?
// Used to decide whether to show the "DOA Claim" shortcut in the inbox.
export async function GET(req: NextRequest) {
  try {
    const companyId = req.nextUrl.searchParams.get('companyId')
    const email = req.nextUrl.searchParams.get('email')
    const phone = req.nextUrl.searchParams.get('phone')
    if (!companyId || (!email && !phone)) return NextResponse.json({ match: false })

    const db = admin()
    // Check WooCommerce customers first (DOA refunds run against WooCommerce)
    if (email) {
      const { data } = await db.from('woocommerce_customers').select('id').eq('company_id', companyId).ilike('email', email).limit(1)
      if (data && data.length > 0) return NextResponse.json({ match: true, source: 'woocommerce' })
    }
    if (phone) {
      const clean = phone.replace(/\D/g, '').slice(-8) // last 8 digits
      if (clean.length >= 6) {
        const { data } = await db.from('woocommerce_customers').select('id, phone').eq('company_id', companyId).ilike('phone', `%${clean}%`).limit(1)
        if (data && data.length > 0) return NextResponse.json({ match: true, source: 'woocommerce' })
      }
    }
    return NextResponse.json({ match: false })
  } catch (err: any) {
    return NextResponse.json({ match: false })
  }
}
