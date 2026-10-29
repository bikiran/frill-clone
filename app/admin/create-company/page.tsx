'use client'

import { authFetch } from '@/lib/auth-fetch'
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { isValidSlug, isSlugAvailable } from '@/lib/board'
import { PLAN_NAMES, Plan } from '@/lib/plan'
import { useRouter } from 'next/navigation'
import { INDUSTRIES } from '@/lib/industries'
import { AdminPage, Panel } from '@/components/ui/AdminKit'

const SUPER_ADMIN_EMAIL = 'bishalstha76@gmail.com'
// The real tiers customers buy (plus the trial state). Values match
// companies.plan / lib/plan.ts, so the entitlement model applies exactly.
const PLANS = ['free', 'trial', 'feedback', 'omnichannel', 'everything', 'enterprise']
const PLAN_HINT: Record<string, string> = {
  free: 'The basics, no charge', trial: '14 days of everything', feedback: 'Ideas, roadmap, surveys',
  omnichannel: 'Inbox, contacts, SMS', everything: 'The whole platform', enterprise: 'Set up by the Colvy team',
}

// A readable temporary password from the browser's secure random source.
function newPassword() {
  const chars = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789'
  const bytes = crypto.getRandomValues(new Uint8Array(12))
  return Array.from(bytes, b => chars[b % chars.length]).join('') + '!'
}

export default function CreateCompanyPage() {
  const router = useRouter()
  const [user, setUser] = useState<any>(null)

  // Company fields
  const [ownerName, setOwnerName] = useState('')
  const [ownerEmail, setOwnerEmail] = useState('')
  const [ownerPassword, setOwnerPassword] = useState('')
  const [companyName, setCompanyName] = useState('')
  const [slug, setSlug] = useState('')
  const [industry, setIndustry] = useState('')
  const [plan, setPlan] = useState('free')
  const [accentColor, setAccentColor] = useState('#ff7a6b')
  const [description, setDescription] = useState('')

  const [slugStatus, setSlugStatus] = useState<'idle'|'checking'|'available'|'taken'|'invalid'>('idle')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState<any>(null)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }: any) => {
      const u = data?.session?.user
      if (u?.email !== SUPER_ADMIN_EMAIL) { router.push('/admin'); return }
      setUser(u)
    })
  }, [router])

  // Auto slug from company name
  useEffect(() => {
    if (!companyName) { setSlug(''); return }
    const auto = companyName.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').slice(0, 30)
    if (auto.length >= 3) setSlug(auto)
  }, [companyName])

  // Check slug
  useEffect(() => {
    if (!slug) { setSlugStatus('idle'); return }
    if (!isValidSlug(slug)) { setSlugStatus('invalid'); return }
    setSlugStatus('checking')
    const t = setTimeout(async () => {
      const ok = await isSlugAvailable(slug)
      setSlugStatus(ok ? 'available' : 'taken')
    }, 500)
    return () => clearTimeout(t)
  }, [slug])

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    if (slugStatus !== 'available') { setError('Slug not available'); return }

    setLoading(true)
    try {
      // 1. Create the owner's auth account
      const res = await authFetch('/api/admin/create-user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: ownerEmail, password: ownerPassword, name: ownerName, role: 'owner' }),
      })
      const result = await res.json()
      if (result.error) throw new Error(result.error)

      // 2. Use the user ID returned by the create-user route (works for both
      //    newly created and pre-existing accounts). Client-side listUsers()
      //    doesn't work without the service role, which caused failures before.
      const userId = result.userId

      // 3. Create the company via API route
      const coRes = await authFetch('/api/companies', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: userId || ownerEmail, // fallback to email if no ID yet
          slug: slug.toLowerCase(),
          name: companyName.trim(),
          industry,
          accentColor,
          description: description.trim(),
          plan,
        }),
      })
      const coResult = await coRes.json()
      if (coResult.error && !coResult.error.includes('duplicate')) throw new Error(coResult.error)

      // 4. The plan is set by /api/companies (only the platform admin may
      //    choose one); the description is saved here.
      if (coResult.company?.id && description.trim()) {
        await (supabase as any).from('companies').update({ description: description.trim() }).eq('id', coResult.company.id)
      }

      // 5. Auto-register subdomain in Vercel
      try {
        await authFetch('/api/domains', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ domain: `${slug.toLowerCase()}.colvy.com`, companyId: coResult.company?.id }),
        })
      } catch {}

      setSuccess({
        ownerEmail,
        ownerPassword,
        boardUrl: `https://${slug}.colvy.com`,
        adminUrl: `https://${slug}.colvy.com/admin`,
        plan,
      })

      // Reset form
      setOwnerName(''); setOwnerEmail(''); setOwnerPassword('')
      setCompanyName(''); setSlug(''); setIndustry('')
      setPlan('free'); setDescription('')

    } catch (err: any) {
      setError(err.message)
    }
    setLoading(false)
  }

  if (!user) return <div className="p-8" style={{ color: 'var(--slate)' }}>Loading…</div>

  const slugNote = { idle: '', checking: 'Checking…', available: 'Available', taken: 'Already taken', invalid: 'Use 3–30 lowercase letters, numbers and dashes' }[slugStatus]
  const copy = (t: string) => { try { navigator.clipboard.writeText(t) } catch {} }

  return (
    <AdminPage width="sm" title="Create a company" sub="Make a workspace and its owner’s account in one go. Only Colvy’s platform admin can do this."
      back={{ href: '/admin', label: 'Admin' }}>
      {success && (
        <section className="cc-done">
          <p className="cc-done-h">
            <span aria-hidden><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg></span>
            Company created
          </p>
          {[
            ['Board', success.boardUrl, true],
            ['Admin', success.adminUrl, true],
            ['Login email', success.ownerEmail, false],
            ['Password', success.ownerPassword, false],
          ].map(([k, v, link]) => (
            <div key={k as string} className="cc-done-row">
              <small>{k}</small>
              {link ? <a href={v as string} target="_blank" rel="noopener">{v}</a> : <code>{v}</code>}
              <button type="button" className="ak-btn sm" onClick={() => copy(v as string)}>Copy</button>
            </div>
          ))}
          <div className="cc-done-row"><small>Plan</small><span>{PLAN_NAMES[success.plan as Plan] || success.plan}</span></div>
          <button type="button" className="ak-btn ghost sm" style={{ marginTop: 10 }} onClick={() => setSuccess(null)}>Create another</button>
        </section>
      )}

      {error && <p className="ak-note bad" role="alert">{error}</p>}

      <form onSubmit={handleCreate}>
        <Panel title="Owner" sub="The person who’ll run this workspace. Send them these details.">
          <div className="cc-fields">
            <div>
              <label className="ak-label" htmlFor="cc-name">Full name</label>
              <input id="cc-name" className="ak-field" type="text" value={ownerName} onChange={e => setOwnerName(e.target.value)} placeholder="Jane Doe" required />
            </div>
            <div>
              <label className="ak-label" htmlFor="cc-email">Email</label>
              <input id="cc-email" className="ak-field" type="email" value={ownerEmail} onChange={e => setOwnerEmail(e.target.value)} placeholder="owner@business.com" required />
            </div>
            <div className="cc-wide">
              <label className="ak-label" htmlFor="cc-pass">Temporary password</label>
              <div className="cc-inline">
                <input id="cc-pass" className="ak-field" type="text" value={ownerPassword} onChange={e => setOwnerPassword(e.target.value)} placeholder="At least 8 characters" required />
                <button type="button" className="ak-btn ghost" onClick={() => setOwnerPassword(newPassword())}>Generate</button>
              </div>
            </div>
          </div>
        </Panel>

        <Panel title="Company" sub="How the business shows up on its board and in the admin.">
          <div className="cc-fields">
            <div className="cc-wide">
              <label className="ak-label" htmlFor="cc-co">Company name</label>
              <input id="cc-co" className="ak-field" type="text" value={companyName} onChange={e => setCompanyName(e.target.value)} placeholder="Roxy Aquarium" required />
            </div>
            <div className="cc-wide">
              <label className="ak-label" htmlFor="cc-slug">Address</label>
              <div className={`cc-slug ${slugStatus}`}>
                <input id="cc-slug" type="text" value={slug} onChange={e => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))} placeholder="roxy" required aria-describedby="cc-slug-note" />
                <span>.colvy.com</span>
              </div>
              <p id="cc-slug-note" className={`cc-slug-note ${slugStatus}`} aria-live="polite">{slugNote}</p>
            </div>
            <div>
              <label className="ak-label" htmlFor="cc-ind">Industry</label>
              <select id="cc-ind" className="ak-select" value={industry} onChange={e => setIndustry(e.target.value)} required>
                <option value="">Choose one</option>
                {INDUSTRIES.map(i => <option key={i} value={i}>{i}</option>)}
              </select>
            </div>
            <div>
              <label className="ak-label" htmlFor="cc-col">Brand colour</label>
              <div className="cc-color">
                <input type="color" value={accentColor} onChange={e => setAccentColor(e.target.value)} aria-label="Pick a colour" />
                <input id="cc-col" className="ak-field" type="text" value={accentColor} onChange={e => setAccentColor(e.target.value)} />
              </div>
            </div>
            <div className="cc-wide">
              <label className="ak-label" htmlFor="cc-desc">Description <span style={{ fontWeight: 500, color: 'var(--soft)' }}>optional</span></label>
              <textarea id="cc-desc" className="ak-field" value={description} onChange={e => setDescription(e.target.value)} placeholder="What does this business do?" rows={2} />
            </div>
          </div>
        </Panel>

        <Panel title="Plan">
          <div className="cc-plans" role="radiogroup" aria-label="Plan">
            {PLANS.map(p => (
              <button key={p} type="button" role="radio" aria-checked={plan === p} className={`cc-plan${plan === p ? ' on' : ''}`} onClick={() => setPlan(p)}>
                <b>{PLAN_NAMES[p as Plan] || (p.charAt(0).toUpperCase() + p.slice(1))}</b>
                <small>{PLAN_HINT[p]}</small>
              </button>
            ))}
          </div>
        </Panel>

        <button type="submit" className="ak-btn go cc-go" disabled={loading || slugStatus !== 'available'}>
          {loading ? 'Creating…' : 'Create company and account'}
        </button>
      </form>
      <style>{CC_CSS}</style>
    </AdminPage>
  )
}

const CC_CSS = `
.cc-fields{display:grid;grid-template-columns:1fr 1fr;gap:14px}
.cc-wide{grid-column:1/-1}
@media (max-width:600px){.cc-fields{grid-template-columns:minmax(0,1fr)}}
.cc-inline{display:flex;gap:8px}
.cc-slug{display:flex;align-items:center;height:44px;border-radius:14px;background:var(--f);border:1.5px solid transparent;overflow:hidden;transition:border-color .15s,background .15s}
.cc-slug:focus-within{background:var(--card,#fff);border-color:var(--f2)}
.cc-slug.available{border-color:#86efac}.cc-slug.taken,.cc-slug.invalid{border-color:#fca5a5}
.ak .cc-slug input{flex:1;min-width:0;height:100%;padding:0 14px;border:none!important;background:transparent!important;box-shadow:none!important;outline:none;font:inherit;font-size:14.5px;color:var(--ink)!important}
.cc-slug span{padding:0 14px;font-size:14px;color:var(--mut)}
.cc-slug-note{min-height:18px;margin:6px 0 0;font-size:12.5px;color:var(--soft)}
.cc-slug-note.available{color:#15803d}.cc-slug-note.taken,.cc-slug-note.invalid{color:#b91c1c}
.cc-color{display:flex;gap:8px;align-items:center}
.cc-color input[type=color]{width:44px;height:44px;flex-shrink:0;padding:0;border:none;border-radius:14px;background:none;cursor:pointer}
.cc-color input[type=color]::-webkit-color-swatch-wrapper{padding:0}
.cc-color input[type=color]::-webkit-color-swatch{border:none;border-radius:14px}
.ak .cc-color .ak-field{font-family:ui-monospace,monospace}
.cc-plans{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}
@media (max-width:600px){.cc-plans{grid-template-columns:1fr 1fr}}
.cc-plan{display:flex;flex-direction:column;align-items:flex-start;gap:2px;padding:12px 14px;border:none;border-radius:16px;background:var(--f);font:inherit;text-align:left;cursor:pointer;transition:background .15s,box-shadow .15s}
.cc-plan:hover{background:var(--f2)}
.cc-plan.on{background:var(--card,#fff);box-shadow:0 0 0 2px var(--ink)}
.cc-plan b{font-size:14px;font-weight:650;color:var(--ink)}
.cc-plan small{font-size:12px;color:var(--mut)}
.ak-btn.cc-go{width:100%;height:50px;font-size:15px;margin-top:4px}
.cc-done{margin-bottom:14px;padding:18px 20px;border-radius:22px;background:#ecfdf3;box-shadow:0 0 0 1px #abefc6}
.cc-done-h{display:flex;align-items:center;gap:9px;margin:0 0 10px;font-size:16px;font-weight:700;color:#05603a}
.cc-done-h span{width:26px;height:26px;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;background:#16a34a;color:#fff}
.cc-done-row{display:flex;align-items:center;gap:10px;min-height:36px;font-size:14px;color:#05603a}
.cc-done-row small{width:96px;flex-shrink:0;font-size:12.5px;font-weight:600;color:#067647}
.cc-done-row a{color:#05603a;font-weight:600;overflow-wrap:anywhere}
.cc-done-row code{padding:3px 8px;border-radius:8px;background:#fff;font-size:13px;overflow-wrap:anywhere}
.cc-done-row .ak-btn{margin-left:auto}
`
