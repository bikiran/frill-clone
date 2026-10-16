'use client'

// "Tell people": the choices for a live post, with honest numbers first.
//   • Bell notification for the people on your board (and voters of the
//     linked idea).
//   • Email to customers who agreed to marketing (the count says how many
//     were left out and why there's a gap).
//   • Text: makes a draft SMS campaign to review (cost, consent, quiet hours)
//     in Campaigns. Nothing is texted from here.
// Sends once per post; the server enforces that and an hourly limit.

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { AnnIcon } from './icons'
import { annAction, notifyCounts, sendNotify } from './client'

export default function NotifyDialog({ companyId, post, onClose, onDone }: {
  companyId: string
  post: { id: string; title: string; notified_at?: string | null }
  onClose: () => void
  onDone?: (msg: string) => void
}) {
  const [counts, setCounts] = useState<{ board: number; email: number; emailSkipped: number; emailReady: boolean; notifiedAt: string | null } | null>(null)
  const [err, setErr] = useState('')
  const [board, setBoard] = useState(true)
  const [email, setEmail] = useState(true)
  const [sms, setSms] = useState(false)
  const [busy, setBusy] = useState(false)
  const [smsId, setSmsId] = useState<string | null>(null)
  const [result, setResult] = useState<string | null>(null)

  useEffect(() => {
    notifyCounts(companyId, post.id).then(c => {
      setCounts(c)
      if (!c.board) setBoard(false)
      if (!c.email || !c.emailReady) setEmail(false)
    }).catch(e => setErr(e.message))
  }, [companyId, post.id])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !busy) onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [busy, onClose])

  const already = !!(counts?.notifiedAt || post.notified_at)
  const go = async () => {
    setBusy(true); setErr('')
    const parts: string[] = []
    try {
      if (!already && (board || email)) {
        const r = await sendNotify(companyId, post.id, { board, email })
        if (board) parts.push(`${r.inAppCount} bell notification${r.inAppCount === 1 ? '' : 's'}`)
        if (email) parts.push(`${r.emailCount} email${r.emailCount === 1 ? '' : 's'}`)
        if (r.errors?.length) parts.push(r.errors[0])
      }
      if (sms) {
        const r = await annAction(companyId, 'sms_draft', post.id)
        setSmsId(r.campaignId)
        parts.push('an SMS campaign draft')
      }
      const msg = parts.length ? `Sent: ${parts.join(', ')}.` : 'Nothing to send.'
      setResult(msg)
      onDone?.(msg)
    } catch (e: any) { setErr(e.message) }
    setBusy(false)
  }

  const nothing = (already || (!board && !email)) && !sms
  return (
    <div className="an-overlay" role="presentation" onMouseDown={e => { if (e.target === e.currentTarget && !busy) onClose() }}>
      <div className="an-dialog" role="dialog" aria-modal="true" aria-labelledby="an-notify-title">
        <div className="an-dialog-head">
          <div>
            <h2 id="an-notify-title" className="an-dialog-title">Tell people about it</h2>
            <p className="an-dialog-sub">“{post.title}” is live. Choose who hears about it. Each way is sent once.</p>
          </div>
          <button type="button" className="an-icon-btn" aria-label="Close" onClick={onClose} disabled={busy}><AnnIcon name="x" size={18} /></button>
        </div>
        {result ? (
          <div className="an-dialog-body">
            <div className="an-choice on" style={{ cursor: 'default' }}>
              <span className="an-choice-icon" style={{ background: '#dcfce7', color: '#15803d' }}><AnnIcon name="check" size={16} /></span>
              <span className="an-choice-text"><strong>Done</strong>{result}</span>
            </div>
            {smsId && (
              <p className="an-dialog-sub" style={{ margin: 0 }}>
                Your SMS is waiting as a draft. <Link href={`/admin/campaigns/${smsId}`} style={{ color: 'var(--coral)', fontWeight: 600 }}>Check the cost and send it</Link>.
              </p>
            )}
          </div>
        ) : (
          <div className="an-dialog-body">
            {!counts && !err && <p className="an-dialog-sub">Counting who can be told…</p>}
            {counts && already && (
              <div className="an-notice" style={{ margin: 0 }}>
                <AnnIcon name="check" size={16} /><span>Your board and customers were already told about this post.</span>
              </div>
            )}
            {counts && !already && (
              <>
                <label className={`an-choice${board ? ' on' : ''}`}>
                  <input type="checkbox" checked={board} disabled={!counts.board} onChange={e => setBoard(e.target.checked)} />
                  <span className="an-choice-icon"><AnnIcon name="bell" size={16} /></span>
                  <span className="an-choice-text"><strong>Board notification</strong>
                    {counts.board ? `${counts.board} ${counts.board === 1 ? 'person' : 'people'} who follow your board see it in their bell.` : 'Nobody has joined your board yet.'}</span>
                </label>
                <label className={`an-choice${email ? ' on' : ''}`}>
                  <input type="checkbox" checked={email} disabled={!counts.email || !counts.emailReady} onChange={e => setEmail(e.target.checked)} />
                  <span className="an-choice-icon"><AnnIcon name="mail" size={16} /></span>
                  <span className="an-choice-text"><strong>Email customers</strong>
                    {!counts.emailReady ? 'Email isn’t set up yet.' : counts.email
                      ? `${counts.email} customer${counts.email === 1 ? '' : 's'} who agreed to hear from you.${counts.emailSkipped ? ` ${counts.emailSkipped} left out (unsubscribed, no consent or no email).` : ''}`
                      : 'No customers in this audience have agreed to marketing emails.'}</span>
                </label>
              </>
            )}
            {counts && (
              <label className={`an-choice${sms ? ' on' : ''}`}>
                <input type="checkbox" checked={sms} onChange={e => setSms(e.target.checked)} />
                <span className="an-choice-icon"><AnnIcon name="sms" size={16} /></span>
                <span className="an-choice-text"><strong>Text customers too</strong>Makes a draft SMS campaign with a link to this post. You’ll see the cost and who’s left out before anything is sent.</span>
              </label>
            )}
            {err && <p className="an-dialog-sub" style={{ color: '#dc2626', margin: 0 }}>{err}</p>}
          </div>
        )}
        <div className="an-dialog-foot">
          {result
            ? <button type="button" className="an-btn an-btn-primary" onClick={onClose}>Done</button>
            : <>
              <button type="button" className="an-btn" onClick={onClose} disabled={busy}>Not now</button>
              <button type="button" className="an-btn an-btn-primary" onClick={go} disabled={busy || !counts || nothing}>
                <AnnIcon name="send" size={15} /> {busy ? 'Sending…' : 'Send'}
              </button>
            </>}
        </div>
      </div>
    </div>
  )
}
