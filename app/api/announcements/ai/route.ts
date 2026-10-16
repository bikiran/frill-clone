import { NextRequest, NextResponse } from 'next/server'
import { requireCompanyAccess } from '@/lib/company-access'
import { guardAiRequest } from '@/lib/rate-limit'
import { adminDb } from '@/lib/announcements-server'
import { runAnnouncementAi, type AiAnnMode } from '@/lib/ai-announcement'
import { recordActivity } from '@/lib/agent/record'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const LABEL: Record<AiAnnMode, string> = { write: 'Wrote an announcement draft', improve: 'Tidied up an announcement', sms: 'Turned an announcement into an SMS', social: 'Turned an announcement into a social post' }

// POST { companyId, mode: write|improve|sms|social, brief?, title?, body?, category? }
// → { title?, html?, category?, sms?, facebook?, instagram?, note?, runId }
// Colvy AI in the announcement editor. Staff only; the workspace's AI plan,
// burst and daily limits apply (guardAiRequest). The result is a draft the
// person chooses to use. It's recorded with the rest of the AI's activity so
// "Why?" can show what it was asked and what it wrote.
export async function POST(req: NextRequest) {
  try {
    const db = adminDb()
    const b = await req.json().catch(() => ({}))
    const companyId = String(b.companyId || '')
    const access = await requireCompanyAccess(req, db, companyId)
    if (!access.ok) return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
    const mode = (['write', 'improve', 'sms', 'social'].includes(b.mode) ? b.mode : 'write') as AiAnnMode
    const guard = await guardAiRequest(req, companyId, 'ai_announcement')
    if (!guard.ok) return guard.response!

    const [{ data: co }, { data: tm }] = await Promise.all([
      db.from('companies').select('name, industry').eq('id', companyId).maybeSingle(),
      db.from('team_members').select('name, email').eq('company_id', companyId).eq('user_id', access.userId).limit(1),
    ])
    const who = tm?.[0]?.name || tm?.[0]?.email?.split('@')[0] || 'A team member'
    const r = await runAnnouncementAi(mode, {
      brief: String(b.brief || '').slice(0, 2000),
      title: String(b.title || '').slice(0, 200),
      body: String(b.body || '').slice(0, 60000),
      category: String(b.category || '').slice(0, 30),
      business: { name: co?.name, industry: co?.industry },
    }, companyId, db)
    if ('error' in r) return NextResponse.json({ error: r.error }, { status: 422 })

    const runId = await recordActivity(db, {
      companyId, roleKey: 'assistant', trigger: 'assistant', model: r.model || null,
      input: { for: who, tool: 'announcement_writer' },
      summary: `${LABEL[mode]} for ${who} when they asked. Nothing was published or sent.`,
      outcome: 'no_action',
    }, [{
      action_key: `announcement_${mode}`,
      input: { mode, brief: b.brief ? String(b.brief).slice(0, 500) : undefined, title: b.title ? String(b.title).slice(0, 200) : undefined },
      output: { title: r.title, sms: r.sms, facebook: r.facebook ? String(r.facebook).slice(0, 300) : undefined, note: r.note },
      status: 'ok', decision: 'allowed',
      decision_reason: `${who} asked for a draft. It stays a suggestion until they use it, and publishing is their choice.`,
    }], { status: 'completed' }).catch(() => null)

    const { ok: _ok, model: _m, ...out } = r
    return NextResponse.json({ ...out, runId })
  } catch (e: any) {
    return NextResponse.json({ error: 'Colvy AI is busy right now. Please try again.' }, { status: 500 })
  }
}
