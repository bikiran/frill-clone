'use client'

import { useEffect, useRef, useState } from 'react'
import Popover, { usePopover } from './Popover'
import { REVIEW_REQUEST_MESSAGE, runReviewAction, type ReviewChannel } from '@/lib/review-request'

// The composer's star button. It used to send a review request the instant it
// was clicked. Now it opens "Ask for a review": the message (editable), which
// channel it will go by, and two explicit choices — Send now, or Insert into
// the reply to send with your own words. Nothing is sent, and no link is made,
// until one of those is clicked.

const StarIcon = ({ size = 16 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
)
const LinkIcon = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>
)
const SendIcon = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M22 2 11 13"/><path d="M22 2 15 22l-4-9-9-4z"/></svg>
)
const InfoIcon = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden style={{ flexShrink: 0, marginTop: 1 }}><circle cx="12" cy="12" r="9"/><line x1="12" y1="8" x2="12" y2="8.01"/><path d="M11 12h1v4h1"/></svg>
)

export interface ReviewRequestProps {
  channel: ReviewChannel
  alreadyReviewed?: string | null      // "Debra left a 5-star Google review on 3 Oct 2026."
  getLink: () => Promise<string | null> // makes the branded short link to the review page
  onSend: (text: string, channel: ReviewChannel) => Promise<void>  // throws on failure
  onInsert?: (text: string) => void    // omitted where there's no reply box to insert into
  onError?: (message: string) => void  // a failure after the popover was closed (e.g. a toast)
  buttonClassName?: string
  buttonLabel?: React.ReactNode         // a text button instead of the star icon
  buttonStyle?: React.CSSProperties
  reviewSettingsHref?: string
  defaultOpen?: boolean                 // tests / screenshots
}

export default function ReviewRequestButton({ channel, alreadyReviewed, getLink, onSend, onInsert, onError, buttonClassName, buttonLabel, buttonStyle, reviewSettingsHref = '/admin/crm-settings/channels/google-reviews', defaultOpen = false }: ReviewRequestProps) {
  const pop = usePopover()
  const [openState, setOpenState] = useState(defaultOpen)
  const open = pop.open || openState
  const close = () => { pop.close(); setOpenState(false); setNoLink(false); setError('') }
  // A send keeps going if the popover is closed meanwhile; then a failure is
  // reported through onError instead of the (gone) popover.
  const openRef = useRef(open)
  useEffect(() => { openRef.current = open })
  const fail = (msg: string) => { if (openRef.current) setError(msg); else onError?.(msg) }
  const [message, setMessage] = useState(REVIEW_REQUEST_MESSAGE)
  const [busy, setBusy] = useState<'' | 'send' | 'insert'>('')
  const [noLink, setNoLink] = useState(false)
  const [error, setError] = useState('')

  const canSend = channel.kind !== 'none'
  const sendLabel = channel.kind === 'none' ? 'Send' : `Send by ${channel.label}`

  const act = async (action: 'send' | 'insert') => {
    if (busy) return
    setBusy(action); setError('')
    try {
      const r = await runReviewAction(action, {
        message, getLink, allowNoLink: noLink,
        send: (t) => onSend(t, channel),
        insert: (t) => onInsert?.(t),
      })
      if (r === 'empty') setError('Write a message first')
      else if (r === 'needs-confirm') setNoLink(true)
      else if (r === 'link-error') fail('Couldn’t make the review link just now. Nothing was sent; try again.')
      else { setMessage(REVIEW_REQUEST_MESSAGE); close() }
    } catch (e: any) {
      fail(e?.message || 'Could not send the review request')
    } finally { setBusy('') }
  }

  const btn: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6, height: 34, padding: '0 12px', borderRadius: 9, fontSize: 12.5, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }

  return (
    <>
      <button type="button" ref={pop.anchorRef} className={buttonClassName}
        onClick={() => { if (open) close(); else pop.setOpen(true) }}
        title="Ask for a review" aria-label="Ask for a review" aria-haspopup="dialog" aria-expanded={open}
        style={buttonStyle}>
        {buttonLabel ?? <StarIcon />}
      </button>
      <Popover open={open} onClose={close} anchorRef={pop.anchorRef} width={340} prefer="top" label="Ask for a review" role="dialog" padding={12}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ display: 'inline-flex', width: 26, height: 26, borderRadius: 8, alignItems: 'center', justifyContent: 'center', background: 'var(--peach)', color: 'var(--coral)' }}><StarIcon size={14} /></span>
            <p style={{ margin: 0, fontSize: 14, fontWeight: 800, color: 'var(--ink)', flex: 1 }}>Ask for a review</p>
          </div>

          {alreadyReviewed && (
            <p role="note" style={{ margin: 0, display: 'flex', gap: 6, fontSize: 12, lineHeight: 1.45, color: '#92400e', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 8, padding: '7px 9px' }}>
              <InfoIcon /><span>{alreadyReviewed}</span>
            </p>
          )}

          <label style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: '.04em', textTransform: 'uppercase', color: 'var(--slate)' }}>Message</span>
            <textarea data-autofocus value={message} onChange={e => { setMessage(e.target.value); setError('') }} rows={3}
              style={{ width: '100%', boxSizing: 'border-box', padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)', fontSize: 13, lineHeight: 1.5, fontFamily: 'inherit', resize: 'vertical', outline: 'none', color: 'var(--ink)', background: 'var(--card, #fff)' }} />
          </label>

          <p style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--slate)' }}>
            <LinkIcon /> Your review link is added on its own line.
          </p>
          <p data-review-channel={channel.kind} style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--slate)' }}>
            <SendIcon />
            {canSend
              ? <span>Goes by <b style={{ color: 'var(--ink)' }}>{channel.label}</b>{channel.to ? <> to {channel.to}</> : null}{channel.note ? <> ({channel.note})</> : null}</span>
              : <span>{channel.note || 'No way to send this to the customer'}.{onInsert ? ' You can still insert it into a reply.' : ''}</span>}
          </p>

          {noLink && (
            <p role="alert" style={{ margin: 0, display: 'flex', gap: 6, fontSize: 12, lineHeight: 1.45, color: '#92400e', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 8, padding: '7px 9px' }}>
              <InfoIcon />
              <span>No Google review link is set up yet, so the message would go without a link. <a href={reviewSettingsHref} style={{ color: 'var(--coral)', fontWeight: 700 }}>Set it up</a></span>
            </p>
          )}
          {error && <p role="alert" style={{ margin: 0, fontSize: 12, color: '#dc2626' }}>{error}</p>}

          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
            {onInsert && (
              <button type="button" data-pop-item onClick={() => act('insert')} disabled={!!busy}
                style={{ ...btn, border: '1px solid var(--border)', background: 'var(--card, #fff)', color: 'var(--ink)', opacity: busy && busy !== 'insert' ? 0.6 : 1 }}>
                {busy === 'insert' ? 'Inserting…' : noLink ? 'Insert without link' : 'Insert into reply'}
              </button>
            )}
            <button type="button" data-pop-item onClick={() => act('send')} disabled={!!busy || !canSend}
              style={{ ...btn, border: 'none', background: 'var(--coral)', color: '#fff', opacity: (!canSend || (busy && busy !== 'send')) ? 0.55 : 1, cursor: canSend ? 'pointer' : 'not-allowed' }}>
              <SendIcon />{busy === 'send' ? 'Sending…' : noLink ? 'Send without link' : sendLabel}
            </button>
          </div>
        </div>
      </Popover>
    </>
  )
}
