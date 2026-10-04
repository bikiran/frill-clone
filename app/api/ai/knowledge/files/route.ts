import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireCompanyAccess } from '@/lib/company-access'
import { chunkText, extractFileText, FILE_MAX_BYTES } from '@/lib/ai-knowledge'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

const OK_NAME = /\.(pdf|txt|md|csv)$/i

// POST multipart { companyId, file } → read the file into the library (text only; the file itself isn't kept).
export async function POST(req: NextRequest) {
  try {
    const db = admin()
    const form = await req.formData()
    const companyId = String(form.get('companyId') || '')
    const access = await requireCompanyAccess(req, db, companyId)
    if (!access.ok) return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
    const file = form.get('file')
    if (!file || typeof file === 'string') return NextResponse.json({ error: 'Choose a file to upload.' }, { status: 400 })
    if (!OK_NAME.test(file.name)) return NextResponse.json({ error: 'Upload a PDF, TXT, MD or CSV file.' }, { status: 400 })
    if (file.size > FILE_MAX_BYTES) return NextResponse.json({ error: 'That file is over 10 MB.' }, { status: 400 })

    let pages: string[]
    try { pages = (await extractFileText(await file.arrayBuffer(), file.name, file.type)).pages }
    catch { return NextResponse.json({ error: 'Couldn’t read that file. If it’s a scanned PDF, it has no text to read.' }, { status: 422 }) }

    const chunks: { title: string; content: string }[] = []
    const multi = pages.length > 1
    pages.forEach((text, i) => {
      for (const c of chunkText(text, 1200, 40)) {
        if (chunks.length >= 250) return
        chunks.push({ title: multi ? `${file.name} · page ${i + 1}` : file.name, content: c })
      }
    })
    const chars = pages.reduce((n, p) => n + p.length, 0)
    if (!chunks.length) return NextResponse.json({ error: 'No readable text found in that file. Scanned PDFs (photos of pages) can’t be read yet.' }, { status: 422 })

    const { data: row, error } = await db.from('ai_knowledge_files').insert({
      company_id: companyId, name: file.name.slice(0, 200), mime: file.type || null, size_bytes: file.size,
      pages: pages.length, chars, chunks: chunks.length, created_by: access.userId || null,
    }).select('id, name, size_bytes, pages, chunks, created_at').maybeSingle()
    if (error || !row) return NextResponse.json({ error: /ai_knowledge_files/.test(error?.message || '') ? 'Run the COLVY_V326 database update in Supabase first.' : (error?.message || 'Failed') }, { status: 500 })

    const rows = chunks.map((c, n) => ({ company_id: companyId, source: 'file', source_id: `${row.id}#${n}`, title: c.title, content: c.content }))
    for (let i = 0; i < rows.length; i += 100) {
      const { error: e2 } = await db.from('ai_knowledge').insert(rows.slice(i, i + 100))
      if (e2) { await db.from('ai_knowledge_files').delete().eq('id', row.id); return NextResponse.json({ error: e2.message }, { status: 500 }) }
    }
    return NextResponse.json({ ok: true, file: row })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Failed' }, { status: 500 })
  }
}

// DELETE { companyId, id } → removes the file and (via trigger) its chunks.
export async function DELETE(req: NextRequest) {
  try {
    const db = admin()
    const b = await req.json().catch(() => ({}))
    const companyId = String(b.companyId || '')
    if (!(await requireCompanyAccess(req, db, companyId)).ok) return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
    const id = String(b.id || '')
    await db.from('ai_knowledge').delete().eq('company_id', companyId).eq('source', 'file').like('source_id', `${id}#%`)
    const { error } = await db.from('ai_knowledge_files').delete().eq('id', id).eq('company_id', companyId)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Failed' }, { status: 500 })
  }
}
