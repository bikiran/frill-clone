'use client'

import { authFetch } from '@/lib/auth-fetch'
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { peekCompanyUser, resolveCompanyUser } from '@/lib/client-cache'
import RegulatoryForm from '@/components/RegulatoryForm'
import CallAnswerSettings from '@/components/CallAnswerSettings'
import AiReceptionistCard from '@/components/AiReceptionistCard'
import CallLanguageSettings from '@/components/CallLanguageSettings'
import CallRoutingSettings from '@/components/CallRoutingSettings'
import { Icon } from '@/components/integrations/ui'
import { finalizeNext } from '@/lib/number-finalize-poll'
import NumberPortingCard from '@/components/NumberPortingCard'
import { KIND_LABEL, TOLLFREE_NOTE, TOLLFREE_VOLUME_NOTE, NO_TOLLFREE, LOCAL_RATE_SOON, type NumberKind } from '@/lib/number-types'
import BrandLogo from '@/components/BrandLogo'

export default function TelnyxIntegration() {
  const [companyId, setCompanyId] = useState<string | null>(null)
  // Which carrier backs THIS company's number purchasing. Transparent to the
  // customer — they always see the same "Get a business number" flow; only the
  // API endpoints differ. Set per-company by a platform admin (default Telnyx).
  const [numProvider, setNumProvider] = useState<'telnyx' | 'twilio'>('twilio')
  // Whether the signed-in user is the platform super-admin. Only they see the
  // internal carrier indicator; customers never learn which carrier backs them.
  const [isSuperAdmin, setIsSuperAdmin] = useState(false)
  // Free numbers a platform admin has granted this business. While > 0, the buy
  // flow skips payment, so the UI shows "Free" instead of a monthly price.
  const [freeCredits, setFreeCredits] = useState(0)
  const [loading, setLoading] = useState(true)
  const [integration, setIntegration] = useState<any>(null)
  const [numbers, setNumbers] = useState<any[]>([])
  const [locations, setLocations] = useState<any[]>([])
  const [addingNumber, setAddingNumber] = useState(false)

  // ── Browser calling setup ────────────────────────────────────────────────
  const [callSetup, setCallSetup] = useState<any>(null)
  const [callSteps, setCallSteps] = useState<string[]>([])
  const [callBusy, setCallBusy] = useState<'' | 'check' | 'setup'>('')

  const checkCalling = async () => {
    if (!companyId) return
    setCallBusy('check'); setCallSteps([])
    try {
      const res = await authFetch(`/api/telnyx/setup-calling?companyId=${companyId}`)
      setCallSetup(await res.json())
    } catch (e: any) { setCallSetup({ verdict: 'Could not check: ' + e.message }) }
    finally { setCallBusy('') }
  }

  const setupCalling = async () => {
    if (!companyId) return
    setCallBusy('setup'); setCallSteps([])
    try {
      const res = await authFetch('/api/telnyx/setup-calling', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ companyId }),
      })
      const d = await res.json()
      setCallSteps(d.steps || [])
      if (!res.ok) { setCallSetup({ verdict: d.error || 'Setup failed' }); return }
      await checkCalling()
    } catch (e: any) { setCallSetup({ verdict: 'Setup failed: ' + e.message }) }
    finally { setCallBusy('') }
  }
  const [assignLocationId, setAssignLocationId] = useState<string>('')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const [numberType, setNumberType] = useState<NumberKind>('local')
  // 1800 is offered only when Twilio has AU toll-free numbers to sell right now
  // (null while asking, or on a Telnyx board, which has none).
  const [tollfree, setTollfree] = useState<{ available: boolean; monthly: number } | null>(null)
  useEffect(() => {
    if (numProvider !== 'twilio' || !companyId) { setTollfree(null); return }
    let gone = false
    authFetch('/api/twilio/number?type=tollfree&probe=1').then(r => r.json()).then(d => {
      if (!gone && typeof d?.available === 'boolean') setTollfree({ available: d.available, monthly: Number(d.monthly) || 25 })
    }).catch(() => {})
    return () => { gone = true }
  }, [numProvider, companyId])
  const [numberCity, setNumberCity] = useState('Melbourne')
  const [available, setAvailable] = useState<any[]>([])
  const [searching, setSearching] = useState(false)
  const [buying, setBuying] = useState(false)
  const [showRegForm, setShowRegForm] = useState(false)
  const [pendingNumber, setPendingNumber] = useState<string | undefined>(undefined)
  const [regDone, setRegDone] = useState(false)
  const [showAdvanced, setShowAdvanced] = useState(false)

  useEffect(() => {
    const init = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.user) { setLoading(false); return }
      if ((session.user.email || '').toLowerCase() === 'bishalstha76@gmail.com') setIsSuperAdmin(true)
      // The admin already knows the company; fall back to looking it up.
      let cid: string | null = peekCompanyUser()?.companyId || (await resolveCompanyUser().catch(() => null))?.companyId || null
      const h = window.location.hostname
      if (!cid && h.endsWith('.colvy.com') && h !== 'colvy.com' && h !== 'www.colvy.com') {
        const { data: co } = await (supabase as any).from('companies').select('id').eq('slug', h.replace('.colvy.com', '')).maybeSingle()
        if (co) cid = co.id
      }
      if (!cid) {
        const { data: ownCo } = await (supabase as any).from('companies').select('id').eq('owner_id', session.user.id).maybeSingle()
        if (ownCo) cid = ownCo.id
      }
      setCompanyId(cid)
      // Resolve which carrier this company provisions through (Twilio unless a
      // company is still explicitly on legacy Telnyx).
      // (read alongside the number setup, which doesn't depend on it).
      if (cid) {
        await Promise.all([
          Promise.resolve((supabase as any).from('companies').select('number_provider, free_number_credits').eq('id', cid).maybeSingle())
            .then(({ data: co }: any) => {
              setNumProvider(co?.number_provider === 'telnyx' ? 'telnyx' : 'twilio')
              setFreeCredits(Number(co?.free_number_credits || 0))
            }).catch(() => {}),
          loadIntegration(cid),
        ])
      }
      // Deep-link from a location: open straight into "add a number" for it.
      const buyForLoc = typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('buyForLocation')
      if (buyForLoc) {
        setAddingNumber(true)
        setAssignLocationId(buyForLoc)
        setAvailable([])
      }
      // Returned from Stripe checkout — actively finalize (verify payment +
      // provision the number directly, so it works even without a webhook).
      if (typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('provisioning') === '1') {
        const qp = new URLSearchParams(window.location.search)
        const sessionId = qp.get('session_id') || undefined
        // The return URL carries which carrier to finalize against.
        const provParam = qp.get('provider') === 'telnyx' ? 'telnyx' : 'twilio'
        // Free path (admin-granted): no Stripe session — the number details ride
        // on the URL and the server consumes a credit.
        const isFree = qp.get('free') === '1'
        const freeBody = isFree ? {
          free: true,
          phoneNumber: qp.get('phoneNumber') || undefined,
          numberType: qp.get('numberType') || 'local',
          locationId: qp.get('locationId') || undefined,
        } : {}
        setSuccess(isFree ? 'Setting up your number, this can take up to a minute…' : 'Payment received — setting up your number, this can take up to a minute…')
        let tries = 0
        const started = Date.now()
        const attempt = async () => {
          tries++
          try {
            const res = await authFetch(`/api/${provParam}/number-finalize`, {
              method: 'POST', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ companyId: cid, sessionId, ...freeBody }),
            })
            const d = await res.json()
            const next = finalizeNext(res, d, tries, Date.now() - started)
            if ('live' in next) {
              const r2 = await authFetch(`/api/${provParam}/setup?companyId=${cid}`)
              const s2 = await r2.json()
              if (s2.integration) setIntegration(s2.integration)
              setSuccess(`Your business number ${d.phoneNumber} is live.`)
              return
            }
            if ('retryIn' in next) { setTimeout(attempt, next.retryIn); return } // payment settling, or being bought
            if ('stillSettingUp' in next) {
              setSuccess('Still setting up your number — this can take a few minutes.')
              if (cid) loadIntegration(cid)
              return
            }
            setError(d.error || 'Could not set up your number automatically. Your payment is safe — please contact support or try again.')
            setSuccess('')
          } catch {
            if (tries < 4) { setTimeout(attempt, 3000); return }
            setError('Could not reach the server to finish setup. Your payment is safe — please refresh in a minute.')
            setSuccess('')
          }
        }
        attempt()
      }
      setLoading(false)
    }
    init()
  }, [])

  const loadIntegration = async (cid: string) => {
    // The number list doesn't need the setup answer: ask for both at once.
    loadNumbers(cid)
    try {
      const res = await authFetch(`/api/telnyx/setup?companyId=${cid}`)
      const data = await res.json()
      if (data.integration) setIntegration(data.integration)
    } catch {}
  }

  const loadNumbers = async (cid: string) => {
    try {
      const res = await authFetch(`/api/telnyx/numbers?companyId=${cid}`)
      const data = await res.json()
      setNumbers(data.numbers || [])
      setLocations(data.locations || [])
    } catch {}
  }

  const assignNumberToLocation = async (numberId: string, locationId: string) => {
    if (!companyId) return
    await authFetch('/api/telnyx/numbers', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ numberId, companyId, locationId: locationId || null }),
    })
    loadNumbers(companyId)
  }

  const makePrimary = async (numberId: string) => {
    if (!companyId) return
    await authFetch('/api/telnyx/numbers', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ numberId, companyId, isPrimary: true }),
    })
    loadNumbers(companyId)
  }

  const searchNumbers = async () => {
    setSearching(true); setError(''); setAvailable([])
    try {
      const res = await authFetch(`/api/${numProvider}/number?type=${numberType}${numberType === 'local' ? `&city=${encodeURIComponent(numberCity)}` : ''}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Could not search numbers')
      // Belt-and-braces: drop anything that isn't a complete number so a blank
      // "+61 468 --- ---" can never render.
      const clean = (data.numbers || []).filter((n: any) => {
        const d = (n.phone_number || '').replace(/^\+61/, '').replace(/\D/g, '')
        return d.length === 9
      })
      setAvailable(clean)
      if (clean.length === 0) setError(data.error || (numberType === 'tollfree' ? NO_TOLLFREE : numberType === 'mobile'
        ? 'No mobile numbers available from our provider right now. Please try again shortly — texting needs a mobile (04) number.'
        : 'No numbers available right now — please check back shortly.'))
    } catch (e: any) { setError(e.message) }
    setSearching(false)
  }

  const buyNumber = async (phoneNumber?: string) => {
    if (!companyId) return
    // AU numbers require a regulatory bundle before activation. Collect it
    // first — the form must be completed before we start checkout.
    if (!regDone) {
      setPendingNumber(phoneNumber)
      setShowRegForm(true)
      return
    }
    await startCheckout(phoneNumber)
  }

  const startCheckout = async (phoneNumber?: string) => {
    if (!companyId) return
    setBuying(true); setError(''); setSuccess('')
    try {
      // Get the user's email for the checkout
      const { data: { session } } = await supabase.auth.getSession()
      const res = await authFetch(`/api/${numProvider}/number-checkout`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ companyId, email: session?.user?.email, phoneNumber, numberType, locationId: assignLocationId || undefined }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Could not start checkout')
      // Admin granted this business a free number — no payment step. Route to the
      // same provisioning flow, flagged free; the server enforces the credit.
      if (data.free) {
        const params = new URLSearchParams({ provisioning: '1', provider: numProvider, free: '1', numberType })
        if (phoneNumber) params.set('phoneNumber', phoneNumber)
        if (assignLocationId) params.set('locationId', assignLocationId)
        window.location.href = `/admin/crm-settings/channels/calls?${params.toString()}`
        return
      }
      if (data.url) {
        window.location.href = data.url
        return
      }
      throw new Error('No checkout URL returned')
    } catch (e: any) { setError(e.message); setBuying(false) }
  }

  const fmtNumber = (n: string) => {
    if (!n) return n
    const d = n.replace('+61', '')
    if (d.startsWith('1800') && d.length === 10) return `1800 ${d.slice(4, 7)} ${d.slice(7)}`
    if (d.startsWith('4') && d.length === 9) return `+61 ${d.slice(0, 3)} ${d.slice(3, 6)} ${d.slice(6)}`
    if (d.length === 9) return `+61 ${d.slice(0, 1)} ${d.slice(1, 5)} ${d.slice(5)}`
    return n
  }

  if (loading) return <div style={{ padding: 24, color: 'var(--slate)' }}>Loading…</div>

  const hasNumber = integration?.phone_number

  return (
    <div className="w-full max-w-[1200px] mx-auto md:px-8 py-1 md:py-8">
      {/* The settings layout's breadcrumb is the way back to Channels. */}
      {showRegForm && companyId && (
        <RegulatoryForm
          companyId={companyId}
          numberType={numberType}
          provider={numProvider}
          free={freeCredits > 0}
          onCancel={() => setShowRegForm(false)}
          onComplete={(_bundleId) => {
            setShowRegForm(false)
            setRegDone(true)
            // Continue straight to checkout for the number they picked
            startCheckout(pendingNumber)
          }}
        />
      )}
      <style>{CS_CSS}</style>
      <div className="cs-head">
        <BrandLogo brand="calls" size={52} />
        <div className="cs-head-t">
          <h1>Calls &amp; SMS</h1>
          <p>Call customers from your browser and text them from the inbox.</p>
        </div>
        {hasNumber && <span className="cs-live"><i aria-hidden />Active</span>}
      </div>

      {error && <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 10, padding: '11px 15px', margin: '16px 0', fontSize: 13, color: '#dc2626' }}>{error}</div>}
      {success && <div style={{ background: '#dcfce7', border: '1px solid #86efac', borderRadius: 10, padding: '11px 15px', margin: '16px 0', fontSize: 13, color: '#059669' }}>{success}</div>}

      {(numbers.length > 0 || hasNumber) && !addingNumber ? (
        <div>
          {/* Browser calling needs a WebRTC connection on Telnyx. Buying a number
              doesn't create one — without it, calls fail with "Connection to
              server lost", which tells the user nothing. Twilio provisions voice
              automatically via its access token, so this card is Telnyx-only. */}
          {numProvider === 'telnyx' && (
          <div style={{ border: `1px solid ${callSetup?.verdict === 'Calling looks ready.' ? '#bbf7d0' : '#fde68a'}`, background: callSetup?.verdict === 'Calling looks ready.' ? '#f0fdf4' : '#fffbeb', borderRadius: 14, padding: 16, marginBottom: 18 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
              <div style={{ minWidth: 0 }}>
                <p style={{ margin: '0 0 3px', fontSize: 14, fontWeight: 700, color: 'var(--ink)' }}>Browser calling</p>
                <p style={{ margin: 0, fontSize: 12.5, color: 'var(--slate)', lineHeight: 1.45 }}>
                  {callSetup?.verdict || 'Check whether calling is set up on Telnyx.'}
                </p>
              </div>
              <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                <button onClick={checkCalling} disabled={!!callBusy}
                  style={{ padding: '8px 14px', borderRadius: 999, border: '1.5px solid #e4e4e7', background: '#fff', color: 'var(--ink)', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
                  {callBusy === 'check' ? 'Checking…' : 'Check'}
                </button>
                <button onClick={setupCalling} disabled={!!callBusy}
                  style={{ padding: '8px 16px', borderRadius: 999, border: 'none', background: 'var(--coral)', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
                  {callBusy === 'setup' ? 'Setting up…' : 'Set up calling'}
                </button>
              </div>
            </div>

            {callSteps.length > 0 && (
              <ul style={{ margin: '12px 0 0', paddingLeft: 18, fontSize: 12.5, color: 'var(--slate)', lineHeight: 1.7 }}>
                {callSteps.map((s, i) => <li key={i}>{s}</li>)}
              </ul>
            )}
          </div>
          )}

          {/* The numbers come first: they're what this page is about. */}
          <section className="cs-nums">
            <div className="cs-sec-h">
              <div>
                <h2>Your numbers</h2>
                <p>Calls and texts to these land in your inbox.</p>
              </div>
              <button type="button" className="cs-add" onClick={() => { setAddingNumber(true); setAvailable([]); setAssignLocationId('') }}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" aria-hidden><path d="M12 5v14M5 12h14" /></svg>
                Add another number
              </button>
            </div>

            <div className="cs-num-list">
              {(numbers.length > 0 ? numbers : [{ id: 'legacy', phone_number: integration.phone_number, is_primary: true, monthly_cost: integration.monthly_cost || 15, location_id: null }]).map((n: any) => {
                // Older rows have no type: an AU mobile starts +614, a 1800 number +611800.
                const pn = String(n.phone_number || '')
                const kind = n.number_type === 'tollfree' || pn.startsWith('+611800') ? 'tollfree' : n.number_type === 'mobile' || pn.startsWith('+614') ? 'mobile' : 'local'
                return (
                  <div key={n.id} className={`cs-num${n.is_primary ? ' primary' : ''}`}>
                    <div className="cs-num-row">
                      <span className={`cs-num-ic ${kind}`} aria-hidden>{NUM_ICON[kind]}</span>
                      <div className="cs-num-main">
                        <div className="cs-num-top">
                          <b>{fmtNumber(n.phone_number)}</b>
                          {n.is_primary && <span className="cs-chip green">Primary</span>}
                          <span className="cs-chip">{kind === 'mobile' ? 'Mobile' : kind === 'tollfree' ? '1800' : 'Landline'}</span>
                        </div>
                        <div className="cs-num-meta">
                          <span><Icon name="check" size={12} /> {kind === 'tollfree' ? 'Calls only' : kind === 'mobile' ? 'Calls & SMS' : 'Calls'}</span>
                          {n.provisioned_by_colvy && <span>${n.monthly_cost || 15}/month</span>}
                        </div>
                      </div>
                      {!n.is_primary && n.id !== 'legacy' && (
                        <button type="button" className="cs-ghost" onClick={() => makePrimary(n.id)}>Make primary</button>
                      )}
                    </div>

                    {/* Location assignment (only if the company has locations) */}
                    {locations.length > 0 && n.id !== 'legacy' && (
                      <label className="cs-loc">
                        <span><Icon name="pin" size={13} /> Location</span>
                        <select value={n.location_id || ''} onChange={e => assignNumberToLocation(n.id, e.target.value)}>
                          <option value="">Unassigned (company-wide)</option>
                          {locations.map((loc: any) => (
                            <option key={loc.id} value={loc.id}>{loc.label || loc.suburb || 'Location'}{loc.state ? ` — ${loc.state}` : ''}</option>
                          ))}
                        </select>
                      </label>
                    )}
                  </div>
                )
              })}
            </div>

            {locations.length === 0 && numbers.length > 0 && (
              <p className="cs-hint">
                <Icon name="info" size={13} style={{ verticalAlign: '-2px', marginRight: 4 }} />Add <a href="/admin/locations">business locations</a> to assign specific numbers to each.
              </p>
            )}
          </section>

          {/* Move an existing number to Colvy: a request our team handles with the
              carriers (Twilio boards; ported numbers land on the platform account). */}
          {companyId && numProvider === 'twilio' && <NumberPortingCard companyId={companyId} />}

          <div className="cs-sec-h cs-sec-gap">
            <div>
              <h2>How calls are handled</h2>
              <p>Who rings, what happens when nobody answers, and the AI receptionist.</p>
            </div>
          </div>
          {companyId && <CallAnswerSettings companyId={companyId} />}
          {companyId && <CallRoutingSettings companyId={companyId} />}
          {companyId && <CallLanguageSettings companyId={companyId} />}
          {companyId && <AiReceptionistCard companyId={companyId} />}
        </div>
      ) : (
        <div className="bn">
          <style>{BN_CSS}</style>
          <div className="bn-main">
            {addingNumber && (
              <button type="button" className="bn-back" onClick={() => setAddingNumber(false)}>‹ Back to my numbers</button>
            )}
            <h2>{addingNumber ? 'Add another number' : 'Get a business number'}</h2>
            <p className="bn-sub">Colvy sets up an Australian number for you, with no separate accounts. Call and text customers right from the inbox.</p>

            {/* If the company has locations, let them assign the new number to one */}
            {locations.length > 0 && (
              <label className="bn-f">
                <span>Assign to a location (optional)</span>
                <select value={assignLocationId} onChange={e => setAssignLocationId(e.target.value)}>
                  <option value="">Company-wide (no specific location)</option>
                  {locations.map((loc: any) => (
                    <option key={loc.id} value={loc.id}>{loc.label || loc.suburb || 'Location'}{loc.state ? ` — ${loc.state}` : ''}</option>
                  ))}
                </select>
              </label>
            )}

            <div className="bn-f">
              <span>Type of number</span>
              <div className="bn-types" role="radiogroup" aria-label="Type of number">
                {([['mobile', 'Mobile', 'Calls and texts', 'M7 2h10a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2z M11 18h2'], ['local', 'Landline', 'Local area code', 'M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.5 2.1L8 9.8a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.7.7a2 2 0 0 1 1.7 2z'], ...(tollfree?.available ? [['tollfree', '1800', 'Callers ring free', 'm12 2 3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01z']] : [])] as [NumberKind, string, string, string][]).map(([t, name, eg, d]) => (
                  <button key={t} type="button" role="radio" aria-checked={numberType === t} className={`bn-type${numberType === t ? ' on' : ''}`} onClick={() => { setNumberType(t); setAvailable([]); setError('') }}>
                    <span className="bn-type-ic"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={d} /></svg></span>
                    <b>{name}</b>
                    <small>{eg}</small>
                    {numberType === t && <i className="bn-check" aria-hidden="true">✓</i>}
                  </button>
                ))}
              </div>
              {numProvider === 'twilio' && <p className="bn-hint">{tollfree && !tollfree.available ? `${NO_TOLLFREE.split('.')[0]}. ` : ''}{LOCAL_RATE_SOON}</p>}
            </div>

            {numberType === 'tollfree' && (
              <div className="bn-note">
                <strong>{TOLLFREE_NOTE}</strong> {TOLLFREE_VOLUME_NOTE}{' '}
                <a href="mailto:support@colvy.com?subject=1800%20call%20volumes">Talk to us</a>
              </div>
            )}

            {/* Landline is region-specific — let the user pick a city so a Melbourne
                business gets an 03 number, not a Gold Coast 07 one. */}
            {numberType === 'local' && (
              <label className="bn-f">
                <span>Number location</span>
                <select value={numberCity} onChange={e => { setNumberCity(e.target.value); setAvailable([]) }}>
                  <option value="Melbourne">Melbourne (03)</option>
                  <option value="Sydney">Sydney (02)</option>
                  <option value="Brisbane">Brisbane (07)</option>
                  <option value="Gold Coast">Gold Coast (07)</option>
                  <option value="Perth">Perth (08)</option>
                  <option value="Adelaide">Adelaide (08)</option>
                  <option value="Canberra">Canberra (02)</option>
                  <option value="Hobart">Hobart (03)</option>
                  <option value="Darwin">Darwin (08)</option>
                </select>
                <small className="bn-hint">Customers see a local number for your area. Landlines are for calls; choose a mobile (04) number to text customers.</small>
              </label>
            )}

            {available.length === 0 ? (
              <div className="bn-buy">
                <div className="bn-price">
                  {freeCredits > 0 ? (
                    <><b className="free">Free</b><span>Included on your plan · no card needed</span></>
                  ) : (
                    <><b>${available[0]?.monthly || (numberType === 'tollfree' ? tollfree?.monthly || 25 : 15)}<em>/month</em></b><span>Cancel anytime</span></>
                  )}
                </div>
                <div className="bn-actions">
                  <button type="button" className="bn-btn ghost" onClick={searchNumbers} disabled={searching}>{searching ? 'Searching…' : 'Choose a number'}</button>
                  <button type="button" className="bn-btn" onClick={() => buyNumber()} disabled={buying}>{buying ? 'Setting up…' : freeCredits > 0 ? 'Get your free number' : 'Buy a number'}</button>
                </div>
              </div>
            ) : (
              <div className="bn-f">
                <span>Pick your number</span>
                <div className="bn-list">
                  {available.map(n => (
                    <div key={n.phone_number} className="bn-num">
                      <div><b>{fmtNumber(n.phone_number)}</b><small>{n.region} · {freeCredits > 0 ? <em>Free</em> : `$${n.monthly}/month`}</small></div>
                      <button type="button" className="bn-btn sm" onClick={() => buyNumber(n.phone_number)} disabled={buying}>{buying ? '…' : freeCredits > 0 ? 'Get free' : 'Buy'}</button>
                    </div>
                  ))}
                </div>
                <button type="button" className="bn-back" onClick={() => setAvailable([])}>‹ Back</button>
              </div>
            )}
          </div>

          {/* What you'll get, as you choose. */}
          <aside className="bn-preview" aria-label="Your new number">
            <div className="bn-phone">
              <span className="bn-chip">{numberType === 'mobile' ? 'Australian mobile' : numberType === 'tollfree' ? 'Toll-free' : `${numberCity} landline`}</span>
              <p className="bn-digits" key={`${numberType}-${numberCity}`}>{numberType === 'mobile' ? '04XX XXX XXX' : numberType === 'tollfree' ? '1800 XXX XXX' : `(${({ Melbourne: '03', Sydney: '02', Brisbane: '07', 'Gold Coast': '07', Perth: '08', Adelaide: '08', Canberra: '02', Hobart: '03', Darwin: '08' } as Record<string, string>)[numberCity] || '0X'}) XXXX XXXX`}</p>
              <ul>
                <li className="ok"><i>✓</i>Calls in your browser and the app</li>
                <li className={numberType === 'mobile' ? 'ok' : ''}><i>{numberType === 'mobile' ? '✓' : '–'}</i>{numberType === 'mobile' ? 'Two-way SMS from the inbox' : 'SMS needs a mobile number'}</li>
                <li className="ok"><i>✓</i>Missed calls land in the inbox</li>
                {numberType === 'tollfree' && <li className="ok"><i>✓</i>Free for your callers</li>}
              </ul>
              <span className="bn-foot">{freeCredits > 0 ? 'Free on your plan' : `$${numberType === 'tollfree' ? tollfree?.monthly || 25 : 15}/month`}{numberType === 'mobile' ? ' · ID check required' : ''}</span>
            </div>
          </aside>
        </div>
      )}

      {/* Without a number yet (or while adding one), moving one in is the other way to start. */}
      {(!(numbers.length > 0 || hasNumber) || addingNumber) && companyId && numProvider === 'twilio' && <div className="cs-port-after"><NumberPortingCard companyId={companyId} /></div>}

      {/* BYO Telnyx is only meaningful for Telnyx-backed boards. Twilio boards are
          fully platform-managed and must never see a competing carrier's name. */}
      {numProvider === 'telnyx' && (
        <>
          <button onClick={() => setShowAdvanced(v => !v)} style={{ marginTop: 20, fontSize: 12.5, color: 'var(--slate)', background: 'none', border: 'none', cursor: 'pointer' }}>
            {showAdvanced ? '▾' : '▸'} Advanced: use your own Telnyx account
          </button>
          {showAdvanced && (
            <div style={{ marginTop: 12, padding: 16, borderRadius: 12, background: 'var(--canvas)', border: '1px solid var(--border)', fontSize: 13, color: 'var(--slate)', lineHeight: 1.5 }}>
              Already have a Telnyx account? You can connect your own API key and number instead of buying through Colvy. Contact support to enable BYO mode for your workspace.
            </div>
          )}
        </>
      )}

      {/* Internal-only: lets the platform super-admin confirm at a glance which
          carrier this board is routed through. Hidden from all customers. */}
      {isSuperAdmin && (
        <div style={{ marginTop: 20, display: 'inline-flex', alignItems: 'center', gap: 7, padding: '5px 11px', borderRadius: 20, background: numProvider === 'twilio' ? '#eef2ff' : '#ecfeff', border: `1px solid ${numProvider === 'twilio' ? '#c7d2fe' : '#a5f3fc'}`, fontSize: 11.5, fontWeight: 700, color: numProvider === 'twilio' ? '#4338ca' : '#0e7490' }}>
          <span style={{ opacity: 0.7, display: 'inline-flex', alignItems: 'center', gap: 3 }}><Icon name="lock" size={11} /> internal</span>
          carrier: {numProvider === 'twilio' ? 'Twilio' : 'Telnyx'}
        </div>
      )}
    </div>
  )
}

const NUM_ICON: Record<'mobile' | 'local' | 'tollfree', React.ReactNode> = {
  mobile: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="6" y="2" width="12" height="20" rx="3" /><path d="M11 18h2" /></svg>,
  local: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.5 2.1L8 9.8a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.7.7a2 2 0 0 1 1.7 2z" /></svg>,
  tollfree: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m12 2 3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01z" /></svg>,
}

const CS_CSS = `
.cs-head{display:flex;align-items:center;gap:16px;margin-bottom:26px}
.cs-head-t{flex:1;min-width:0}
.cs-head h1{margin:0;font-family:var(--font-display),-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:clamp(26px,3vw,32px);font-weight:700;letter-spacing:-.04em;line-height:1.1;color:var(--ink)}
.cs-head p{margin:5px 0 0;font-size:14.5px;line-height:1.5;color:#71717a}
.cs-live{display:inline-flex;align-items:center;gap:7px;padding:6px 12px;border-radius:999px;background:#dcfce7;color:#15803d;font-size:13px;font-weight:650;white-space:nowrap}
.cs-live i{width:7px;height:7px;border-radius:50%;background:#22c55e;box-shadow:0 0 0 3px color-mix(in srgb,#22c55e 25%,transparent)}
.cs-sec-h{display:flex;align-items:flex-end;justify-content:space-between;gap:12px;flex-wrap:wrap;margin-bottom:14px}
.cs-sec-h h2{margin:0;font-family:var(--font-display),-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:21px;font-weight:700;letter-spacing:-.03em;color:var(--ink)}
.cs-sec-h p{margin:3px 0 0;font-size:13.5px;color:#71717a}
.cs-sec-gap{margin-top:34px}
.cs-nums{margin-bottom:16px}
.cs-add{display:inline-flex;align-items:center;gap:7px;height:40px;padding:0 18px;border:0;border-radius:999px;background:var(--ink);color:var(--card,#fff);font:inherit;font-size:13.5px;font-weight:650;cursor:pointer;transition:transform .12s,filter .15s}
.cs-add:hover{filter:brightness(1.15)}
.cs-add:active{transform:scale(.98)}
.cs-add::before,.cs-ghost::before{display:none!important}
.cs-num-list{display:grid;grid-template-columns:repeat(auto-fill,minmax(min(100%,360px),1fr));gap:12px}
.cs-num{display:flex;flex-direction:column;gap:14px;min-width:0;padding:20px;border-radius:24px;background:var(--card,#fff);box-shadow:0 0 0 1px rgba(0,0,0,.06),0 1px 2px rgba(16,24,40,.04)}
.cs-num.primary{box-shadow:0 0 0 1.5px color-mix(in srgb,#22c55e 45%,transparent),0 10px 30px -18px rgba(34,197,94,.55)}
.cs-num-row{display:flex;align-items:center;gap:14px;min-width:0}
.cs-num-ic{width:48px;height:48px;flex-shrink:0;border-radius:16px;display:inline-flex;align-items:center;justify-content:center;background:color-mix(in srgb,var(--coral) 13%,var(--card,#fff));color:var(--coral)}
.cs-num-ic.local{background:#eff6ff;color:#2563eb}
.cs-num-ic.tollfree{background:#ecfeff;color:#0e7490}
.cs-num-main{flex:1;min-width:0}
.cs-num-top{display:flex;align-items:center;flex-wrap:wrap;gap:7px}
.cs-num-top b{font-family:var(--font-display),-apple-system,sans-serif;font-size:22px;font-weight:700;letter-spacing:-.02em;color:var(--ink);font-variant-numeric:tabular-nums;white-space:nowrap}
.cs-chip{display:inline-flex;align-items:center;padding:3px 10px;border-radius:999px;background:#f4f4f5;font-size:12px;font-weight:650;color:#52525b}
.cs-chip.green{background:#dcfce7;color:#15803d}
.cs-num-meta{display:flex;flex-wrap:wrap;gap:6px 14px;margin-top:5px;font-size:13px;color:#71717a}
.cs-num-meta span{display:inline-flex;align-items:center;gap:5px}
.cs-ghost{height:34px;padding:0 14px;border:0;border-radius:999px;background:#f4f4f5;font:inherit;font-size:13px;font-weight:650;color:var(--ink);cursor:pointer;white-space:nowrap}
.cs-ghost:hover{background:#ececef}
.cs-loc{display:flex;align-items:center;gap:10px;padding:8px 8px 8px 14px;border-radius:16px;background:#f7f7f8}
.cs-loc span{display:inline-flex;align-items:center;gap:5px;font-size:13px;font-weight:600;color:#71717a;white-space:nowrap}
.cs-nums .cs-num .cs-loc select{flex:1;min-width:0;height:38px;padding:0 12px;border:0!important;border-radius:12px!important;background-color:var(--card,#fff)!important;font:inherit;font-size:13.5px;color:var(--ink);cursor:pointer}
.cs-hint{margin:12px 2px 0;font-size:13px;color:#71717a}
.cs-hint a{color:var(--coral);font-weight:600}
.cs-port-after{margin-top:16px}
[data-theme="dark"] .cs-chip,[data-theme="dark"] .cs-ghost{background:#2a2a2e;color:#d4d4d8}
[data-theme="dark"] .cs-loc{background:#242428}
[data-theme="dark"] .cs-num-ic.local{background:rgba(37,99,235,.16);color:#93c5fd}
[data-theme="dark"] .cs-num-ic.tollfree{background:rgba(14,116,144,.2);color:#67e8f9}
[data-theme="dark"] .cs-head p,[data-theme="dark"] .cs-sec-h p{color:#a1a1aa}
@media (max-width:560px){.cs-head{gap:12px}.cs-num{padding:16px;border-radius:20px}.cs-num-top b{font-size:19px}.cs-sec-h h2{font-size:19px}}
`

const BN_CSS = `
.bn{display:grid;grid-template-columns:minmax(0,1fr) 260px;gap:20px;padding:22px;border-radius:22px;background:#fff;box-shadow:0 0 0 1px rgba(0,0,0,.06),0 1px 2px rgba(16,24,40,.04);container-type:inline-size}
.bn button::before{display:none!important}
.bn-main{display:flex;flex-direction:column;gap:16px;min-width:0}
.bn h2{margin:0;font-size:19px;font-weight:800;letter-spacing:-.02em;color:#111}
.bn-sub{margin:-10px 0 0;font-size:14px;line-height:1.5;color:#71717a}
.bn-back{align-self:flex-start;padding:0;border:0;background:none;font:inherit;font-size:13px;font-weight:600;color:#71717a;cursor:pointer}
.bn-f{display:flex;flex-direction:column;gap:8px}
.bn-f>span{font-size:13px;font-weight:600;color:#18181b}
.bn-f select{height:46px;padding:0 14px;border:0;border-radius:12px;background:#f4f4f5;font:inherit;font-size:14.5px;color:#111;outline:none}
.bn-f select:focus{background:#fff;box-shadow:0 0 0 2px color-mix(in srgb,var(--coral) 55%,transparent)}
.bn-hint{margin:0;font-size:12px;line-height:1.5;color:#8e8e93}
.bn-types{display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:8px}
.bn-type{position:relative;display:flex;flex-direction:column;align-items:flex-start;gap:2px;padding:12px 14px;border:0;border-radius:16px;background:#f7f7f8;font:inherit;text-align:left;cursor:pointer;transition:background .2s,box-shadow .2s}
.bn-type:hover{background:#f1f1f3}
.bn-type.on{background:#fff;box-shadow:0 0 0 1.5px var(--coral),0 6px 18px -10px color-mix(in srgb,var(--coral) 60%,transparent)}
.bn-type-ic{width:32px;height:32px;margin-bottom:6px;border-radius:10px;background:#fff;color:#52525b;display:inline-flex;align-items:center;justify-content:center;box-shadow:0 0 0 1px rgba(0,0,0,.06)}
.bn-type.on .bn-type-ic{background:color-mix(in srgb,var(--coral) 12%,#fff);color:var(--coral);box-shadow:none}
.bn-type b{font-size:14.5px;color:#111}
.bn-type small{font-size:12px;color:#8e8e93}
.bn-check{position:absolute;top:10px;right:10px;width:18px;height:18px;border-radius:50%;background:var(--coral);color:#fff;font-style:normal;font-size:10px;font-weight:800;display:inline-flex;align-items:center;justify-content:center}
.bn-note{padding:12px 14px;border-radius:14px;background:#f0f9ff;font-size:13px;line-height:1.5;color:#0f172a}
.bn-note a{color:var(--coral);font-weight:600}
.bn-buy{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;padding:14px 14px 14px 18px;border-radius:18px;background:#f7f7f8}
.bn-price{display:flex;flex-direction:column;gap:1px;min-width:0}
.bn-price b{font-size:24px;font-weight:800;letter-spacing:-.02em;color:#111;line-height:1.1}
.bn-price b.free{color:#059669}
.bn-price b em{font-style:normal;font-size:14px;font-weight:500;color:#71717a}
.bn-price span{font-size:12.5px;color:#71717a}
.bn-actions{display:flex;gap:8px;flex-wrap:wrap}
.bn-btn{height:44px;padding:0 20px;border:0;border-radius:999px;background:var(--coral);color:#fff;font:inherit;font-size:14px;font-weight:700;white-space:nowrap;cursor:pointer;box-shadow:inset 0 1px 0 rgba(255,255,255,.22),0 1px 2px rgba(16,24,40,.12)}
.bn-btn.ghost{background:#fff;color:#18181b;box-shadow:0 0 0 1.5px #e4e4e7}
.bn-btn.sm{height:36px;padding:0 16px;font-size:13px}
.bn-btn:disabled{opacity:.6;cursor:default}
.bn-btn:focus-visible,.bn-type:focus-visible{outline:2px solid var(--coral);outline-offset:2px}
.bn-list{display:flex;flex-direction:column;gap:8px}
.bn-num{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:12px 14px;border-radius:14px;background:#f7f7f8}
.bn-num b{display:block;font-size:15.5px;color:#111;font-variant-numeric:tabular-nums}
.bn-num small{font-size:12px;color:#8e8e93}
.bn-num em{font-style:normal;font-weight:700;color:#059669}
.bn-preview{position:relative}
.bn-phone{position:sticky;top:80px;display:flex;flex-direction:column;gap:12px;padding:18px;border-radius:22px;background:linear-gradient(160deg,#18181b,#27272a);color:#fff;box-shadow:0 20px 40px -18px rgba(0,0,0,.45)}
.bn-chip{align-self:flex-start;padding:4px 10px;border-radius:999px;background:rgba(255,255,255,.12);font-size:11.5px;font-weight:600}
.bn-digits{margin:0;font-size:24px;font-weight:700;letter-spacing:.02em;font-variant-numeric:tabular-nums;animation:bnIn .4s cubic-bezier(.22,1,.36,1) both}
.bn-phone ul{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:7px}
.bn-phone li{display:flex;align-items:center;gap:8px;font-size:12.5px;color:rgba(255,255,255,.55)}
.bn-phone li.ok{color:rgba(255,255,255,.9)}
.bn-phone li i{width:18px;height:18px;border-radius:50%;background:rgba(255,255,255,.1);font-style:normal;font-size:10px;font-weight:800;display:inline-flex;align-items:center;justify-content:center;flex-shrink:0}
.bn-phone li.ok i{background:#22c55e;color:#fff}
.bn-foot{padding-top:10px;border-top:1px solid rgba(255,255,255,.12);font-size:12px;color:rgba(255,255,255,.65)}
@keyframes bnIn{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}
@container (max-width:640px){.bn-actions{width:100%}.bn-actions .bn-btn{flex:1}}
@media (max-width:900px){.bn{grid-template-columns:minmax(0,1fr)}.bn-preview{order:-1}.bn-phone{position:static}}
@media (prefers-reduced-motion:reduce){.bn-digits{animation:none}}
`
