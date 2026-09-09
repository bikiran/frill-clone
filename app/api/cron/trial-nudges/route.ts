import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { logJobRun } from '@/lib/job-log'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )
}

const DAY = 86400000

// Which milestone (if any) a trial is at right now. Returns null when the trial
// isn't at a nudge point, so the worker only emails around the key moments.
function milestone(endMs: number, now: number): 't_minus_3' | 't_zero' | 't_plus_3' | null {
  const left = endMs - now
  if (left > 0 && left <= 3 * DAY) return 't_minus_3'       // in the final 3 days
  if (left <= 0 && left > -1 * DAY) return 't_zero'         // just expired (today)
  if (left <= -3 * DAY && left > -4 * DAY) return 't_plus_3' // 3 days after expiry
  return null
}

const SUBDOMAIN = (slug?: string | null) => slug ? `https://${slug}.colvy.com` : 'https://colvy.com'

function emailFor(kind: string, business: string, billingUrl: string): { subject: string; html: string } {
  const btn = (label: string) => `<a href="${billingUrl}" style="display:inline-block;background:#ff7a6b;color:#fff;text-decoration:none;font-weight:700;font-size:14px;padding:11px 26px;border-radius:10px">${label}</a>`
  const wrap = (title: string, body: string, label: string) => ({
    subject: title,
    html: `<div style="background:#eef2ff;padding:28px 12px;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif">
      <div style="max-width:520px;margin:0 auto;background:#fff;border-radius:16px;padding:28px;text-align:center">
        <h2 style="margin:0 0 10px;font-size:20px;color:#1a1a1a">${title}</h2>
        <p style="margin:0 0 20px;color:#4b5563;font-size:14px;line-height:1.6">${body}</p>
        ${btn(label)}
        <p style="margin:20px 0 0;color:#9ca3af;font-size:12px">You’re receiving this because ${business} is on a Colvy trial.</p>
      </div></div>`,
  })
  if (kind === 't_minus_3') return wrap('Your Colvy trial ends in 3 days',
    `Keep your inbox, orders, calls and everything you’ve set up for ${business} running without interruption. Pick a plan before your trial ends and nothing skips a beat.`, 'Choose a plan')
  if (kind === 't_zero') return wrap('Your Colvy trial has ended',
    `Your trial for ${business} has finished, but your data is safe. Upgrade now to pick up exactly where you left off — inbox, orders, calls and all.`, 'Upgrade & keep going')
  return wrap('Still time to bring Colvy back',
    `${business}’s trial ended a few days ago. Your workspace and data are still here — upgrade any time to switch everything back on.`, 'Reactivate Colvy')
}

/**
 * GET /api/cron/trial-nudges
 *
 * Emails trial owners at three conversion moments — 3 days before expiry, on
 * expiry, and 3 days after — each sent at most once per trial cycle (deduped via
 * the trial_nudges table, keyed by trial_ends_at so a re-started trial re-nudges).
 * Skips demo / complimentary workspaces and anything without a billing email.
 * Runs daily (see vercel.json). No-op without RESEND_API_KEY.
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (secret) {
    const auth = req.headers.get('authorization') || ''
    if (auth !== `Bearer ${secret}`) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const startedAt = new Date().toISOString()
  const t0 = Date.now()
  const db = admin()
  const key = process.env.RESEND_API_KEY
  const from = 'Colvy <notifications@updates.colvy.com>'
  const now = Date.now()
  const floor = new Date(now - 30 * DAY).toISOString() // don't nudge trials that lapsed long ago

  let sent = 0, considered = 0, skippedNoEmail = 0
  try {
    const { data: companies } = await db.from('companies')
      .select('id, name, slug, plan, trial_ends_at, business_email, is_demo, is_complimentary')
      .eq('plan', 'trial')
      .not('trial_ends_at', 'is', null)
      .gte('trial_ends_at', floor)
      .limit(2000)

    for (const c of companies || []) {
      if (c.is_demo || c.is_complimentary) continue
      const endMs = new Date(c.trial_ends_at).getTime()
      if (!endMs) continue
      const kind = milestone(endMs, now)
      if (!kind) continue
      considered++

      // Only proceed when we can actually send — otherwise we'd claim the dedupe
      // row without sending and never retry once configured.
      if (!key) continue // email not configured — do nothing, retry a later run
      const to = c.business_email
      if (!to) { skippedNoEmail++; continue } // no address yet — retry when added

      // Dedupe: claim the (company, kind, trial_ends_at) row first. A unique
      // index makes the insert fail if this nudge already went out — so even
      // overlapping runs never double-send.
      const { error: claimErr } = await db.from('trial_nudges')
        .insert({ company_id: c.id, kind, trial_ends_at: c.trial_ends_at })
      if (claimErr) continue // already sent (unique violation) or table missing → skip

      const business = c.name || 'your business'
      const { subject, html } = emailFor(kind, business, `${SUBDOMAIN(c.slug)}/admin/billing`)
      try {
        await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ from, to, subject, html }),
        })
        sent++
      } catch { /* non-fatal — the row is claimed so we won't retry this cycle */ }
    }
  } catch (e: any) {
    await logJobRun({ job: 'trial-nudges', startedAt, durationMs: Date.now() - t0, status: 'error', error: e?.message })
    return NextResponse.json({ error: e?.message || 'failed' }, { status: 500 })
  }

  await logJobRun({ job: 'trial-nudges', startedAt, durationMs: Date.now() - t0, status: sent ? 'success' : 'idle', detail: { sent, considered, skippedNoEmail } })
  return NextResponse.json({ ok: true, sent, considered, skippedNoEmail })
}
