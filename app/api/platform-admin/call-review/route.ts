import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createAIService } from '@/lib/ai-service'

export const dynamic = 'force-dynamic'

const SUPER_ADMIN = 'bishalstha76@gmail.com'

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

async function requireSuperAdmin(req: NextRequest, db: any): Promise<boolean> {
  try {
    const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '')
    if (!token) return false
    const { data } = await db.auth.getUser(token)
    return data?.user?.email === SUPER_ADMIN
  } catch { return false }
}

// Build a readable transcript from whatever the call has: structured segments
// (preferred, with speakers) or the plain transcription string. A bracketed
// routing marker (e.g. "[to voicemail: nobody online]") is NOT a transcript.
function transcriptOf(call: any): string {
  const segs = Array.isArray(call.transcript_segments) ? call.transcript_segments : []
  if (segs.length) {
    return segs.map((s: any) => `${s.speaker || 'Speaker'}: ${s.text || ''}`.trim()).filter(Boolean).join('\n')
  }
  const t = typeof call.transcription === 'string' ? call.transcription.trim() : ''
  if (t && !t.startsWith('[')) return t
  return ''
}

// POST { callId, force? } — super-admin: generate (and cache) an admin-facing AI
// overview of how a call went, incl. likely technical/sound issues. Cached on
// the calls row so re-opening the call is instant; pass force:true to regenerate.
export async function POST(req: NextRequest) {
  try {
    const db = admin()
    if (!(await requireSuperAdmin(req, db))) return NextResponse.json({ error: 'Not authorized' }, { status: 403 })

    const body = await req.json().catch(() => ({}))
    const callId = body?.callId
    const force = !!body?.force
    if (!callId) return NextResponse.json({ error: 'callId required' }, { status: 400 })

    const { data: call } = await db.from('calls').select('*').eq('id', callId).maybeSingle()
    if (!call) return NextResponse.json({ error: 'Call not found' }, { status: 404 })

    // Serve the cached review unless a regenerate was asked for.
    if (!force && call.ai_admin_review) {
      return NextResponse.json({ review: call.ai_admin_review, cached: true, at: call.ai_admin_review_at })
    }

    if (!process.env.ANTHROPIC_API_KEY) {
      return NextResponse.json({ error: 'AI isn’t configured (ANTHROPIC_API_KEY not set).' }, { status: 400 })
    }

    const transcript = transcriptOf(call)
    let review
    try {
      const ai = createAIService()
      review = await ai.analyzeCallForAdmin({
        direction: call.direction,
        status: call.status,
        cause: call.cause || undefined,
        durationSeconds: call.duration_seconds ?? undefined,
        isVoicemail: !!call.is_voicemail,
        agentRating: typeof call.rating === 'number' ? call.rating : null,
        transcript,
      })
    } catch (e: any) {
      return NextResponse.json({ error: `AI analysis failed: ${e?.message || 'error'}` }, { status: 500 })
    }

    const at = new Date().toISOString()
    // Best-effort cache; if the columns don't exist yet (migration not run), still
    // return the review so the feature works before the migration lands.
    try {
      const { error } = await db.from('calls').update({ ai_admin_review: review, ai_admin_review_at: at }).eq('id', callId)
      if (error && !/column .* does not exist|schema cache/i.test(error.message)) throw error
    } catch (e: any) {
      return NextResponse.json({ review, cached: false, at, warning: 'Generated but not saved (run migration COLVY_V312).' })
    }
    return NextResponse.json({ review, cached: false, at })
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Failed' }, { status: 500 })
  }
}
