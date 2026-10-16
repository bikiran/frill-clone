'use client'

import { Fragment, useState, useEffect, useRef, useMemo } from 'react'
import { useParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import {
  readFormLogic, computePath, pathAnswersBefore, getNextStep, getPrevStep, resolveCurrent, getProgress,
  estimateMinutes, pipeText, resolveWelcome, isListMode, isBlankAnswer, type Answers, type Vars,
} from '@/lib/form-logic'
import { OTHER_TEXT_KEY, otherChoiceLabel, otherTextOf, toggleMultiChoice } from '@/lib/form-choice-options'
import { scaleImageToJpeg } from '@/lib/scan-image'
import Confetti from '@/components/Confetti'
import { StatusMark } from '@/components/StatusMark'
import { notifyIntegrations } from '@/lib/integrations-notify'
import {
  abandonQuestionId, buildPublicSubmission, choiceList, hasOtherBox, listProgress, otherBoxOpen, problemFor,
  problemMessage, rankOrderFor, restoreProgress, tint, trackBody, validatePublic, type PublicProblem,
} from './form-runtime'
import { ChoiceRow, MediaBlock, OtherInput, Tick, WelcomeMeta } from './parts'

type TrackEvent = 'view' | 'start' | 'abandon'

// Question types where a single tap/click is an unambiguous answer — auto-advance
const AUTO_ADVANCE_TYPES = ['multiple_choice', 'dropdown', 'yes_no', 'rating', 'nps', 'opinion_scale', 'legal', 'picture_choice']

/** True the first time this key is seen in this tab. If storage is blocked, true (over-counting beats failing). */
function onceThisSession(key: string): boolean {
  try {
    if (sessionStorage.getItem(key)) return false
    sessionStorage.setItem(key, '1')
  } catch { /* blocked storage: count anyway */ }
  return true
}

export default function PublicForm() {
  const params = useParams()
  const formId = params.id as string

  const [form, setForm] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  // The question on screen (one-at-a-time). null = the welcome screen.
  const [currentId, setCurrentId] = useState<string | null>(null)
  const [answers, setAnswers] = useState<Answers>({})
  // Always the latest answers, including ones set in this same tick. Anything
  // that runs later (timeouts, async callbacks) reads this, never `answers`,
  // so an auto-advancing last answer can't be lost.
  const answersRef = useRef<Answers>(answers)
  answersRef.current = answers
  const commit = (next: Answers) => { answersRef.current = next; setAnswers(next) }
  const patchAnswers = (p: Answers) => commit({ ...answersRef.current, ...p })

  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const submittedRef = useRef(false)
  // What the thank-you message pipes from: the saved path answers and final variables.
  const [finalRun, setFinalRun] = useState<{ answers: Answers; variables: Vars } | null>(null)
  useEffect(() => { (window as any).__formStartTime = Date.now() }, [])
  const [formStatus, setFormStatus] = useState<'active' | 'coming-soon' | 'closed'>('active')
  const [showConfetti, setShowConfetti] = useState(false)
  const [uploadingFor, setUploadingFor] = useState<string | null>(null)
  // Scan a business card / photo on the welcome screen → pre-fill contact answers.
  const cardInputRef = useRef<HTMLInputElement>(null)
  const [scanning, setScanning] = useState(false)
  const [scanMsg, setScanMsg] = useState('')
  // List view: whether the person has pressed the welcome button, and per-question errors.
  const [listStarted, setListStarted] = useState(false)
  const [listErrs, setListErrs] = useState<Record<string, string>>({})
  const [responseCount, setResponseCount] = useState<number | null>(null)
  // Tracking: whether they started, and whether we're leaving for Stripe (not a drop-off).
  const startedRef = useRef(false)
  const leavingForPayment = useRef(false)
  const abandonSent = useRef(false)
  // The "Other" box to focus once it appears (set when Other is picked).
  const focusOther = useRef<string | null>(null)

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

  // ── Logic (lib/form-logic) ──────────────────────────────────────────────────
  // The path is a pure function of the answers: display rules, hidden choices,
  // branching and calculations are re-projected on every change, so Back
  // follows the route actually taken and nothing double-counts.
  const logic = useMemo(() => readFormLogic(form), [form])
  const run = useMemo(() => computePath(logic, answers), [logic, answers])
  const listMode = isListMode(form)
  const welcome = useMemo(() => resolveWelcome(form?.theme), [form])
  const piping = form?.enable_piping !== false
  const themeColor = form?.theme?.color || '#ff7a6b'
  const known = (id: string | null): id is string => id !== null && Object.prototype.hasOwnProperty.call(logic.indexOf, id)
  const questionAt = (id: string | null): any => (known(id) ? logic.questions[logic.indexOf[id]] : undefined)
  const current: any = questionAt(currentId)
  const runRef = useRef(run); runRef.current = run
  const currentIdRef = useRef(currentId); currentIdRef.current = currentId
  const listModeRef = useRef(listMode); listModeRef.current = listMode

  // ── View / start / drop-off tracking (/api/forms/track, migration V376) ─────
  // Only the form id, the event and (for a drop-off) a question id are sent.
  const track = (event: TrackEvent, questionId?: string | null) => {
    try {
      const body = trackBody(formId, event, questionId)
      if (event === 'abandon' && typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function') {
        navigator.sendBeacon('/api/forms/track', new Blob([body], { type: 'application/json' }))
        return
      }
      fetch('/api/forms/track', { method: 'POST', keepalive: true, headers: { 'Content-Type': 'application/json' }, body }).catch(() => {})
    } catch { /* tracking never breaks the form */ }
  }

  // One view per tab session, for a live published form only.
  useEffect(() => {
    if (!form || formStatus !== 'active') return
    if (onceThisSession(`colvy_form_viewed_${formId}`)) track('view')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form, formStatus, formId])

  // A drop-off: the page goes away after they started, without submitting, and
  // not because they're off to Stripe. At most once per page load.
  useEffect(() => {
    const onHide = () => {
      if (!startedRef.current || submittedRef.current || leavingForPayment.current || abandonSent.current) return
      const qid = abandonQuestionId(listModeRef.current, runRef.current, currentIdRef.current)
      if (!qid) return
      abandonSent.current = true
      track('abandon', qid)
    }
    // Back from Stripe via the browser's back button (page restored from cache): they're here again.
    const onShow = (e: PageTransitionEvent) => { if (e.persisted) leavingForPayment.current = false }
    window.addEventListener('pagehide', onHide)
    window.addEventListener('pageshow', onShow)
    return () => { window.removeEventListener('pagehide', onHide); window.removeEventListener('pageshow', onShow) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formId])

  // "N people have filled this out": fetched once, only when the owner turned it on.
  useEffect(() => {
    if (!form || formStatus !== 'active' || !welcome.showResponseCount) return
    let alive = true
    fetch(`/api/forms/count/${encodeURIComponent(formId)}`)
      .then(r => (r.ok ? r.json() : null))
      .then(d => { if (alive && d && typeof d.count === 'number') setResponseCount(d.count) })
      .catch(() => {})
    return () => { alive = false }
  }, [form, formStatus, formId, welcome.showResponseCount])

  // ── Moving between questions ────────────────────────────────────────────────
  // Like Typeform: the current question slides up and out, the next one rises in
  // from below (and the other way round going back). `leaving` plays the exit
  // for a beat before the question actually changes.
  const [dir, setDir] = useState<'fwd' | 'back'>('fwd')
  const [leaving, setLeaving] = useState(false)
  const [err, setErr] = useState('')          // inline "please fill this in" note
  const [flash, setFlash] = useState('')      // the choice blinking before auto-advance
  const [hoverStar, setHoverStar] = useState<{ qid: string; n: number } | null>(null)
  const answerRef = useRef<HTMLDivElement>(null)
  const moving = useRef(false)
  const advancing = useRef(false)             // a picked choice is blinking before it moves on
  const reduceMotion = typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

  const shake = () => {
    if (!reduceMotion) answerRef.current?.animate?.(
      [0, -8, 7, -5, 3, 0].map(x => ({ transform: `translateX(${x}px)` })),
      { duration: 380, easing: 'cubic-bezier(.36,.07,.19,.97)' },
    )
  }

  // Go to a question. `errMsg` is shown (and shaken) on the NEW question, after it lands.
  const go = (toId: string, errMsg?: string) => {
    if (moving.current) return
    setErr('')
    const fromId = currentIdRef.current
    const from = known(fromId) ? logic.indexOf[fromId] : -1
    setDir(known(toId) && logic.indexOf[toId] < from ? 'back' : 'fwd')
    const land = () => {
      setCurrentId(toId); setLeaving(false); setFlash('')
      if (errMsg) { setErr(errMsg); setTimeout(shake, 40) }
    }
    if (reduceMotion) { land(); return }
    moving.current = true
    setLeaving(true)
    setTimeout(() => { land(); moving.current = false }, 170)
  }

  // Any change to an answer clears the "please fill this in" note.
  useEffect(() => { setErr('') }, [answers])

  const complain = (msg: string) => { setErr(msg); shake() }

  const scrollToQuestion = (qid: string | null | undefined, block: ScrollLogicalPosition = 'center') => {
    if (!qid) return
    setTimeout(() => {
      document.getElementById(`ff-q-${qid}`)?.scrollIntoView({ block, behavior: reduceMotion ? 'auto' : 'smooth' })
    }, 60)
  }

  const showListProblems = (problems: PublicProblem[]) => {
    const errs: Record<string, string> = {}
    for (const p of problems) errs[p.questionId] = problemMessage(questionAt(p.questionId), p.reason)
    setListErrs(errs)
    scrollToQuestion(problems[0]?.questionId)
  }

  // Validate the whole path, then submit. Takes the answers explicitly so a
  // value set a moment ago (an auto-advancing last answer) is included.
  const finish = (ans: Answers = answersRef.current) => {
    if (submittedRef.current) return
    const problems = validatePublic(logic, ans)
    if (!problems.length) { handleSubmit(ans); return }
    if (listModeRef.current) { showListProblems(problems); return }
    const p = problems[0]
    const msg = problemMessage(questionAt(p.questionId), p.reason)
    if (p.questionId === currentIdRef.current) complain(msg)
    else go(p.questionId, msg)
  }

  // Leaving the welcome screen (button or Enter), in both layouts.
  const startForm = () => {
    if (moving.current || advancing.current || submittedRef.current) return
    startedRef.current = true
    if (onceThisSession(`colvy_form_started_${formId}`)) track('start')
    const ans = answersRef.current
    if (listModeRef.current) {
      const first = computePath(logic, ans).path[0]
      if (!first) { finish(ans); return }
      setListStarted(true)
      scrollToQuestion(first, 'start')
      return
    }
    const s = getNextStep(logic, ans, null)
    if (s.kind === 'end') finish(ans)
    else go(s.id)
  }

  const handleNext = () => {
    if (moving.current || advancing.current || submittedRef.current) return
    if (currentId === null) { startForm(); return }
    if (!current) return
    const ans = answersRef.current
    // Payment, required, email and "Other" checks on this question (effective answer).
    const p = problemFor(logic, ans, current.id)
    if (p) { complain(problemMessage(current, p.reason)); return }
    const nx = getNextStep(logic, ans, current.id)
    if (nx.kind === 'end') finish(ans)
    else go(nx.id)
  }

  const goBack = () => {
    const at = currentIdRef.current
    const p = at !== null ? getPrevStep(logic, answersRef.current, at) : null
    if (p) go(p)
  }

  const clearListErr = (qid: string) => setListErrs(e => {
    if (!e[qid]) return e
    const next = { ...e }; delete next[qid]; return next
  })
  const setAnswer = (qid: string, value: unknown) => { patchAnswers({ [qid]: value }); clearListErr(qid) }
  const setOtherText = (qid: string, text: string) => {
    const box = answersRef.current[OTHER_TEXT_KEY]
    patchAnswers({ [OTHER_TEXT_KEY]: { ...(box && typeof box === 'object' && !Array.isArray(box) ? box : {}), [qid]: text } })
    clearListErr(qid)
  }
  const otherRef = (qid: string) => (el: HTMLInputElement | null) => {
    if (el && focusOther.current === qid) { focusOther.current = null; el.focus({ preventScroll: listModeRef.current }) }
  }

  const selectAndAdvance = (q: any, value: unknown) => {
    if (moving.current || advancing.current || submittedRef.current) return
    const next = { ...answersRef.current, [q.id]: value }
    commit(next)
    setErr('')
    if (isBlankAnswer(value)) return                                  // the dropdown's "Select an option..."
    if (otherBoxOpen(q, value)) { focusOther.current = q.id; return }  // stay, so they can type into "Other"
    // Blink the picked choice, then move on along the path these answers
    // project (logic can show, hide or jump past later questions). The local
    // `next` is passed through: the state variable would still hold the
    // answers from before this pick when the timeout fires.
    setFlash(`${q.id}:${JSON.stringify(value)}`)
    advancing.current = true
    setTimeout(() => {
      advancing.current = false
      const nx = getNextStep(logic, next, q.id)
      if (nx.kind === 'end') { setFlash(''); finish(next) }
      else go(nx.id)
    }, reduceMotion ? 120 : 420)
  }

  // A single pick: auto-advances one at a time; in the list it only sets the answer.
  const pick = (q: any, value: unknown) => {
    if (!listModeRef.current) { selectAndAdvance(q, value); return }
    setAnswer(q.id, value)
    if (otherBoxOpen(q, value)) focusOther.current = q.id
  }

  // Multi-select toggle. Exclusive options ("None", "No"…) clear the rest, and
  // picking anything else clears them (lib/form-choice-options).
  const toggle = (q: any, label: string) => {
    const cur = answersRef.current[q.id]
    const next = toggleMultiChoice(q, Array.isArray(cur) ? cur : [], label)
    setAnswer(q.id, next)
    setErr('')
    if (otherBoxOpen(q, next) && !otherBoxOpen(q, cur)) focusOther.current = q.id
  }

  const handleSubmit = async (ans: Answers) => {
    if (submittedRef.current) return
    submittedRef.current = true
    setSubmitting(true)
    // Only answers on the path taken (plus paid/booked side effects), the
    // "Other" texts, and __logic (path, variables, branches). See form-runtime.
    const sub = buildPublicSubmission(logic, ans)
    setFinalRun({ answers: sub.pipeAnswers, variables: sub.variables })
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
      const { error } = await (supabase as any).from('form_responses').insert({
        form_id: formId,
        answers: sub.answers,
        user_agent: navigator.userAgent,
        language: navigator.language,
        screen_width: window.screen?.width,
        screen_height: window.screen?.height,
        response_time_seconds: responseTimeSec,
        referrer: document.referrer || null,
      })
      if (error) console.error('Failed to save form response:', error)
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
    setUploadingFor(questionId)
    try {
      const ext = file.name.split('.').pop()
      const fileName = `form-uploads/${formId}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`
      const { data, error } = await supabase.storage.from('idea-images').upload(fileName, file, { upsert: true })
      if (error) throw error
      const { data: { publicUrl } } = supabase.storage.from('idea-images').getPublicUrl(data.path)
      setAnswer(questionId, { name: file.name, url: publicUrl })
    } catch (e: any) {
      const msg = 'That upload didn’t work — ' + (e?.message || 'please try again')
      if (listModeRef.current) setListErrs(p => ({ ...p, [questionId]: msg }))
      else complain(msg)
    }
    setUploadingFor(null)
  }

  // ── Payment (Stripe hosted checkout, then back to the form) ──────────────────
  const [paying, setPaying] = useState(false)
  const [payMsg, setPayMsg] = useState<Record<string, string>>({})
  const setPayMsgFor = (qid: string, msg: string) => setPayMsg(m => ({ ...m, [qid]: msg }))
  const startPayment = async (q: any) => {
    setPaying(true); setPayMsgFor(q.id, '')
    try {
      const r = await fetch('/api/forms/payment', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'create', formId, questionId: q.id, origin: window.location.origin }),
      })
      const d = await r.json()
      if (!r.ok || !d.checkoutUrl) { setPayMsgFor(q.id, d.error || 'Could not start the payment.'); setPaying(false); return }
      // Persist answers + place so returning from Stripe restores the form.
      try {
        localStorage.setItem(`colvy_form_progress_${formId}`, JSON.stringify({
          answers: answersRef.current, currentId: currentIdRef.current, payQuestionId: q.id, listStarted,
        }))
      } catch {}
      leavingForPayment.current = true
      window.location.href = d.checkoutUrl
    } catch { setPayMsgFor(q.id, 'Could not start the payment.'); setPaying(false) }
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
    const restored = restoreProgress(logic, saved)
    const payQ = restored?.payQuestionId || ''
    if (restored) {
      commit(restored.answers)
      startedRef.current = true
      if (isListMode(form)) { setListStarted(true); scrollToQuestion(payQ) }
      else if (restored.currentId) setCurrentId(restored.currentId)   // the safety net below fixes one that's off the path
    }
    const clean = () => { url.searchParams.delete('form_paid'); url.searchParams.delete('form_pay_cancelled'); url.searchParams.delete('session_id'); window.history.replaceState({}, '', url.toString()) }
    if (cancelled) { setPayMsgFor(payQ, 'Payment was cancelled — you can try again.'); clean(); return }
    ;(async () => {
      setPaying(true); setPayMsgFor(payQ, 'Confirming your payment…')
      try {
        const r = await fetch('/api/forms/payment', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'verify', paymentId: paidId }) })
        const d = await r.json()
        if (d.status === 'paid') {
          if (payQ) patchAnswers({ [payQ]: { status: 'paid', amount_cents: d.amountCents, currency: d.currency, payment_id: paidId } })
          setPayMsgFor(payQ, '')
          try { localStorage.removeItem(`colvy_form_progress_${formId}`) } catch {}
        } else {
          setPayMsgFor(payQ, 'We couldn’t confirm the payment yet. If you completed it, wait a moment and press OK.')
        }
      } catch { setPayMsgFor(payQ, 'We couldn’t confirm the payment. Please try again.') }
      setPaying(false)
      clean()
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form])

  // ── Signature pad ───────────────────────────────────────────────────────────
  // One canvas per signature question (the list view can show several).
  const sigRefs = useRef<Record<string, HTMLCanvasElement | null>>({})
  const sigDrawing = useRef(false)
  const sigLast = useRef<{ x: number; y: number } | null>(null)
  const sigPos = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const c = e.currentTarget; const r = c.getBoundingClientRect()
    return { x: (e.clientX - r.left) * (c.width / r.width), y: (e.clientY - r.top) * (c.height / r.height) }
  }
  const sigStart = (e: React.PointerEvent<HTMLCanvasElement>) => {
    sigDrawing.current = true; sigLast.current = sigPos(e)
    try { (e.target as Element).setPointerCapture?.(e.pointerId) } catch {}
  }
  const sigMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!sigDrawing.current || !sigLast.current) return
    const ctx = e.currentTarget.getContext('2d'); if (!ctx) return
    const p = sigPos(e)
    ctx.strokeStyle = '#0d0d0d'; ctx.lineWidth = 2.5; ctx.lineCap = 'round'; ctx.lineJoin = 'round'
    ctx.beginPath(); ctx.moveTo(sigLast.current.x, sigLast.current.y); ctx.lineTo(p.x, p.y); ctx.stroke()
    sigLast.current = p
  }
  const sigEnd = (qid: string) => {
    if (!sigDrawing.current) return
    sigDrawing.current = false
    const c = sigRefs.current[qid]
    if (c) setAnswer(qid, c.toDataURL('image/png'))
  }
  const sigClear = (qid: string) => {
    const c = sigRefs.current[qid]
    if (c) { const ctx = c.getContext('2d'); ctx?.clearRect(0, 0, c.width, c.height) }
    setAnswer(qid, undefined)
  }

  // ── Ranking helpers ──────────────────────────────────────────────────────────
  // Ranking works on an ordered copy of the visible options; the order is stored
  // once the person moves something.
  const visibleLabels = (q: any) => choiceList(run, q).map(c => c.label)
  const rankOrder = (q: any): string[] => rankOrderFor(answers[q.id], visibleLabels(q))
  const rankMove = (q: any, from: number, d: -1 | 1) => {
    const arr = [...rankOrderFor(answersRef.current[q.id], visibleLabels(q))]
    const to = from + d
    if (to < 0 || to >= arr.length) return
    ;[arr[from], arr[to]] = [arr[to], arr[from]]
    setAnswer(q.id, arr)
  }

  // ── Scheduler ────────────────────────────────────────────────────────────────
  // Picked day, booked slots and messages are per question (the list view can show several).
  const [schedDate, setSchedDate] = useState<Record<string, string>>({})          // qid → 'YYYY-MM-DD'
  const [schedBooked, setSchedBooked] = useState<Record<string, { starts_at: string; ends_at: string }[]>>({})
  const [schedBusy, setSchedBusy] = useState(false)
  const [schedMsg, setSchedMsg] = useState<Record<string, string>>({})
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
    return (schedBooked[q.id] || []).some(b => {
      const bs = new Date(b.starts_at).getTime(), be = new Date(b.ends_at).getTime()
      return bs < e && be > s
    })
  }
  const loadSchedBooked = async (q: any, dateStr: string) => {
    setSchedDate(m => ({ ...m, [q.id]: dateStr })); setSchedMsg(m => ({ ...m, [q.id]: '' }))
    try {
      const from = new Date(dateStr + 'T00:00:00').toISOString()
      const to = new Date(dateStr + 'T23:59:59').toISOString()
      const r = await fetch('/api/forms/schedule', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'slots', formId, questionId: q.id, from, to }) })
      const d = await r.json()
      setSchedBooked(m => ({ ...m, [q.id]: Array.isArray(d.booked) ? d.booked : [] }))
    } catch { setSchedBooked(m => ({ ...m, [q.id]: [] })) }
  }
  const pickSlot = async (q: any, slot: Date) => {
    setSchedBusy(true); setSchedMsg(m => ({ ...m, [q.id]: '' }))
    try {
      const r = await fetch('/api/forms/schedule', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'book', formId, questionId: q.id, startsAt: slot.toISOString(), releaseEventId: (answersRef.current[q.id] as any)?.calendar_event_id }),
      })
      const d = await r.json()
      if (!r.ok) {
        setSchedMsg(m => ({ ...m, [q.id]: d.error || 'Could not book that time.' }))
        if (r.status === 409 && schedDate[q.id]) loadSchedBooked(q, schedDate[q.id])   // refresh availability
        setSchedBusy(false); return
      }
      setAnswer(q.id, { starts_at: d.startsAt, ends_at: d.endsAt, calendar_event_id: d.eventId })
    } catch { setSchedMsg(m => ({ ...m, [q.id]: 'Could not book that time.' })) }
    setSchedBusy(false)
  }

  // Keyboard, Typeform style: Enter = OK, letters pick choices (A, B, C…),
  // Y / N answer yes-no, digits pick a rating or scale. Letters and digits are
  // ignored while typing in a field. Kept in a ref so the listener always sees
  // the latest answers without re-binding on every keystroke. In the list view
  // only Enter on the welcome screen does anything.
  const onKey = useRef<(e: KeyboardEvent) => void>(() => {})
  onKey.current = (e: KeyboardEvent) => {
    if (submittedRef.current || e.metaKey || e.ctrlKey || e.altKey) return
    const t = e.target as HTMLElement | null
    const tag = t?.tagName
    const typing = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || !!t?.isContentEditable
    if (e.key === 'Enter') {
      // Enter on a focused choice means OK (as on Typeform), not "pick it again".
      if (e.shiftKey || tag === 'A' || (tag === 'BUTTON' && !t?.classList.contains('ff-choice'))) return
      if (listMode) {
        if (listStarted) return   // newlines in a textarea still work
        e.preventDefault()
        startForm()
        return
      }
      e.preventDefault()
      handleNext()
      return
    }
    if (listMode || typing || !current || e.repeat) return
    const k = e.key.toLowerCase()
    const opts = choiceList(run, current)   // letters map to the choices on screen
    const letter = /^[a-z]$/.test(k) ? k.charCodeAt(0) - 97 : -1
    const digit = /^[0-9]$/.test(k) ? Number(k) : -1
    switch (current.type) {
      case 'multiple_choice':
      case 'picture_choice':
        if (letter < 0 || letter >= opts.length) return
        if (current.type === 'multiple_choice' && current.multiSelect) toggle(current, opts[letter].label)
        else selectAndAdvance(current, opts[letter].label)
        break
      case 'checkbox':
        if (letter < 0 || letter >= opts.length) return
        toggle(current, opts[letter].label)
        break
      case 'yes_no':
        if (k === 'y') selectAndAdvance(current, 'Yes')
        else if (k === 'n') selectAndAdvance(current, 'No')
        else return
        break
      case 'legal':
        if (k !== 'y') return
        selectAndAdvance(current, true)
        break
      case 'rating':
        if (digit < 1 || digit > 5) return
        selectAndAdvance(current, digit)
        break
      case 'opinion_scale':
        if (digit < 1 || digit > 7) return
        selectAndAdvance(current, digit)
        break
      case 'nps':
        if (digit < 0) return
        selectAndAdvance(current, digit)
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

  // Safety net: if the question on screen is no longer on the path (answers
  // restored after a payment, a card scan…), move to the next question on the
  // path after it, or finish rather than render a dead end.
  useEffect(() => {
    if (loading || listMode || currentId === null || submittedRef.current || moving.current) return
    if (run.path.includes(currentId)) return
    const r = resolveCurrent(logic, answersRef.current, currentId)
    if (r.kind === 'question') setCurrentId(r.id)
    else finish(answersRef.current)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [run, currentId, loading, listMode])

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
  const formIsScannable = logic.questions.some(q => !!scannedValueFor(q, SCAN_PROBE))

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
      for (const q of logic.questions) {
        const v = scannedValueFor(q, c)
        const prev = answersRef.current[q.id]
        if (v && (prev === undefined || prev === '')) patch[q.id] = v
      }
      const n = Object.keys(patch).length
      if (n) patchAnswers(patch)
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

  const isFlash = (qid: string, v: any) => flash === `${qid}:${JSON.stringify(v)}`
  const ARROW = <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
  const enterHint = <span className="ff-hint">press <b>Enter ↵</b></span>
  const stage = leaving ? `ff-out-${dir}` : `ff-in-${dir}`
  const auto = !listMode   // no autoFocus in the list view (focus would jump to the last input)
  const keyFor = (pos: number) => String.fromCharCode(65 + pos)

  // A question's own text pipes answers and variables from BEFORE it on the path.
  const pipe = (q: any, text: string): string => (!piping || !text)
    ? text
    : pipeText(text, { form: logic, answers: pathAnswersBefore(run, q.id), variables: run.variablesBefore[q.id] ?? run.variables })

  const errorNote = (msg: string, style?: React.CSSProperties) => (
    <div className="ff-indent" style={style}>
      <div className="ff-err" role="alert">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
        {msg}
      </div>
    </div>
  )

  const renderHead = (q: any, num: number) => {
    const title = pipe(q, q.title || '')
    const description = pipe(q, q.description || '')
    return (
      <div className="ff-qhead">
        <span className="ff-num">{num}{ARROW}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          {title && (
            <h2 className="ff-title">
              {title}{q.type !== 'statement' && q.required && <span style={{ color: themeColor }}> *</span>}
            </h2>
          )}
          {/* Statement body is the main content — render it large. Other types
              show the description as a subtitle. */}
          {q.type === 'statement'
            ? (description && <p style={{ fontSize: 18, color: '#374151', lineHeight: 1.7, whiteSpace: 'pre-wrap', margin: title ? '8px 0 0' : 0 }}>{description}</p>)
            : (description && <p className="ff-desc" style={{ marginTop: title ? 6 : 0 }}>{description}</p>)}
        </div>
      </div>
    )
  }

  const questionMedia = (q: any) => q.mediaUrl ? <MediaBlock url={q.mediaUrl} type={q.mediaType} /> : null

  // The "Type your answer" box under a picked "Other" option.
  const otherBox = (q: any) => (
    <OtherInput value={otherTextOf(answers, q.id)} onChange={t => setOtherText(q.id, t)} inputRef={otherRef(q.id)}
      invalid={(listMode ? listErrs[q.id] : err) === problemMessage(q, 'other')} />
  )

  // Per-type answer input, shared by both layouts. Choice types show exactly the
  // choices the logic walk evaluated (hidden choices removed).
  const renderInput = (q: any) => {
    const a: any = answers[q.id]
    const text = typeof a === 'string' || typeof a === 'number' ? a : ''
    const onText = (v: string) => setAnswer(q.id, v)
    const vis = choiceList(run, q)
    const otherLabel = hasOtherBox(q) ? otherChoiceLabel(q) : null
    const uploading = uploadingFor === q.id
    const multi = (q.type === 'multiple_choice' && q.multiSelect) || q.type === 'checkbox'
    return (
      <>
        {q.type === 'short_text' && (
          <input autoFocus={auto} value={text} onChange={e => onText(e.target.value)}
            className="ff-input"
            placeholder="Type your answer here..." />
        )}
        {q.type === 'long_text' && (
          <textarea autoFocus={auto} value={text} onChange={e => onText(e.target.value)}
            className="ff-input" rows={3} style={{ resize: 'none', fontSize: 'clamp(18px, 2.6vw, 24px)' }}
            placeholder="Type your answer here..." />
        )}
        {q.type === 'email' && (
          <input autoFocus={auto} type="email" value={text} onChange={e => onText(e.target.value)}
            className="ff-input"
            placeholder="name@example.com" />
        )}
        {q.type === 'number' && (
          <input autoFocus={auto} type="number" value={text} onChange={e => onText(e.target.value)}
            className="ff-input"
            placeholder="0" />
        )}
        {q.type === 'date' && (
          <input autoFocus={auto} type="date" value={text} onChange={e => onText(e.target.value)}
            className="ff-input" />
        )}
        {q.type === 'yes_no' && (
          <div className="ff-row">
            {['Yes', 'No'].map(o => <ChoiceRow key={o}
              k={o[0]} label={o} on={a === o} blink={isFlash(q.id, o)}
              onClick={() => pick(q, o)} />)}
          </div>
        )}
        {q.type === 'rating' && (
          <div style={{ display: 'flex', gap: 6 }} onMouseLeave={() => setHoverStar(null)}>
            {[1, 2, 3, 4, 5].map(n => {
              const hovered = hoverStar?.qid === q.id ? hoverStar.n : 0
              const lit = (hovered || (typeof a === 'number' ? a : 0)) >= n
              return (
                <button key={n} type="button" className={`ff-star${isFlash(q.id, n) ? ' ff-blink' : ''}`} aria-label={`${n} star${n > 1 ? 's' : ''}`} aria-pressed={a === n}
                  onMouseEnter={() => setHoverStar({ qid: q.id, n })} onClick={() => pick(q, n)}>
                  <svg width="44" height="44" viewBox="0 0 24 24" fill={lit ? themeColor : `${themeColor}14`} stroke={themeColor} strokeWidth="1.3" strokeLinejoin="round" style={{ transition: 'fill .15s', display: 'block' }}><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
                  <span style={{ display: 'block', fontSize: 12, color: '#9ca3af', marginTop: 2 }}>{n}</span>
                </button>
              )
            })}
          </div>
        )}
        {q.type === 'multiple_choice' && !q.multiSelect && (
          <div className="ff-choices">
            {vis.map((c, pos) => (
              <Fragment key={c.index}>
                <ChoiceRow k={keyFor(pos)} label={c.label} on={a === c.label} blink={isFlash(q.id, c.label)}
                  onClick={() => pick(q, c.label)} />
                {c.label === otherLabel && a === c.label && otherBox(q)}
              </Fragment>
            ))}
          </div>
        )}
        {/* Multiple Choice with "multiple selection" on, and Checkboxes, are a
            pick-several group: choose, then press OK (no auto-advance). */}
        {multi && (
          <div className="ff-choices">
            {vis.map((c, pos) => {
              const isChecked = Array.isArray(a) && a.includes(c.label)
              return (
                <Fragment key={c.index}>
                  <ChoiceRow k={keyFor(pos)} label={c.label} on={isChecked} onClick={() => toggle(q, c.label)} />
                  {c.label === otherLabel && isChecked && otherBox(q)}
                </Fragment>
              )
            })}
            <p style={{ fontSize: 13, color: '#6b6b70', margin: '4px 0 0' }}>Choose as many as you like</p>
          </div>
        )}
        {q.type === 'dropdown' && (
          <>
            <select value={typeof a === 'string' ? a : ''} onChange={e => pick(q, e.target.value)}
              className="ff-input">
              <option value="">Select an option...</option>
              {vis.map(c => <option key={c.index} value={c.label}>{c.label}</option>)}
            </select>
            {otherLabel && a === otherLabel && <div style={{ marginTop: 14 }}>{otherBox(q)}</div>}
          </>
        )}
        {q.type === 'nps' && (
          <div>
            <div className="ff-scale">
              {[...Array(11)].map((_, n) => (
                <button key={n} type="button" onClick={() => pick(q, n)} aria-pressed={a === n}
                  className={`ff-choice${a === n ? ' on' : ''}${isFlash(q.id, n) ? ' ff-blink' : ''}`}>
                  {n}
                </button>
              ))}
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: '#6b6b70', marginTop: 10 }}>
              <span>Not likely at all</span><span>Extremely likely</span>
            </div>
          </div>
        )}
        {q.type === 'opinion_scale' && (
          <div className="ff-scale" style={{ maxWidth: 520 }}>
            {[1, 2, 3, 4, 5, 6, 7].map(n => (
              <button key={n} type="button" onClick={() => pick(q, n)} aria-pressed={a === n}
                className={`ff-choice${a === n ? ' on' : ''}${isFlash(q.id, n) ? ' ff-blink' : ''}`}>
                {n}
              </button>
            ))}
          </div>
        )}
        {['contact_info', 'phone', 'address', 'website'].includes(q.type) && (
          <input autoFocus={auto} value={text} onChange={e => onText(e.target.value)}
            className="ff-input"
            placeholder={q.type === 'phone' ? '+61 4XX XXX XXX' : q.type === 'website' ? 'https://...' : q.type === 'address' ? 'Street, suburb, state, postcode' : 'Your name'} />
        )}
        {q.type === 'legal' && (
          <div className="ff-choices">
            <ChoiceRow k="Y" label="I accept" on={!!a} blink={isFlash(q.id, true)} onClick={() => pick(q, true)} />
          </div>
        )}
        {q.type === 'file_upload' && (
          <div>
            {a?.url ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', borderRadius: 12, border: `2px solid ${themeColor}`, background: `${themeColor}10` }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={themeColor} strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                <span style={{ fontSize: 14, color: '#0d0d0d', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.name}</span>
                <button type="button" aria-label="Remove file" onClick={() => setAnswer(q.id, undefined)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444' }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                </button>
              </div>
            ) : (
              <label className="ff-drop" style={{ cursor: uploading ? 'wait' : 'pointer' }}>
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                <span style={{ fontSize: 14, fontWeight: 600 }}>{uploading ? 'Uploading...' : 'Click to upload a file'}</span>
                <input type="file" accept={q.fileAccept !== 'any' ? q.fileAccept : undefined} className="hidden" disabled={uploading}
                  onChange={e => { const f = e.target.files?.[0]; if (f) handleFileUpload(f, q.id) }} />
              </label>
            )}
          </div>
        )}
        {q.type === 'picture_choice' && (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 12 }}>
              {vis.map((c, pos) => {
                const img = (q.optionImages || [])[c.index]
                const selected = a === c.label
                return (
                  <button key={c.index} type="button" onClick={() => pick(q, c.label)} aria-pressed={selected}
                    className={`ff-choice${selected ? ' on' : ''}${isFlash(q.id, c.label) ? ' ff-blink' : ''}`}
                    style={{ flexDirection: 'column', alignItems: 'stretch', gap: 8, padding: 8 }}>
                    {img
                      ? <img src={img} alt="" style={{ width: '100%', aspectRatio: '4/3', objectFit: 'cover', borderRadius: 4, display: 'block' }} />
                      : <div style={{ width: '100%', aspectRatio: '4/3', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#fff', borderRadius: 4, color: '#c0c4cc' }}>
                          <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
                        </div>}
                    <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span className="ff-key">{keyFor(pos)}</span>
                      <span className="ff-label" style={{ fontSize: 15 }}>{c.label}</span>
                      {selected && <Tick size={16} />}
                    </span>
                  </button>
                )
              })}
            </div>
            {otherLabel && a === otherLabel && <div style={{ marginTop: 14 }}>{otherBox(q)}</div>}
          </>
        )}
        {q.type === 'ranking' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {(() => {
              const order = rankOrder(q)
              return order.map((opt: string, oi: number) => (
                <div key={opt} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', borderRadius: 12, border: '2px solid #e5e5e5', background: '#fff' }}>
                  <span style={{ width: 24, height: 24, borderRadius: 7, background: themeColor, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 800, flexShrink: 0 }}>{oi + 1}</span>
                  <span style={{ flex: 1, fontSize: 16, color: '#0d0d0d' }}>{opt}</span>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <button type="button" onClick={() => rankMove(q, oi, -1)} disabled={oi === 0} aria-label="Move up"
                      style={{ background: 'none', border: 'none', cursor: oi === 0 ? 'default' : 'pointer', opacity: oi === 0 ? 0.25 : 0.7, padding: 0 }}>
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><polyline points="18 15 12 9 6 15"/></svg>
                    </button>
                    <button type="button" onClick={() => rankMove(q, oi, 1)} disabled={oi === order.length - 1} aria-label="Move down"
                      style={{ background: 'none', border: 'none', cursor: oi === order.length - 1 ? 'default' : 'pointer', opacity: oi === order.length - 1 ? 0.25 : 0.7, padding: 0 }}>
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
                    </button>
                  </div>
                </div>
              ))
            })()}
            <p style={{ fontSize: 12, color: '#9ca3af', marginTop: 2 }}>Order them from most to least important{listMode ? '.' : ', then press OK.'}</p>
          </div>
        )}
        {q.type === 'matrix' && (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
              <thead>
                <tr>
                  <th />
                  {(q.matrixCols || []).map((col: string) => (
                    <th key={col} style={{ padding: '6px 8px', fontSize: 12.5, fontWeight: 700, color: '#6b6b70', textAlign: 'center' }}>{col}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(q.matrixRows || []).map((row: string) => (
                  <tr key={row} style={{ borderTop: '1px solid #eee' }}>
                    <td style={{ padding: '10px 8px', fontWeight: 600, color: '#0d0d0d' }}>{row}</td>
                    {(q.matrixCols || []).map((col: string) => {
                      const val = (a && typeof a === 'object' ? a : {})[row]
                      return (
                        <td key={col} style={{ textAlign: 'center', padding: '10px 8px' }}>
                          <button type="button" onClick={() => {
                            const prev: any = answersRef.current[q.id]
                            setAnswer(q.id, { ...(prev && typeof prev === 'object' && !Array.isArray(prev) ? prev : {}), [row]: col })
                          }}
                            aria-label={`${row}: ${col}`} aria-pressed={val === col}
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
        {q.type === 'signature' && (
          <div>
            <canvas ref={el => { sigRefs.current[q.id] = el }} width={600} height={200}
              onPointerDown={sigStart} onPointerMove={sigMove} onPointerUp={() => sigEnd(q.id)} onPointerLeave={() => sigEnd(q.id)}
              style={{ width: '100%', height: 200, borderRadius: 12, border: '2px solid #e5e5e5', background: '#fff', touchAction: 'none', cursor: 'crosshair' }} />
            <button onClick={() => sigClear(q.id)} type="button"
              style={{ marginTop: 8, background: 'none', border: 'none', color: '#9ca3af', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Clear</button>
          </div>
        )}
        {q.type === 'video_audio' && (
          <div>
            {a?.url ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', borderRadius: 12, border: `2px solid ${themeColor}`, background: `${themeColor}10` }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={themeColor} strokeWidth="2"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2"/></svg>
                <span style={{ fontSize: 14, color: '#0d0d0d', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.name}</span>
                <button type="button" aria-label="Remove file" onClick={() => setAnswer(q.id, undefined)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444' }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                </button>
              </div>
            ) : (
              <label className="ff-drop" style={{ cursor: uploading ? 'wait' : 'pointer' }}>
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2"/></svg>
                <span style={{ fontSize: 14, fontWeight: 600 }}>{uploading ? 'Uploading...' : 'Upload a video or audio file'}</span>
                <input type="file" accept="video/*,audio/*" className="hidden" disabled={uploading}
                  onChange={e => { const f = e.target.files?.[0]; if (f) handleFileUpload(f, q.id) }} />
              </label>
            )}
          </div>
        )}
        {q.type === 'payment' && (
          <div>
            {a?.status === 'paid' ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 16px', borderRadius: 12, border: `2px solid ${themeColor}`, background: `${themeColor}10` }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={themeColor} strokeWidth="2.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>
                <span style={{ fontSize: 15, fontWeight: 700, color: '#0d0d0d' }}>
                  Payment received{a.amount_cents ? ` — ${fmtMoney(a.amount_cents, a.currency)}` : ''}
                </span>
              </div>
            ) : (
              <>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 16 }}>
                  <span style={{ fontSize: 34, fontWeight: 800, color: '#0d0d0d' }}>{Number(q.amountCents) > 0 ? fmtMoney(q.amountCents, q.currency) : '—'}</span>
                  <span style={{ fontSize: 13, color: '#9ca3af', textTransform: 'uppercase' }}>{(q.currency || 'aud')}</span>
                </div>
                <button type="button" onClick={() => startPayment(q)} disabled={paying || !(Number(q.amountCents) > 0)}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '13px 26px', borderRadius: 12, background: themeColor, color: '#fff', fontWeight: 700, fontSize: 15, border: 'none', cursor: paying ? 'wait' : 'pointer', opacity: paying ? 0.7 : 1 }}>
                  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="1" y="4" width="22" height="16" rx="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg>
                  {paying ? 'Please wait…' : `Pay securely`}
                </button>
                <p style={{ fontSize: 12, color: '#9ca3af', marginTop: 10 }}>You'll be taken to a secure Stripe checkout, then back here.</p>
              </>
            )}
            {(() => {
              const msg = payMsg[q.id] || payMsg['']
              return msg ? <p style={{ fontSize: 13, color: msg.includes('received') ? '#047857' : '#b45309', marginTop: 10, fontWeight: 600 }}>{msg}</p> : null
            })()}
          </div>
        )}
        {q.type === 'scheduler' && (
          <div>
            {a?.starts_at && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', borderRadius: 12, border: `2px solid ${themeColor}`, background: `${themeColor}10`, marginBottom: 16 }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={themeColor} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                <span style={{ fontSize: 14, fontWeight: 700, color: '#0d0d0d' }}>{new Date(a.starts_at).toLocaleString([], { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}</span>
              </div>
            )}
            {/* Date chips */}
            <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 6, marginBottom: 14 }}>
              {schedDates(q).map(d => {
                const ds = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
                const on = schedDate[q.id] === ds
                return (
                  <button type="button" key={ds} onClick={() => loadSchedBooked(q, ds)} aria-pressed={on}
                    style={{ flexShrink: 0, minWidth: 62, padding: '8px 10px', borderRadius: 12, border: `2px solid ${on ? themeColor : '#e5e5e5'}`, background: on ? `${themeColor}10` : '#fff', cursor: 'pointer', textAlign: 'center' }}>
                    <div style={{ fontSize: 11, color: '#9ca3af', fontWeight: 700 }}>{d.toLocaleDateString([], { weekday: 'short' })}</div>
                    <div style={{ fontSize: 17, fontWeight: 800, color: on ? themeColor : '#0d0d0d' }}>{d.getDate()}</div>
                    <div style={{ fontSize: 10.5, color: '#9ca3af' }}>{d.toLocaleDateString([], { month: 'short' })}</div>
                  </button>
                )
              })}
            </div>
            {/* Time slots */}
            {schedDate[q.id] ? (
              (() => {
                const slots = schedSlots(q, schedDate[q.id])
                if (slots.length === 0) return <p style={{ fontSize: 13, color: '#9ca3af' }}>No times available on this day.</p>
                return (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(88px, 1fr))', gap: 8 }}>
                    {slots.map(slot => {
                      const taken = slotTaken(q, slot)
                      const chosen = a?.starts_at === slot.toISOString()
                      return (
                        <button type="button" key={slot.toISOString()} disabled={taken || schedBusy} onClick={() => pickSlot(q, slot)} aria-pressed={chosen}
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
            {schedMsg[q.id] && <p style={{ fontSize: 13, color: '#b45309', marginTop: 10, fontWeight: 600 }}>{schedMsg[q.id]}</p>}
          </div>
        )}
      </>
    )
  }

  // Where we are.
  const onWelcome = !submitted && (listMode ? !listStarted : currentId === null)
  const showQuestion = !submitted && !listMode && !!current
  const showList = !submitted && listMode && listStarted
  const atEnd = showQuestion ? getNextStep(logic, answers, current.id).kind === 'end' : false
  const prevId = showQuestion ? getPrevStep(logic, answers, current.id) : null
  const progress = showQuestion ? getProgress(logic, answers, current.id).ratio : showList ? listProgress(logic, run) : 0
  const thankYou = form.thank_you_message || 'Thanks for completing this form!'

  // Theme tints as plain colours for browsers without color-mix() (older iOS
  // Safari); color-mix() still wins where it's supported.
  const tints: Record<string, string> = {}
  for (const [name, alpha] of [['--ff-t8', 0.08], ['--ff-t14', 0.14], ['--ff-t26', 0.26], ['--ff-t45', 0.45]] as const) {
    const c = tint(themeColor, alpha)
    if (c) tints[name] = c
  }

  return (
    <div style={{ ['--ff' as any]: themeColor, ...tints, minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#fff', padding: '64px 24px 96px', position: 'relative', overflowX: 'clip' }}>
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
        @keyframes ffFade { from { opacity: 0; } to { opacity: 1; } }
        .ff-in-fwd > .ff-fade, .ff-fade { animation: ffFade .4s ease both; animation-delay: 0s; }

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

        .ff-input { width: 100%; font-size: clamp(20px, 3vw, 28px); padding: 6px 0 10px; border: none; border-bottom: 1px solid var(--ff-t45, #c4c4c8); border-bottom: 1px solid color-mix(in srgb, var(--ff) 40%, transparent); border-radius: 0; outline: none; background: transparent; color: var(--ff); font-family: inherit; transition: border-color .2s, box-shadow .2s; }
        .ff-input:focus { border-color: transparent !important; border-bottom-color: var(--ff) !important; box-shadow: 0 1px 0 var(--ff); }
        .ff-input::placeholder { color: color-mix(in srgb, var(--ff) 35%, #b8b8be); }
        select.ff-input { cursor: pointer; }
        .ff-other { font-size: clamp(17px, 2.2vw, 20px); padding: 4px 0 8px; margin: 0 0 4px; }

        .ff-choices { display: flex; flex-direction: column; gap: 8px; width: fit-content; min-width: min(100%, 300px); max-width: 100%; }
        /* Unpicked rows are a light tint; a picked row is a clearly stronger fill
           with a solid border and a filled key, and only it shows the tick. The
           plain-colour line before each color-mix() is the fallback. */
        .ff-choice { display: flex; align-items: center; gap: 10px; width: 100%; padding: 8px 12px 8px 8px; border-radius: 6px; border: 1px solid var(--ff-t45, #d4d4d8); border-color: color-mix(in srgb, var(--ff) 45%, transparent); background: var(--ff-t8, #fafafa); background: color-mix(in srgb, var(--ff) 8%, #fff); color: #0d0d0d; font-size: 17px; text-align: left; cursor: pointer; transition: background .15s, box-shadow .15s, transform .1s; font-family: inherit; }
        @media (hover: hover) {
          .ff-choice:hover:not(.on) { background: var(--ff-t14, #f2f2f3); background: color-mix(in srgb, var(--ff) 14%, #fff); }
        }
        .ff-choice:active { transform: scale(.985); }
        .ff-choice.on { border-color: var(--ff); box-shadow: inset 0 0 0 1px var(--ff); background: var(--ff-t26, #e9e9ec); background: color-mix(in srgb, var(--ff) 26%, #fff); }
        .ff-key { min-width: 24px; height: 24px; padding: 0 6px; border-radius: 4px; border: 1px solid var(--ff); border-color: color-mix(in srgb, var(--ff) 55%, transparent); background: #fff; color: var(--ff); font-size: 12px; font-weight: 700; display: inline-flex; align-items: center; justify-content: center; flex-shrink: 0; transition: background .15s, color .15s; white-space: nowrap; }
        .ff-keyword { display: none; }
        @media (hover: hover) { .ff-choice:hover .ff-keyword { display: inline; margin-right: 3px; } }
        .ff-choice.on .ff-key { background: var(--ff); border-color: var(--ff); color: #fff; }
        .ff-label { flex: 1; min-width: 0; }
        @keyframes ffTickIn { from { opacity: 0; transform: scale(.5); } to { opacity: 1; transform: none; } }
        .ff-tick { color: var(--ff); flex-shrink: 0; animation: ffTickIn .25s cubic-bezier(.34,1.56,.64,1) both; }
        @keyframes ffBlink { 0%, 50%, 100% { background: var(--ff-t26, #e9e9ec); background: color-mix(in srgb, var(--ff) 26%, #fff); } 25%, 75% { background: var(--ff-t8, #fafafa); background: color-mix(in srgb, var(--ff) 6%, #fff); } }
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

        /* List view: every question on the path, stacked. */
        .ff-list { display: flex; flex-direction: column; gap: 56px; }
        .ff-list-q { scroll-margin-top: 24px; }

        .ff-nav { position: fixed; right: 20px; bottom: 20px; display: flex; gap: 1px; border-radius: 6px; overflow: hidden; z-index: 20; box-shadow: 0 2px 10px rgba(0,0,0,.08); }
        .ff-nav button { width: 40px; height: 36px; border: none; background: var(--ff); color: #fff; display: flex; align-items: center; justify-content: center; cursor: pointer; transition: filter .15s; }
        .ff-nav button:hover:not(:disabled) { filter: brightness(1.08); }
        .ff-nav button:disabled { opacity: .4; cursor: default; }
        .ff-bar { position: fixed; top: 0; left: 0; right: 0; height: 4px; background: color-mix(in srgb, var(--ff) 18%, #fff); z-index: 10; }
        .ff-bar > div { height: 100%; background: var(--ff); transition: width .5s cubic-bezier(.16,1,.3,1); }

        @media (prefers-reduced-motion: reduce) {
          .ff-in-fwd > *, .ff-in-back > *, .ff-out-fwd, .ff-out-back, .ff-blink, .ff-err, .ff-tick, .ff-fade { animation: none !important; }
        }
      `}</style>

      <Confetti show={showConfetti} color={themeColor} />

      {(showQuestion || showList) && (
        <div className="ff-bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress * 100)}>
          <div style={{ width: `${progress * 100}%` }} />
        </div>
      )}

      {showQuestion && (
        <div className="ff-nav">
          <button type="button" onClick={goBack} disabled={!prevId} aria-label="Previous question">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><polyline points="18 15 12 9 6 15"/></svg>
          </button>
          <button type="button" onClick={handleNext} disabled={atEnd} aria-label="Next question">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
          </button>
        </div>
      )}

      <div style={{ width: '100%', maxWidth: 640 }}>
        {submitted ? (
          <div key="thanks" className="ff-in-fwd" style={{ textAlign: 'center' }}>
            <div style={{ marginBottom: 24 }}><StatusMark kind="success" size={88} celebrate /></div>
            <h1 style={{ fontSize: 24, fontWeight: 800, color: '#0d0d0d', marginBottom: (form.end_actions || []).length > 0 ? 28 : 0 }}>
              {piping && finalRun ? pipeText(thankYou, { form: logic, answers: finalRun.answers, variables: finalRun.variables }) : thankYou}
            </h1>
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
        ) : onWelcome ? (
          <div key="welcome" className={leaving ? stage : 'ff-in-fwd'} style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            {welcome.mediaUrl && <MediaBlock url={welcome.mediaUrl} type={welcome.mediaType} />}
            <h1 style={{ fontSize: 'clamp(26px, 3.6vw, 34px)', fontWeight: 600, color: '#0d0d0d', margin: '0 0 12px', lineHeight: 1.25, letterSpacing: '-0.015em' }}>{form.title}</h1>
            {form.welcome_message && <p style={{ fontSize: 18, color: '#4b5563', lineHeight: 1.55, margin: '0 0 28px', maxWidth: 520 }}>{form.welcome_message}</p>}
            <div className="ff-actions" style={{ justifyContent: 'center', marginTop: form.welcome_message ? 0 : 16 }}>
              <button type="button" className="ff-ok" onClick={startForm} style={{ fontSize: 19, padding: '12px 26px' }}>{welcome.buttonText}</button>
              {enterHint}
            </div>
            <WelcomeMeta
              minutes={welcome.showTimeToComplete ? estimateMinutes(logic, answers) : null}
              count={welcome.showResponseCount ? responseCount : null} />

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
        ) : showList ? (
          <div key="list" className="ff-list">
            {run.path.map((id, i) => {
              const q = questionAt(id)
              if (!q) return null
              return (
                <div key={id} id={`ff-q-${id}`} className="ff-list-q">
                  {questionMedia(q)}
                  {renderHead(q, i + 1)}
                  <div className="ff-indent" style={{ marginTop: q.type === 'statement' ? 20 : 30 }}>
                    {renderInput(q)}
                  </div>
                  {listErrs[id] && errorNote(listErrs[id])}
                </div>
              )
            })}
            <div className="ff-actions ff-indent">
              <button type="button" className="ff-ok" onClick={() => finish(answersRef.current)} disabled={submitting}>
                {submitting ? 'Submitting…' : 'Submit'}
              </button>
            </div>
          </div>
        ) : showQuestion ? (
          <div key={current.id} className={stage}>
            {questionMedia(current)}

            {renderHead(current, run.path.indexOf(current.id) + 1)}

            <div ref={answerRef} className="ff-indent" style={{ marginTop: current.type === 'statement' ? 20 : 30, marginBottom: 28 }}>
              {renderInput(current)}
            </div>

            {err && errorNote(err, { marginTop: -14, marginBottom: 18 })}

            {(!AUTO_ADVANCE_TYPES.includes(current.type) || (current.type === 'multiple_choice' && current.multiSelect) || otherBoxOpen(current, answers[current.id]))
              && !(current.type === 'payment' && (answers[current.id] as any)?.status !== 'paid') && (
              <div className="ff-actions ff-indent">
                <button type="button" className="ff-ok" onClick={handleNext} disabled={submitting}>
                  {submitting ? 'Submitting…' : atEnd ? 'Submit' : current.type === 'statement' ? 'Continue' : 'OK'}
                  {!submitting && !atEnd && current.type !== 'statement' && (
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
