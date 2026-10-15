'use client'

import { useState, useEffect, useRef } from 'react'
import { useParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { getVisibleQuestions } from '@/lib/conditional-logic'
import { scaleImageToJpeg } from '@/lib/scan-image'
import Confetti from '@/components/Confetti'
import { StatusMark } from '@/components/StatusMark'
import { notifyIntegrations } from '@/lib/integrations-notify'

export default function PublicForm() {
  const params = useParams()
  const formId = params.id as string

  const [form, setForm] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [step, setStep] = useState(-1) // -1 = welcome
  const [answers, setAnswers] = useState<Record<string, any>>({})
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  useEffect(() => { (window as any).__formStartTime = Date.now() }, [])
  const [formStatus, setFormStatus] = useState<'active' | 'coming-soon' | 'closed'>('active')
  const [showConfetti, setShowConfetti] = useState(false)
  const [uploadingFile, setUploadingFile] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  // Scan a business card / photo on the welcome screen → pre-fill contact answers.
  const cardInputRef = useRef<HTMLInputElement>(null)
  const [scanning, setScanning] = useState(false)
  const [scanMsg, setScanMsg] = useState('')

  useEffect(() => {
    ;(async () => {
      const { data, error } = await (supabase as any).from('forms').select('*').eq('id', formId).single()
      if (error || !data || !data.is_published) { setNotFound(true); setLoading(false); return }
      
      // Check if form is scheduled
      const now = new Date()
      if (data.scheduled_start) {
        const startDate = new Date(data.scheduled_start)
        if (now < startDate) {
          setFormStatus('coming-soon')
          setForm(data)
          setLoading(false)
          return
        }
      }
      if (data.scheduled_end) {
        const endDate = new Date(data.scheduled_end)
        if (now > endDate) {
          setFormStatus('closed')
          setForm(data)
          setLoading(false)
          return
        }
      }
      
      setFormStatus('active')
      setForm(data)
      setLoading(false)
    })()
  }, [formId])

  const questions = form?.questions || []
  const visibleQuestions = getVisibleQuestions(questions, answers)
  const themeColor = form?.theme?.color || '#ff7a6b'
  const current = visibleQuestions[step]

  // Question types where a single tap/click is an unambiguous answer — auto-advance
  const AUTO_ADVANCE_TYPES = ['multiple_choice', 'dropdown', 'yes_no', 'rating', 'nps', 'opinion_scale', 'legal', 'picture_choice']

  // ── Moving between questions ────────────────────────────────────────────────
  // Like Typeform: the current question slides up and out, the next one rises in
  // from below (and the other way round going back). `leaving` plays the exit
  // for a beat before the step actually changes.
  const [dir, setDir] = useState<'fwd' | 'back'>('fwd')
  const [leaving, setLeaving] = useState(false)
  const [err, setErr] = useState('')          // inline "please fill this in" note
  const [flash, setFlash] = useState('')      // the choice blinking before auto-advance
  const [hoverStar, setHoverStar] = useState(0)
  const answerRef = useRef<HTMLDivElement>(null)
  const moving = useRef(false)
  const reduceMotion = typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

  const go = (to: number) => {
    if (moving.current) return
    setErr('')
    setDir(to < step ? 'back' : 'fwd')
    if (reduceMotion) { setStep(to); return }
    moving.current = true
    setLeaving(true)
    setTimeout(() => {
      setStep(to); setLeaving(false); setFlash('')
      moving.current = false
    }, 170)
  }

  // Any change to an answer clears the "please fill this in" note.
  useEffect(() => { setErr('') }, [answers])

  const complain = (msg: string) => {
    setErr(msg)
    if (!reduceMotion) answerRef.current?.animate?.(
      [0, -8, 7, -5, 3, 0].map(x => ({ transform: `translateX(${x}px)` })),
      { duration: 380, easing: 'cubic-bezier(.36,.07,.19,.97)' },
    )
  }

  const isEmpty = (v: any) => v === undefined || v === null || v === '' || (Array.isArray(v) && v.length === 0)

  const handleNext = () => {
    if (moving.current) return
    if (step === -1) { go(0); return }
    // A payment step can't be skipped until it's actually paid.
    if (current?.type === 'payment' && Number(current?.amountCents) > 0 && answers[current.id]?.status !== 'paid') {
      complain('Please complete the payment to continue')
      return
    }
    const v = current ? answers[current.id] : undefined
    // A statement is informational — it has no answer, so never block on "required".
    if (current?.type !== 'statement' && current?.required && isEmpty(v)) {
      complain(['multiple_choice', 'checkbox', 'picture_choice', 'dropdown', 'yes_no', 'legal'].includes(current?.type) ? 'Please make a selection' : 'Please fill this in')
      return
    }
    if (current?.type === 'email' && !isEmpty(v) && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(v).trim())) {
      complain('Hmm… that email doesn’t look right')
      return
    }
    if (step < visibleQuestions.length - 1) go(step + 1)
    else handleSubmit()
  }

  const goBack = () => { if (step > 0) go(step - 1) }

  const selectAndAdvance = (questionId: string, value: any) => {
    if (moving.current) return
    const next = { ...answers, [questionId]: value }
    setAnswers(next)
    setErr('')
    // Blink the picked choice, then move on. Count against the questions that
    // will be visible WITH this answer (conditional logic can show or hide later
    // ones), and submit on the last one rather than stepping past the end.
    setFlash(`${questionId}:${JSON.stringify(value)}`)
    const nextVisible = getVisibleQuestions(questions, next)
    setTimeout(() => {
      if (step < nextVisible.length - 1) go(step + 1)
      else { setFlash(''); handleSubmit() }
    }, reduceMotion ? 120 : 420)
  }

  const handleSubmit = async () => {
    if (submitted || submitting) return
    setSubmitting(true)
    // Show the thank-you screen immediately so the transition from the last step
    // is smooth — the response is persisted in the background rather than making
    // the user wait on the network round-trip before anything visibly happens.
    setSubmitted(true)
    if (form?.show_confetti !== false) {
      setShowConfetti(true)
      setTimeout(() => setShowConfetti(false), 3500)
    }
    try {
      const startTime = (window as any).__formStartTime || Date.now()
      const responseTimeSec = Math.round((Date.now() - startTime) / 1000)
      await (supabase as any).from('form_responses').insert({
        form_id: formId,
        answers,
        user_agent: navigator.userAgent,
        language: navigator.language,
        screen_width: window.screen?.width,
        screen_height: window.screen?.height,
        response_time_seconds: responseTimeSec,
        referrer: document.referrer || null,
      })
      notifyIntegrations('form.submitted', { id: formId })

      // Trigger email notification to form admin (best-effort, background).
      // The server works out who that is from the form.
      try {
        if (form && form.company_id) {
          await fetch('/api/form-notifications', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ formId }),
          })
        }
      } catch (error) {
        console.error('Failed to send notification:', error)
      }
    } catch (e) {
      // The thank-you screen is already shown; log rather than yanking the user back.
      console.error('Failed to save form response:', e)
    }
    setSubmitting(false)
  }

  const handleFileUpload = async (file: File, questionId: string) => {
    setUploadingFile(true)
    try {
      const ext = file.name.split('.').pop()
      const fileName = `form-uploads/${formId}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`
      const { data, error } = await supabase.storage.from('idea-images').upload(fileName, file, { upsert: true })
      if (error) throw error
      const { data: { publicUrl } } = supabase.storage.from('idea-images').getPublicUrl(data.path)
      setAnswers(p => ({ ...p, [questionId]: { name: file.name, url: publicUrl } }))
    } catch (e: any) {
      complain('That upload didn’t work — ' + (e?.message || 'please try again'))
    }
    setUploadingFile(false)
  }

  // ── Payment (Stripe hosted checkout, then back to the form) ──────────────────
  const [paying, setPaying] = useState(false)
  const [payMsg, setPayMsg] = useState('')
  const startPayment = async (q: any) => {
    setPaying(true); setPayMsg('')
    try {
      const r = await fetch('/api/forms/payment', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'create', formId, questionId: q.id, origin: window.location.origin }),
      })
      const d = await r.json()
      if (!r.ok || !d.checkoutUrl) { setPayMsg(d.error || 'Could not start the payment.'); setPaying(false); return }
      // Persist answers + place so returning from Stripe restores the form.
      try { localStorage.setItem(`colvy_form_progress_${formId}`, JSON.stringify({ answers, step, payQuestionId: q.id })) } catch {}
      window.location.href = d.checkoutUrl
    } catch { setPayMsg('Could not start the payment.'); setPaying(false) }
  }
  const fmtMoney = (cents: number, currency?: string) => `${new Intl.NumberFormat(undefined, { style: 'currency', currency: (currency || 'aud').toUpperCase() }).format((cents || 0) / 100)}`

  // On returning from Stripe (?form_paid=<id>): restore saved progress, verify the
  // payment, and mark the payment question paid so the person can finish.
  useEffect(() => {
    if (!form) return
    const url = new URL(window.location.href)
    const paidId = url.searchParams.get('form_paid')
    const cancelled = url.searchParams.get('form_pay_cancelled')
    if (!paidId && !cancelled) return
    let saved: any = null
    try { saved = JSON.parse(localStorage.getItem(`colvy_form_progress_${formId}`) || 'null') } catch {}
    if (saved) { setAnswers(saved.answers || {}); if (typeof saved.step === 'number') setStep(saved.step) }
    const clean = () => { url.searchParams.delete('form_paid'); url.searchParams.delete('form_pay_cancelled'); url.searchParams.delete('session_id'); window.history.replaceState({}, '', url.toString()) }
    if (cancelled) { setPayMsg('Payment was cancelled — you can try again.'); clean(); return }
    ;(async () => {
      setPaying(true); setPayMsg('Confirming your payment…')
      try {
        const r = await fetch('/api/forms/payment', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'verify', paymentId: paidId }) })
        const d = await r.json()
        if (d.status === 'paid') {
          const payQ = saved?.payQuestionId
          if (payQ) setAnswers(prev => ({ ...prev, [payQ]: { status: 'paid', amount_cents: d.amountCents, currency: d.currency, payment_id: paidId } }))
          setPayMsg('')
          try { localStorage.removeItem(`colvy_form_progress_${formId}`) } catch {}
        } else {
          setPayMsg('We couldn’t confirm the payment yet. If you completed it, wait a moment and press OK.')
        }
      } catch { setPayMsg('We couldn’t confirm the payment. Please try again.') }
      setPaying(false)
      clean()
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form])

  // ── Signature pad ───────────────────────────────────────────────────────────
  const sigRef = useRef<HTMLCanvasElement | null>(null)
  const sigDrawing = useRef(false)
  const sigLast = useRef<{ x: number; y: number } | null>(null)
  const sigPos = (e: React.PointerEvent) => {
    const c = sigRef.current!; const r = c.getBoundingClientRect()
    return { x: (e.clientX - r.left) * (c.width / r.width), y: (e.clientY - r.top) * (c.height / r.height) }
  }
  const sigStart = (e: React.PointerEvent) => {
    sigDrawing.current = true; sigLast.current = sigPos(e)
    try { (e.target as Element).setPointerCapture?.(e.pointerId) } catch {}
  }
  const sigMove = (e: React.PointerEvent) => {
    if (!sigDrawing.current || !sigRef.current) return
    const ctx = sigRef.current.getContext('2d'); if (!ctx) return
    const p = sigPos(e)
    ctx.strokeStyle = '#0d0d0d'; ctx.lineWidth = 2.5; ctx.lineCap = 'round'; ctx.lineJoin = 'round'
    ctx.beginPath(); ctx.moveTo(sigLast.current!.x, sigLast.current!.y); ctx.lineTo(p.x, p.y); ctx.stroke()
    sigLast.current = p
  }
  const sigEnd = (qid: string) => {
    if (!sigDrawing.current) return
    sigDrawing.current = false
    const c = sigRef.current
    if (c) setAnswers(p => ({ ...p, [qid]: c.toDataURL('image/png') }))
  }
  const sigClear = (qid: string) => {
    const c = sigRef.current
    if (c) { const ctx = c.getContext('2d'); ctx?.clearRect(0, 0, c.width, c.height) }
    setAnswers(p => ({ ...p, [qid]: undefined }))
  }

  // ── Ranking helpers ──────────────────────────────────────────────────────────
  // Ranking works on an ordered copy of the options; seed it from the options on
  // first interaction so a submitted-but-untouched ranking still records an order.
  const rankOrder = (q: any): string[] => (Array.isArray(answers[q.id]) ? answers[q.id] : (q.options || []))
  const rankMove = (q: any, from: number, dir: -1 | 1) => {
    const arr = [...rankOrder(q)]
    const to = from + dir
    if (to < 0 || to >= arr.length) return
    ;[arr[from], arr[to]] = [arr[to], arr[from]]
    setAnswers(p => ({ ...p, [q.id]: arr }))
  }

  // ── Scheduler ────────────────────────────────────────────────────────────────
  const [schedDate, setSchedDate] = useState<string>('')          // 'YYYY-MM-DD'
  const [schedBooked, setSchedBooked] = useState<{ starts_at: string; ends_at: string }[]>([])
  const [schedBusy, setSchedBusy] = useState(false)
  const [schedMsg, setSchedMsg] = useState('')
  const schedCfg = (q: any) => {
    const c = q.schedule || {}
    return {
      days: (c.days && c.days.length ? c.days : [1, 2, 3, 4, 5]) as number[],
      start: c.start || '09:00', end: c.end || '17:00',
      slotMins: Math.max(5, Number(c.slotMins) || Number(c.durationMins) || 30),
      durationMins: Math.max(5, Number(c.durationMins) || Number(c.slotMins) || 30),
      daysAhead: Math.max(1, Number(c.daysAhead) || 14),
    }
  }
  const schedDates = (q: any): Date[] => {
    const { days, daysAhead } = schedCfg(q)
    const out: Date[] = []
    const today = new Date(); today.setHours(0, 0, 0, 0)
    for (let i = 0; i < daysAhead; i++) {
      const d = new Date(today); d.setDate(today.getDate() + i)
      if (days.includes(d.getDay())) out.push(d)
    }
    return out
  }
  const schedSlots = (q: any, dateStr: string): Date[] => {
    if (!dateStr) return []
    const { start, end, slotMins, durationMins } = schedCfg(q)
    const [sh, sm] = start.split(':').map(Number)
    const [eh, em] = end.split(':').map(Number)
    const base = new Date(dateStr + 'T00:00:00')
    const startMin = sh * 60 + sm, endMin = eh * 60 + em
    const out: Date[] = []
    for (let m = startMin; m + durationMins <= endMin; m += slotMins) {
      const d = new Date(base); d.setHours(0, m, 0, 0)
      if (d.getTime() > Date.now()) out.push(d)
    }
    return out
  }
  const slotTaken = (q: any, slot: Date): boolean => {
    const { durationMins } = schedCfg(q)
    const s = slot.getTime(), e = s + durationMins * 60000
    return schedBooked.some(b => {
      const bs = new Date(b.starts_at).getTime(), be = new Date(b.ends_at).getTime()
      return bs < e && be > s
    })
  }
  const loadSchedBooked = async (q: any, dateStr: string) => {
    setSchedDate(dateStr); setSchedMsg('')
    try {
      const from = new Date(dateStr + 'T00:00:00').toISOString()
      const to = new Date(dateStr + 'T23:59:59').toISOString()
      const r = await fetch('/api/forms/schedule', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'slots', formId, questionId: q.id, from, to }) })
      const d = await r.json()
      setSchedBooked(Array.isArray(d.booked) ? d.booked : [])
    } catch { setSchedBooked([]) }
  }
  const pickSlot = async (q: any, slot: Date) => {
    setSchedBusy(true); setSchedMsg('')
    try {
      const r = await fetch('/api/forms/schedule', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'book', formId, questionId: q.id, startsAt: slot.toISOString(), releaseEventId: answers[q.id]?.calendar_event_id }),
      })
      const d = await r.json()
      if (!r.ok) {
        setSchedMsg(d.error || 'Could not book that time.')
        if (r.status === 409) loadSchedBooked(q, schedDate)   // refresh availability
        setSchedBusy(false); return
      }
      setAnswers(p => ({ ...p, [q.id]: { starts_at: d.startsAt, ends_at: d.endsAt, calendar_event_id: d.eventId } }))
    } catch { setSchedMsg('Could not book that time.') }
    setSchedBusy(false)
  }

  // Keyboard, Typeform style: Enter = OK, letters pick choices (A, B, C…),
  // Y / N answer yes-no, digits pick a rating or scale. Letters and digits are
  // ignored while typing in a field. Kept in a ref so the listener always sees
  // the latest answers without re-binding on every keystroke.
  const onKey = useRef<(e: KeyboardEvent) => void>(() => {})
  onKey.current = (e: KeyboardEvent) => {
    if (submitted || e.metaKey || e.ctrlKey || e.altKey) return
    const t = e.target as HTMLElement | null
    const tag = t?.tagName
    const typing = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || !!t?.isContentEditable
    if (e.key === 'Enter') {
      // Enter on a focused choice means OK (as on Typeform), not "pick it again".
      if (e.shiftKey || tag === 'A' || (tag === 'BUTTON' && !t?.classList.contains('ff-choice'))) return
      e.preventDefault()
      handleNext()
      return
    }
    if (typing || !current || e.repeat) return
    const k = e.key.toLowerCase()
    const opts: string[] = current.options || []
    const letter = /^[a-z]$/.test(k) ? k.charCodeAt(0) - 97 : -1
    const digit = /^[0-9]$/.test(k) ? Number(k) : -1
    const toggle = (opt: string) => {
      const arr: string[] = answers[current.id] || []
      setAnswers(p => ({ ...p, [current.id]: arr.includes(opt) ? arr.filter(o => o !== opt) : [...arr, opt] }))
      setErr('')
    }
    switch (current.type) {
      case 'multiple_choice':
      case 'picture_choice':
        if (letter < 0 || letter >= opts.length) return
        if (current.type === 'multiple_choice' && current.multiSelect) toggle(opts[letter])
        else selectAndAdvance(current.id, opts[letter])
        break
      case 'checkbox':
        if (letter < 0 || letter >= opts.length) return
        toggle(opts[letter])
        break
      case 'yes_no':
        if (k === 'y') selectAndAdvance(current.id, 'Yes')
        else if (k === 'n') selectAndAdvance(current.id, 'No')
        else return
        break
      case 'legal':
        if (k !== 'y') return
        selectAndAdvance(current.id, true)
        break
      case 'rating':
        if (digit < 1 || digit > 5) return
        selectAndAdvance(current.id, digit)
        break
      case 'opinion_scale':
        if (digit < 1 || digit > 7) return
        selectAndAdvance(current.id, digit)
        break
      case 'nps':
        if (digit < 0) return
        selectAndAdvance(current.id, digit)
        break
      default:
        return
    }
    e.preventDefault()
  }
  useEffect(() => {
    const handler = (e: KeyboardEvent) => onKey.current(e)
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  // Safety net: if step ever lands past the last visible question without a
  // submission (e.g. an edge in conditional logic), submit rather than render a
  // blank dead-end. Guarded on submitted/submitting so it fires at most once.
  useEffect(() => {
    if (!loading && !submitted && !submitting && step >= 0 && visibleQuestions.length > 0 && step > visibleQuestions.length - 1) {
      handleSubmit()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, visibleQuestions.length, submitted, submitting, loading])

  // Map a scanned contact (from /api/contacts/scan) onto one of this form's
  // questions. Matches by question type first, then by the question's wording
  // for free-text fields — so "Your name", "Company", "Suburb" etc. line up.
  const scannedValueFor = (q: any, c: Record<string, string>): string => {
    const t = q?.type
    const label = `${q?.title || ''} ${q?.label || ''}`.toLowerCase()
    const has = (...ws: string[]) => ws.some(w => label.includes(w))
    const fullAddress = [c.address, c.city, [c.state, c.postcode].filter(Boolean).join(' '), c.country]
      .map(s => (s || '').trim()).filter(Boolean).join(', ')

    if (t === 'email') return c.email || ''
    if (t === 'phone') return c.phone || ''
    if (t === 'address') return fullAddress
    if (t === 'contact_info') return c.name || ''
    if (t === 'website') return '' // not something a card scan provides
    if (t === 'short_text' || t === 'long_text') {
      if (has('email')) return c.email || ''
      if (has('mobile', 'phone', 'tel', 'contact number')) return c.phone || ''
      if (has('first name')) return (c.name || '').split(' ')[0] || ''
      if (has('last name', 'surname')) return (c.name || '').split(' ').slice(1).join(' ')
      if (has('company', 'business', 'organisation', 'organization', 'employer')) return c.company_name || ''
      if (has('street', 'address')) return c.address || ''
      if (has('suburb', 'city', 'town')) return c.city || ''
      if (has('state', 'province', 'region')) return c.state || ''
      if (has('postcode', 'post code', 'postal', 'zip')) return c.postcode || ''
      if (has('country')) return c.country || ''
      if (has('name') && !has('user', 'file', 'business')) return c.name || ''
    }
    return ''
  }

  // Does this form have any question a card scan could fill? Drives whether the
  // "Scan a business card" affordance shows on the welcome screen at all.
  const SCAN_PROBE = { name: 'x', phone: 'x', email: 'x', company_name: 'x', address: 'x', city: 'x', state: 'x', postcode: 'x', country: 'x' }
  const formIsScannable = (questions as any[]).some(q => !!scannedValueFor(q, SCAN_PROBE))

  const scanCard = async (file: File) => {
    setScanMsg('')
    if (!file.type.startsWith('image/')) { setScanMsg('Please choose a photo or image file.'); return }
    setScanning(true)
    try {
      const { data } = await scaleImageToJpeg(file)
      // /api/contacts/scan wants raw base64 with no data: prefix.
      const base64 = data.slice(data.indexOf(',') + 1)
      const res = await fetch('/api/contacts/scan', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ companyId: form?.company_id, formId: form?.id, image: base64, mediaType: 'image/jpeg' }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok || !json?.contact) {
        setScanMsg(json?.error || 'Could not read that photo. Try a clearer, well-lit shot.')
        return
      }
      const c: Record<string, string> = json.contact
      // Fill only empty answers — never overwrite something already entered.
      const patch: Record<string, any> = {}
      for (const q of questions as any[]) {
        const v = scannedValueFor(q, c)
        if (v && (answers[q.id] === undefined || answers[q.id] === '')) patch[q.id] = v
      }
      const n = Object.keys(patch).length
      if (n) setAnswers(prev => ({ ...prev, ...patch }))
      setScanMsg(n ? `Filled ${n} field${n > 1 ? 's' : ''} from your card — review each as you go.` : 'No matching details found on that photo.')
    } catch (e: any) {
      setScanMsg(e?.message || 'Could not scan that photo.')
    } finally {
      setScanning(false)
    }
  }

  if (loading) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ width: 32, height: 32, border: '3px solid #f0f0f0', borderTopColor: '#ff7a6b', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  )

  if (notFound) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 8 }}>
      <p style={{ fontSize: 18, fontWeight: 700, color: '#0d0d0d' }}>Form not found</p>
      <p style={{ fontSize: 14, color: '#6b6b70' }}>This form may have been unpublished or deleted.</p>
    </div>
  )

  if (formStatus === 'coming-soon' && form?.scheduled_start) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#fff', padding: 24 }}>
      <div style={{ textAlign: 'center', maxWidth: 500 }}>
        <div style={{ fontSize: 64, marginBottom: 16 }}>🚀</div>
        <h1 style={{ fontSize: 28, fontWeight: 700, color: '#0d0d0d', marginBottom: 8 }}>{form.title}</h1>
        <p style={{ fontSize: 16, color: '#6b6b70', marginBottom: 24 }}>
          This form will be available on {new Date(form.scheduled_start).toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
        </p>
        <p style={{ fontSize: 14, color: '#9ca3af' }}>Check back soon!</p>
      </div>
    </div>
  )

  if (formStatus === 'closed' && form?.scheduled_end) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#fff', padding: 24 }}>
      <div style={{ textAlign: 'center', maxWidth: 500 }}>
        <div style={{ fontSize: 64, marginBottom: 16 }}>🚫</div>
        <h1 style={{ fontSize: 28, fontWeight: 700, color: '#0d0d0d', marginBottom: 8 }}>{form.title}</h1>
        <p style={{ fontSize: 16, color: '#6b6b70', marginBottom: 24 }}>
          This form closed on {new Date(form.scheduled_end).toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
        </p>
        <p style={{ fontSize: 14, color: '#9ca3af' }}>Thank you for your interest!</p>
      </div>
    </div>
  )

  // One choice row, Typeform style: a key badge (A, B, C… or Y / N), the label,
  // and a tick when picked. `blink` plays the double flash before auto-advance.
  const isFlash = (qid: string, v: any) => flash === `${qid}:${JSON.stringify(v)}`
  const choice = (o: { k: string; label: React.ReactNode; on: boolean; blink?: boolean; onClick: () => void; checkbox?: boolean }) => (
    <button type="button" onClick={o.onClick} aria-pressed={o.on}
      className={`ff-choice${o.on ? ' on' : ''}${o.blink ? ' ff-blink' : ''}`}>
      <span className="ff-key"><span className="ff-keyword">Key </span>{o.k}</span>
      <span className="ff-label">{o.label}</span>
      <svg className="ff-tick" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
    </button>
  )
  const ARROW = <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
  const enterHint = <span className="ff-hint">press <b>Enter ↵</b></span>
  const minutes = Math.max(1, Math.round((visibleQuestions.length * 12) / 60))
  const stage = leaving ? `ff-out-${dir}` : `ff-in-${dir}`

  return (
    <div style={{ ['--ff' as any]: themeColor, minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#fff', padding: '64px 24px 96px', position: 'relative', overflowX: 'clip' }}>
      <style>{`
        @keyframes ffInUp { from { opacity: 0; transform: translateY(44px); } to { opacity: 1; transform: none; } }
        @keyframes ffInDown { from { opacity: 0; transform: translateY(-44px); } to { opacity: 1; transform: none; } }
        @keyframes ffOutUp { to { opacity: 0; transform: translateY(-44px); } }
        @keyframes ffOutDown { to { opacity: 0; transform: translateY(44px); } }
        .ff-in-fwd > * { animation: ffInUp .55s cubic-bezier(.16,1,.3,1) both; }
        .ff-in-back > * { animation: ffInDown .55s cubic-bezier(.16,1,.3,1) both; }
        .ff-in-fwd > :nth-child(2), .ff-in-back > :nth-child(2) { animation-delay: .04s; }
        .ff-in-fwd > :nth-child(3), .ff-in-back > :nth-child(3) { animation-delay: .08s; }
        .ff-in-fwd > :nth-child(4), .ff-in-back > :nth-child(4) { animation-delay: .12s; }
        .ff-in-fwd > :nth-child(n+5), .ff-in-back > :nth-child(n+5) { animation-delay: .16s; }
        .ff-out-fwd { animation: ffOutUp .17s cubic-bezier(.4,0,1,1) both; }
        .ff-out-back { animation: ffOutDown .17s cubic-bezier(.4,0,1,1) both; }

        .ff-qhead { display: flex; gap: 10px; align-items: baseline; margin-bottom: 8px; }
        .ff-num { display: inline-flex; align-items: center; gap: 3px; font-size: 15px; font-weight: 600; color: var(--ff); flex-shrink: 0; transform: translateY(-2px); }
        .ff-title { font-size: clamp(21px, 2.6vw, 26px); font-weight: 500; color: #0d0d0d; line-height: 1.35; letter-spacing: -0.01em; margin: 0; }
        .ff-desc { font-size: 17px; color: #4b5563; line-height: 1.55; margin: 0 0 4px; }
        /* Answers line up under the question text, past the number. On phones the
           number sits above the question instead, so everything is flush left. */
        .ff-indent { padding-left: 34px; }
        @media (max-width: 600px) {
          .ff-qhead { flex-direction: column; gap: 6px; }
          .ff-num { transform: none; }
          .ff-indent { padding-left: 0; }
        }

        .ff-input { width: 100%; font-size: clamp(20px, 3vw, 28px); padding: 6px 0 10px; border: none; border-bottom: 1px solid color-mix(in srgb, var(--ff) 40%, transparent); border-radius: 0; outline: none; background: transparent; color: var(--ff); font-family: inherit; transition: border-color .2s, box-shadow .2s; }
        .ff-input:focus { border-color: transparent !important; border-bottom-color: var(--ff) !important; box-shadow: 0 1px 0 var(--ff); }
        .ff-input::placeholder { color: color-mix(in srgb, var(--ff) 35%, #b8b8be); }
        select.ff-input { cursor: pointer; }

        .ff-choices { display: flex; flex-direction: column; gap: 8px; width: fit-content; min-width: min(100%, 300px); max-width: 100%; }
        .ff-choice { display: flex; align-items: center; gap: 10px; width: 100%; padding: 8px 12px 8px 8px; border-radius: 6px; border: 1px solid color-mix(in srgb, var(--ff) 45%, transparent); background: color-mix(in srgb, var(--ff) 8%, #fff); color: #0d0d0d; font-size: 17px; text-align: left; cursor: pointer; transition: background .15s, box-shadow .15s, transform .1s; font-family: inherit; }
        .ff-choice:hover { background: color-mix(in srgb, var(--ff) 15%, #fff); }
        .ff-choice:active { transform: scale(.985); }
        .ff-choice.on { border-color: var(--ff); box-shadow: inset 0 0 0 1px var(--ff); background: color-mix(in srgb, var(--ff) 16%, #fff); }
        .ff-key { min-width: 24px; height: 24px; padding: 0 6px; border-radius: 4px; border: 1px solid color-mix(in srgb, var(--ff) 55%, transparent); background: #fff; color: var(--ff); font-size: 12px; font-weight: 700; display: inline-flex; align-items: center; justify-content: center; flex-shrink: 0; transition: background .15s, color .15s; white-space: nowrap; }
        .ff-keyword { display: none; }
        @media (hover: hover) { .ff-choice:hover .ff-keyword { display: inline; margin-right: 3px; } }
        .ff-choice.on .ff-key { background: var(--ff); border-color: var(--ff); color: #fff; }
        .ff-label { flex: 1; min-width: 0; }
        .ff-tick { color: var(--ff); flex-shrink: 0; opacity: 0; transform: scale(.5); transition: opacity .2s, transform .25s cubic-bezier(.34,1.56,.64,1); }
        .ff-choice.on .ff-tick { opacity: 1; transform: none; }
        @keyframes ffBlink { 0%, 50%, 100% { background: color-mix(in srgb, var(--ff) 16%, #fff); } 25%, 75% { background: color-mix(in srgb, var(--ff) 4%, #fff); } }
        .ff-blink { animation: ffBlink .4s linear 1; }
        .ff-row { display: flex; gap: 10px; flex-wrap: wrap; }
        .ff-row .ff-choice { width: auto; min-width: 150px; }
        .ff-scale { display: flex; gap: 6px; }
        .ff-scale .ff-choice { flex: 1; min-width: 0; justify-content: center; padding: 12px 0; font-weight: 600; font-size: 16px; }
        .ff-star { background: none; border: none; cursor: pointer; padding: 2px; transition: transform .18s cubic-bezier(.34,1.56,.64,1); }
        .ff-star:hover { transform: scale(1.12); }
        .ff-star:active { transform: scale(.94); }

        .ff-drop { display: flex; flex-direction: column; align-items: center; gap: 8px; padding: 32px; border-radius: 10px; border: 1px solid color-mix(in srgb, var(--ff) 30%, transparent); background: color-mix(in srgb, var(--ff) 6%, #fff); color: var(--ff); transition: background .15s, border-color .15s; }
        .ff-drop:hover { background: color-mix(in srgb, var(--ff) 11%, #fff); border-color: color-mix(in srgb, var(--ff) 55%, transparent); }

        .ff-actions { display: flex; align-items: center; gap: 14px; flex-wrap: wrap; }
        .ff-ok { display: inline-flex; align-items: center; gap: 8px; padding: 10px 20px; border-radius: 6px; border: none; background: var(--ff); color: #fff; font-size: 17px; font-weight: 700; cursor: pointer; font-family: inherit; box-shadow: 0 4px 14px -6px color-mix(in srgb, var(--ff) 70%, transparent); transition: transform .12s, filter .15s; }
        .ff-ok:hover { filter: brightness(1.06); }
        .ff-ok:active { transform: scale(.97); }
        .ff-ok:disabled { opacity: .6; cursor: default; }
        .ff-hint { font-size: 12.5px; color: #6b6b70; }
        .ff-hint b { font-weight: 700; color: #3f3f46; }
        @media (hover: none) { .ff-hint { display: none; } }

        @keyframes ffErrIn { from { opacity: 0; transform: translateY(-4px); } to { opacity: 1; transform: none; } }
        .ff-err { display: inline-flex; align-items: center; gap: 8px; margin-top: 14px; padding: 6px 12px; border-radius: 4px; background: #fdecec; color: #c0262d; font-size: 14px; font-weight: 500; animation: ffErrIn .25s cubic-bezier(.16,1,.3,1) both; }

        .ff-nav { position: fixed; right: 20px; bottom: 20px; display: flex; gap: 1px; border-radius: 6px; overflow: hidden; z-index: 20; box-shadow: 0 2px 10px rgba(0,0,0,.08); }
        .ff-nav button { width: 40px; height: 36px; border: none; background: var(--ff); color: #fff; display: flex; align-items: center; justify-content: center; cursor: pointer; transition: filter .15s; }
        .ff-nav button:hover:not(:disabled) { filter: brightness(1.08); }
        .ff-nav button:disabled { opacity: .4; cursor: default; }
        .ff-bar { position: fixed; top: 0; left: 0; right: 0; height: 4px; background: color-mix(in srgb, var(--ff) 18%, #fff); z-index: 10; }
        .ff-bar > div { height: 100%; background: var(--ff); transition: width .5s cubic-bezier(.16,1,.3,1); }

        @media (prefers-reduced-motion: reduce) {
          .ff-in-fwd > *, .ff-in-back > *, .ff-out-fwd, .ff-out-back, .ff-blink, .ff-err { animation: none !important; }
        }
      `}</style>

      <Confetti show={showConfetti} color={themeColor} />

      {step >= 0 && !submitted && (
        <div className="ff-bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round((step / Math.max(1, visibleQuestions.length)) * 100)}>
          <div style={{ width: `${(step / Math.max(1, visibleQuestions.length)) * 100}%` }} />
        </div>
      )}

      {step >= 0 && !submitted && current && (
        <div className="ff-nav">
          <button type="button" onClick={goBack} disabled={step === 0} aria-label="Previous question">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><polyline points="18 15 12 9 6 15"/></svg>
          </button>
          <button type="button" onClick={handleNext} disabled={step >= visibleQuestions.length - 1} aria-label="Next question">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
          </button>
        </div>
      )}

      <div style={{ width: '100%', maxWidth: 640 }}>
        {submitted ? (
          <div key="thanks" className="ff-in-fwd" style={{ textAlign: 'center' }}>
            <div style={{ marginBottom: 24 }}><StatusMark kind="success" size={88} celebrate /></div>
            <h1 style={{ fontSize: 24, fontWeight: 800, color: '#0d0d0d', marginBottom: (form.end_actions || []).length > 0 ? 28 : 0 }}>{form.thank_you_message || 'Thanks for completing this form!'}</h1>
            {(form.end_actions || []).length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxWidth: 320, margin: '0 auto' }}>
                {(form.end_actions || []).map((a: any, i: number) => {
                  // An action with no URL (e.g. the seeded "Visit our board")
                  // must not render a dead href="#" — that just reloads the form.
                  // Fall back to the public board at the subdomain root.
                  const href = a.type === 'board' ? '/' : (a.url && a.url !== '#' ? a.url : '/')
                  const external = /^https?:\/\//i.test(href)
                  return (
                  <a key={i} href={href} target={external ? '_blank' : undefined} rel={external ? 'noopener' : undefined}
                    style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                      padding: '13px 20px', borderRadius: 12, fontSize: 14, fontWeight: 700, textDecoration: 'none',
                      background: i === 0 ? themeColor : '#fff',
                      color: i === 0 ? '#fff' : themeColor,
                      border: i === 0 ? 'none' : `1.5px solid ${themeColor}`,
                    }}>
                    {a.type === 'board' && <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 11l18-5v12L3 14v-3z"/><path d="M11.6 16.8a3 3 0 1 1-5.8-1.6"/></svg>}
                    {a.type === 'video' && <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2"/></svg>}
                    {a.type === 'social' && <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>}
                    {(a.type === 'website' || a.type === 'custom') && <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>}
                    {a.label}
                  </a>
                  )
                })}
              </div>
            )}
          </div>
        ) : step === -1 ? (
          <div key="welcome" className={leaving ? stage : 'ff-in-fwd'} style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <h1 style={{ fontSize: 'clamp(26px, 3.6vw, 34px)', fontWeight: 600, color: '#0d0d0d', margin: '0 0 12px', lineHeight: 1.25, letterSpacing: '-0.015em' }}>{form.title}</h1>
            {form.welcome_message && <p style={{ fontSize: 18, color: '#4b5563', lineHeight: 1.55, margin: '0 0 28px', maxWidth: 520 }}>{form.welcome_message}</p>}
            <div className="ff-actions" style={{ justifyContent: 'center', marginTop: form.welcome_message ? 0 : 16 }}>
              <button type="button" className="ff-ok" onClick={() => go(0)} style={{ fontSize: 19, padding: '12px 26px' }}>Start</button>
              {enterHint}
            </div>
            <p style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13.5, color: '#6b6b70', marginTop: 18 }}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9"/><polyline points="12 7 12 12 15 14"/></svg>
              Takes {minutes} minute{minutes === 1 ? '' : 's'}
            </p>

            {formIsScannable && (
              <div style={{ marginTop: 28, paddingTop: 24, borderTop: '1px solid #eee', alignSelf: 'stretch' }}>
                <input
                  ref={cardInputRef}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  style={{ display: 'none' }}
                  onChange={e => { const f = e.target.files?.[0]; if (f) scanCard(f); e.target.value = '' }}
                />
                <button
                  type="button"
                  onClick={() => cardInputRef.current?.click()}
                  disabled={scanning}
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 8,
                    padding: '11px 20px', borderRadius: 12,
                    border: `1.5px solid ${themeColor}`, background: '#fff', color: themeColor,
                    fontWeight: 700, fontSize: 14, cursor: scanning ? 'default' : 'pointer', opacity: scanning ? 0.7 : 1,
                  }}
                >
                  {scanning ? 'Scanning…' : '📇 Scan a business card'}
                </button>
                <p style={{ fontSize: 12.5, color: '#9ca3af', margin: '10px auto 0', maxWidth: 380 }}>
                  Snap or upload a card and we&rsquo;ll fill in the contact details for you.
                </p>
                {scanMsg && (
                  <p style={{ fontSize: 12.5, marginTop: 8, fontWeight: 600, color: scanMsg.startsWith('Filled') ? '#047857' : '#dc2626' }}>
                    {scanMsg}
                  </p>
                )}
              </div>
            )}
          </div>
        ) : current ? (
          <div key={current.id} className={stage}>
            {current.mediaUrl && (
              current.mediaType === 'video' ? (
                <video src={current.mediaUrl} controls style={{ width: '100%', borderRadius: 10, marginBottom: 24, maxHeight: 300, objectFit: 'cover', display: 'block' }} />
              ) : (
                <img src={current.mediaUrl} alt="" style={{ width: '100%', borderRadius: 10, marginBottom: 24, maxHeight: 300, objectFit: 'cover', display: 'block' }} />
              )
            )}

            <div className="ff-qhead">
              <span className="ff-num">{step + 1}{ARROW}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                {current.title && (
                  <h2 className="ff-title">
                    {current.title}{current.type !== 'statement' && current.required && <span style={{ color: themeColor }}> *</span>}
                  </h2>
                )}
                {/* Statement body is the main content — render it large. Other types
                    show the description as a subtitle. */}
                {current.type === 'statement'
                  ? (current.description && <p style={{ fontSize: 18, color: '#374151', lineHeight: 1.7, whiteSpace: 'pre-wrap', margin: current.title ? '8px 0 0' : 0 }}>{current.description}</p>)
                  : (current.description && <p className="ff-desc" style={{ marginTop: current.title ? 6 : 0 }}>{current.description}</p>)}
              </div>
            </div>

            <div ref={answerRef} className="ff-indent" style={{ marginTop: current.type === 'statement' ? 20 : 30, marginBottom: 28 }}>
              {current.type === 'short_text' && (
                <input autoFocus value={answers[current.id] || ''} onChange={e => setAnswers(p => ({ ...p, [current.id]: e.target.value }))}
                  className="ff-input"
                  placeholder="Type your answer here..." />
              )}
              {current.type === 'long_text' && (
                <textarea autoFocus value={answers[current.id] || ''} onChange={e => setAnswers(p => ({ ...p, [current.id]: e.target.value }))}
                  className="ff-input" rows={3} style={{ resize: 'none', fontSize: 'clamp(18px, 2.6vw, 24px)' }}
                  placeholder="Type your answer here..." />
              )}
              {current.type === 'email' && (
                <input autoFocus type="email" value={answers[current.id] || ''} onChange={e => setAnswers(p => ({ ...p, [current.id]: e.target.value }))}
                  className="ff-input"
                  placeholder="name@example.com" />
              )}
              {current.type === 'number' && (
                <input autoFocus type="number" value={answers[current.id] || ''} onChange={e => setAnswers(p => ({ ...p, [current.id]: e.target.value }))}
                  className="ff-input"
                  placeholder="0" />
              )}
              {current.type === 'date' && (
                <input autoFocus type="date" value={answers[current.id] || ''} onChange={e => setAnswers(p => ({ ...p, [current.id]: e.target.value }))}
                  className="ff-input" />
              )}
              {current.type === 'yes_no' && (
                <div className="ff-row">
                  {['Yes', 'No'].map(o => <span key={o}>{choice({
                    k: o[0], label: o, on: answers[current.id] === o, blink: isFlash(current.id, o),
                    onClick: () => selectAndAdvance(current.id, o),
                  })}</span>)}
                </div>
              )}
              {current.type === 'rating' && (
                <div style={{ display: 'flex', gap: 6 }} onMouseLeave={() => setHoverStar(0)}>
                  {[1, 2, 3, 4, 5].map(n => {
                    const lit = (hoverStar || answers[current.id] || 0) >= n
                    return (
                      <button key={n} type="button" className={`ff-star${isFlash(current.id, n) ? ' ff-blink' : ''}`} aria-label={`${n} star${n > 1 ? 's' : ''}`}
                        onMouseEnter={() => setHoverStar(n)} onClick={() => selectAndAdvance(current.id, n)}>
                        <svg width="44" height="44" viewBox="0 0 24 24" fill={lit ? themeColor : `${themeColor}14`} stroke={themeColor} strokeWidth="1.3" strokeLinejoin="round" style={{ transition: 'fill .15s', display: 'block' }}><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
                        <span style={{ display: 'block', fontSize: 12, color: '#9ca3af', marginTop: 2 }}>{n}</span>
                      </button>
                    )
                  })}
                </div>
              )}
              {current.type === 'multiple_choice' && !(current as any).multiSelect && (
                <div className="ff-choices">
                  {(current.options || []).map((opt: string, oi: number) => <span key={oi}>{choice({
                    k: String.fromCharCode(65 + oi), label: opt, on: answers[current.id] === opt, blink: isFlash(current.id, opt),
                    onClick: () => selectAndAdvance(current.id, opt),
                  })}</span>)}
                </div>
              )}
              {/* Multiple Choice with "multiple selection" on, and Checkboxes, are a
                  pick-several group: choose, then press OK (no auto-advance). */}
              {((current.type === 'multiple_choice' && (current as any).multiSelect) || current.type === 'checkbox') && (
                <div className="ff-choices">
                  {(current.options || []).map((opt: string, oi: number) => {
                    const selectedArr: string[] = answers[current.id] || []
                    const isChecked = selectedArr.includes(opt)
                    return <span key={oi}>{choice({
                      k: String.fromCharCode(65 + oi), label: opt, on: isChecked,
                      onClick: () => {
                        const next = isChecked ? selectedArr.filter(o => o !== opt) : [...selectedArr, opt]
                        setAnswers(p => ({ ...p, [current.id]: next })); setErr('')
                      },
                    })}</span>
                  })}
                  <p style={{ fontSize: 13, color: '#6b6b70', margin: '4px 0 0' }}>Choose as many as you like</p>
                </div>
              )}
              {current.type === 'dropdown' && (
                <select value={answers[current.id] || ''} onChange={e => selectAndAdvance(current.id, e.target.value)}
                  className="ff-input">
                  <option value="">Select an option...</option>
                  {(current.options || []).map((opt: string, oi: number) => <option key={oi} value={opt}>{opt}</option>)}
                </select>
              )}
              {current.type === 'nps' && (
                <div>
                  <div className="ff-scale">
                    {[...Array(11)].map((_, n) => (
                      <button key={n} type="button" onClick={() => selectAndAdvance(current.id, n)}
                        className={`ff-choice${answers[current.id] === n ? ' on' : ''}${isFlash(current.id, n) ? ' ff-blink' : ''}`}>
                        {n}
                      </button>
                    ))}
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: '#6b6b70', marginTop: 10 }}>
                    <span>Not likely at all</span><span>Extremely likely</span>
                  </div>
                </div>
              )}
              {current.type === 'opinion_scale' && (
                <div className="ff-scale" style={{ maxWidth: 520 }}>
                  {[1, 2, 3, 4, 5, 6, 7].map(n => (
                    <button key={n} type="button" onClick={() => selectAndAdvance(current.id, n)}
                      className={`ff-choice${answers[current.id] === n ? ' on' : ''}${isFlash(current.id, n) ? ' ff-blink' : ''}`}>
                      {n}
                    </button>
                  ))}
                </div>
              )}
              {['contact_info', 'phone', 'address', 'website'].includes(current.type) && (
                <input autoFocus value={answers[current.id] || ''} onChange={e => setAnswers(p => ({ ...p, [current.id]: e.target.value }))}
                  className="ff-input"
                  placeholder={current.type === 'phone' ? '+61 4XX XXX XXX' : current.type === 'website' ? 'https://...' : current.type === 'address' ? 'Street, suburb, state, postcode' : 'Your name'} />
              )}
              {current.type === 'legal' && (
                <div className="ff-choices">
                  {choice({ k: 'Y', label: 'I accept', on: !!answers[current.id], blink: isFlash(current.id, true), onClick: () => selectAndAdvance(current.id, true) })}
                </div>
              )}
              {current.type === 'file_upload' && (
                <div>
                  {answers[current.id]?.url ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', borderRadius: 12, border: `2px solid ${themeColor}`, background: `${themeColor}10` }}>
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={themeColor} strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                      <span style={{ fontSize: 14, color: '#0d0d0d', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{answers[current.id].name}</span>
                      <button onClick={() => setAnswers(p => ({ ...p, [current.id]: undefined }))} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444' }}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                      </button>
                    </div>
                  ) : (
                    <label className="ff-drop" style={{ cursor: uploadingFile ? 'wait' : 'pointer' }}>
                      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                      <span style={{ fontSize: 14, fontWeight: 600 }}>{uploadingFile ? 'Uploading...' : 'Click to upload a file'}</span>
                      <input ref={fileInputRef} type="file" accept={current.fileAccept !== 'any' ? current.fileAccept : undefined} className="hidden" disabled={uploadingFile}
                        onChange={e => { const f = e.target.files?.[0]; if (f) handleFileUpload(f, current.id) }} />
                    </label>
                  )}
                </div>
              )}
              {current.type === 'picture_choice' && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 12 }}>
                  {(current.options || []).map((opt: string, oi: number) => {
                    const img = (current.optionImages || [])[oi]
                    const selected = answers[current.id] === opt
                    return (
                      <button key={oi} type="button" onClick={() => selectAndAdvance(current.id, opt)} aria-pressed={selected}
                        className={`ff-choice${selected ? ' on' : ''}${isFlash(current.id, opt) ? ' ff-blink' : ''}`}
                        style={{ flexDirection: 'column', alignItems: 'stretch', gap: 8, padding: 8 }}>
                        {img
                          ? <img src={img} alt="" style={{ width: '100%', aspectRatio: '4/3', objectFit: 'cover', borderRadius: 4, display: 'block' }} />
                          : <div style={{ width: '100%', aspectRatio: '4/3', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#fff', borderRadius: 4, color: '#c0c4cc' }}>
                              <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
                            </div>}
                        <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span className="ff-key">{String.fromCharCode(65 + oi)}</span>
                          <span className="ff-label" style={{ fontSize: 15 }}>{opt}</span>
                          <svg className="ff-tick" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                        </span>
                      </button>
                    )
                  })}
                </div>
              )}
              {current.type === 'ranking' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {rankOrder(current).map((opt: string, oi: number) => (
                    <div key={opt} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', borderRadius: 12, border: '2px solid #e5e5e5', background: '#fff' }}>
                      <span style={{ width: 24, height: 24, borderRadius: 7, background: themeColor, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 800, flexShrink: 0 }}>{oi + 1}</span>
                      <span style={{ flex: 1, fontSize: 16, color: '#0d0d0d' }}>{opt}</span>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                        <button onClick={() => rankMove(current, oi, -1)} disabled={oi === 0} aria-label="Move up"
                          style={{ background: 'none', border: 'none', cursor: oi === 0 ? 'default' : 'pointer', opacity: oi === 0 ? 0.25 : 0.7, padding: 0 }}>
                          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><polyline points="18 15 12 9 6 15"/></svg>
                        </button>
                        <button onClick={() => rankMove(current, oi, 1)} disabled={oi === rankOrder(current).length - 1} aria-label="Move down"
                          style={{ background: 'none', border: 'none', cursor: oi === rankOrder(current).length - 1 ? 'default' : 'pointer', opacity: oi === rankOrder(current).length - 1 ? 0.25 : 0.7, padding: 0 }}>
                          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
                        </button>
                      </div>
                    </div>
                  ))}
                  <p style={{ fontSize: 12, color: '#9ca3af', marginTop: 2 }}>Order them from most to least important, then press OK.</p>
                </div>
              )}
              {current.type === 'matrix' && (
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
                    <thead>
                      <tr>
                        <th />
                        {(current.matrixCols || []).map((col: string) => (
                          <th key={col} style={{ padding: '6px 8px', fontSize: 12.5, fontWeight: 700, color: '#6b6b70', textAlign: 'center' }}>{col}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {(current.matrixRows || []).map((row: string) => (
                        <tr key={row} style={{ borderTop: '1px solid #eee' }}>
                          <td style={{ padding: '10px 8px', fontWeight: 600, color: '#0d0d0d' }}>{row}</td>
                          {(current.matrixCols || []).map((col: string) => {
                            const val = (answers[current.id] || {})[row]
                            return (
                              <td key={col} style={{ textAlign: 'center', padding: '10px 8px' }}>
                                <button onClick={() => setAnswers(p => ({ ...p, [current.id]: { ...(p[current.id] || {}), [row]: col } }))}
                                  aria-label={`${row}: ${col}`}
                                  style={{ width: 22, height: 22, borderRadius: '50%', border: `2px solid ${val === col ? themeColor : '#d1d5db'}`, background: val === col ? themeColor : '#fff', cursor: 'pointer', padding: 0 }} />
                              </td>
                            )
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {current.type === 'signature' && (
                <div>
                  <canvas ref={sigRef} width={600} height={200}
                    onPointerDown={sigStart} onPointerMove={sigMove} onPointerUp={() => sigEnd(current.id)} onPointerLeave={() => sigEnd(current.id)}
                    style={{ width: '100%', height: 200, borderRadius: 12, border: '2px solid #e5e5e5', background: '#fff', touchAction: 'none', cursor: 'crosshair' }} />
                  <button onClick={() => sigClear(current.id)} type="button"
                    style={{ marginTop: 8, background: 'none', border: 'none', color: '#9ca3af', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Clear</button>
                </div>
              )}
              {current.type === 'video_audio' && (
                <div>
                  {answers[current.id]?.url ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', borderRadius: 12, border: `2px solid ${themeColor}`, background: `${themeColor}10` }}>
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={themeColor} strokeWidth="2"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2"/></svg>
                      <span style={{ fontSize: 14, color: '#0d0d0d', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{answers[current.id].name}</span>
                      <button onClick={() => setAnswers(p => ({ ...p, [current.id]: undefined }))} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444' }}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                      </button>
                    </div>
                  ) : (
                    <label className="ff-drop" style={{ cursor: uploadingFile ? 'wait' : 'pointer' }}>
                      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2"/></svg>
                      <span style={{ fontSize: 14, fontWeight: 600 }}>{uploadingFile ? 'Uploading...' : 'Upload a video or audio file'}</span>
                      <input type="file" accept="video/*,audio/*" className="hidden" disabled={uploadingFile}
                        onChange={e => { const f = e.target.files?.[0]; if (f) handleFileUpload(f, current.id) }} />
                    </label>
                  )}
                </div>
              )}
              {current.type === 'payment' && (
                <div>
                  {answers[current.id]?.status === 'paid' ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 16px', borderRadius: 12, border: `2px solid ${themeColor}`, background: `${themeColor}10` }}>
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={themeColor} strokeWidth="2.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>
                      <span style={{ fontSize: 15, fontWeight: 700, color: '#0d0d0d' }}>
                        Payment received{answers[current.id].amount_cents ? ` — ${fmtMoney(answers[current.id].amount_cents, answers[current.id].currency)}` : ''}
                      </span>
                    </div>
                  ) : (
                    <>
                      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 16 }}>
                        <span style={{ fontSize: 34, fontWeight: 800, color: '#0d0d0d' }}>{Number(current.amountCents) > 0 ? fmtMoney(current.amountCents, current.currency) : '—'}</span>
                        <span style={{ fontSize: 13, color: '#9ca3af', textTransform: 'uppercase' }}>{(current.currency || 'aud')}</span>
                      </div>
                      <button onClick={() => startPayment(current)} disabled={paying || !(Number(current.amountCents) > 0)}
                        style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '13px 26px', borderRadius: 12, background: themeColor, color: '#fff', fontWeight: 700, fontSize: 15, border: 'none', cursor: paying ? 'wait' : 'pointer', opacity: paying ? 0.7 : 1 }}>
                        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="1" y="4" width="22" height="16" rx="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg>
                        {paying ? 'Please wait…' : `Pay securely`}
                      </button>
                      <p style={{ fontSize: 12, color: '#9ca3af', marginTop: 10 }}>You'll be taken to a secure Stripe checkout, then back here.</p>
                    </>
                  )}
                  {payMsg && <p style={{ fontSize: 13, color: payMsg.includes('received') ? '#047857' : '#b45309', marginTop: 10, fontWeight: 600 }}>{payMsg}</p>}
                </div>
              )}
              {current.type === 'scheduler' && (
                <div>
                  {answers[current.id]?.starts_at && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', borderRadius: 12, border: `2px solid ${themeColor}`, background: `${themeColor}10`, marginBottom: 16 }}>
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={themeColor} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                      <span style={{ fontSize: 14, fontWeight: 700, color: '#0d0d0d' }}>{new Date(answers[current.id].starts_at).toLocaleString([], { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}</span>
                    </div>
                  )}
                  {/* Date chips */}
                  <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 6, marginBottom: 14 }}>
                    {schedDates(current).map(d => {
                      const ds = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
                      const on = schedDate === ds
                      return (
                        <button key={ds} onClick={() => loadSchedBooked(current, ds)}
                          style={{ flexShrink: 0, minWidth: 62, padding: '8px 10px', borderRadius: 12, border: `2px solid ${on ? themeColor : '#e5e5e5'}`, background: on ? `${themeColor}10` : '#fff', cursor: 'pointer', textAlign: 'center' }}>
                          <div style={{ fontSize: 11, color: '#9ca3af', fontWeight: 700 }}>{d.toLocaleDateString([], { weekday: 'short' })}</div>
                          <div style={{ fontSize: 17, fontWeight: 800, color: on ? themeColor : '#0d0d0d' }}>{d.getDate()}</div>
                          <div style={{ fontSize: 10.5, color: '#9ca3af' }}>{d.toLocaleDateString([], { month: 'short' })}</div>
                        </button>
                      )
                    })}
                  </div>
                  {/* Time slots */}
                  {schedDate ? (
                    (() => {
                      const slots = schedSlots(current, schedDate)
                      if (slots.length === 0) return <p style={{ fontSize: 13, color: '#9ca3af' }}>No times available on this day.</p>
                      return (
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(88px, 1fr))', gap: 8 }}>
                          {slots.map(slot => {
                            const taken = slotTaken(current, slot)
                            const chosen = answers[current.id]?.starts_at === slot.toISOString()
                            return (
                              <button key={slot.toISOString()} disabled={taken || schedBusy} onClick={() => pickSlot(current, slot)}
                                style={{ padding: '10px 6px', borderRadius: 10, border: `2px solid ${chosen ? themeColor : '#e5e5e5'}`, background: chosen ? themeColor : taken ? '#f3f4f6' : '#fff', color: chosen ? '#fff' : taken ? '#c0c4cc' : '#0d0d0d', fontSize: 13.5, fontWeight: 600, cursor: taken ? 'not-allowed' : 'pointer', textDecoration: taken ? 'line-through' : 'none' }}>
                                {slot.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
                              </button>
                            )
                          })}
                        </div>
                      )
                    })()
                  ) : (
                    <p style={{ fontSize: 13, color: '#9ca3af' }}>Pick a day to see available times.</p>
                  )}
                  {schedMsg && <p style={{ fontSize: 13, color: '#b45309', marginTop: 10, fontWeight: 600 }}>{schedMsg}</p>}
                </div>
              )}
            </div>

            {err && (
              <div className="ff-indent" style={{ marginTop: -14, marginBottom: 18 }}>
                <div className="ff-err" role="alert">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                  {err}
                </div>
              </div>
            )}

            {(!AUTO_ADVANCE_TYPES.includes(current.type) || (current.type === 'multiple_choice' && (current as any).multiSelect)) && !(current.type === 'payment' && answers[current.id]?.status !== 'paid') && (
              <div className="ff-actions ff-indent">
                <button type="button" className="ff-ok" onClick={handleNext} disabled={submitting}>
                  {submitting ? 'Submitting…' : step === visibleQuestions.length - 1 ? 'Submit' : current.type === 'statement' ? 'Continue' : 'OK'}
                  {!submitting && step < visibleQuestions.length - 1 && current.type !== 'statement' && (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                  )}
                </button>
                {current.type === 'long_text'
                  ? <span className="ff-hint"><b>Shift ⇧ + Enter ↵</b> to make a line break</span>
                  : enterHint}
              </div>
            )}
          </div>
        ) : null}
      </div>
    </div>
  )
}
