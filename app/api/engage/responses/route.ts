import { NextRequest, NextResponse } from 'next/server'
import { requireCompanyAccess } from '@/lib/company-access'
import { checkBurst, callerKey } from '@/lib/rate-limit'
import { deleteAnswers } from '@/lib/engage-admin'
import { engageDb } from '@/lib/engage-http'

export const dynamic = 'force-dynamic'

/**
 * POST /api/engage/responses { kind: 'poll' | 'survey', id, companyId, ids?: string[], all?: true }
 * Deletes votes or survey responses (V386 leaves those tables server-write
 * only). Staff of companyId only, and only rows of a poll / survey that
 * company owns.
 */
export async function POST(req: NextRequest) {
  const db = engageDb()
  if (!db) return NextResponse.json({ error: 'Not available' }, { status: 503 })
  let body: any = {}
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Bad request' }, { status: 400 }) }
  if (!(await requireCompanyAccess(req, db, body?.companyId)).ok) return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
  if (!checkBurst(`engage-delete:${callerKey(req, body?.companyId)}`, 30)) return NextResponse.json({ error: 'Too many requests. Please wait a moment.' }, { status: 429 })
  const out = await deleteAnswers(db, body || {})
  return NextResponse.json(out.body, { status: out.status })
}
