import { callerStripeCustomer } from '@/lib/company-access'
import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(req: NextRequest) {
  try {
    // The caller's own billing customer — never one named in the request.
    const customerId = await callerStripeCustomer(req, createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { autoRefreshToken: false, persistSession: false } }))
    if (!customerId) return NextResponse.json({ invoices: [] })

    const secret = process.env.STRIPE_SECRET_KEY || ''
    if (!secret.startsWith('sk_')) return NextResponse.json({ invoices: [] })

    const Stripe = (await import('stripe')).default
    const stripe = new Stripe(secret, { apiVersion: '2024-06-20' as any })

    const invoices = await stripe.invoices.list({ customer: customerId, limit: 20 })

    return NextResponse.json({
      invoices: invoices.data.map(inv => ({
        id: inv.id,
        created: inv.created,
        amount_paid: inv.amount_paid,
        status: inv.status,
        description: inv.lines?.data?.[0]?.description || 'Subscription',
        invoice_pdf: inv.invoice_pdf,
      }))
    })
  } catch (err: any) {
    return NextResponse.json({ invoices: [], error: err.message })
  }
}
