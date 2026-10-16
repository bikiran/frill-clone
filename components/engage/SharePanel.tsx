'use client'

// Share a poll or survey: link, QR code for the counter, embed code, and
// sending it out (SMS through a campaign, email, social). Used in the list's
// share dialog and on the detail page's Share tab.

import { useEffect, useState } from 'react'
import type { EngageKind, EngageStatus } from '@/lib/engage-core'
import { EngageIcon } from './icons'

export function SharePanel({ kind, url, title, status, onSms, smsBusy, compact }: {
  kind: EngageKind
  url: string
  title: string
  status: EngageStatus
  onSms: () => void
  smsBusy?: boolean
  compact?: boolean
}) {
  const [copied, setCopied] = useState('')
  const [qr, setQr] = useState<string | null>(null)
  const noun = kind === 'poll' ? 'poll' : 'survey'
  const embed = `<iframe src="${url}?embed=1" width="100%" height="${kind === 'poll' ? 480 : 580}" frameborder="0" style="border:0;border-radius:16px;max-width:640px" title="${title.replace(/"/g, '&quot;')}"></iframe>`

  useEffect(() => {
    let live = true
    import('qrcode').then(QR => QR.toDataURL(url, { margin: 1, width: 640, errorCorrectionLevel: 'M' }))
      .then(d => { if (live) setQr(d) })
      .catch(() => { if (live) setQr(null) })
    return () => { live = false }
  }, [url])

  const copy = async (text: string, field: string) => {
    try { await navigator.clipboard.writeText(text) } catch {
      const t = document.createElement('textarea'); t.value = text; document.body.appendChild(t); t.select()
      try { document.execCommand('copy') } catch {}
      t.remove()
    }
    setCopied(field)
    setTimeout(() => setCopied(c => (c === field ? '' : c)), 2000)
  }

  const downloadQr = () => {
    if (!qr) return
    const a = document.createElement('a')
    a.href = qr
    a.download = `${(title || noun).replace(/[\\/:*?"<>|]+/g, ' ').trim().slice(0, 60) || noun}-qr.png`
    document.body.appendChild(a); a.click(); a.remove()
  }

  return (
    <div className={`eg-share${compact ? ' is-compact' : ''}`}>
      {status !== 'live' && (
        <div className="eg-note is-warn" role="status">
          <EngageIcon name="lock" size={15} />
          <span>{status === 'draft' ? `This ${noun} is a draft. Publish it before sharing; until then the link shows “not found”.` : `This ${noun} is closed. The link shows that it has closed${kind === 'poll' ? ' (and the results, if you allow it)' : ''}.`}</span>
        </div>
      )}

      <section className="eg-share-sec">
        <h3 className="eg-h3">Link</h3>
        <div className="eg-row">
          <input readOnly value={url} onFocus={e => e.currentTarget.select()} className="eg-input eg-grow" aria-label={`${noun} link`} />
          <button type="button" className="fr-btn" onClick={() => copy(url, 'link')}><EngageIcon name={copied === 'link' ? 'check' : 'external'} size={15} />{copied === 'link' ? 'Copied' : 'Copy'}</button>
          <a className="fr-btn" href={url} target="_blank" rel="noopener noreferrer">Open</a>
        </div>
      </section>

      <div className="eg-share-grid">
        <section className="eg-share-sec">
          <h3 className="eg-h3">QR code</h3>
          <p className="eg-help">Print it for the counter, a shelf talker or a receipt. Scans go straight to the {noun}.</p>
          <div className="eg-qr">
            {qr ? <img src={qr} alt={`QR code for ${title}`} width={150} height={150} /> : <div className="eg-qr-empty" aria-hidden="true"><EngageIcon name="qr" size={28} /></div>}
            <button type="button" className="fr-btn" onClick={downloadQr} disabled={!qr}><EngageIcon name="download" size={15} />Download PNG</button>
          </div>
        </section>

        <section className="eg-share-sec">
          <h3 className="eg-h3">Send it out</h3>
          <p className="eg-help">SMS goes through a campaign, so only customers who agreed to marketing get it, opt-outs are respected and each person&apos;s vote is matched to them.</p>
          <div className="eg-stack">
            <button type="button" className="fr-btn eg-btn-coral" onClick={onSms} disabled={smsBusy || status === 'draft'} title={status === 'draft' ? 'Publish it first' : undefined}>
              <EngageIcon name="sms" size={15} />{smsBusy ? 'Starting campaign…' : 'Send by SMS to a segment'}
            </button>
            <a className="fr-btn" href={`mailto:?subject=${encodeURIComponent(title)}&body=${encodeURIComponent(`${title}\n\n${url}`)}`}><EngageIcon name="mail" size={15} />Email the link</a>
            <a className="fr-btn" href={`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`} target="_blank" rel="noopener noreferrer"><EngageIcon name="globe" size={15} />Share on Facebook</a>
          </div>
          <p className="eg-help" style={{ marginTop: 10 }}>You can also send it into a live chat from the inbox (Send, then {kind === 'poll' ? 'Poll' : 'Survey'}).</p>
        </section>
      </div>

      <section className="eg-share-sec">
        <h3 className="eg-h3">Embed on your website</h3>
        <textarea readOnly value={embed} rows={3} onFocus={e => e.currentTarget.select()} className="eg-input eg-code" aria-label="Embed code" />
        <div className="eg-row" style={{ marginTop: 8 }}>
          <button type="button" className="fr-btn" onClick={() => copy(embed, 'embed')}><EngageIcon name={copied === 'embed' ? 'check' : 'code'} size={15} />{copied === 'embed' ? 'Copied' : 'Copy embed code'}</button>
        </div>
      </section>
    </div>
  )
}
