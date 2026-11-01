'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { peekCompanyUser, resolveCompanyUser } from '@/lib/client-cache'
import { SkeletonList } from '@/components/Skeleton'
import EmojiPicker from '@/components/EmojiPicker'
import { analyseSms, renderVariables, SMS_VARIABLES } from '@/lib/sms-segments'
import { audienceFilterProblem, stableJson } from '@/lib/campaign-audience-rules'
import { allowanceProblem, type SmsAllowanceSummary } from '@/lib/sms-allowance'
import { latestOnly, isAbort } from '@/lib/latest-request'
import SmsLowBalanceBanner from '@/components/billing/SmsLowBalanceBanner'
import { fmtCents, fmtRate } from '@/lib/sms-credits-core'
import { EmailDesignStep, EmailTestCard, EmailReviewCard, type EmailInfo } from './EmailParts'
import { TestSendPanel, postTest } from '@/components/campaigns/TestSendPanel'
import { calculateCost, DEFAULT_PRICING, SmsPricing, aud, audRate, resolveSmsPricing } from '@/lib/sms-pricing'
import { alertDialog, confirmDialog } from '@/components/ConfirmDialog'
import { campaignControls, unscheduleFlow, rescheduleFlow, stopSendingFlow, type ActionOutcome } from '@/components/campaigns/CampaignActions'
import { authFetch } from '@/lib/auth-fetch'
import { MessagesPhone, DEVICES_CSS } from '@/components/EmailDesigner/Devices'
import SmsChecksCard from '@/components/campaigns/SmsChecksCard'
import { runSmsChecks } from '@/lib/sms-checks'

const AUDIENCE_TYPES: [string, string, string][] = [
  ['all_subscribed', 'All subscribed contacts', 'Everyone with marketing consent'],
  ['segment', 'Customer segment', 'Target by loyalty (RFM) segment'],
  ['woocommerce', 'WooCommerce customers', 'Contacts matched to a store customer'],
  ['purchased_category', 'Purchased a product or category', 'Bought a specific SKU or product'],
  ['lapsed', 'Have not purchased recently', 'No order in the last N days'],
  ['outlet', 'Customers from an outlet', 'Belong to a specific location'],
  ['tags', 'Customers with specific tags', 'Match any of the selected tags'],
  ['clicked_campaign', 'Clicked a previous campaign', 'Engaged with an earlier send'],
  ['abandoned_checkout', 'Abandoned checkout', 'Left an unrecovered cart'],
  ['manual', 'Manual contact selection', 'Pick contacts by hand'],
]

const SEGMENTS = ['Champions', 'Loyal Customers', 'Potential Loyalists', 'At Risk', 'Lost']

const SKIP_LABEL: Record<string, string> = {
  unsubscribed: 'unsubscribed',
  opted_out: 'turned off marketing texts',
  no_consent: 'have no marketing consent',
  blocked: 'are blocked',
  invalid_number: 'have no valid mobile number',
  duplicate: 'are duplicates',
}
// Email audiences: no address, opted out of email, bounced / complained.
const EMAIL_SKIP_LABEL: Record<string, string> = {
  ...SKIP_LABEL,
  opted_out: 'turned off marketing email',
  no_email: 'have no email address',
  suppressed: 'bounced or marked an email as spam',
  duplicate: 'share an email address with someone else on the list',
}

/** A count that greys out (keeping the last figure) while it's being worked out. */
function Count({ n, busy }: { n: number | null | undefined; busy: boolean }) {
  return (
    <span style={{ color: busy ? '#9ca3af' : undefined, transition: 'color .15s' }}>
      {n == null ? '\u2014' : n.toLocaleString()}
    </span>
  )
}

function Calculating() {
  return <span style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--slate)', marginLeft: 6, textTransform: 'none', letterSpacing: 0 }}>Calculating…</span>
}

export default function CampaignEditorPage() {
  const router = useRouter()
  const params = useParams()
  const campaignId = params?.id as string

  const [loading, setLoading] = useState(true)
  const [companyId, setCompanyId] = useState<string | null>(null)
  const [companyName, setCompanyName] = useState('')
  const [campaign, setCampaign] = useState<any>(null)
  const [outlets, setOutlets] = useState<any[]>([])
  const [allTags, setAllTags] = useState<string[]>([])
  const [pastCampaigns, setPastCampaigns] = useState<any[]>([])
  const [step, setStep] = useState(2)
  const [saving, setSaving] = useState(false)
  const [savedAt, setSavedAt] = useState<string | null>(null)

  // Audience state
  const [audType, setAudType] = useState('all_subscribed')
  const [segment, setSegment] = useState('Champions')
  const [productQuery, setProductQuery] = useState('')
  const [lapsedDays, setLapsedDays] = useState(90)
  const [locationId, setLocationId] = useState('')
  const [tags, setTags] = useState<string[]>([])
  const [priorCampaign, setPriorCampaign] = useState('')
  const [minSpend, setMinSpend] = useState('')
  const [minOrders, setMinOrders] = useState('')
  // Manual contact picker
  const [pickQuery, setPickQuery] = useState('')
  const [pickResults, setPickResults] = useState<any[]>([])
  const [pickBusy, setPickBusy] = useState(false)
  const [picked, setPicked] = useState<any[]>([])
  // Every hand-picked id. The chips above show at most 200 names, so the
  // filter must not be rebuilt from them — that quietly dropped the rest.
  const [manualIds, setManualIds] = useState<string[]>([])

  const [preview, setPreview] = useState<any>(null)
  // The audience as saved on the campaign — what the sender will use. Steps
  // 3, 5 and 6 show these numbers, never the unsaved in-memory filter.
  const [savedKey, setSavedKey] = useState<string>('')
  const [saved, setSaved] = useState<any>(null)
  const [savedLoading, setSavedLoading] = useState(false)
  const [stepError, setStepError] = useState('')
  // Email campaigns: the designer's brand / sender and the campaign's design.
  const [emailInfo, setEmailInfo] = useState<EmailInfo | null>(null)
  // Message composer (step 3)
  const [message, setMessage] = useState('')
  const [showEmoji, setShowEmoji] = useState(false)
  const [aiBusy, setAiBusy] = useState(false)
  const [pricing, setPricing] = useState<SmsPricing>(DEFAULT_PRICING)
  // Links & offers (step 4)
  const [attachment, setAttachment] = useState<any>(null)
  const [attachKind, setAttachKind] = useState('product')
  const [linkUrl, setLinkUrl] = useState('')
  const [linkLabel, setLinkLabel] = useState('')
  const [prodQuery, setProdQuery] = useState('')
  const [prodResults, setProdResults] = useState<any[]>([])
  const [prodBusy, setProdBusy] = useState(false)
  const [articles, setArticles] = useState<any[]>([])
  // Coupon builder
  const [coupon, setCoupon] = useState<any>(null)
  const [cCode, setCCode] = useState('')
  const [cType, setCType] = useState('percent')
  const [cAmount, setCAmount] = useState('')
  const [cExpiry, setCExpiry] = useState('')
  const [cMinSpend, setCMinSpend] = useState('')
  const [cUsageLimit, setCUsageLimit] = useState('')
  const [couponBusy, setCouponBusy] = useState(false)
  // Schedule (step 5)
  const [sendMode, setSendMode] = useState<'now' | 'later'>('later')
  const [schedDate, setSchedDate] = useState('')
  const [schedTime, setSchedTime] = useState('10:00')
  const [quietHours, setQuietHours] = useState(true)
  const [localTime, setLocalTime] = useState(false)
  const [ratePerMin, setRatePerMin] = useState(60)
  // Review & send (step 6)
  const [sending, setSending] = useState(false)
  const [sendResult, setSendResult] = useState('')
  const msgRef = useRef<HTMLTextAreaElement | null>(null)
  const [previewing, setPreviewing] = useState(false)
  const [previewError, setPreviewError] = useState('')
  const debounce = useRef<any>(null)
  const previewReq = useRef(latestOnly())
  const savedReq = useRef(latestOnly())

  useEffect(() => {
    ;(async () => {
      try {
        // The admin already knows the company; fall back to looking it up.
        let cid: string | null = peekCompanyUser()?.companyId || (await resolveCompanyUser().catch(() => null))?.companyId || null
        if (!cid && typeof window !== 'undefined') {
          const host = window.location.hostname
          if (host.endsWith('.colvy.com') && host !== 'colvy.com') {
            const slug = host.replace('.colvy.com', '')
            const { data: co } = await (supabase as any).from('companies').select('id').eq('slug', slug).maybeSingle()
            if (co) cid = co.id
          }
        }
        if (!cid) {
          const { data: { session } } = await supabase.auth.getSession()
          if (session?.user) {
            const { data: own } = await (supabase as any).from('companies').select('id').eq('owner_id', session.user.id).maybeSingle()
            if (own?.id) cid = own.id
            else {
              const { data: mem } = await (supabase as any).from('team_members').select('company_id').eq('user_id', session.user.id).limit(1)
              if (mem?.length) cid = mem[0].company_id
            }
          }
        }
        if (!cid) { setLoading(false); return }
        setCompanyId(cid)
        ;(supabase as any).from('companies').select('name').eq('id', cid).maybeSingle()
          .then(({ data }: any) => setCompanyName(String(data?.name || '')), () => {})

        // The campaign and the pickers' lists don't depend on each other.
        const sideLists = Promise.all([
          (supabase as any).from('company_locations').select('id, label, suburb').eq('company_id', cid)
            .then(({ data: outs }: any) => setOutlets(outs || [])),
          // Real per-part pricing, so cost estimates aren't guesses. Resolves the
          // platform-wide default (set by the super admin) with a per-company
          // override taking precedence.
          resolveSmsPricing(supabase, cid).then(setPricing).catch(() => { /* defaults until the pricing tables exist */ }),
          (supabase as any).from('contacts').select('tags').eq('company_id', cid).not('tags', 'is', null).limit(2000)
            .then(({ data: cts }: any) => {
              const t = new Set<string>()
              for (const row of (cts || [])) for (const x of (row.tags || [])) t.add(String(x))
              setAllTags(Array.from(t).sort())
            }),
          (supabase as any).from('campaigns').select('id, name').eq('company_id', cid).eq('status', 'sent').limit(50)
            .then(({ data: prior }: any) => setPastCampaigns(prior || [])),
        ]).catch(() => {})

        const { data: c } = await (supabase as any).from('campaigns')
          .select('*').eq('id', campaignId).maybeSingle()
        if (c) {
          setCampaign(c)
          if (c.channel === 'email') {
            authFetch(`/api/email-campaigns/designs?companyId=${encodeURIComponent(cid)}&campaignId=${encodeURIComponent(c.id)}`)
              .then(r => r.json().then(j => (r.ok ? j : null)))
              .then(j => { if (j) setEmailInfo({ brand: j.brand, sender: j.sender || null, design: j.design || null, dbReady: j.dbReady !== false }) })
              .catch(() => {})
          }
          setMessage(c.message || '')
          const atts = Array.isArray(c.attachments) ? c.attachments : []
          const primary = atts.find((a: any) => a.kind !== 'coupon') || null
          const cp = atts.find((a: any) => a.kind === 'coupon') || null
          if (primary) { setAttachment(primary); setAttachKind(primary.kind || 'product') }
          if (cp) setCoupon(cp)
          if (c.quiet_hours != null) setQuietHours(!!c.quiet_hours)
          if (c.send_local_time != null) setLocalTime(!!c.send_local_time)
          if (c.rate_per_minute) setRatePerMin(c.rate_per_minute)
          if (c.scheduled_at) {
            const d = new Date(c.scheduled_at)
            if (!isNaN(d.getTime())) {
              setSchedDate(d.toISOString().slice(0, 10))
              setSchedTime(d.toTimeString().slice(0, 5))
            }
          }
          const f = c.audience_filter || {}
          setSavedKey(f.type ? stableJson(f) : '')
          setAudType(f.type || c.audience_type || 'all_subscribed')
          if (f.segment) setSegment(f.segment)
          if (f.productQuery) setProductQuery(f.productQuery)
          if (f.lapsedDays) setLapsedDays(f.lapsedDays)
          if (f.locationId) setLocationId(f.locationId)
          if (f.tags) setTags(f.tags)
          if (f.campaignId) setPriorCampaign(f.campaignId)
          if (f.minSpend != null) setMinSpend(String(f.minSpend))
          if (f.minOrders != null) setMinOrders(String(f.minOrders))
          if (Array.isArray(f.contactIds)) setManualIds(f.contactIds.filter(Boolean))
          if (Array.isArray(f.contactIds) && f.contactIds.length) {
            const { data: pc } = await (supabase as any).from('contacts')
              .select('id, name, phone, email').in('id', f.contactIds.slice(0, 200))
            setPicked(pc || [])
          }
        }

        await sideLists
      } finally { setLoading(false) }
    })()
  }, [campaignId])

  /** The filter spec as the resolver expects it. */
  const buildFilter = useCallback(() => {
    const f: any = { type: audType }
    if (audType === 'segment') f.segment = segment
    if (audType === 'purchased_category') f.productQuery = productQuery.trim()
    if (audType === 'lapsed') f.lapsedDays = lapsedDays
    if (audType === 'outlet') f.locationId = locationId
    if (audType === 'tags') f.tags = tags
    if (audType === 'clicked_campaign' && priorCampaign) f.campaignId = priorCampaign
    if (audType === 'manual') f.contactIds = manualIds
    if (minSpend && Number.isFinite(parseFloat(minSpend))) f.minSpend = parseFloat(minSpend)
    if (minOrders && Number.isFinite(parseInt(minOrders))) f.minOrders = parseInt(minOrders)
    return f
  }, [audType, segment, productQuery, lapsedDays, locationId, tags, priorCampaign, minSpend, minOrders, manualIds])

  const currentFilter = buildFilter()
  const currentKey = stableJson(currentFilter)
  // An unfinished filter matches nobody — say what's missing instead.
  const filterProblem = audienceFilterProblem(currentFilter)
  const audienceDirty = currentKey !== savedKey

  // Live recipient count, debounced so typing doesn't hammer the endpoint.
  // Only the newest request's answer is used (latestOnly), and nothing is
  // asked until the campaign row has loaded — otherwise a first "everyone"
  // request raced the saved filter.
  useEffect(() => {
    if (!companyId || !campaign) return
    clearTimeout(debounce.current)
    if (filterProblem) {
      previewReq.current.cancel()
      setPreviewing(false); setPreviewError('')
      setPreview({ incomplete: filterProblem, recipients: 0, matched: 0, excludedTotal: 0, excluded: {}, sample: [] })
      return
    }
    debounce.current = setTimeout(async () => {
      const ticket = previewReq.current.start()
      setPreviewing(true); setPreviewError('')
      try {
        const res = await authFetch('/api/campaigns/audience', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ companyId, filter: JSON.parse(currentKey), channel: campaign?.channel || 'sms' }),
          signal: ticket.signal,
        })
        const d = await res.json()
        if (!ticket.isCurrent()) return
        if (!res.ok) throw new Error(d.error || 'Could not work out the audience')
        setPreview(d)
      } catch (e: any) {
        if (isAbort(e) || !ticket.isCurrent()) return
        setPreviewError(e.message); setPreview(null)
      } finally { if (ticket.isCurrent()) setPreviewing(false) }
    }, 450)
    return () => clearTimeout(debounce.current)
  }, [companyId, currentKey, filterProblem, !!campaign, campaign?.channel])

  // The saved audience (and the month's SMS allowance), for steps 3, 5 and 6.
  const loadSaved = useCallback(async (msg?: string) => {
    if (!companyId || !campaignId) return
    const ticket = savedReq.current.start()
    setSavedLoading(true)
    try {
      const res = await authFetch('/api/campaigns/audience', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        // The message on screen, so the credit quote matches what you see.
        body: JSON.stringify({ companyId, campaignId, saved: true, ...(msg != null ? { message: msg } : {}) }),
        signal: ticket.signal,
      })
      const d = await res.json()
      if (!ticket.isCurrent()) return
      if (!res.ok) throw new Error(d.error || 'Could not work out the audience')
      setSaved({ ...d, key: d.filter ? stableJson(d.filter) : '', msg })
    } catch (e: any) {
      if (isAbort(e) || !ticket.isCurrent()) return
      setSaved({ error: e.message, key: '__error' })
    } finally { if (ticket.isCurrent()) setSavedLoading(false) }
  }, [companyId, campaignId])

  useEffect(() => {
    if (!companyId || !campaign || step === 2) return
    // Review re-quotes when the message changed (its length decides the parts).
    if (saved && !saved.error && saved.key === savedKey && (step !== 6 || saved.msg === message)) return
    loadSaved(message)
  }, [step, savedKey, companyId, !!campaign, loadSaved])

  /** Save the audience through the server (which checks it's finished). */
  const saveAudience = async (): Promise<boolean> => {
    if (!campaignId || !companyId) return false
    if (filterProblem) { setStepError(filterProblem); return false }
    setSaving(true); setStepError('')
    try {
      const res = await authFetch('/api/campaigns/audience', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ companyId, campaignId, filter: currentFilter, save: true }),
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error || 'Could not save the audience')
      const key = stableJson(d.filter)
      savedReq.current.cancel()
      setSaved({ ...d, key })
      setSavedKey(key)
      setCampaign((c: any) => ({ ...c, audience_type: d.filter.type, audience_filter: d.filter, audience_count: d.recipients, excluded_count: d.excludedTotal }))
      setSavedAt(new Date().toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit' }))
      return true
    } catch (e: any) { setStepError('Could not save the audience: ' + e.message); return false }
    finally { setSaving(false) }
  }

  /**
   * Move between steps. Leaving the Audience step saves it (or stays put and
   * says what's missing), so what the later steps show is what gets sent.
   */
  const goToStep = async (n: number) => {
    if (n === step) return
    if (step === 2) {
      if (filterProblem) { setStepError(filterProblem); return }
      if (audienceDirty && !(await saveAudience())) return
    }
    setStepError('')
    setStep(n)
  }

  // ── Message composer ─────────────────────────────────────────────────────
  const sms = analyseSms(message)
  const sampleVars = Object.fromEntries(SMS_VARIABLES.map(v => [v.token, v.sample]))
  const previewText = renderVariables(message, sampleVars)
  // Cost is estimated on the RENDERED message, since variables change the
  // length — a long first name can push a borderline message to another segment.
  const renderedSms = analyseSms(previewText)
  // Costs, the allowance check and the Review step use the SAVED audience —
  // the numbers the sender will use — not whatever is half-chosen on step 2.
  const savedReady = !!saved && !saved.error && !saved.incomplete
  // Email campaigns: no SMS cost, credit, allowance or message checks.
  const isEmail = campaign?.channel === 'email'
  const emailDesign = emailInfo?.design || null
  const recipients = savedReady ? (saved.recipients || 0) : 0
  const costing = calculateCost(pricing, renderedSms.segments, recipients)
  const allowance: SmsAllowanceSummary | null = saved?.allowance || null
  // Prepaid SMS credit (V395): past the allowance, texts are paid from credit.
  // Before the wallet exists (credit.ready false) the allowance alone decides.
  const credit: any = savedReady && saved?.credit ? saved.credit : null
  const walletOn = !!credit?.ready
  // Off when Colvy manages this company's top-ups (lib/sms-policy).
  const canTopUp = credit?.canTopUp !== false
  const partsNeeded = credit?.parts ?? recipients * renderedSms.segments
  const allowanceMsg = !isEmail && !walletOn && allowance && recipients > 0 ? allowanceProblem(allowance, partsNeeded) : null
  const creditMsg = !isEmail && walletOn && recipients > 0
    ? !credit.entitled ? 'SMS isn\u2019t on your plan. Upgrade to the Inbox or Everything plan to send text messages.'
      : !credit.affordable ? (canTopUp ? `This campaign needs ${fmtCents(credit.shortfallCents)} more SMS credit. Top up to send it.` : `This campaign needs ${fmtCents(credit.shortfallCents)} more SMS credit. Top-ups are managed by Colvy for your account: contact us to add credit.`)
      : null
    : null
  const [sendTopUp, setSendTopUp] = useState(false)
  // What this send costs the business: with the wallet, only the texts past
  // the allowance (from credit); before it, the estimate at the campaign rate.
  const payNowAud = walletOn ? (credit.unlimited ? 0 : (credit.costCents || 0) / 100) : costing.totalIncGst
  const cost = costing.totalIncGst
  const hasOptOut = /\bstop\b/i.test(message)
  // The business is named if the text says {{store_name}} or any distinctive
  // word of its name ("Roxy" or "Aquarium" for Roxy Aquarium). Until the name
  // has loaded, don't warn.
  const nameWords = companyName.toLowerCase().split(/[^a-z0-9]+/)
    .filter(w => w.length >= 3 && !['the', 'and', 'pty', 'ltd', 'co', 'inc', 'shop', 'store'].includes(w))
  const hasSender = /\{\{\s*store_name\s*\}\}/.test(message) || !nameWords.length
    || nameWords.some(w => message.toLowerCase().includes(w))
  const smsChecks = runSmsChecks({ message, rendered: renderedSms, hasOptOut, hasSender })

  const insertAtCursor = (text: string) => {
    const el = msgRef.current
    if (!el) { setMessage(m => m + text); return }
    const start = el.selectionStart ?? message.length
    const end = el.selectionEnd ?? message.length
    const next = message.slice(0, start) + text + message.slice(end)
    setMessage(next)
    requestAnimationFrame(() => {
      el.focus()
      const pos = start + text.length
      el.setSelectionRange(pos, pos)
    })
  }

  const aiImprove = async () => {
    if (!message.trim()) return
    setAiBusy(true)
    try {
      const res = await authFetch('/api/ai', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ companyId,
          task: 'improve_writing',
          content:
            `Rewrite this marketing SMS so it is concise, warm and under 160 characters. ` +
            `Keep any {{variables}} exactly as they are, and keep the "Reply STOP to unsubscribe" ` +
            `wording if present. Return only the message text.\n\n${message}`,
        }),
      })
      const d = await res.json()
      const out = d.result || d.content || d.text
      if (!res.ok || !out) throw new Error(d.error || 'AI is not configured')
      setMessage(String(out).trim())
    } catch (e: any) {
      alertDialog('Could not rewrite the message: ' + e.message)
    } finally { setAiBusy(false) }
  }

  const saveMessage = async () => {
    if (!campaignId) return
    setSaving(true)
    try {
      await (supabase as any).from('campaigns').update({
        message,
        segments: renderedSms.segments,
        estimated_cost: cost,
        updated_at: new Date().toISOString(),
      }).eq('id', campaignId)
      setSavedAt(new Date().toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit' }))
    } catch (e: any) { alertDialog('Could not save: ' + e.message) }
    finally { setSaving(false) }
  }

  // ── Links & offers (step 4) ──────────────────────────────────────────────
  const searchContacts = async () => {
    if (!companyId) return
    setPickBusy(true)
    try {
      const res = await authFetch(
        `/api/campaigns/contacts?companyId=${companyId}&q=${encodeURIComponent(pickQuery)}&channel=${campaign?.channel || 'sms'}`
      )
      const d = await res.json()
      setPickResults(d.contacts || [])
    } catch { setPickResults([]) }
    finally { setPickBusy(false) }
  }

  const searchProducts = async () => {
    if (!prodQuery.trim() || !companyId) return
    setProdBusy(true)
    try {
      const res = await authFetch(`/api/orders/products?companyId=${companyId}&q=${encodeURIComponent(prodQuery)}`)
      const d = await res.json()
      setProdResults(d.products || [])
    } catch { setProdResults([]) }
    finally { setProdBusy(false) }
  }

  const loadArticles = async () => {
    if (!companyId || articles.length) return
    const { data } = await (supabase as any).from('help_articles')
      .select('id, title, category').eq('company_id', companyId).eq('status', 'published').limit(100)
    setArticles(data || [])
  }

  const createCoupon = async () => {
    if (!cCode.trim() || !cAmount || !companyId) return
    setCouponBusy(true)
    try {
      const res = await authFetch('/api/campaigns/coupon', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          companyId, code: cCode.trim(), discountType: cType, amount: cAmount,
          expiryDate: cExpiry || undefined,
          minimumSpend: cMinSpend || undefined,
          usageLimit: cUsageLimit || undefined,
          description: `Campaign: ${campaign?.name || ''}`,
        }),
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error || 'Could not create the coupon')
      const c = {
        kind: 'coupon',
        code: d.coupon?.code || cCode.trim().toLowerCase(),
        discountType: cType, amount: cAmount,
        expiryDate: cExpiry || null, minimumSpend: cMinSpend || null,
        usageLimit: cUsageLimit || null,
        existing: !!d.existing,
      }
      setCoupon(c)
      if (!/\{\{coupon_code\}\}/.test(message)) {
        // Nudge the code into the message — a coupon nobody can see is useless.
        setMessage(m => m.trim() ? `${m.trimEnd()} Use code {{coupon_code}}.` : 'Use code {{coupon_code}}.')
      }
    } catch (e: any) { alertDialog({ title: 'Couldn’t create the coupon', message: e.message }) }
    finally { setCouponBusy(false) }
  }

  const saveLinks = async () => {
    if (!campaignId) return
    setSaving(true)
    try {
      const atts: any[] = []
      if (attachment) atts.push(attachment)
      if (coupon) atts.push(coupon)
      await (supabase as any).from('campaigns').update({
        attachments: atts,
        message,
        updated_at: new Date().toISOString(),
      }).eq('id', campaignId)
      setSavedAt(new Date().toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit' }))
    } catch (e: any) { alertDialog('Could not save: ' + e.message) }
    finally { setSaving(false) }
  }

  const attachAndInsert = (a: any) => {
    setAttachment(a)
    // The message needs {{short_link}} for the attachment to actually appear.
    if (!/\{\{short_link\}\}/.test(message)) {
      setMessage(m => m.trim() ? `${m.trimEnd()} {{short_link}}` : '{{short_link}}')
    }
  }

  // ?step=N opens that step (Colvy AI's builder lands on Review), once.
  const stepFromUrl = useRef(false)
  useEffect(() => {
    if (!campaign || stepFromUrl.current || typeof window === 'undefined') return
    stepFromUrl.current = true
    const n = Number(new URLSearchParams(window.location.search).get('step'))
    if (n >= 2 && n <= 6 && !(campaign.channel === 'email' && n === 4)) setStep(n)
  }, [campaign])

  // ── Schedule (step 5) ────────────────────────────────────────────────────
  const scheduledIso = () => {
    if (sendMode === 'now' || !schedDate) return null
    const d = new Date(`${schedDate}T${schedTime || '10:00'}`)
    return isNaN(d.getTime()) ? null : d.toISOString()
  }

  // Australian marketing rules restrict sending outside reasonable hours.
  const schedHour = parseInt((schedTime || '10:00').split(':')[0], 10)
  const inQuietHours = schedHour < 9 || schedHour >= 20
  const schedInPast = (() => {
    const iso = scheduledIso()
    return iso ? new Date(iso).getTime() < Date.now() : false
  })()


  const saveSchedule = async () => {
    if (!campaignId) return
    setSaving(true)
    try {
      await (supabase as any).from('campaigns').update({
        scheduled_at: scheduledIso(),
        quiet_hours: quietHours,
        send_local_time: localTime,
        rate_per_minute: ratePerMin,
        // Lock in the rate this campaign was quoted at, so changing your pricing
        // later doesn't retroactively alter what past campaigns appear to cost.
        price_per_part: costing.pricePerPart,
        estimated_cost: costing.totalIncGst,
        segments: renderedSms.segments,
        updated_at: new Date().toISOString(),
      }).eq('id', campaignId)
      setSavedAt(new Date().toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit' }))
    } catch (e: any) { alertDialog('Could not save: ' + e.message) }
    finally { setSaving(false) }
  }

  // ── Review & send (step 6) ───────────────────────────────────────────────
  const checks: { text: string; blocking: boolean }[] = (() => {
    const out: { text: string; blocking: boolean }[] = []
    if (isEmail) {
      if (!emailDesign?.design?.blocks?.length) out.push({ text: 'Design and save the email first', blocking: true })
      else if (!String(emailDesign.subject || '').trim()) out.push({ text: 'The email has no subject line', blocking: true })
    } else if (!message.trim()) out.push({ text: 'The message is empty', blocking: true })
    if (saved?.error) out.push({ text: `Couldn\u2019t work out the saved audience: ${saved.error}`, blocking: true })
    else if (saved?.incomplete) out.push({ text: saved.incomplete, blocking: true })
    else if (savedReady && recipients === 0) out.push({ text: 'The audience has no recipients', blocking: true })
    if (allowanceMsg) out.push({ text: allowanceMsg, blocking: true })
    if (creditMsg) out.push({ text: creditMsg, blocking: true })
    // Every campaign email carries its own unsubscribe link and the business's
    // name and address, so these are SMS-only.
    if (!isEmail && !hasOptOut) out.push({ text: 'No unsubscribe instructions in the message', blocking: false })
    if (!isEmail && !hasSender) out.push({ text: 'The business isn\u2019t identified in the message', blocking: false })
    if (sendMode === 'later' && !scheduledIso()) out.push({ text: 'No send date chosen', blocking: false })
    if (sendMode === 'later' && schedInPast) out.push({ text: 'The scheduled time is in the past', blocking: true })
    return out
  })()
  const readyProblems = checks.map(c => c.text)
  const blockers = checks.filter(c => c.blocking).map(c => c.text)
  const cannotSendYet = blockers.length > 0 || !savedReady || savedLoading

  /**
   * Save everything on the page — message, links and offers, schedule options
   * and (if it changed) the audience — before scheduling or sending, so the
   * server works from exactly what's on screen.
   */
  const saveAll = async (): Promise<boolean> => {
    if (audienceDirty) {
      if (filterProblem) { setSendResult('Could not send: ' + filterProblem); return false }
      if (!(await saveAudience())) return false
    }
    const atts: any[] = []
    if (attachment) atts.push(attachment)
    if (coupon) atts.push(coupon)
    // Email: the content lives in the design (saved by the designer); only
    // the delivery options are the campaign's.
    const { error } = await (supabase as any).from('campaigns').update(isEmail ? {
      quiet_hours: quietHours,
      updated_at: new Date().toISOString(),
    } : {
      message,
      attachments: atts,
      quiet_hours: quietHours,
      send_local_time: localTime,
      rate_per_minute: ratePerMin,
      segments: renderedSms.segments,
      price_per_part: costing.pricePerPart,
      estimated_cost: costing.totalIncGst,
      updated_at: new Date().toISOString(),
    }).eq('id', campaignId)
    if (error) { setSendResult('Could not save: ' + error.message); return false }
    return true
  }

  const scheduleCampaign = async () => {
    if (!scheduledIso()) { setSendResult('Could not schedule: pick a date and time first.'); return }
    setSending(true); setSendResult('')
    try {
      if (!(await saveAll())) return
      // The server checks the saved audience and the SMS allowance before
      // queueing it, and again when the time comes.
      const res = await authFetch('/api/campaigns/schedule', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ companyId, campaignId, scheduledAt: scheduledIso() }),
      })
      const d = await res.json()
      if (!res.ok) { setSendTopUp(!!d.topUpUrl && d.reason !== 'plan'); throw new Error(d.error || 'Could not schedule the campaign') }
      setSendTopUp(false)
      setSendResult(`Scheduled for ${new Date(d.scheduledAt).toLocaleString('en-AU', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}`)
      setCampaign((c: any) => ({ ...c, status: 'scheduled', scheduled_at: d.scheduledAt, status_reason: null }))
    } catch (e: any) { setSendResult('Could not schedule: ' + e.message) }
    finally { setSending(false) }
  }

  const sendNow = async () => {
    if (!companyId) return
    // Spending money and messaging real people — make the numbers explicit.
    const ok = await confirmDialog(isEmail
      ? `You are about to email ${recipients.toLocaleString()} people from ${emailInfo?.sender?.from || 'your business'}.\n\nThis cannot be undone once it starts.`
      : `You are about to send ${recipients.toLocaleString()} SMS messages ` +
      (credit?.ready && !credit.unlimited && credit.billableParts > 0
        ? `(${credit.freeParts.toLocaleString()} texts free from your allowance, ${credit.billableParts.toLocaleString()} from credit = ${fmtCents(credit.costCents)}) `
        : `(${partsNeeded.toLocaleString()} texts of your allowance) `) +
      `at an estimated cost of ${aud(payNowAud)} (inc GST).\n\n` +
      `This cannot be undone once it starts.`
    )
    if (!ok) return
    setSending(true); setSendResult('')
    try {
      if (!(await saveAll())) return
      const res = await authFetch('/api/campaigns/send', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ companyId, campaignId, confirm: 'SEND' }),
      })
      const d = await res.json()
      if (!res.ok) { setSendTopUp(!!d.topUpUrl && d.reason !== 'plan'); throw new Error(d.error || 'Could not start the send') }
      setSendResult(
        `Sending to ${d.recipients.toLocaleString()} recipients` +
        (d.excluded ? ` · ${d.excluded.toLocaleString()} excluded` : '')
      )
      setTimeout(() => router.push(`/admin/campaigns/${campaignId}/report`), 1500)
    } catch (e: any) { setSendResult('Could not send: ' + e.message) }
    finally { setSending(false) }
  }

  // Unschedule (back to a draft, held credit / a prepared email list given
  // back), Reschedule and Stop sending: the same for SMS and email, each
  // confirmed first (components/campaigns/CampaignActions).
  const controls = campaignControls(campaign)
  const runControl = async (flow: (companyId: string, c: any) => Promise<ActionOutcome | null>) => {
    if (!companyId || !campaign) return
    setSending(true); setSendResult('')
    try {
      const r = await flow(companyId, campaign)
      if (!r) return
      setSendResult(r.message)
      if (r.ok && r.patch) {
        setCampaign((c: any) => ({ ...c, ...r.patch }))
        if (r.patch.status === 'draft') setSaved(null)
        if (r.patch.scheduled_at) {
          // Keep the Schedule step's date and time in step with the new time.
          const d = new Date(r.patch.scheduled_at)
          const p2 = (n: number) => String(n).padStart(2, '0')
          setSchedDate(`${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`)
          setSchedTime(`${p2(d.getHours())}:${p2(d.getMinutes())}`)
          setSendMode('later')
        }
      }
    } finally { setSending(false) }
  }
  const unschedule = () => runControl(unscheduleFlow)
  const reschedule = () => runControl(rescheduleFlow)
  const stopSending = () => runControl(stopSendingFlow)

  // A campaign that paused part-way (allowance used up, texting not set up).
  const pausedMidSend = campaign?.status === 'paused' && Number(campaign?.recipients_total) > 0
  const resumeSend = async () => {
    if (!companyId) return
    setSending(true); setSendResult('')
    try {
      const res = await authFetch('/api/campaigns/send', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ companyId, campaignId, confirm: 'SEND', resume: true }),
      })
      const d = await res.json()
      if (!res.ok) { setSendTopUp(!!d.topUpUrl && d.reason !== 'plan'); throw new Error(d.error || 'Could not resume the campaign') }
      setSendResult(`Resumed · ${Number(d.remaining || 0).toLocaleString()} still to send`)
      setCampaign((c: any) => ({ ...c, status: 'sending', status_reason: null }))
    } catch (e: any) { setSendResult('Could not resume: ' + e.message) }
    finally { setSending(false) }
  }

  // White rounded cards, grey pill fields and bold normal-case titles. A
  // card that sets borderColor shows it (tinted notes); the rest show a ring.
  const card: React.CSSProperties = { border: '1px solid transparent', borderRadius: 20, background: '#fff', padding: 20, boxShadow: '0 0 0 1px rgba(0,0,0,.06), 0 1px 2px rgba(16,24,40,.04)' }
  const stopBtn: React.CSSProperties = { padding: '10px 16px', borderRadius: 999, background: '#fff1f2', color: '#be123c', border: 'none', fontSize: 13.5, fontWeight: 600, cursor: 'pointer' }
  const input: React.CSSProperties = { width: '100%', minHeight: 42, padding: '10px 14px', borderRadius: 12, border: '1.5px solid transparent', fontSize: 14, boxSizing: 'border-box', backgroundColor: '#f4f4f5', color: 'var(--ink)' }
  const label: React.CSSProperties = { fontSize: 14.5, fontWeight: 700, color: 'var(--ink)', letterSpacing: '-0.01em', display: 'block', marginBottom: 10 }
  // "Send a test" for an SMS campaign: the saved message, to the numbers chosen.
  const smsTestCard = companyId ? (
    <div style={card}>
      <label style={label}>Send a test</label>
      <p style={{ margin: '0 0 10px', fontSize: 12.5, color: 'var(--slate)' }}>
        Check how it reads on a real phone: the text with example details and “[TEST]” at the start, to your number or anyone you add.
      </p>
      <TestSendPanel kind="sms" companyId={companyId} disabled={!message.trim()} disabledText="Write the message first."
        note="Up to 5 mobiles. Numbers that replied STOP are skipped. Tests count as normal texts against your SMS allowance or credit. It never touches the campaign audience."
        send={to => postTest('/api/campaigns/test-send', { companyId, campaignId, to })} />
    </div>
  ) : null

  if (loading) return <SkeletonList rows={6} />
  if (!campaign) return (
    <div style={{ padding: 40, textAlign: 'center', color: 'var(--slate)' }}>
      Campaign not found. <a href="/admin/campaigns" style={{ color: 'var(--coral)' }}>Back to campaigns</a>
    </div>
  )

  return (
    <div style={{ padding: '24px 28px 48px', boxSizing: 'border-box', width: '100%', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' }} className="campaign-editor">
      <button onClick={() => router.push('/admin/campaigns')} className="ce-back">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m15 18-6-6 6-6" /></svg>
        Campaigns
      </button>

      <div style={{ marginBottom: 18 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <h1 style={{ fontSize: 30, fontWeight: 800, letterSpacing: '-0.025em', lineHeight: 1.15, color: 'var(--ink)', margin: 0 }}>{campaign.name}</h1>
          <span className="ce-tag">{isEmail ? 'Email' : 'SMS'}</span>
        </div>
        <p style={{ color: '#71717a', fontSize: 14, margin: '6px 0 0' }}>
          {isEmail ? (step === 2 ? 'Step 2 of 5 — choose who this email goes to.' : step === 5 ? 'Step 4 of 5 — choose when it sends.' : step === 6 ? 'Step 5 of 5 — review and confirm.' : 'Step 3 of 5 — design the email.')
            : step === 2 ? 'Step 2 of 6 — choose who this campaign goes to.'
            : step === 3 ? (isEmail ? 'Step 3 of 5 — design the email.' : 'Step 3 of 6 — write the message.')
            : step === 4 ? 'Step 4 of 6 — attach links and offers.'
            : step === 5 ? 'Step 5 of 6 — choose when it sends.'
            : 'Step 6 of 6 — review and confirm.'}
        </p>
      </div>

      {/* Step rail */}
      <div className="ce-steps" style={{ display: 'flex', gap: 2, marginBottom: 20, overflowX: 'auto', padding: 3, borderRadius: 999, background: '#f4f4f5', width: 'fit-content', maxWidth: '100%', boxSizing: 'border-box', scrollbarWidth: 'none' }}>
        {['Details', 'Audience', isEmail ? 'Email' : 'Message', 'Links & offers', 'Schedule', 'Review'].map((s, i) => {
          const n = i + 1
          // Email: links and offers are blocks in the designer, so no step 4.
          if (isEmail && n === 4) return null
          const shown = isEmail && n > 4 ? n - 1 : n
          const done = n >= 2 && n <= 6
          const active = step === n
          return (
            <button key={s} type="button" disabled={!done || saving} onClick={() => done && goToStep(n)}
              aria-current={active ? 'step' : undefined}
              style={{
                flexShrink: 0, display: 'inline-flex', alignItems: 'center', gap: 7, height: 34, padding: '0 14px 0 6px', borderRadius: 999, fontSize: 13.5, fontWeight: 600,
                background: active ? '#fff' : 'transparent',
                color: active ? '#18181b' : done ? '#52525b' : '#a1a1aa',
                border: 'none', boxShadow: active ? '0 1px 3px rgba(0,0,0,.1), 0 0 0 .5px rgba(0,0,0,.04)' : 'none',
                cursor: done ? 'pointer' : 'default',
              }}>
              <span style={{ width: 22, height: 22, borderRadius: 999, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, background: active ? '#18181b' : n < step ? 'color-mix(in srgb, var(--coral) 14%, #fff)' : 'rgba(0,0,0,.06)', color: active ? '#fff' : n < step ? 'var(--coral)' : 'inherit' }}>{shown}</span>
              {s}
            </button>
          )
        })}
      </div>

      {stepError && (
        <div role="alert" style={{ marginBottom: 14, padding: '12px 16px', borderRadius: 16, border: '1px solid #fecaca', background: '#fef2f2', color: '#7f1d1d', fontSize: 13 }}>
          {stepError}
        </div>
      )}
      {campaign.status === 'paused' && (
        <div style={{ marginBottom: 14, padding: '12px 16px', borderRadius: 16, border: '1px solid #fde68a', background: '#fffbeb', display: 'flex', gap: 10, alignItems: 'flex-start' }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#b45309" strokeWidth="2.2" strokeLinecap="round" style={{ flexShrink: 0, marginTop: 1 }}><rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/></svg>
          <div style={{ fontSize: 13, color: '#78350f', lineHeight: 1.5 }}>
            <strong>This campaign is paused.</strong>{' '}
            {campaign.status_reason || (pausedMidSend ? 'It stopped part-way through.' : 'It needs attention before it can go out.')}
            {pausedMidSend
              ? ' Resume it from the Review step.'
              : ' Fix it, then schedule or send it again from the Review step.'}
          </div>
        </div>
      )}

      {isEmail && step === 3 && companyId && (
        <EmailDesignStep companyId={companyId} campaignId={campaignId} info={emailInfo} campaignName={campaign.name}
          onSaved={row => setEmailInfo(i => i ? { ...i, design: row } : i)} />
      )}

      <div style={{ display: isEmail && step === 3 ? 'none' : 'grid', gridTemplateColumns: 'minmax(0, 1fr) 340px', gap: 18, alignItems: 'start' }}
        className="campaign-grid">
        {/* ── Left: audience selection (step 2) ────────────────────────────── */}
        {step === 2 && (
        <div style={card}>
          <label style={label}>Who should receive this?</label>
          <div style={{ display: 'grid', gap: 6, marginBottom: 16 }}>
            {AUDIENCE_TYPES.map(([val, title, desc]) => (
              <button key={val} type="button" onClick={() => setAudType(val)}
                style={{
                  textAlign: 'left', padding: '12px 14px', borderRadius: 14, cursor: 'pointer', border: 'none',
                    boxShadow: audType === val ? '0 0 0 1.5px var(--coral)' : 'none',
                    background: audType === val ? 'color-mix(in srgb, var(--coral) 8%, #fff)' : '#f4f4f5',
                }}>
                <div style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--ink)' }}>{title}</div>
                <div style={{ fontSize: 12.5, color: '#71717a', marginTop: 2 }}>{desc}</div>
              </button>
            ))}
          </div>

          {/* Type-specific options */}
          {audType === 'segment' && (
            <div style={{ marginBottom: 14 }}>
              <label style={label}>Segment</label>
              <select value={segment} onChange={e => setSegment(e.target.value)} style={input}>
                {SEGMENTS.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          )}
          {audType === 'purchased_category' && (
            <div style={{ marginBottom: 14 }}>
              <label style={label}>Product SKU or name</label>
              <input value={productQuery} onChange={e => setProductQuery(e.target.value)}
                placeholder="e.g. Discus, or 0001" style={input} />
            </div>
          )}
          {audType === 'lapsed' && (
            <div style={{ marginBottom: 14 }}>
              <label style={label}>No order in the last</label>
              <select value={lapsedDays} onChange={e => setLapsedDays(parseInt(e.target.value))} style={input}>
                {[30, 60, 90, 180, 365].map(d => <option key={d} value={d}>{d} days</option>)}
              </select>
            </div>
          )}
          {audType === 'outlet' && (
            <div style={{ marginBottom: 14 }}>
              <label style={label}>Outlet</label>
              <select value={locationId} onChange={e => setLocationId(e.target.value)} style={input}>
                <option value="">Select an outlet…</option>
                {outlets.map(o => <option key={o.id} value={o.id}>{o.label || o.suburb}</option>)}
              </select>
            </div>
          )}
          {audType === 'tags' && (
            <div style={{ marginBottom: 14 }}>
              <label style={label}>Tags (match any)</label>
              {allTags.length === 0
                ? <p style={{ fontSize: 12.5, color: 'var(--slate)', margin: 0 }}>No tags on any contacts yet.</p>
                : (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                    {allTags.map(t => (
                      <button key={t} type="button"
                        onClick={() => setTags(cur => cur.includes(t) ? cur.filter(x => x !== t) : [...cur, t])}
                        style={{
                          padding: '0 13px', height: 32, borderRadius: 999, fontSize: 13, fontWeight: 600, cursor: 'pointer',
                          border: 'none', background: tags.includes(t) ? '#18181b' : '#f4f4f5', color: tags.includes(t) ? '#fff' : '#3f3f46',
                        }}>
                        {t}
                      </button>
                    ))}
                  </div>
                )}
            </div>
          )}
          {audType === 'clicked_campaign' && (
            <div style={{ marginBottom: 14 }}>
              <label style={label}>Previous campaign</label>
              <select value={priorCampaign} onChange={e => setPriorCampaign(e.target.value)} style={input}>
                <option value="">Any previous campaign</option>
                {pastCampaigns.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
          )}
          {audType === 'manual' && (
            <div style={{ marginBottom: 14 }}>
              <label style={label}>Find contacts</label>
              <div style={{ display: 'flex', gap: 8 }}>
                <input value={pickQuery} onChange={e => setPickQuery(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && searchContacts()}
                  placeholder="Search by name, email or phone" style={input} />
                <button type="button" onClick={searchContacts} disabled={pickBusy}
                  style={{ padding: '9px 16px', borderRadius: 999, background: 'var(--coral)', color: '#fff', border: 'none', fontSize: 13.5, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }}>
                  {pickBusy ? 'Searching…' : 'Search'}
                </button>
              </div>

              {pickResults.length > 0 && (
                <div style={{ marginTop: 10, maxHeight: 260, overflowY: 'auto', borderRadius: 14, background: '#fafafa', boxShadow: '0 0 0 1px #ececef' }}>
                  {pickResults.map(r => {
                    const already = manualIds.includes(r.id)
                    return (
                      <div key={r.id}
                        style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 11px', borderBottom: '1px solid #ececef' }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)' }}>{r.name || 'Unnamed'}</div>
                          <div style={{ fontSize: 11.5, color: 'var(--slate)' }}>
                            {r.destination || '—'}
                            {r.issue && <span style={{ color: '#dc2626' }}> · {r.issue}</span>}
                          </div>
                        </div>
                        <button type="button" disabled={already || !r.messageable}
                          onClick={() => { setPicked(cur => [...cur, r]); setManualIds(ids => ids.includes(r.id) ? ids : [...ids, r.id]) }}
                          title={r.issue || undefined}
                          style={{
                            padding: '0 12px', height: 30, borderRadius: 999, fontSize: 12.5, fontWeight: 600, whiteSpace: 'nowrap', border: 'none',
                            background: already ? '#f4f4f5' : 'color-mix(in srgb, var(--coral) 12%, #fff)',
                            color: already ? 'var(--slate)' : r.messageable ? 'var(--coral)' : '#d1d5db',
                            cursor: already || !r.messageable ? 'default' : 'pointer',
                          }}>
                          {already ? 'Added' : r.messageable ? 'Add' : 'Can\u2019t message'}
                        </button>
                      </div>
                    )
                  })}
                </div>
              )}

              {manualIds.length > 0 && (
                <div style={{ marginTop: 12 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                    <span style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--ink)' }}>
                      {manualIds.length.toLocaleString()} selected
                    </span>
                    <button type="button" onClick={() => { setPicked([]); setManualIds([]) }}
                      style={{ border: 'none', background: 'none', color: '#dc2626', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
                      Clear all
                    </button>
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                    {picked.map(pc => (
                      <span key={pc.id}
                        style={{ display: 'inline-flex', alignItems: 'center', gap: 6, height: 28, padding: '0 8px 0 12px', borderRadius: 999, background: '#f4f4f5', color: '#18181b', fontSize: 12.5, fontWeight: 600 }}>
                        {pc.name || pc.phone || pc.email || 'Contact'}
                        <button type="button" onClick={() => { setPicked(cur => cur.filter(x => x.id !== pc.id)); setManualIds(ids => ids.filter(x => x !== pc.id)) }}
                          style={{ border: 'none', background: '#e4e4e7', borderRadius: 999, width: 18, height: 18, padding: 0, color: '#52525b', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                        </button>
                      </span>
                    ))}
                    {manualIds.length > picked.length && (
                      <span style={{ padding: '4px 10px', fontSize: 12, color: 'var(--slate)' }}>
                        and {(manualIds.length - picked.length).toLocaleString()} more
                      </span>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Extra narrowing that applies to most types */}
          {audType !== 'manual' && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, paddingTop: 14, borderTop: '1px solid #f0f0f2' }}>
              <div>
                <label style={label}>Min. total spend</label>
                <input value={minSpend} onChange={e => setMinSpend(e.target.value)} type="number" placeholder="Any" style={input} />
              </div>
              <div>
                <label style={label}>Min. orders</label>
                <input value={minOrders} onChange={e => setMinOrders(e.target.value)} type="number" placeholder="Any" style={input} />
              </div>
            </div>
          )}
        </div>

        )}

        {/* ── Left: message composer (step 3) ──────────────────────────────── */}
        {step === 3 && (
        <div style={{ display: 'grid', gap: 14, alignContent: 'start' }}>
        {companyId && <SmsLowBalanceBanner companyId={companyId} />}
        <div style={card}>
          <label style={label}>Message</label>
          <textarea ref={msgRef} value={message} onChange={e => setMessage(e.target.value)} rows={6}
            placeholder="Hi {{first_name}}, new 15cm+ discus have arrived at {{store_name}}! View this week's arrivals: {{short_link}} Reply STOP to unsubscribe."
            style={{ ...input, resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.5 }} />

          <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', margin: '10px 0 0', fontSize: 12.5, color: 'var(--slate)' }}>
            <span><strong style={{ color: 'var(--ink)' }}>{sms.length}</strong> characters</span>
            <span><strong style={{ color: 'var(--ink)' }}>{renderedSms.segments}</strong> SMS segment{renderedSms.segments === 1 ? '' : 's'}</span>
            <span><strong style={{ color: 'var(--ink)' }}><Count n={savedReady ? recipients : null} busy={savedLoading} /></strong> recipients{savedLoading && <Calculating />}</span>
            <span>Est. cost <strong style={{ color: savedLoading ? '#9ca3af' : 'var(--ink)' }}>{aud(cost)}</strong>
              <span style={{ color: '#9ca3af' }}> inc GST</span></span>
          </div>
          {saved?.incomplete && !savedLoading && (
            <p style={{ margin: '6px 0 0', fontSize: 11.5, color: '#b45309' }}>{saved.incomplete}</p>
          )}
          {(allowanceMsg || creditMsg) && !savedLoading && (
            <p style={{ margin: '6px 0 0', fontSize: 11.5, color: '#dc2626', fontWeight: 600 }}>
              {allowanceMsg || creditMsg}
              {creditMsg && credit?.entitled && canTopUp && <> <a href="/admin/billing#sms-credits" style={{ color: 'var(--coral)' }}>Top up</a></>}
            </p>
          )}
          {walletOn && credit.entitled && !credit.unlimited && credit.billableParts > 0 && !savedLoading && (
            <p style={{ margin: '6px 0 0', fontSize: 11.5, color: 'var(--slate)' }}>
              {credit.freeParts.toLocaleString()} texts free from your allowance, {credit.billableParts.toLocaleString()} from SMS credit ({fmtCents(credit.costCents)}).
            </p>
          )}

          {recipients > 0 && (
            <p style={{ margin: '6px 0 0', fontSize: 11.5, color: 'var(--slate)' }}>
              {costing.parts.toLocaleString()} message parts at {audRate(costing.pricePerPart)} each
              {costing.tier && <span style={{ color: '#15803d', fontWeight: 600 }}> · volume rate applied</span>}
              {costing.nextTier && (
                <span> · {costing.nextTier.partsAway.toLocaleString()} more parts reaches {audRate(costing.nextTier.price)}</span>
              )}
            </p>
          )}

          {sms.encoding === 'UCS-2' && (
            <div style={{ marginTop: 10, padding: '10px 12px', borderRadius: 14, background: '#fffbeb', border: '1px solid #fde68a', fontSize: 12.5, color: '#78350f' }}>
              <strong>This message uses special characters</strong> ({sms.nonGsmChars.join(' ')}), so it is sent as
              Unicode — only {sms.perSegment} characters per segment instead of 160. Removing them would
              cut the segment count and the cost.
            </div>
          )}

          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 12, alignItems: 'center' }}>
            <div style={{ position: 'relative' }}>
              <button type="button" onClick={() => setShowEmoji(v => !v)}
                style={{ padding: '0 14px', height: 34, borderRadius: 999, border: 'none', background: '#f4f4f5', fontSize: 13, fontWeight: 600, cursor: 'pointer', color: 'var(--ink)' }}>
                Emoji
              </button>
              {showEmoji && (
                <EmojiPicker onSelect={(e) => { insertAtCursor(e); setShowEmoji(false) }} />
              )}
            </div>
            <button type="button" onClick={() => insertAtCursor('{{short_link}}')}
              style={{ padding: '0 14px', height: 34, borderRadius: 999, border: 'none', background: '#f4f4f5', fontSize: 13, fontWeight: 600, cursor: 'pointer', color: 'var(--ink)' }}>
              Insert tracked link
            </button>
            <button type="button" onClick={aiImprove} disabled={aiBusy || !message.trim()}
              style={{ padding: '0 14px', height: 34, borderRadius: 999, border: 'none', background: '#f4f4f5', fontSize: 13, fontWeight: 600, cursor: 'pointer', color: 'var(--ink)', opacity: aiBusy || !message.trim() ? 0.5 : 1 }}>
              {aiBusy ? 'Rewriting…' : 'Improve with AI'}
            </button>
            {!hasOptOut && (
              <button type="button" onClick={() => setMessage(m => (m.trimEnd() + ' Reply STOP to unsubscribe.').trim())}
                style={{ padding: '0 14px', height: 34, borderRadius: 999, border: 'none', background: '#fef3c7', fontSize: 13, fontWeight: 600, cursor: 'pointer', color: '#b45309' }}>
                + Add opt-out wording
              </button>
            )}
          </div>

          <div style={{ marginTop: 16, paddingTop: 14, borderTop: '1px solid #f0f0f2' }}>
            <label style={label}>Personalisation</label>
            <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
              {SMS_VARIABLES.map(v => (
                <button key={v.token} type="button" onClick={() => insertAtCursor('{{' + v.token + '}}')}
                  title={'Example: ' + v.sample}
                  style={{ padding: '0 11px', height: 28, borderRadius: 999, border: 'none', background: '#f4f4f5', fontSize: 12.5, fontWeight: 600, color: '#3f3f46', cursor: 'pointer' }}>
                  {v.label}
                </button>
              ))}
            </div>
            <p style={{ margin: '8px 0 0', fontSize: 11.5, color: 'var(--slate)' }}>
              Variables are replaced per recipient. The preview uses example values.
            </p>
          </div>
        </div>
        </div>
        )}

        {/* ── Left: links & offers (step 4) ────────────────────────────────── */}
        {step === 4 && (
        <div style={{ display: 'grid', gap: 14 }}>
          <div style={card}>
            <label style={label}>Attach a link</label>
            <p style={{ margin: '0 0 12px', fontSize: 12.5, color: 'var(--slate)' }}>
              Whatever you attach becomes a tracked short link on your own domain, so clicks appear
              in Link Reports. It replaces <code>{'{{short_link}}'}</code> in the message.
            </p>
            <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginBottom: 14 }}>
              {[
                ['product', 'Product'], ['category', 'Category'], ['help', 'Help article'],
                ['announcement', 'Announcement'], ['form', 'Form'], ['booking', 'Booking page'],
                ['payment', 'Payment link'], ['external', 'External URL'],
              ].map(([k, l]) => (
                <button key={k} type="button"
                  onClick={() => { setAttachKind(k); if (k === 'help') loadArticles() }}
                  style={{
                    padding: '0 13px', height: 32, borderRadius: 999, fontSize: 13, fontWeight: 600, cursor: 'pointer',
                    border: 'none', background: attachKind === k ? '#18181b' : '#f4f4f5', color: attachKind === k ? '#fff' : '#3f3f46',
                  }}>
                  {l}
                </button>
              ))}
            </div>

            {attachKind === 'product' && (
              <div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <input value={prodQuery} onChange={e => setProdQuery(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && searchProducts()}
                    placeholder="Search products by name or SKU" style={input} />
                  <button type="button" onClick={searchProducts} disabled={prodBusy}
                    style={{ padding: '9px 16px', borderRadius: 999, background: 'var(--coral)', color: '#fff', border: 'none', fontSize: 13.5, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }}>
                    {prodBusy ? 'Searching…' : 'Search'}
                  </button>
                </div>
                <div style={{ marginTop: 10, display: 'grid', gap: 6 }}>
                  {prodResults.map((p: any) => (
                    <button key={p.id} type="button"
                      onClick={() => attachAndInsert({ kind: 'product', id: p.id, label: p.name, url: p.permalink, price: p.price })}
                      style={{ display: 'flex', alignItems: 'center', gap: 10, textAlign: 'left', padding: 10, borderRadius: 14, border: 'none', background: '#f4f4f5', cursor: 'pointer' }}>
                      {p.image && <img src={p.image} alt="" style={{ width: 34, height: 34, borderRadius: 7, objectFit: 'cover' }} />}
                      <span style={{ flex: 1 }}>
                        <span style={{ display: 'block', fontSize: 13, fontWeight: 600, color: 'var(--ink)' }}>{p.name}</span>
                        <span style={{ fontSize: 11.5, color: 'var(--slate)' }}>SKU {p.sku || '—'}</span>
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {attachKind === 'help' && (
              <div style={{ display: 'grid', gap: 6, maxHeight: 260, overflowY: 'auto' }}>
                {articles.length === 0 && (
                  <p style={{ fontSize: 12.5, color: 'var(--slate)', margin: 0 }}>No published help articles found.</p>
                )}
                {articles.map((a: any) => (
                  <button key={a.id} type="button"
                    onClick={() => attachAndInsert({ kind: 'help', id: a.id, label: a.title, url: `/help/${a.id}` })}
                    style={{ textAlign: 'left', padding: 10, borderRadius: 14, border: 'none', background: '#f4f4f5', cursor: 'pointer', fontSize: 13, color: 'var(--ink)' }}>
                    {a.title}
                  </button>
                ))}
              </div>
            )}

            {['category', 'announcement', 'form', 'booking', 'payment', 'external'].includes(attachKind) && (
              <div style={{ display: 'grid', gap: 8 }}>
                <input value={linkLabel} onChange={e => setLinkLabel(e.target.value)}
                  placeholder="Label (for your reference)" style={input} />
                <input value={linkUrl} onChange={e => setLinkUrl(e.target.value)}
                  placeholder="https://roxyaquarium.com.au/..." style={input} />
                <button type="button" disabled={!linkUrl.trim()}
                  onClick={() => attachAndInsert({ kind: attachKind, label: linkLabel || linkUrl, url: linkUrl.trim() })}
                  style={{ padding: '9px 16px', borderRadius: 999, background: 'var(--coral)', color: '#fff', border: 'none', fontSize: 13.5, fontWeight: 600, cursor: 'pointer', opacity: linkUrl.trim() ? 1 : 0.5, justifySelf: 'start' }}>
                  Attach link
                </button>
              </div>
            )}
          </div>

          {/* ── Coupon ──────────────────────────────────────────────────────── */}
          <div style={card}>
            <label style={label}>Offer a coupon</label>
            {coupon ? (
              <div style={{ padding: 14, borderRadius: 14, background: '#f0fdf4' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
                  <div>
                    <code style={{ fontSize: 15, fontWeight: 800, color: '#15803d' }}>{coupon.code.toUpperCase()}</code>
                    <p style={{ margin: '4px 0 0', fontSize: 12.5, color: '#166534' }}>
                      {coupon.discountType === 'percent' ? `${coupon.amount}% off` : `$${coupon.amount} off`}
                      {coupon.minimumSpend ? ` · min spend $${coupon.minimumSpend}` : ''}
                      {coupon.expiryDate ? ` · expires ${coupon.expiryDate}` : ''}
                      {coupon.usageLimit ? ` · ${coupon.usageLimit} uses` : ''}
                    </p>
                    {coupon.existing && (
                      <p style={{ margin: '4px 0 0', fontSize: 11.5, color: '#b45309' }}>
                        This code already existed in WooCommerce and was reused.
                      </p>
                    )}
                  </div>
                  <button type="button" onClick={() => setCoupon(null)}
                    style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#dc2626', fontSize: 12.5, fontWeight: 700 }}>
                    Remove
                  </button>
                </div>
              </div>
            ) : (
              <div style={{ display: 'grid', gap: 8 }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  <input value={cCode} onChange={e => setCCode(e.target.value)} placeholder="Code e.g. FISH15" style={input} />
                  <select value={cType} onChange={e => setCType(e.target.value)} style={input}>
                    <option value="percent">Percentage off</option>
                    <option value="fixed_cart">Fixed amount off cart</option>
                    <option value="fixed_product">Fixed amount off product</option>
                  </select>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  <input value={cAmount} onChange={e => setCAmount(e.target.value)} type="number"
                    placeholder={cType === 'percent' ? 'Amount (%)' : 'Amount ($)'} style={input} />
                  <input value={cExpiry} onChange={e => setCExpiry(e.target.value)} type="date"
                    placeholder="Expiry" style={input} />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  <input value={cMinSpend} onChange={e => setCMinSpend(e.target.value)} type="number"
                    placeholder="Minimum spend ($)" style={input} />
                  <input value={cUsageLimit} onChange={e => setCUsageLimit(e.target.value)} type="number"
                    placeholder="Usage limit" style={input} />
                </div>
                <button type="button" onClick={createCoupon} disabled={couponBusy || !cCode.trim() || !cAmount}
                  style={{ padding: '9px 16px', borderRadius: 999, background: 'var(--coral)', color: '#fff', border: 'none', fontSize: 13.5, fontWeight: 600, cursor: 'pointer', opacity: couponBusy || !cCode.trim() || !cAmount ? 0.5 : 1, justifySelf: 'start' }}>
                  {couponBusy ? 'Creating…' : 'Create coupon in WooCommerce'}
                </button>
                <p style={{ margin: 0, fontSize: 11.5, color: 'var(--slate)' }}>
                  This creates a real, redeemable coupon in your store.
                </p>
              </div>
            )}
          </div>
        </div>
        )}

        {/* ── Left: schedule (step 5) ──────────────────────────────────────── */}
        {step === 5 && (
        <div style={{ display: 'grid', gap: 14 }}>
          <div style={card}>
            <label style={label}>When should this send?</label>
            <div style={{ display: 'grid', gap: 6, marginBottom: 14 }}>
              {[
                ['later', 'Schedule for later', 'Pick a date and time'],
                ['now', 'Send immediately', 'Goes out as soon as you confirm'],
              ].map(([v, t, d]) => (
                <button key={v} type="button" onClick={() => setSendMode(v as any)}
                  style={{
                    textAlign: 'left', padding: '12px 14px', borderRadius: 14, cursor: 'pointer', border: 'none',
                    boxShadow: sendMode === v ? '0 0 0 1.5px var(--coral)' : 'none',
                    background: sendMode === v ? 'color-mix(in srgb, var(--coral) 8%, #fff)' : '#f4f4f5',
                  }}>
                  <div style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--ink)' }}>{t}</div>
                  <div style={{ fontSize: 12.5, color: '#71717a', marginTop: 2 }}>{d}</div>
                </button>
              ))}
            </div>

            {sendMode === 'later' && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div>
                  <label style={label}>Date</label>
                  <input type="date" value={schedDate} onChange={e => setSchedDate(e.target.value)} style={input} />
                </div>
                <div>
                  <label style={label}>Time</label>
                  <input type="time" value={schedTime} onChange={e => setSchedTime(e.target.value)} style={input} />
                </div>
              </div>
            )}

            {sendMode === 'later' && schedInPast && (
              <p style={{ margin: '10px 0 0', fontSize: 12.5, color: '#dc2626' }}>
                That time is in the past — pick a future date and time.
              </p>
            )}
            {sendMode === 'later' && !schedInPast && inQuietHours && (
              <div style={{ marginTop: 10, padding: '10px 12px', borderRadius: 14, background: '#fffbeb', border: '1px solid #fde68a', fontSize: 12.5, color: '#78350f' }}>
                <strong>That's outside normal contact hours.</strong> Marketing messages should land between
                9am and 8pm. With quiet-hour protection on, this will be held until 9am.
              </div>
            )}
          </div>

          <div style={card}>
            <label style={label}>Delivery options</label>
            <label style={{ display: 'flex', gap: 9, alignItems: 'flex-start', cursor: 'pointer', marginBottom: 12 }}>
              <input type="checkbox" checked={quietHours} onChange={e => setQuietHours(e.target.checked)} style={{ marginTop: 2 }} />
              <span>
                <span style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--ink)', display: 'block' }}>Quiet-hour protection</span>
                <span style={{ fontSize: 11.5, color: 'var(--slate)' }}>
                  {isEmail
                    ? 'Optional for email. Hold the send until 9am if it would start outside 9am–8pm.'
                    : 'Hold anything scheduled outside 9am–8pm until the next reasonable hour.'}
                </span>
              </span>
            </label>
            {isEmail ? (
              <p style={{ margin: 0, fontSize: 12, color: 'var(--slate)', lineHeight: 1.5 }}>
                Emails go out through Resend in batches of 100, as fast as it accepts them — a few thousand
                take a few minutes. Email doesn’t use your SMS allowance or SMS credit.
              </p>
            ) : (<>
            <label style={{ display: 'flex', gap: 9, alignItems: 'flex-start', cursor: 'pointer', marginBottom: 12 }}>
              <input type="checkbox" checked={localTime} onChange={e => setLocalTime(e.target.checked)} style={{ marginTop: 2 }} />
              <span>
                <span style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--ink)', display: 'block' }}>Send at the customer's local time</span>
                <span style={{ fontSize: 11.5, color: 'var(--slate)' }}>
                  Uses the state on their address; falls back to {campaign.timezone || 'Australia/Melbourne'} when unknown.
                </span>
              </span>
            </label>
            <div>
              <label style={label}>Sending pace</label>
              <select value={ratePerMin} onChange={e => setRatePerMin(parseInt(e.target.value))} style={input}>
                {[30, 60, 120, 300].map(r => <option key={r} value={r}>Up to {r} a minute</option>)}
              </select>
              <p style={{ margin: '6px 0 0', fontSize: 11.5, color: 'var(--slate)', lineHeight: 1.5 }}>
                Drip delivery spreads the send so replies arrive at a manageable pace. Texts go out in
                batches every 2 minutes, up to {(ratePerMin * 2).toLocaleString()} a batch.
                {recipients > 0 && ratePerMin > 0 && (
                  <> At best about {Math.ceil(recipients / ratePerMin)} minute{Math.ceil(recipients / ratePerMin) === 1 ? '' : 's'} for {recipients.toLocaleString()} recipients; it pauses overnight with quiet-hour protection on, and very large sends can take longer.</>
                )}
              </p>
            </div>
            </>)}
          </div>

          {/* Test send */}
          {isEmail && companyId ? <EmailTestCard companyId={companyId} info={emailInfo} card={card} label={label} /> : smsTestCard}
        </div>
        )}

        {/* ── Left: review & confirm (step 6) ──────────────────────────────── */}
        {step === 6 && (
        <div style={{ display: 'grid', gap: 14 }}>
          {companyId && !isEmail && <SmsLowBalanceBanner companyId={companyId} />}
          <div style={card}>
            <label style={label}>Review</label>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <tbody>
                {(isEmail ? [
                  ['Campaign', campaign.name],
                  ['Channel', 'Email'],
                  ['Audience', savedLoading ? 'Calculating\u2026' : savedReady ? `${recipients.toLocaleString()} people who can be emailed` : (saved?.incomplete || saved?.error || '\u2014')],
                  ['Excluded', savedReady && !savedLoading ? `${(saved.excludedTotal || 0).toLocaleString()} contacts` : '\u2014'],
                  ['Cost', 'Included in your plan (no SMS credit used)'],
                  ['When', sendMode === 'now'
                    ? 'Immediately'
                    : scheduledIso()
                      ? new Date(scheduledIso()!).toLocaleString('en-AU', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })
                      : 'Not scheduled'],
                ] : [
                  ['Campaign', campaign.name],
                  ['Channel', String(campaign.channel || 'sms').toUpperCase()],
                  ['Sender', campaign.sender_name || campaign.sender_number || 'Default number'],
                  ['Audience', savedLoading ? 'Calculating\u2026' : savedReady ? `${recipients.toLocaleString()} recipients` : (saved?.incomplete || saved?.error || '\u2014')],
                  ['Excluded', savedReady && !savedLoading ? `${(saved.excludedTotal || 0).toLocaleString()} contacts` : '\u2014'],
                  ['Texts needed', savedReady && !savedLoading
                    ? walletOn
                      ? credit.unlimited ? `${partsNeeded.toLocaleString()} (unlimited plan)` : partsNeeded.toLocaleString()
                      : `${partsNeeded.toLocaleString()}${allowance ? allowance.unlimited ? ' (unlimited plan)' : ` of ${(allowance.remaining ?? 0).toLocaleString()} left this month` : ''}`
                    : '\u2014'],
                  ['SMS segments', `${renderedSms.segments} per message`],
                  ['Total parts', costing.parts.toLocaleString()],
                  ['Rate', walletOn && !credit.unlimited ? `${fmtRate(credit.pricePerPart)} per text past the allowance` : `${audRate(costing.pricePerPart)} per part`],
                  ['Estimated cost', walletOn ? (credit.unlimited ? 'Included in your plan' : `${aud(payNowAud)} inc GST from SMS credit`) : `${aud(costing.totalIncGst)} inc GST`],
                  ['When', sendMode === 'now'
                    ? 'Immediately'
                    : scheduledIso()
                      ? new Date(scheduledIso()!).toLocaleString('en-AU', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })
                      : 'Not scheduled'],
                ]).map(([k, v]) => (
                  <tr key={String(k)} style={{ borderTop: '1px solid #f0f0f2' }}>
                    <td style={{ padding: '9px 0', color: 'var(--slate)', width: 150 }}>{k}</td>
                    <td style={{ padding: '9px 0', color: 'var(--ink)', fontWeight: 600 }}>{v}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* How it's paid for: the allowance first, then prepaid credit */}
          {walletOn && savedReady && !savedLoading && credit.entitled && (
            <div style={{ ...card, borderColor: credit.affordable ? 'transparent' : '#fecaca', background: credit.affordable ? '#fff' : '#fef2f2' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
                <label style={{ ...label, marginBottom: 0 }}>How it’s paid for</label>
                {!credit.unlimited && canTopUp && (
                  <a href="/admin/billing#sms-credits" style={{ padding: '0 13px', height: 30, display: 'inline-flex', alignItems: 'center', borderRadius: 999, border: 'none', color: 'color-mix(in srgb, var(--coral) 85%, #000)', background: 'color-mix(in srgb, var(--coral) 12%, #fff)', fontSize: 12.5, fontWeight: 600, textDecoration: 'none' }}>
                    Top up
                  </a>
                )}
              </div>
              {credit.unlimited ? (
                <p style={{ margin: '10px 0 0', fontSize: 13, color: 'var(--ink)' }}>Your plan has unlimited texts, so no SMS credit is used.</p>
              ) : (
                <>
                  <p style={{ margin: '10px 0 0', fontSize: 13.5, color: 'var(--ink)', lineHeight: 1.5 }}>
                    <strong>{credit.freeParts.toLocaleString()}</strong> text{credit.freeParts === 1 ? '' : 's'} free from your allowance,{' '}
                    <strong>{credit.billableParts.toLocaleString()}</strong> text{credit.billableParts === 1 ? '' : 's'} from credit = <strong>{fmtCents(credit.costCents)}</strong>
                  </p>
                  <p style={{ margin: '6px 0 0', fontSize: 12.5, color: 'var(--slate)' }}>
                    SMS credit balance <strong style={{ color: 'var(--ink)' }}>{fmtCents(credit.balanceCents)}</strong>
                    {credit.heldCents > 0 && <> plus {fmtCents(credit.heldCents)} already held for this campaign</>}
                    {credit.billableParts > 0 && <> · {fmtRate(credit.pricePerPart)} a text</>}
                  </p>
                  {!credit.affordable && (
                    <p style={{ margin: '8px 0 0', fontSize: 12.5, color: '#7f1d1d', fontWeight: 600 }}>
                      This campaign needs {fmtCents(credit.shortfallCents)} more credit.{' '}
                      {canTopUp
                        ? <><a href="/admin/billing#sms-credits" style={{ color: 'var(--coral)' }}>Top up</a> to schedule or send it.</>
                        : <>Top-ups are managed by Colvy for your account: contact us to add credit.</>}
                    </p>
                  )}
                  {credit.affordable && credit.costCents > 0 && (
                    <p style={{ margin: '8px 0 0', fontSize: 11.5, color: 'var(--slate)', lineHeight: 1.5 }}>
                      The credit is held when you schedule or send, and you’re charged for what actually goes out; the rest comes back.
                    </p>
                  )}
                </>
              )}
            </div>
          )}

          {isEmail ? (<>
            <EmailReviewCard info={emailInfo} card={card} label={label} onEdit={() => goToStep(3)} />
            {companyId && <EmailTestCard companyId={companyId} info={emailInfo} card={card} label={label} />}
          </>) : (<>
          <div style={card}>
            <label style={label}>Message preview</label>
            <div style={{ background: '#e9e9eb', borderRadius: 14, padding: '11px 14px', fontSize: 13.5, lineHeight: 1.45, whiteSpace: 'pre-wrap', wordBreak: 'break-word', color: '#1a1a1a' }}>
              {previewText || 'No message written.'}
            </div>
            <p style={{ margin: '8px 0 0', fontSize: 11.5, color: 'var(--slate)' }}>
              Shown with example values. Each recipient gets their own details.
            </p>
          </div>
          {smsTestCard}
          </>)}

          {/* Exclusions, restated before committing (from the saved audience) */}
          {savedReady && saved.excludedTotal > 0 && (
            <div style={{ ...card, borderColor: '#fde68a', background: '#fffbeb' }}>
              <label style={{ ...label, color: '#b45309' }}>Who won't receive this</label>
              {Object.entries(saved.excluded as Record<string, number>)
                .filter(([, n]) => n > 0)
                .map(([reason, n]) => (
                  <p key={reason} style={{ margin: '0 0 4px', fontSize: 12.5, color: '#78350f' }}>
                    <strong>{n.toLocaleString()}</strong> {(isEmail ? EMAIL_SKIP_LABEL : SKIP_LABEL)[reason] || reason}
                  </p>
                ))}
            </div>
          )}

          {/* Compliance / readiness */}
          {readyProblems.length > 0 && (
            <div style={{ ...card, borderColor: blockers.length ? '#fecaca' : '#fde68a', background: blockers.length ? '#fef2f2' : '#fffbeb' }}>
              <label style={{ ...label, color: blockers.length ? '#dc2626' : '#b45309' }}>
                {blockers.length ? 'Must fix before sending' : 'Worth checking'}
              </label>
              {readyProblems.map(p => (
                <p key={p} style={{ margin: '0 0 4px', fontSize: 12.5, color: blockers.includes(p) ? '#7f1d1d' : '#78350f', fontWeight: blockers.includes(p) ? 600 : 400 }}>
                  · {p}
                </p>
              ))}
              {allowanceMsg && renderedSms.segments > 1 && (
                <p style={{ margin: '6px 0 0', fontSize: 11.5, color: '#7f1d1d' }}>
                  Each message is {renderedSms.segments} parts, and every part counts as one text. Shortening it
                  to one part, or narrowing the audience, brings the number down.
                </p>
              )}
            </div>
          )}
        </div>
        )}
        {/* ── Right: live count / phone preview ────────────────────────────── */}
        <div style={{ display: 'grid', gap: 12, position: 'sticky', top: 16 }}>
          {step === 6 && (
            <>
              <div style={{ ...card, borderColor: 'var(--coral)' }}>
                <div style={{ fontSize: 14.5, fontWeight: 700, color: 'var(--ink)' }}>
                  {pausedMidSend ? 'Paused part-way' : campaign.status === 'cancelled' ? 'Stopped part-way' : campaign.status === 'sending' ? 'Sending' : campaign.status === 'sent' ? 'Sent' : blockers.length ? 'Not ready yet' : 'Ready to send'}
                </div>
                <p style={{ fontSize: 30, fontWeight: 800, color: 'var(--ink)', margin: '6px 0 0', lineHeight: 1 }}>
                  <Count n={savedReady ? recipients : null} busy={savedLoading} />
                </p>
                <p style={{ margin: '4px 0 0', fontSize: 12.5, color: 'var(--slate)' }}>
                  {isEmail ? 'people to email' : <>recipients · {aud(payNowAud)} inc GST</>}{savedLoading && <Calculating />}
                </p>
                <p style={{ margin: '6px 0 0', fontSize: 11.5, color: 'var(--slate)' }}>
                  Worked out from the saved audience, the same way the send will.
                </p>
              </div>

              {pausedMidSend ? (
                <>
                  <button onClick={resumeSend} disabled={sending}
                    style={{ padding: '12px 16px', borderRadius: 999, background: 'var(--coral)', color: '#fff', border: 'none', fontSize: 13.5, fontWeight: 600, cursor: 'pointer', opacity: sending ? 0.5 : 1 }}>
                    {sending ? 'Resuming\u2026' : 'Resume sending'}
                  </button>
                  {controls.stop && (
                    <button onClick={stopSending} disabled={sending} style={stopBtn}>
                      Stop sending
                    </button>
                  )}
                  <button onClick={() => router.push(`/admin/campaigns/${campaignId}/report`)}
                    style={{ padding: '10px 16px', borderRadius: 999, background: '#f4f4f5', color: 'var(--ink)', border: 'none', fontSize: 13.5, fontWeight: 600, cursor: 'pointer' }}>
                    View report
                  </button>
                </>
              ) : campaign.status === 'cancelled' ? (
                <div style={{ ...card, background: '#f9fafb' }}>
                  <p style={{ margin: 0, fontSize: 13, color: 'var(--ink)', lineHeight: 1.5 }}>
                    This campaign was stopped part-way{Number(campaign.sent_count) > 0 ? ` after ${Number(campaign.sent_count).toLocaleString()} ${isEmail ? 'emails' : 'texts'} went` : ''}. It can't be sent again.
                  </p>
                  <button onClick={() => router.push(`/admin/campaigns/${campaignId}/report`)}
                    style={{ marginTop: 10, padding: '9px 16px', borderRadius: 999, background: '#f4f4f5', color: 'var(--ink)', border: 'none', fontSize: 13.5, fontWeight: 600, cursor: 'pointer' }}>
                    View report
                  </button>
                </div>
              ) : campaign.status === 'sent' || campaign.status === 'sending' ? (
                <div style={{ ...card, background: '#f0fdf4', borderColor: '#bbf7d0' }}>
                  <p style={{ margin: 0, fontSize: 13, color: '#166534' }}>
                    This campaign is {campaign.status}. It can't be sent again.
                  </p>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
                    <button onClick={() => router.push(`/admin/campaigns/${campaignId}/report`)}
                      style={{ padding: '9px 16px', borderRadius: 999, background: '#15803d', color: '#fff', border: 'none', fontSize: 13.5, fontWeight: 600, cursor: 'pointer' }}>
                      View report
                    </button>
                    {controls.stop && (
                      <button onClick={stopSending} disabled={sending} style={{ ...stopBtn, padding: '9px 16px' }}>
                        Stop sending
                      </button>
                    )}
                  </div>
                </div>
              ) : (
                <>
                  {sendMode === 'later' ? (
                    <button onClick={scheduleCampaign} disabled={sending || cannotSendYet}
                      style={{ padding: '12px 16px', borderRadius: 999, background: 'var(--coral)', color: '#fff', border: 'none', fontSize: 13.5, fontWeight: 600, cursor: cannotSendYet ? 'not-allowed' : 'pointer', opacity: sending || cannotSendYet ? 0.5 : 1 }}>
                      {sending ? 'Scheduling…' : 'Schedule campaign'}
                    </button>
                  ) : (
                    <button onClick={sendNow} disabled={sending || cannotSendYet}
                      style={{ padding: '12px 16px', borderRadius: 999, background: 'var(--coral)', color: '#fff', border: 'none', fontSize: 13.5, fontWeight: 600, cursor: cannotSendYet ? 'not-allowed' : 'pointer', opacity: sending || cannotSendYet ? 0.5 : 1 }}>
                      {sending ? 'Starting…' : savedReady ? `Send to ${recipients.toLocaleString()} now` : 'Send now'}
                    </button>
                  )}
                  {controls.unschedule && (
                    <div style={{ ...card, padding: 12, display: 'grid', gap: 8 }}>
                      <p style={{ margin: 0, fontSize: 12.5, color: 'var(--slate)', lineHeight: 1.45 }}>
                        Scheduled for <strong style={{ color: 'var(--ink)' }}>{campaign.scheduled_at ? new Date(campaign.scheduled_at).toLocaleString('en-AU', { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }) : 'a time not set'}</strong>
                      </p>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                        <button onClick={reschedule} disabled={sending}
                          style={{ padding: '10px 12px', borderRadius: 999, background: '#f4f4f5', color: 'var(--ink)', border: 'none', fontSize: 13.5, fontWeight: 600, cursor: 'pointer' }}>
                          Reschedule
                        </button>
                        <button onClick={unschedule} disabled={sending}
                          style={{ padding: '10px 12px', borderRadius: 999, background: '#fff1f2', color: '#be123c', border: 'none', fontSize: 13.5, fontWeight: 600, cursor: 'pointer' }}>
                          Unschedule
                        </button>
                      </div>
                    </div>
                  )}
                  <button onClick={() => goToStep(5)}
                    style={{ padding: '10px 16px', borderRadius: 999, background: '#f4f4f5', color: 'var(--ink)', border: 'none', fontSize: 13.5, fontWeight: 600, cursor: 'pointer' }}>
                    Back
                  </button>
                  <button onClick={saveLinks} disabled={saving}
                    style={{ padding: '10px 16px', borderRadius: 999, background: '#f4f4f5', color: 'var(--slate)', border: 'none', fontSize: 13.5, fontWeight: 600, cursor: 'pointer' }}>
                    {saving ? 'Saving…' : 'Save draft'}
                  </button>
                </>
              )}

              {sendResult && (
                <p style={{ margin: 0, fontSize: 12.5, textAlign: 'center', color: sendResult.startsWith('Could not') ? '#dc2626' : '#15803d' }}>
                  {sendResult}
                  {sendTopUp && sendResult.startsWith('Could not') && (
                    <> <a href="/admin/billing#sms-credits" style={{ color: 'var(--coral)', fontWeight: 700 }}>Top up SMS credit</a></>
                  )}
                </p>
              )}
              {blockers.length > 0 && !pausedMidSend && !['sent', 'sending', 'cancelled'].includes(campaign.status) && (
                <p style={{ margin: 0, fontSize: 12, color: '#dc2626', textAlign: 'center', lineHeight: 1.45 }}>
                  {blockers[0]}
                </p>
              )}
            </>
          )}

          {step === 5 && (
            <>
              <div style={card}>
                <div style={{ fontSize: 14.5, fontWeight: 700, color: 'var(--ink)', marginBottom: 10 }}>
                  Send summary
                </div>
                <p style={{ margin: '0 0 5px', fontSize: 12.5, color: 'var(--slate)' }}>
                  Recipients <strong style={{ color: 'var(--ink)' }}><Count n={savedReady ? recipients : null} busy={savedLoading} /></strong>{savedLoading && <Calculating />}
                </p>
                {isEmail ? (
                  <p style={{ margin: '0 0 5px', fontSize: 12.5, color: 'var(--slate)' }}>
                    Channel <strong style={{ color: 'var(--ink)' }}>Email</strong>
                    <span style={{ color: '#9ca3af' }}> · no SMS credit used</span>
                  </p>
                ) : (<>
                <p style={{ margin: '0 0 5px', fontSize: 12.5, color: 'var(--slate)' }}>
                  Segments each <strong style={{ color: 'var(--ink)' }}>{renderedSms.segments}</strong>
                </p>
                <p style={{ margin: '0 0 5px', fontSize: 12.5, color: 'var(--slate)' }}>
                  Total parts <strong style={{ color: 'var(--ink)' }}>{costing.parts.toLocaleString()}</strong>
                  <span style={{ color: '#9ca3af' }}> at {audRate(costing.pricePerPart)}</span>
                </p>
                <p style={{ margin: '0 0 5px', fontSize: 12.5, color: 'var(--slate)' }}>
                  Estimated cost <strong style={{ color: 'var(--ink)' }}>{aud(costing.totalIncGst)}</strong>
                  <span style={{ color: '#9ca3af' }}> inc GST</span>
                </p>
                <p style={{ margin: '0 0 5px', fontSize: 11.5, color: '#9ca3af' }}>
                  {aud(costing.totalExGst)} ex GST + {aud(costing.gst)} GST
                </p>
                </>)}
                <p style={{ margin: 0, fontSize: 12.5, color: 'var(--slate)' }}>
                  {sendMode === 'now'
                    ? 'Sends immediately on confirmation'
                    : scheduledIso()
                      ? `Scheduled for ${new Date(scheduledIso()!).toLocaleString('en-AU', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}`
                      : 'No date chosen yet'}
                </p>
              </div>

              <button onClick={saveSchedule} disabled={saving}
                style={{ padding: '11px 16px', borderRadius: 999, background: 'var(--coral)', color: '#fff', border: 'none', fontSize: 13.5, fontWeight: 600, cursor: 'pointer', opacity: saving ? 0.6 : 1 }}>
                {saving ? 'Saving…' : 'Save schedule'}
              </button>
              {savedAt && <p style={{ margin: 0, fontSize: 12, color: '#15803d', textAlign: 'center' }}>Saved at {savedAt}</p>}
              <p style={{ margin: 0, fontSize: 11.5, color: 'var(--slate)', lineHeight: 1.5 }}>
                Saving stores the schedule only. Nothing is queued until you schedule or send it on
                the Review step, so a campaign can't go out by accident.
              </p>
            </>
          )}

          {step === 4 && (
            <>
              <div style={card}>
                <div style={{ fontSize: 14.5, fontWeight: 700, color: 'var(--ink)', marginBottom: 10 }}>
                  Attached
                </div>
                {!attachment && !coupon && (
                  <p style={{ fontSize: 12.5, color: 'var(--slate)', margin: 0 }}>
                    Nothing attached yet. A campaign can still send without a link.
                  </p>
                )}
                {attachment && (
                  <div style={{ padding: 12, borderRadius: 14, background: '#f4f4f5', marginBottom: 8 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--coral)', textTransform: 'capitalize' }}>{attachment.kind}</div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)', marginTop: 2 }}>{attachment.label}</div>
                    <div style={{ fontSize: 11, color: '#9ca3af', wordBreak: 'break-all', marginTop: 2 }}>{attachment.url}</div>
                    <button type="button" onClick={() => setAttachment(null)}
                      style={{ marginTop: 6, border: 'none', background: 'none', padding: 0, color: '#dc2626', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
                      Remove
                    </button>
                  </div>
                )}
                {coupon && (
                  <div style={{ padding: 12, borderRadius: 14, background: '#f0fdf4' }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: '#15803d', textTransform: 'capitalize' }}>Coupon</div>
                    <code style={{ fontSize: 13.5, fontWeight: 800, color: '#15803d' }}>{coupon.code.toUpperCase()}</code>
                  </div>
                )}
              </div>

              {/* Warn when an attachment can't actually appear in the message */}
              {attachment && !/\{\{short_link\}\}/.test(message) && (
                <div style={{ ...card, borderColor: '#fde68a', background: '#fffbeb' }}>
                  <p style={{ margin: 0, fontSize: 12.5, color: '#78350f' }}>
                    Your message has no <code>{'{{short_link}}'}</code>, so the attached link won't appear.
                  </p>
                  <button type="button" onClick={() => setMessage(m => (m.trimEnd() + ' {{short_link}}').trim())}
                    style={{ marginTop: 8, padding: '0 13px', height: 30, borderRadius: 999, border: 'none', background: '#fff', color: '#b45309', fontSize: 12.5, fontWeight: 600, boxShadow: '0 0 0 1px #fde68a', cursor: 'pointer' }}>
                    Add it to the message
                  </button>
                </div>
              )}
              {coupon && !/\{\{coupon_code\}\}/.test(message) && (
                <div style={{ ...card, borderColor: '#fde68a', background: '#fffbeb' }}>
                  <p style={{ margin: 0, fontSize: 12.5, color: '#78350f' }}>
                    Your message has no <code>{'{{coupon_code}}'}</code>, so customers won't see the code.
                  </p>
                </div>
              )}

              <div style={{ ...card, padding: 16, background: '#f4f4f5', boxShadow: 'none' }}>
                <div style={{ fontSize: 14.5, fontWeight: 700, color: 'var(--ink)', marginBottom: 10 }}>
                  Preview
                </div>
                <div style={{ background: '#fff', borderRadius: 18, border: 'none', boxShadow: '0 1px 2px rgba(0,0,0,.05)', padding: 13, fontSize: 13, lineHeight: 1.45, whiteSpace: 'pre-wrap', wordBreak: 'break-word', color: 'var(--ink)' }}>
                  {previewText || 'Your message will appear here.'}
                </div>
              </div>

              <button onClick={saveLinks} disabled={saving}
                style={{ padding: '11px 16px', borderRadius: 999, background: 'var(--coral)', color: '#fff', border: 'none', fontSize: 13.5, fontWeight: 600, cursor: 'pointer', opacity: saving ? 0.6 : 1 }}>
                {saving ? 'Saving…' : 'Save links & offers'}
              </button>
              {savedAt && <p style={{ margin: 0, fontSize: 12, color: '#15803d', textAlign: 'center' }}>Saved at {savedAt}</p>}
            </>
          )}

          {step === 3 && (
            <>
              {/* The text as it arrives, in a phone, updating as you type */}
              <style>{DEVICES_CSS}</style>
              <div style={{ ...card, padding: '14px 10px 10px', background: 'linear-gradient(180deg,#f7f7f8,#f1f1f3)', boxShadow: 'none' }}>
                <div style={{ fontSize: 14.5, fontWeight: 700, color: 'var(--ink)', margin: '0 6px 8px' }}>Preview</div>
                <MessagesPhone name={companyName || campaign.sender_name || 'Your business'} text={previewText} accent="var(--coral)" height={540} />
                <p style={{ margin: '6px 6px 0', fontSize: 11, color: 'var(--slate)' }}>
                  Shown with example values. Each person sees their own name and link.
                </p>
              </div>

              <SmsChecksCard checks={smsChecks} />

              <button onClick={saveMessage} disabled={saving}
                style={{ padding: '11px 16px', borderRadius: 999, background: 'var(--coral)', color: '#fff', border: 'none', fontSize: 13.5, fontWeight: 600, cursor: 'pointer', opacity: saving ? 0.6 : 1 }}>
                {saving ? 'Saving…' : 'Save message'}
              </button>
              {savedAt && <p style={{ margin: 0, fontSize: 12, color: '#15803d', textAlign: 'center' }}>Saved at {savedAt}</p>}
            </>
          )}

          {step === 2 && (
          <>
          <div style={card}>
            <div style={{ fontSize: 14.5, fontWeight: 700, color: 'var(--ink)', display: 'flex', alignItems: 'center' }}>
              Estimated recipients{previewing && !filterProblem && <Calculating />}
            </div>
            {filterProblem ? (
              <p style={{ margin: '10px 0 0', fontSize: 13.5, fontWeight: 600, color: 'var(--ink)', lineHeight: 1.45 }}>
                {filterProblem}
              </p>
            ) : (
              <p style={{ fontSize: 34, fontWeight: 800, color: 'var(--ink)', margin: '6px 0 0', lineHeight: 1 }}>
                <Count n={preview && !preview.incomplete ? (preview.recipients ?? 0) : null} busy={previewing} />
              </p>
            )}
            {preview && !preview.incomplete && !filterProblem && (
              <p style={{ margin: '8px 0 0', fontSize: 12, color: previewing ? '#9ca3af' : 'var(--slate)' }}>
                {(preview.matched || 0).toLocaleString()} matched this filter
                {preview.excludedTotal > 0 && `, ${preview.excludedTotal.toLocaleString()} excluded`}
              </p>
            )}
            {previewError && (
              <p style={{ margin: '8px 0 0', fontSize: 12, color: '#dc2626' }}>{previewError}</p>
            )}
          </div>

          {/* Exclusions — the compliance-relevant part */}
          {!filterProblem && preview && !preview.incomplete && preview.excludedTotal > 0 && (
            <div style={{ ...card, borderColor: '#fde68a', background: '#fffbeb', opacity: previewing ? 0.55 : 1, transition: 'opacity .15s' }}>
              <div style={{ fontSize: 14.5, fontWeight: 700, color: '#b45309', marginBottom: 8 }}>
                Excluded contacts
              </div>
              {Object.entries(preview.excluded as Record<string, number>)
                .filter(([, n]) => n > 0)
                .map(([reason, n]) => (
                  <p key={reason} style={{ margin: '0 0 5px', fontSize: 12.5, color: '#78350f' }}>
                    <strong>{n.toLocaleString()}</strong> {(isEmail ? EMAIL_SKIP_LABEL : SKIP_LABEL)[reason] || reason}
                  </p>
                ))}
              <p style={{ margin: '8px 0 0', fontSize: 11.5, color: '#92400e' }}>
                These are removed automatically and can't be messaged.
              </p>
            </div>
          )}

          {/* Sample so staff can sanity-check the targeting */}
          {!filterProblem && preview?.sample?.length > 0 && (
            <div style={{ ...card, opacity: previewing ? 0.55 : 1, transition: 'opacity .15s' }}>
              <div style={{ fontSize: 14.5, fontWeight: 700, color: 'var(--ink)', marginBottom: 8 }}>
                Sample recipients
              </div>
              {preview.sample.map((s: any, i: number) => (
                <div key={i} style={{ fontSize: 12.5, color: 'var(--ink)', padding: '3px 0' }}>
                  {s.name || 'Unnamed'} <span style={{ color: '#9ca3af' }}>· {s.destination}</span>
                </div>
              ))}
            </div>
          )}

          {audienceDirty || saving ? (
            <button onClick={saveAudience} disabled={saving || !!filterProblem}
              title={filterProblem || undefined}
              style={{ padding: '11px 16px', borderRadius: 999, background: 'var(--coral)', color: '#fff', border: 'none', fontSize: 13.5, fontWeight: 600, cursor: filterProblem ? 'not-allowed' : 'pointer', opacity: saving || filterProblem ? 0.5 : 1 }}>
              {saving ? 'Saving…' : 'Save audience'}
            </button>
          ) : (
            <div style={{ padding: '11px 16px', borderRadius: 999, border: 'none', background: '#dcfce7', color: '#15803d', fontSize: 13.5, fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7 }}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
              Audience saved
            </div>
          )}
          <button onClick={() => goToStep(3)} disabled={saving || !!filterProblem}
            style={{ padding: '10px 16px', borderRadius: 999, background: '#f4f4f5', color: 'var(--ink)', border: 'none', fontSize: 13.5, fontWeight: 600, cursor: filterProblem ? 'not-allowed' : 'pointer', opacity: saving || filterProblem ? 0.5 : 1 }}>
            {audienceDirty ? 'Save and write the message' : 'Next: write the message'}
          </button>
          {savedAt && !audienceDirty && (
            <p style={{ margin: 0, fontSize: 12, color: '#15803d', textAlign: 'center' }}>Saved at {savedAt}</p>
          )}
          <p style={{ margin: 0, fontSize: 11.5, color: 'var(--slate)', lineHeight: 1.5 }}>
            The audience is stored as a filter, not a fixed list. Recipients are worked out again when
            the campaign sends, so anyone who unsubscribes in the meantime is still excluded.
          </p>
          </>
          )}
        </div>
      </div>

      <style jsx global>{`
        .campaign-editor button::before { display: none; }
        .campaign-editor .ce-back { display: inline-flex; align-items: center; gap: 4px; height: 32px; padding: 0 14px 0 10px; margin-bottom: 14px; border: none; border-radius: 999px; background: #f4f4f5; color: #3f3f46; font: inherit; font-size: 13.5px; font-weight: 600; cursor: pointer; }
        .campaign-editor .ce-back:hover { background: #ececef; color: #18181b; }
        .campaign-editor .ce-tag { display: inline-flex; align-items: center; height: 24px; padding: 0 10px; border-radius: 999px; background: #f4f4f5; color: #52525b; font-size: 12.5px; font-weight: 600; }
        .campaign-editor .ce-steps::-webkit-scrollbar { display: none; }
        .campaign-editor :is(input:not([type=checkbox]):not([type=radio]), select, textarea):focus { background-color: #fff !important; border-color: #d4d4d8 !important; box-shadow: 0 0 0 3px color-mix(in srgb, var(--coral) 16%, transparent) !important; outline: none; }
        .campaign-editor input[type=checkbox] { width: 18px; height: 18px; accent-color: var(--coral); }
        @media (max-width: 900px) {
          .campaign-grid { grid-template-columns: 1fr !important; }
        }
        @media (max-width: 560px) {
          .campaign-editor { padding: 16px 14px 36px !important; }
          .campaign-editor h1 { font-size: 25px !important; }
        }
      `}</style>
    </div>
  )
}
