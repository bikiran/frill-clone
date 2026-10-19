import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireCompanyAccess, requireCompanyAdmin } from '@/lib/company-access'
import { checkPortFile, isOpenPort } from '@/lib/number-porting'
import { getPort, storePortFile, signedFileUrl } from '@/lib/number-porting-server'

export const dynamic = 'force-dynamic'

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

// GET ?companyId=&fileId= — a short-lived link to one of the business's own
// port documents (they're in a private bucket).
export async function GET(req: NextRequest) {
  try {
    const companyId = req.nextUrl.searchParams.get('companyId')
    const fileId = req.nextUrl.searchParams.get('fileId')
    if (!companyId || !fileId) return NextResponse.json({ error: 'Missing companyId or fileId' }, { status: 400 })
    const db = admin()
    if (!(await requireCompanyAccess(req, db, companyId)).ok) return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
    const { data: f } = await db.from('porting_request_files').select('*').eq('id', fileId).eq('company_id', companyId).maybeSingle()
    if (!f) return NextResponse.json({ error: 'File not found' }, { status: 404 })
    const url = await signedFileUrl(db, f)
    if (!url) return NextResponse.json({ error: 'The file isn’t available right now.' }, { status: 502 })
    return NextResponse.json({ url })
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Something went wrong' }, { status: 500 })
  }
}

// POST multipart: companyId, requestId, file — another document for an open
// request (e.g. a newer bill the Colvy team asked for).
export async function POST(req: NextRequest) {
  try {
    let form: FormData
    try { form = await req.formData() } catch { return NextResponse.json({ error: 'Attach a file.' }, { status: 400 }) }
    const companyId = String(form.get('companyId') || '')
    const requestId = String(form.get('requestId') || '')
    if (!companyId || !requestId) return NextResponse.json({ error: 'Missing companyId or requestId' }, { status: 400 })
    const db = admin()
    const access = await requireCompanyAdmin(req, db, companyId)
    if (!access.ok) return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
    const r = await getPort(db, requestId)
    if (!r || r.company_id !== companyId) return NextResponse.json({ error: 'Request not found' }, { status: 404 })
    if (!isOpenPort(r.status)) return NextResponse.json({ error: 'This request is closed.' }, { status: 409 })
    const raw = form.get('file')
    const file = raw && typeof raw === 'object' && 'arrayBuffer' in raw ? raw as File : null
    const bad = checkPortFile(file ? { name: file.name, type: file.type, size: file.size } : null)
    if (bad) return NextResponse.json({ error: bad.replace('Attach a recent bill from your current provider', 'Attach a document').replace('The bill', 'The file') }, { status: 422 })
    const stored = await storePortFile(db, { request: r, file: { name: file!.name, type: file!.type, size: file!.size, bytes: new Uint8Array(await file!.arrayBuffer()) }, kind: 'other', userId: access.userId || null })
    if (!stored.ok) return NextResponse.json({ error: stored.error }, { status: 500 })
    const { storage_path: _p, storage_bucket: _b, ...meta } = stored.file
    return NextResponse.json({ ok: true, file: meta })
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Something went wrong' }, { status: 500 })
  }
}
