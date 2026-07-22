import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

/** Default ceiling per company per day, per endpoint. Override per company via
 *  companies.ai_daily_limit, or globally with AI_DAILY_LIMIT. */
const DEFAULT_DAILY_LIMIT = Number(process.env.AI_DAILY_LIMIT || 500)

/** Short-window burst guard, held in memory. */
const BURST_MAX = Number(process.env.AI_BURST_LIMIT || 20)
const BURST_WINDOW_MS = 60_000

const burst = new Map<string, { count: number; resetAt: number }>()

/**
 * A quick in-memory burst check.
 *
 * Serverless instances don't share memory, so this is not a hard guarantee —
 * it's a cheap first line that stops a single instance being hammered without
 * a database round trip. The daily counter below is the real ceiling.
 */
export function checkBurst(key: string, max = BURST_MAX): boolean {
  const now = Date.now()
  const entry = burst.get(key)
  if (!entry || now > entry.resetAt) {
    burst.set(key, { count: 1, resetAt: now + BURST_WINDOW_MS })
    return true
  }
  if (entry.count >= max) return false
  entry.count++
  return true
}

/** Best-effort caller identity for burst keying. */
export function callerKey(req: NextRequest, companyId?: string | null): string {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    || req.headers.get('x-real-ip')
    || 'unknown'
  return `${companyId || 'nocompany'}:${ip}`
}

export interface GuardResult {
  ok: boolean
  response?: NextResponse
  used?: number
  limit?: number
}

/**
 * Guard an AI endpoint.
 *
 * Enforces three things, in increasing cost order:
 *   1. a company must be identified — anonymous callers are refused outright
 *   2. a per-instance burst limit, with no database round trip
 *   3. a per-company daily ceiling, recorded so spend is visible
 *
 * Returns { ok: false, response } when the caller should be turned away; the
 * route should return that response unchanged.
 */
export async function guardAiRequest(
  req: NextRequest,
  companyId: string | null | undefined,
  endpoint = 'ai',
): Promise<GuardResult> {
  // 1. No company, no service. These endpoints previously accepted anything.
  if (!companyId) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: 'companyId is required' },
        { status: 400 },
      ),
    }
  }

  // 2. Burst.
  if (!checkBurst(callerKey(req, companyId))) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: 'Too many requests. Please wait a moment and try again.' },
        { status: 429, headers: { 'Retry-After': '60' } },
      ),
    }
  }

  // 3. Daily ceiling.
  try {
    const db = admin()
    const day = new Date().toISOString().slice(0, 10)

    const { data: company } = await db.from('companies')
      .select('id, ai_daily_limit').eq('id', companyId).maybeSingle()
    // An unknown company id is not a real caller.
    if (!company) {
      return {
        ok: false,
        response: NextResponse.json({ error: 'Unknown company' }, { status: 403 }),
      }
    }
    const limit = company.ai_daily_limit ?? DEFAULT_DAILY_LIMIT

    const { data: row } = await db.from('ai_usage')
      .select('id, requests')
      .eq('company_id', companyId).eq('day', day).eq('endpoint', endpoint)
      .maybeSingle()

    const used = row?.requests || 0
    if (used >= limit) {
      return {
        ok: false,
        used, limit,
        response: NextResponse.json(
          {
            error: 'Daily AI limit reached for this workspace. It resets at midnight.',
            used, limit,
          },
          { status: 429 },
        ),
      }
    }

    // Count it. Update-then-insert rather than upsert, so we don't depend on
    // conflict-target behaviour.
    if (row) {
      await db.from('ai_usage')
        .update({ requests: used + 1, updated_at: new Date().toISOString() })
        .eq('id', row.id)
    } else {
      await db.from('ai_usage')
        .insert({ company_id: companyId, day, endpoint, requests: 1 })
    }

    return { ok: true, used: used + 1, limit }
  } catch (e) {
    // If the counter table is missing or unreachable, fall through rather than
    // taking the feature down — the burst limit above still applies.
    console.error('[ai guard] usage check failed', e)
    return { ok: true }
  }
}
