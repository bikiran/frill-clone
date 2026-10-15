'use client'

import { authFetch } from '@/lib/auth-fetch'
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { getCompanyByOwner, getCompanyBySlug, type Company } from '@/lib/board'
import { boardUrl, redirectToUserAdmin, RESERVED_SUBDOMAINS } from '@/lib/redirect'
import { track } from '@/lib/analytics'
import type { SetupStatus, SetupStepKey } from '@/lib/setup-status'
import { SETUP_HOME, SKIPPABLE_STEPS, addQuery, withReturnTo } from '@/lib/setup-return'
import { setupSteps, CheckMark, ArrowRight, MailIcon, SocialIcon, StoreIcon, PhoneIcon, BoltIcon, PeopleIcon } from '@/components/setup-steps'

// ── After sign-up: a short guided launcher ────────────────────────────────────
// Welcome → "what do you use?" (email, Facebook & Instagram, store, phone) →
// a plan with one button that starts the first connection. Each connect page
// brings them back to the dashboard's setup checklist (`/admin?setup=1`),
// which ticks steps off from what's really connected and skips what they said
// they don't use. Also reached from Settings → "Restart setup".
//
// Before any of that it still does the old post-signup housekeeping: repair a
// half-made workspace, re-create a lost one from what signup stashed, apply
// the business profile from an OAuth signup, and count the funnel events.
// Signup runs on colvy.com, so none of that happens when this is opened on a
// workspace's own subdomain (Restart setup) — the workspace is long made.

type Pick = (typeof SKIPPABLE_STEPS)[number]
type Ws = Company & { industry?: string | null }

// Industries that mostly don't sell online start with "store" unticked.
const NO_STORE_INDUSTRIES = ['Trades & Home Services', 'Real Estate', 'Professional Services', 'Healthcare', 'Education', 'Finance', 'Logistics', 'SaaS']

const PICKS: { key: Pick; title: string; sub: string; Icon: (p: { size?: number; color?: string }) => React.ReactNode }[] = [
  { key: 'email', title: 'Email', sub: 'Gmail or your own domain', Icon: MailIcon },
  { key: 'meta', title: 'Facebook & Instagram', sub: 'Messages and comments', Icon: SocialIcon },
  { key: 'store', title: 'Online store', sub: 'Shopify or WooCommerce', Icon: StoreIcon },
  { key: 'phone', title: 'Business phone number', sub: 'Calls and texts, Australian number', Icon: PhoneIcon },
]

// The workspace subdomain this page is open on (Settings → Restart setup), if any.
function tenantSlug(): string | null {
  const h = window.location.hostname
  if (!h.endsWith('.colvy.com') || h === 'www.colvy.com') return null
  const sub = h.slice(0, -'.colvy.com'.length)
  return sub && !sub.includes('.') && !RESERVED_SUBDOMAINS.has(sub) ? sub : null
}

// Open a page inside the workspace. Signup happens on colvy.com but the
// workspace lives on its own subdomain with its own sign-in, so the session is
// handed over the same way the sign-in page does (/auth/handoff, which only
// forwards to a same-site path).
async function openInWorkspace(slug: string | undefined, path: string) {
  const host = window.location.hostname
  const sameOrigin = !slug || host.includes('localhost') || host.includes('vercel.app') || !host.endsWith('colvy.com') || host === `${slug}.colvy.com`
  if (sameOrigin) { window.location.href = path; return }
  if (RESERVED_SUBDOMAINS.has(slug)) { window.location.href = boardUrl(slug, path); return }
  const { data: { session } } = await supabase.auth.getSession()
  if (session?.access_token && session?.refresh_token) {
    window.location.href = `https://${slug}.colvy.com/auth/handoff#access_token=${encodeURIComponent(session.access_token)}&refresh_token=${encodeURIComponent(session.refresh_token)}&next=${encodeURIComponent(path)}`
    return
  }
  window.location.href = boardUrl(slug, path)
}

// What's connected in this workspace, or null. Staff only (the API answers 403
// to anyone else), so a null also means "not one of yours".
async function loadSetupStatus(companyId: string): Promise<SetupStatus | null> {
  try {
    const r = await authFetch(`/api/setup/status?companyId=${companyId}`)
    const s = await r.json().catch(() => null)
    return r.ok && Array.isArray(s?.steps) ? s : null
  } catch { return null }
}

export default function OnboardingPage() {
  const [company, setCompany] = useState<Ws | null>(null)
  const [user, setUser] = useState<{ id: string; email?: string; user_metadata?: Record<string, unknown> } | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [status, setStatus] = useState<SetupStatus | null>(null)
  const [screen, setScreen] = useState<0 | 1 | 2>(0)
  const [picks, setPicks] = useState<Set<Pick>>(new Set(['email', 'meta', 'store', 'phone']))
  const [going, setGoing] = useState('')

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      const u = data?.session?.user
      if (!u) { window.location.href = '/signup'; return }
      setUser(u)

      // Self-heal the workspace as soon as we know who's signed in — BEFORE and
      // independent of the client-side read below. This provisions the
      // subdomain, ensures the owner's admin membership, and seeds sample
      // content if it's empty. Server-scoped to this user's own company, so
      // it's safe; fire-and-forget so it never blocks onboarding.
      const token = data?.session?.access_token
      const slug = tenantSlug()
      if (token && !slug) {
        fetch('/api/companies/ensure-domain', { method: 'POST', headers: { Authorization: `Bearer ${token}` } }).catch(() => {})
      }

      // Opened on the workspace's own subdomain (Restart setup): that one — if
      // they work there. Anyone signed in can open acme.colvy.com/onboarding (a
      // customer from its public board, say); they get their own workspace.
      let co: Ws | null = null
      let st: SetupStatus | null = null
      if (slug) {
        const here = await getCompanyBySlug(slug)
        st = here?.id ? await loadSetupStatus(here.id) : null
        if (st) co = here
      }
      // A workspace created seconds ago can briefly be unreadable (row
      // replication / RLS catch-up). Retry a few times instead of giving up on
      // the first null.
      for (let i = 0; i < 5 && !co; i++) {
        co = await getCompanyByOwner(u.id)
        if (!co) await new Promise(r => setTimeout(r, 800))
      }

      // Recovery: the workspace row may have never been created — signup can
      // lose the slug/name when Supabase's email-verify redirect strips the
      // query string, leaving a user with no company. Re-create it from the
      // details stashed in localStorage at signup, owned by this account.
      if (!co) {
        try {
          const pending = JSON.parse(localStorage.getItem('pending_company') || 'null')
          if (pending?.slug && pending?.name) {
            const r = await authFetch('/api/companies', {
              method: 'POST', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ userId: u.id, slug: pending.slug, name: pending.name, industry: pending.industry }),
            })
            const d = await r.json().catch(() => ({}))
            if (r.ok && d.company) { co = d.company; localStorage.removeItem('pending_company') }
            else if (r.status === 409) { co = await getCompanyByOwner(u.id) } // slug already exists
            // Make sure the fresh workspace is fully set up (membership + seed + domain).
            if (co && token) fetch('/api/companies/ensure-domain', { method: 'POST', headers: { Authorization: `Bearer ${token}` } }).catch(() => {})
          }
        } catch {}
      }

      // Funnel: a workspace reached the post-signup screen. Once per workspace
      // per browser so a revisit doesn't re-count it.
      if (co?.id && !slug) {
        try {
          const k = `colvy_ws_tracked_${co.id}`
          if (!localStorage.getItem(k)) { track('workspace_created', { plan: co.plan || null }); localStorage.setItem(k, '1') }
        } catch { track('workspace_created') }
      }
      // Apply the business profile captured during an OAuth signup — the OAuth
      // callback only carries slug/name/industry, so the website/address/phone/
      // hours (and the person's full name) are stashed at signup and applied
      // here once, then cleared.
      if (co?.id && !slug) {
        try {
          const prof = JSON.parse(localStorage.getItem('pending_business_profile') || 'null')
          if (prof) {
            const patch: Record<string, unknown> = {}
            for (const k of ['website', 'business_address', 'business_city', 'business_state', 'business_postcode', 'business_country', 'business_phone', 'business_hours']) {
              if (prof[k] != null && prof[k] !== '') patch[k] = prof[k]
            }
            if (Object.keys(patch).length) await supabase.from('companies').update(patch).eq('id', co.id)
            if (prof.fullName) {
              try {
                await authFetch('/api/team/me', {
                  method: 'PATCH', headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ companyId: co.id, name: prof.fullName }),
                })
              } catch {}
              try { await supabase.auth.updateUser({ data: { display_name: prof.fullName, full_name: prof.fullName } }) } catch {}
            }
            localStorage.removeItem('pending_business_profile')
          }
        } catch {}
      }

      // What's already connected (e.g. a store installed from Shopify before
      // signing up) — ticked and locked on the "what do you use?" screen.
      if (co?.id) {
        const s = st || await loadSetupStatus(co.id)
        if (s) {
          setStatus(s)
          const industry = s.industry || co.industry || ''
          const next = new Set<Pick>(['email', 'meta', 'store', 'phone'])
          if (NO_STORE_INDUSTRIES.includes(industry) && s.store == null) next.delete('store')
          setPicks(next)
        }
      }

      setCompany(co)
      setLoaded(true)
    })
  }, [])

  const stateOf = (k: SetupStepKey) => status?.steps.find(s => s.key === k)?.state || 'todo'
  const isDone = (k: SetupStepKey) => stateOf(k) === 'done'

  // Leaving for the workspace = onboarding done. Once per workspace per browser,
  // and not again for a Restart setup on the workspace's own subdomain.
  const markDone = () => {
    if (tenantSlug()) return
    try {
      const k = company?.id ? `colvy_onb_done_${company.id}` : null
      if (!k || !localStorage.getItem(k)) { track('onboarding_completed', { slug: company?.slug || null }); if (k) localStorage.setItem(k, '1') }
    } catch { try { track('onboarding_completed') } catch {} }
  }

  // Where the checklist should land them, with the channels they don't use skipped.
  const skipped = SKIPPABLE_STEPS.filter(k => !picks.has(k) && !isDone(k))
  const checklistPath = addQuery(SETUP_HOME, skipped.length ? `skip=${skipped.join(',')}` : '')

  const metas = setupSteps(status)
  const plan = metas.filter(m => !(SKIPPABLE_STEPS as readonly string[]).includes(m.key) || picks.has(m.key as Pick))
  const todo = plan.filter(m => stateOf(m.key) === 'todo')
  const first = todo[0]
  const minutes = todo.reduce((a, m) => a + m.minutes, 0)

  const start = async () => {
    setGoing('start'); markDone()
    await openInWorkspace(company?.slug, first ? withReturnTo(first.href, checklistPath) : checklistPath)
  }
  const toDashboard = async () => { setGoing('dash'); markDone(); await openInWorkspace(company?.slug, checklistPath) }
  const skipAll = async () => { setGoing('skip'); markDone(); await openInWorkspace(company?.slug, '/admin') }

  const togglePick = (k: Pick) => {
    if (isDone(k)) return
    setPicks(prev => { const n = new Set(prev); if (n.has(k)) n.delete(k); else n.add(k); return n })
  }

  const firstName = String(user?.user_metadata?.display_name || user?.user_metadata?.full_name || '').trim().split(/\s+/)[0] || ''

  if (!loaded) return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--canvas)' }}>
      <div className="w-8 h-8 rounded-full border-2 animate-spin" style={{ borderColor: 'var(--coral)', borderTopColor: 'transparent' }} />
    </div>
  )

  // Loaded, but the workspace couldn't be read (e.g. RLS/replication lag, or
  // the company row wasn't created). Show a way forward instead of a spinner.
  if (!company) return (
    <div className="min-h-screen flex items-center justify-center px-6" style={{ background: 'var(--canvas)' }}>
      <div className="max-w-md w-full text-center">
        <div className="mx-auto mb-4 w-14 h-14 rounded-2xl flex items-center justify-center" style={{ background: 'var(--peach)' }}>
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="var(--coral)" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" /></svg>
        </div>
        <h1 className="text-2xl font-black mb-2" style={{ color: 'var(--ink)' }}>Finishing your workspace setup</h1>
        <p className="text-base mb-6" style={{ color: 'var(--slate)' }}>
          Your account is ready, but we couldn&rsquo;t load your workspace just yet. Give it a moment and try again.
        </p>
        <div className="flex items-center justify-center gap-3">
          <button onClick={() => window.location.reload()}
            className="px-6 py-2.5 rounded-xl font-semibold text-white cursor-pointer" style={{ background: 'var(--coral)' }}>
            Retry
          </button>
          <button onClick={async () => { if (user) await redirectToUserAdmin(user.id); else window.location.href = '/admin' }}
            className="px-6 py-2.5 rounded-xl border font-medium cursor-pointer" style={{ borderColor: 'var(--border)', color: 'var(--ink)' }}>
            Go to dashboard
          </button>
        </div>
      </div>
    </div>
  )

  return (
    <div className="onb">
      <style>{`
        .onb { min-height: 100vh; background: var(--peach); display: flex; justify-content: center; padding: 40px 16px 56px; }
        .onb-wrap { width: 100%; max-width: 560px; }
        .onb-steps { display: flex; gap: 6px; margin: 0 auto 22px; max-width: 180px; }
        .onb-steps span { flex: 1; height: 4px; border-radius: 99px; background: rgba(0,0,0,.08); transition: background .3s ease; }
        .onb-steps span.on { background: var(--coral); }
        .onb-card { background: var(--card, #fff); border: 1px solid var(--border); border-radius: 20px; padding: 28px; box-shadow: 0 10px 40px -20px rgba(16,24,40,.25); animation: onb-in .35s cubic-bezier(.2,.8,.2,1) both; }
        @keyframes onb-in { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } }
        .onb-h { margin: 0 0 8px; font-size: 26px; line-height: 1.2; font-weight: 900; color: var(--ink); letter-spacing: -.01em; }
        .onb-p { margin: 0 0 20px; font-size: 15px; line-height: 1.55; color: var(--slate); }
        .onb-why { list-style: none; margin: 0 0 24px; padding: 0; display: grid; gap: 12px; }
        .onb-why li { display: flex; align-items: center; gap: 12px; font-size: 14px; color: var(--ink); }
        .onb-why-ic { width: 36px; height: 36px; border-radius: 10px; background: var(--peach); color: var(--coral); display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
        .onb-picks { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 22px; }
        .onb-pick { position: relative; display: flex; flex-direction: column; align-items: flex-start; gap: 10px; padding: 14px; border-radius: 14px; border: 1.5px solid var(--border); background: var(--card, #fff); cursor: pointer; text-align: left; font: inherit; color: inherit; transition: border-color .15s ease, background .15s ease, transform .1s ease; }
        .onb-pick:active { transform: scale(.98); }
        .onb-pick.on { border-color: var(--coral); background: var(--peach); }
        .onb-pick.locked { cursor: default; border-color: #a7f3d0; background: #ecfdf5; }
        .onb-pick-ic { width: 38px; height: 38px; border-radius: 11px; background: var(--canvas); color: var(--slate); display: flex; align-items: center; justify-content: center; }
        .onb-pick.on .onb-pick-ic { background: #fff; color: var(--coral); }
        .onb-pick.locked .onb-pick-ic { background: #fff; color: #059669; }
        .onb-pick-t { font-size: 14px; font-weight: 800; color: var(--ink); line-height: 1.25; }
        .onb-pick-s { font-size: 12px; color: var(--slate); line-height: 1.35; margin-top: 2px; }
        .onb-tick { position: absolute; top: 12px; right: 12px; width: 22px; height: 22px; border-radius: 50%; border: 1.5px solid var(--border); display: flex; align-items: center; justify-content: center; color: #fff; background: var(--card, #fff); transition: all .15s ease; }
        .onb-pick.on .onb-tick { background: var(--coral); border-color: var(--coral); }
        .onb-pick.locked .onb-tick { background: #10b981; border-color: #10b981; }
        .onb-plan { list-style: none; margin: 0 0 22px; padding: 0; border: 1px solid var(--border); border-radius: 14px; overflow: hidden; }
        .onb-plan li { display: flex; align-items: center; gap: 12px; padding: 12px 14px; font-size: 14px; color: var(--ink); }
        .onb-plan li + li { border-top: 1px solid var(--border); }
        .onb-plan li.done { color: var(--slate); }
        .onb-plan-ic { width: 32px; height: 32px; border-radius: 50%; background: var(--canvas); color: var(--slate); display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
        .onb-plan li.first .onb-plan-ic { background: var(--peach); color: var(--coral); }
        .onb-plan li.done .onb-plan-ic { background: #10b981; color: #fff; }
        .onb-plan-m { margin-left: auto; font-size: 12px; color: var(--slate); white-space: nowrap; }
        .onb-actions { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
        .onb-btn { display: inline-flex; align-items: center; justify-content: center; gap: 8px; padding: 12px 20px; border-radius: 12px; font-size: 15px; font-weight: 700; cursor: pointer; border: 0; text-decoration: none; }
        .onb-btn:disabled { opacity: .6; cursor: progress; }
        .onb-primary { background: var(--coral); color: #fff; flex: 1; min-width: 200px; }
        .onb-primary:hover:not(:disabled) { background: var(--coral-hover, #f56354); }
        .onb-ghost { background: transparent; color: var(--ink); border: 1px solid var(--border); }
        .onb-ghost:hover:not(:disabled) { background: var(--canvas); }
        .onb-later { display: block; margin: 18px auto 0; background: none; border: 0; font-size: 13.5px; color: var(--slate); cursor: pointer; }
        .onb-later:hover { color: var(--ink); text-decoration: underline; }
        .onb-note { margin: -8px 0 18px; font-size: 12.5px; color: var(--slate); }
        @media (max-width: 480px) {
          .onb { padding-top: 24px; }
          .onb-card { padding: 22px 18px; border-radius: 18px; }
          .onb-h { font-size: 22px; }
          .onb-picks { grid-template-columns: 1fr; }
          .onb-pick { flex-direction: row; align-items: center; }
          .onb-actions .onb-btn { width: 100%; }
        }
        @media (prefers-reduced-motion: reduce) { .onb *, .onb-card { animation: none !important; transition: none !important; } }
      `}</style>

      <div className="onb-wrap">
        <div className="onb-steps" aria-label={`Step ${screen + 1} of 3`}>
          {[0, 1, 2].map(i => <span key={i} className={i <= screen ? 'on' : ''} />)}
        </div>

        {screen === 0 && (
          <div className="onb-card" key="welcome">
            <h1 className="onb-h">Welcome to Colvy{firstName ? `, ${firstName}` : ''}</h1>
            <p className="onb-p">
              {company.name ? <><strong style={{ color: 'var(--ink)' }}>{company.name}</strong> is ready. </> : 'Your workspace is ready. '}
              Let&rsquo;s connect the places your customers already reach you. Most businesses are done in 10 to 15 minutes.
            </p>
            <ul className="onb-why">
              <li><span className="onb-why-ic"><MailIcon size={18} /></span>Every email, DM, text and call in one inbox</li>
              <li><span className="onb-why-ic"><PeopleIcon size={18} /></span>Each customer&rsquo;s orders and history beside the chat</li>
              <li><span className="onb-why-ic"><BoltIcon size={18} /></span>Common questions answered for you, day or night</li>
            </ul>
            <div className="onb-actions">
              <button type="button" className="onb-btn onb-primary" onClick={() => setScreen(1)}>
                Let&rsquo;s get started <ArrowRight size={16} />
              </button>
            </div>
          </div>
        )}

        {screen === 1 && (
          <div className="onb-card" key="pick">
            <h1 className="onb-h">What does {company.name || 'your business'} use?</h1>
            <p className="onb-p">Tick everything you&rsquo;d like in Colvy. You can add the rest any time.</p>
            <div className="onb-picks" role="group" aria-label="What you use">
              {PICKS.map(p => {
                const locked = isDone(p.key)
                const on = locked || picks.has(p.key)
                return (
                  <button key={p.key} type="button" role="checkbox" aria-checked={on} aria-disabled={locked}
                    className={`onb-pick ${on ? 'on' : ''} ${locked ? 'locked' : ''}`} onClick={() => togglePick(p.key)}>
                    <span className="onb-pick-ic"><p.Icon size={19} /></span>
                    <span style={{ minWidth: 0, paddingRight: 24 }}>
                      <span className="onb-pick-t" style={{ display: 'block' }}>{p.title}</span>
                      <span className="onb-pick-s" style={{ display: 'block' }}>{locked ? 'Already connected' : p.sub}</span>
                    </span>
                    <span className="onb-tick" aria-hidden="true">{on && <CheckMark size={13} color="#fff" />}</span>
                  </button>
                )
              })}
            </div>
            <div className="onb-actions">
              <button type="button" className="onb-btn onb-ghost" onClick={() => setScreen(0)}>Back</button>
              <button type="button" className="onb-btn onb-primary" onClick={() => {
                track('setup_started', { picks: SKIPPABLE_STEPS.filter(k => picks.has(k) || isDone(k)).join(',') })
                setScreen(2)
              }}>
                Continue <ArrowRight size={16} />
              </button>
            </div>
          </div>
        )}

        {screen === 2 && (
          <div className="onb-card" key="go">
            <h1 className="onb-h">{first ? 'Here’s your plan' : 'You’re all set'}</h1>
            <p className="onb-p">
              {first
                ? <>About {minutes} minutes, one step at a time. After each one you&rsquo;ll land back on your checklist, ready for the next.</>
                : <>Everything you picked is already connected. Your dashboard has the rest.</>}
            </p>
            <ol className="onb-plan">
              {plan.map(m => {
                const st = stateOf(m.key)
                return (
                  <li key={m.key} className={`${st === 'done' ? 'done' : ''} ${first?.key === m.key ? 'first' : ''}`}>
                    <span className="onb-plan-ic" aria-hidden="true">{st === 'done' ? <CheckMark size={15} /> : <m.Icon size={15} />}</span>
                    <span>{st === 'done' ? m.doneTitle : m.title}</span>
                    <span className="onb-plan-m">{st === 'done' ? 'Done' : st === 'waiting' ? 'Waiting for approval' : `~${m.minutes} min`}</span>
                  </li>
                )
              })}
            </ol>
            {first?.key === 'phone' && <p className="onb-note">A new Australian number needs a quick ID check, which can take a day or two to approve.</p>}
            <div className="onb-actions">
              <button type="button" className="onb-btn onb-ghost" onClick={() => setScreen(1)} disabled={!!going}>Back</button>
              {first ? (
                <button type="button" className="onb-btn onb-primary" onClick={start} disabled={!!going}>
                  {going === 'start' ? 'Opening…' : <>{first.cta} <ArrowRight size={16} /></>}
                </button>
              ) : (
                <button type="button" className="onb-btn onb-primary" onClick={toDashboard} disabled={!!going}>
                  {going === 'dash' ? 'Opening…' : <>Go to my dashboard <ArrowRight size={16} /></>}
                </button>
              )}
            </div>
            {first && (
              <button type="button" className="onb-later" onClick={toDashboard} disabled={!!going}>
                {going === 'dash' ? 'Opening…' : 'I’ll do it from my dashboard'}
              </button>
            )}
          </div>
        )}

        {screen < 2 && (
          <button type="button" className="onb-later" onClick={skipAll} disabled={!!going}>
            {going === 'skip' ? 'Opening…' : 'Skip for now — take me to my dashboard'}
          </button>
        )}
      </div>
    </div>
  )
}
