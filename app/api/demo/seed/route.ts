import { NextRequest, NextResponse } from 'next/server'
import { seedHarbourBean, demoAdmin } from '@/lib/demo-seed'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const SUPER_ADMIN = 'bishalstha76@gmail.com'

// POST /api/demo/seed — (re)build the public Harbour & Bean showcase.
// Authorised by the super admin (Bearer token) OR a server secret header
// (x-demo-secret === DEMO_RESET_SECRET) so a scheduled reset can call it.
export async function POST(req: NextRequest) {
  try {
    const db = demoAdmin()
    const secret = req.headers.get('x-demo-secret')
    let authorised = false
    if (process.env.DEMO_RESET_SECRET && secret === process.env.DEMO_RESET_SECRET) authorised = true
    if (!authorised) {
      const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '')
      if (token) { const { data } = await db.auth.getUser(token); if (data?.user?.email === SUPER_ADMIN) authorised = true }
    }
    if (!authorised) return NextResponse.json({ error: 'Not authorized' }, { status: 403 })

    const result = await seedHarbourBean(db)
    return NextResponse.json({ ok: true, ...result })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Seed failed' }, { status: 500 })
  }
}
