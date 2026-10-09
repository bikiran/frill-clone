import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireCompanyAccess } from '@/lib/company-access'
import { refreshAccessToken } from '@/lib/shopify-auth'
import {
  CLAIM_COOKIE, PENDING_COOKIE, clearInstallCookies, connectStore, connectedElsewhere,
  findPendingInstall, pendingTokens,
} from '@/lib/shopify-install'

export const dynamic = 'force-dynamic'

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

// A store installed from Shopify before Colvy knew the workspace waits in
// shopify_pending_installs; the claim token is an httpOnly cookie on the
// browser that installed it (lib/shopify-install). Signed in, that person
// connects it to their workspace here.

// GET ?companyId= → { pending: { shop, store_name } | null }
export async function GET(req: NextRequest) {
  const db = admin()
  const companyId = req.nextUrl.searchParams.get('companyId')
  if (!(await requireCompanyAccess(req, db, companyId)).ok) return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
  const p = await findPendingInstall(db, req.cookies.get(CLAIM_COOKIE)?.value)
  const res = NextResponse.json({ pending: p ? { shop: p.shop, store_name: p.store_name || p.shop } : null })
  // Expired or already used: stop pages from asking.
  if (!p && (req.cookies.get(CLAIM_COOKIE) || req.cookies.get(PENDING_COOKIE))) clearInstallCookies(res, req, [CLAIM_COOKIE, PENDING_COOKIE])
  return res
}

// POST { companyId } → { ok, store: { id, store_name } }: connect it here.
export async function POST(req: NextRequest) {
  const db = admin()
  const { companyId } = await req.json().catch(() => ({}))
  const access = await requireCompanyAccess(req, db, companyId)
  if (!access.ok) return NextResponse.json({ error: 'Not authorized' }, { status: 403 })

  const p = await findPendingInstall(db, req.cookies.get(CLAIM_COOKIE)?.value)
  if (!p) {
    const res = NextResponse.json({ error: 'This Shopify install has expired. Open Colvy from your Shopify admin (Apps → Colvy) to connect the store again.' }, { status: 410 })
    clearInstallCookies(res, req, [CLAIM_COOKIE, PENDING_COOKIE])
    return res
  }
  if (await connectedElsewhere(db, p.shop, companyId)) {
    return NextResponse.json({ error: `${p.store_name || p.shop} is already connected to another Colvy workspace. Disconnect it there first.` }, { status: 409 })
  }
  // Exactly once, even with two tabs open.
  const { data: mine } = await db.from('shopify_pending_installs')
    .update({ claimed_at: new Date().toISOString() }).eq('id', p.id).is('claimed_at', null).select('id')
  if (!mine?.length) return NextResponse.json({ error: 'This store is already being connected.' }, { status: 409 })

  try {
    let tokens = pendingTokens(p)
    // The access token lasts an hour; the claim can come close to that.
    if (tokens.refreshToken && tokens.expiresAt && new Date(tokens.expiresAt).getTime() - Date.now() < 5 * 60 * 1000) {
      tokens = await refreshAccessToken(p.shop, tokens.refreshToken)
    }
    const id = await connectStore(db, { companyId, userId: access.userId, shop: p.shop, tokens, storeName: p.store_name })
    await db.from('shopify_pending_installs').delete().eq('id', p.id)
    const res = NextResponse.json({ ok: true, store: { id, store_name: p.store_name || p.shop } })
    clearInstallCookies(res, req, [CLAIM_COOKIE, PENDING_COOKIE])
    return res
  } catch (e: any) {
    // Leave it claimable so the person can try again.
    await db.from('shopify_pending_installs').update({ claimed_at: null }).eq('id', p.id)
    return NextResponse.json({ error: e?.message || 'Could not connect the store' }, { status: 500 })
  }
}

// DELETE { companyId } → don't connect it: forget the install.
export async function DELETE(req: NextRequest) {
  const db = admin()
  const { companyId } = await req.json().catch(() => ({}))
  if (!(await requireCompanyAccess(req, db, companyId)).ok) return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
  const p = await findPendingInstall(db, req.cookies.get(CLAIM_COOKIE)?.value)
  if (p) await db.from('shopify_pending_installs').delete().eq('id', p.id)
  const res = NextResponse.json({ ok: true })
  clearInstallCookies(res, req, [CLAIM_COOKIE, PENDING_COOKIE])
  return res
}
