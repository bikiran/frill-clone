import { createClient } from '@supabase/supabase-js'
import { memberOr403 } from '@/lib/company-access'
import { NextRequest, NextResponse } from 'next/server'
import { provisionSubdomain, provisionCustomDomain } from '@/lib/provision-domain'

// Provision a board subdomain (Vercel project domain + Cloudflare CNAME) via the
// shared, idempotent engine. Only *.colvy.com is accepted.
export async function POST(req: NextRequest) {
  try {
    const { domain: rawDomain, companyId } = await req.json()
    // Members only, for their own workspace. This adds domains to Colvy's Vercel
    // project and Cloudflare zone with Colvy's tokens. (The DELETE and GET that
    // were here had no callers and could remove any domain, colvy.com included.)
    { const deny = await memberOr403(req, companyId); if (deny) return deny }
    const domain = String(rawDomain || '').trim().toLowerCase()
    if (!domain) return NextResponse.json({ error: 'Domain required' }, { status: 400 })
    if (!/^(?=.{1,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(domain)) {
      return NextResponse.json({ error: 'That is not a valid domain name.' }, { status: 400 })
    }
    if (domain.endsWith('.colvy.com')) {
      // Only the workspace's own board subdomain.
      const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { autoRefreshToken: false, persistSession: false } }) as any
      const { data: co } = await db.from('companies').select('slug').eq('id', companyId).maybeSingle()
      if (!co?.slug || domain !== `${String(co.slug).toLowerCase()}.colvy.com`) {
        return NextResponse.json({ error: 'That subdomain belongs to another board.' }, { status: 403 })
      }
    }
    // *.colvy.com subdomains are provisioned automatically (Vercel + Cloudflare).
    // A customer's own domain is registered on the Vercel project (they own DNS).
    if (String(domain).toLowerCase().endsWith('.colvy.com')) {
      const result = await provisionSubdomain(domain)
      return NextResponse.json({ success: result.ok, ...result })
    }
    const custom = await provisionCustomDomain(domain)
    return NextResponse.json({ success: custom.registered, manual: !custom.configured, ...custom })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
