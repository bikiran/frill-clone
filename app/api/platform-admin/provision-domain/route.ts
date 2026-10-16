import { NextRequest, NextResponse } from 'next/server'
import { adminDb, superAdmin } from '../_lib/super-admin'
import { provisionSubdomain, checkSubdomain, describeProvision } from '@/lib/provision-domain'
import { boardSubdomain } from '@/lib/board-url'
import { logSuperAdminAudit } from '@/lib/super-admin-audit'

export const dynamic = 'force-dynamic'

// Super admin → Companies → "Set up board address" (the ↻ button on a row).
// Adds <slug>.colvy.com to the Vercel project and Cloudflare (idempotent), then
// asks Vercel how it stands and says, in plain words, what's left to do.
// Works for any company, including Colvy's own workspace, whose slug is one a
// new business can't sign up with (lib/reserved-subdomains.ts).
export async function POST(req: NextRequest) {
  const db = adminDb()
  const who = await superAdmin(req, db)
  if (!who) return NextResponse.json({ error: 'Not authorised' }, { status: 403 })

  const body = await req.json().catch(() => ({}))
  const companyId = typeof body?.companyId === 'string' ? body.companyId : ''
  if (!companyId) return NextResponse.json({ error: 'companyId required' }, { status: 400 })

  const { data: co } = await db.from('companies').select('id, name, slug').eq('id', companyId).maybeSingle()
  if (!co) return NextResponse.json({ error: 'Company not found' }, { status: 404 })
  const domain = boardSubdomain(co.slug)
  if (!domain) return NextResponse.json({ error: `“${co.slug || ''}” can't be a web address. Change the slug first.` }, { status: 400 })

  const result = await provisionSubdomain(domain)
  const check = await checkSubdomain(domain)
  const report = describeProvision(result, check)

  await logSuperAdminAudit(db, {
    adminId: who.id, adminEmail: who.email, companyId: co.id,
    action: 'company.provision_domain',
    summary: `${domain}: ${report.ok ? 'ready' : 'needs attention'}`,
    detail: { vercel: result.vercel, cloudflare: result.cloudflare, check: { attached: check.attached, verified: check.verified, misconfigured: check.misconfigured } },
  })

  return NextResponse.json({
    domain,
    url: `https://${domain}`,
    ...report,
    vercel: result.vercel,
    cloudflare: result.cloudflare,
    check,
  })
}
