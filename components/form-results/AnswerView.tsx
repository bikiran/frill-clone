'use client'

import VoicePlayer from '@/components/VoicePlayer'
import { answerToPlainText, isBlankAnswer, toNum, type FormQuestion } from '@/lib/form-logic'
import { otherChoiceLabel } from '@/lib/form-choice-options'
import {
  prep, isSkipped, otherTextFor, checkPayment, checkBooking, paymentText, bookingText, cellText, safeUrl, mediaKindOf,
  type ResultRow, type VerifyContext,
} from './aggregate'
import { Icon } from './icons'

const muted = { color: 'var(--slate)', fontStyle: 'italic' as const }

/** The full answer, as the drawer shows it. Plain text only; media through safe URLs; audio through VoicePlayer. */
export function AnswerView({ row, q, verify, color }: { row: ResultRow; q: FormQuestion; verify: VerifyContext | null; color: string }) {
  const answer = prep(row).answers[q.id]
  if (isBlankAnswer(answer)) return <span style={muted}>{isSkipped(row, q.id) ? 'Skipped' : 'No answer'}</span>

  if (q.type === 'rating') {
    const n = toNum(answer)
    return (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
        <span style={{ display: 'inline-flex', gap: 2 }} aria-hidden>
          {[1, 2, 3, 4, 5].map(i => (
            <svg key={i} width="16" height="16" viewBox="0 0 24 24" fill={i <= n ? color : 'none'} stroke={color} strokeWidth="1.5">
              <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
            </svg>
          ))}
        </span>
        <b>{Number.isFinite(n) ? n : answerToPlainText(answer)}/5</b>
      </span>
    )
  }
  if (q.type === 'nps' || q.type === 'opinion_scale') {
    const n = toNum(answer)
    const max = q.type === 'nps' ? 10 : 7
    const tone = q.type === 'nps' ? (n >= 9 ? '#16a34a' : n >= 7 ? '#d97706' : '#dc2626') : color
    return <span style={{ display: 'inline-flex', padding: '3px 10px', borderRadius: 8, fontWeight: 700, background: `${tone}18`, color: tone }}>{Number.isFinite(n) ? n : answerToPlainText(answer)} / {max}</span>
  }
  if (q.type === 'payment') {
    const c = checkPayment(answer, q, row.id, verify)
    const ok = c.state === 'paid'
    const tone = ok ? '#047857' : c.state === 'checking' ? 'var(--slate)' : c.state === 'refunded' ? '#6b7280' : '#b45309'
    return (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontWeight: 600, color: tone }} title={c.reason}>
        <Icon name={ok ? 'check' : c.state === 'unverified' ? 'alert' : 'card'} size={15} />
        {paymentText(c)}
        {c.state === 'unverified' && c.reason && <span style={{ fontWeight: 400, color: 'var(--slate)', fontSize: 12 }}>· {c.reason}</span>}
      </span>
    )
  }
  if (q.type === 'scheduler') {
    const c = checkBooking(answer, q, row.id, verify)
    const tone = c.state === 'booked' ? 'var(--ink)' : c.state === 'checking' ? 'var(--slate)' : '#b45309'
    return (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontWeight: 600, color: tone }} title={c.reason}>
        <Icon name={c.state === 'unverified' ? 'alert' : 'calendar'} size={15} />
        {bookingText(c)}
        {c.state === 'unverified' && c.reason && <span style={{ fontWeight: 400, color: 'var(--slate)', fontSize: 12 }}>· {c.reason}</span>}
      </span>
    )
  }
  if (q.type === 'matrix' && answer && typeof answer === 'object' && !Array.isArray(answer)) {
    return (
      <div style={{ display: 'grid', gap: 3 }}>
        {Object.entries(answer as Record<string, unknown>).slice(0, 100).map(([k, v]) => (
          <div key={k}><span style={{ color: 'var(--slate)' }}>{k}:</span> {answerToPlainText(v)}</div>
        ))}
      </div>
    )
  }

  // Media: data: URLs (signatures, recordings) and uploads ({ name, url }).
  const mediaType = q.type === 'file_upload' || q.type === 'video_audio' || q.type === 'signature'
  const rawUrl = typeof answer === 'string' ? (answer.startsWith('data:') || (mediaType && /^https?:\/\//i.test(answer)) ? answer : null)
    : answer && typeof answer === 'object' && !Array.isArray(answer) ? (answer as any).url : null
  if (rawUrl !== null && rawUrl !== undefined) {
    const url = safeUrl(rawUrl)
    const name = answer && typeof answer === 'object' && typeof (answer as any).name === 'string' ? (answer as any).name : ''
    if (!url) return <span>{name || 'File'} <span style={muted}>(link not shown)</span></span>
    const kind = mediaKindOf(url, name)
    if (kind === 'image') return <img src={url} alt={q.type === 'signature' ? 'Signature' : name || 'Uploaded image'} style={{ maxWidth: '100%', maxHeight: 240, borderRadius: 8, border: '1px solid var(--border)', background: '#fff' }} />
    if (kind === 'video') return <video src={url} controls style={{ maxWidth: '100%', maxHeight: 240, borderRadius: 8 }} />
    if (kind === 'audio') return <VoicePlayer src={url} name={name || 'Voice answer'} />
    if (url.startsWith('data:')) return <span>{name || 'File'}</span>
    return (
      <a href={url} target="_blank" rel="noopener noreferrer" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: 'var(--coral)', textDecoration: 'underline' }}>
        <Icon name="file" size={15} />{name || url.split(/[?#]/)[0].split('/').pop() || 'Download'}
      </a>
    )
  }

  if (Array.isArray(answer)) {
    const other = otherChoiceLabel(q as any)
    const text = otherTextFor(row, q.id)
    return (
      <div style={{ display: 'grid', gap: 2 }}>
        {answer.slice(0, 200).map((x, i) => {
          const label = answerToPlainText(x)
          return <div key={i}>{q.type === 'ranking' ? `${i + 1}. ` : ''}{other && label === other && text ? `${label}: ${text}` : label}</div>
        })}
      </div>
    )
  }

  return <span>{cellText(answer, q, { otherText: otherTextFor(row, q.id) })}</span>
}
