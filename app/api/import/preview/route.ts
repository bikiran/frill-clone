import { NextRequest, NextResponse } from 'next/server'
import { requireCompanyAccess } from '@/lib/company-access'
import { adminDb } from '@/lib/import/server'
import { readSource, filterPayload, sanitizePayload, summarize, includeOf } from '@/lib/import/engine'
import { SourceError } from '@/lib/import/sources'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

/**
 * POST /api/import/preview
 * { companyId, source: 'canny' | 'zendesk' | 'csv', apiKey?, url?, payload?, include, publishArticles }
 *
 * Reads the source (or the parsed CSV) and reports exactly what an import would
 * do: how many items were found, how many are new, which are duplicates of what
 * the workspace already has, sample items and how statuses map. Writes nothing.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}))
    const { companyId, source } = body || {}
    const db = adminDb()
    if (!(await requireCompanyAccess(req, db, companyId)).ok) return NextResponse.json({ error: 'Not authorized' }, { status: 403 })

    const include = includeOf(body)
    let payload, complete = true, label: string | undefined, warnings: string[] = []
    if (source === 'csv') {
      payload = filterPayload(sanitizePayload(body.payload), include)
      label = String(body.label || 'Spreadsheet').slice(0, 80)
    } else if (source === 'canny' || source === 'zendesk') {
      const res = await readSource(source, { apiKey: body.apiKey, url: body.url, include, publishArticles: body.publishArticles }, Date.now() + 40_000)
      payload = filterPayload(res.payload, include)
      complete = res.complete; label = res.label; warnings = res.warnings
    } else {
      return NextResponse.json({ error: 'Pick a source to import from.' }, { status: 400 })
    }
    const summary = await summarize(db, companyId, payload)
    return NextResponse.json({ ok: true, label, complete, warnings, ...summary })
  } catch (e: any) {
    if (e instanceof SourceError) return NextResponse.json({ error: e.message }, { status: 400 })
    if (e?.name === 'TimeoutError' || e?.name === 'AbortError') return NextResponse.json({ error: 'The source took too long to answer. Try again in a minute.' }, { status: 504 })
    return NextResponse.json({ error: 'Couldn’t read the source. Check the details and try again.' }, { status: 500 })
  }
}
