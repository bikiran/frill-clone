'use client'

import { useAttachmentToken } from '@/lib/useAttachmentToken'
import { VoiceTag } from '@/components/VoiceTag'
import { useEffect, useRef, useState } from 'react'
import { quotedDateOf, emailFrameDoc, estimateEmailHeight, emailHtmlHasContent } from '@/lib/email-text'
import { toPublicUrl, sizedImageUrl, sizedImageFallback } from '@/lib/storage-url'

// Email card. A customer's email reads as a RECEIVED message: on the left,
// with their name, the time it arrived, the body, the history their mail app
// quoted collapsed behind "Replying to your email from 8 Oct", the formatted
// version behind "View full message", and attachments (photos and videos open
// in the inbox's viewer, other files download). An email the business sent
// sits on the right and says where it went from and where replies come back.

const ico = (path: React.ReactNode, size = 14) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>{path}</svg>
)
// Received: an arrow down into a tray. Sent: a paper plane. (The old "in"
// icon was an up-right arrow, which reads as outgoing.)
const InboxIn = () => ico(<><polyline points="22 12 16 12 14 15 10 15 8 12 2 12"/><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/></>, 13)
const SentPlane = () => ico(<><path d="M22 2 11 13"/><path d="M22 2 15 22l-4-9-9-4z"/></>, 13)
const Chevron = ({ open }: { open: boolean }) => ico(<polyline points={open ? '18 15 12 9 6 15' : '6 9 12 15 18 9'} />, 13)
const Paperclip = () => ico(<path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/>, 13)
const Download = () => ico(<><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></>, 13)

function firstAddress(raw?: string | null): { name: string; email: string } {
  if (!raw) return { name: '', email: '' }
  const first = raw.split(',')[0].trim()
  const m = first.match(/^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/)
  if (m) return { name: (m[1] || '').trim(), email: m[2].trim() }
  return { name: '', email: first }
}

// The stored plain-text preview sometimes contains ESCAPED html — literal
// "&lt;br&gt;" and "&amp;" — which then showed up verbatim in the collapsed
// view (while "View full message" rendered the real HTML fine). Decode the
// entities and flatten any tags so the collapsed preview reads like prose.
function cleanPreview(raw: string): string {
  if (!raw) return ''
  let t = raw
  // Decode entities first (handles &lt;br&gt; -> <br>, &amp; -> & etc.).
  const ENT: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', copy: '©' }
  t = t.replace(/&([a-z]+);/gi, (m, e) => ENT[String(e).toLowerCase()] ?? m)
  t = t.replace(/&#(\d+);/g, (_m, d) => String.fromCharCode(Number(d)))
  // Turn line-break tags into real newlines, then drop the rest of the tags.
  t = t.replace(/<br\s*\/?>/gi, '\n').replace(/<\/(p|div|tr|li|h[1-6])>/gi, '\n')
  t = t.replace(/<[^>]+>/g, '')
  // Collapse the long "------" separator rules and excess blank lines.
  t = t.replace(/[-_=]{6,}/g, '').replace(/\n{3,}/g, '\n\n').replace(/[ \t]+/g, ' ')
  return t.trim()
}

// Photo or video? Uses the stored type, else the file name ("image0.jpeg").
export function emailAttachmentKind(a: any): 'image' | 'video' | null {
  const mime = String(a?.mime || a?.type || a?.mimeType || '').toLowerCase()
  if (mime.startsWith('image/')) return 'image'
  if (mime.startsWith('video/')) return 'video'
  const ext = String(a?.name || '').toLowerCase().split('.').pop() || ''
  if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'heic', 'heif', 'bmp', 'avif'].includes(ext)) return 'image'
  if (['mp4', 'mov', 'm4v', 'webm'].includes(ext)) return 'video'
  return null
}

// Where an email attachment can be fetched: a direct url (webhook emails), or
// streamed from Gmail through our attachment route.
export function emailAttachmentUrl(msg: any, a: any, attToken?: string | null): string | null {
  return a?.url || (msg?.gmail_message_id && a?.attachmentId
    ? `/api/email/attachment?messageId=${encodeURIComponent(msg.gmail_message_id)}&attachmentId=${encodeURIComponent(a.attachmentId)}&name=${encodeURIComponent(a.name || 'file')}&conversationId=${encodeURIComponent(msg.conversation_id)}${attToken ? `&t=${encodeURIComponent(attToken)}` : ''}`
    : null)
}

// "16 Oct, 10:07 pm"
function fmtWhen(raw?: string | null): string {
  if (!raw) return ''
  const d = new Date(String(raw).replace(' ', 'T'))
  if (isNaN(d.getTime())) return ''
  const date = d.toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })
  const time = d.toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit', hour12: true }).replace(/\s?([ap])\.?m\.?/i, ' $1m').toLowerCase()
  return `${date}, ${time}`
}

// Why an email's text couldn't be loaded yet (metadata.inbound_email.body_error), for owners and super admins.
const PENDING_WHY: Record<string, string> = {
  unauthorised: 'Resend key can’t read received mail',
  'not-found': 'Resend doesn’t have this email',
  'over-quota': 'Resend didn’t keep this email’s text (account over quota)',
  unavailable: 'Resend didn’t answer; Colvy will try again',
  'no-key': 'No Resend key is set up',
}

/** The webhook saved this email without its text (Resend didn't give it), still to be filled in. */
export function emailTextPending(msg: any): boolean {
  const ie = msg?.metadata?.inbound_email
  return !!ie && ['pending', 'unavailable', 'gave-up'].includes(String(ie.body || '')) && !String(msg?.content || '').trim() && !msg?.email_html
}

export default function EmailMessage({ msg, agentColor, onOpenMedia, businessName, showWhy }: {
  msg: any
  agentColor?: string
  // Open a photo/video attachment in the viewer: a received one by its index
  // on this email, a sent one (a chat attachment) by its url.
  onOpenMedia?: (target: { index: number } | { url: string }) => void
  // The business's name, for "Sent from Roxy Aquarium <…>".
  businessName?: string | null
  // Owners and super admins: say why an email's text couldn't be loaded.
  showWhy?: boolean
}) {
  const attToken = useAttachmentToken(msg?.gmail_message_id ? msg?.conversation_id : null)
  const [showFull, setShowFull] = useState(false)
  const [showQuoted, setShowQuoted] = useState(false)
  // The frame's width (our own element, measured from outside the sandbox) for
  // its starting height: a narrow phone needs a taller frame.
  const bodyRef = useRef<HTMLDivElement | null>(null)
  const [bodyW, setBodyW] = useState(640)
  useEffect(() => {
    const el = bodyRef.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(() => setBodyW(Math.max(200, Math.round(el.clientWidth))))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  const isAgent = msg.sender_type === 'agent'

  const from = firstAddress(msg.email_from)
  const fromEmail = from.email || msg.sender_email || ''
  const fromName = from.name || msg.sender_name || fromEmail
  const to = msg.email_to || ''
  const cc = msg.email_cc || ''
  const subject = msg.email_subject || ''
  // Only a formatted copy with something in it (a photo-only email used to
  // open an empty frame: its pasted photo was a cid: image that couldn't load).
  const html = emailHtmlHasContent(msg.email_html) ? msg.email_html : ''
  const quoted = msg.email_quoted || ''
  // Files on a received email are in email_attachments. Files sent from Colvy
  // with an email are kept on the message like any chat attachment
  // ({ url, name, type, kind }); they were sent but never shown here.
  const received: any[] = Array.isArray(msg.email_attachments) ? msg.email_attachments : []
  const seenUrls = new Set(received.map(a => a?.url).filter(Boolean))
  const sent: any[] = (Array.isArray(msg.attachments) ? msg.attachments : []).filter((a: any) => a?.url && !seenUrls.has(a.url))
  const attachments: any[] = [...received.map((a, i) => ({ ...a, _i: i })), ...sent.map(a => ({ ...a, _sent: true }))]
  const text = cleanPreview(msg.content)
  const when = fmtWhen(msg.metadata?.inbound_email?.received_at || msg.created_at)
  const quotedOn = quotedDateOf(quoted)
  const isAuto = isAgent && !!msg.metadata?.auto
  const pending = !isAgent && emailTextPending(msg)
  const pendingWhy = pending && showWhy ? (PENDING_WHY[String(msg.metadata?.inbound_email?.body_error || '')] || (msg.metadata?.inbound_email?.body === 'unavailable' ? 'Resend didn’t hand over the text' : '')) : ''
  const accent = agentColor || '#2563eb'

  const fmtBytes = (n: number) => n > 1048576 ? `${(n / 1048576).toFixed(1)} MB` : n > 1024 ? `${Math.round(n / 1024)} KB` : `${n} B`
  const initial = (fromName || '?').trim().charAt(0).toUpperCase()

  return (
    <div className="em-row" style={{ display: 'flex', justifyContent: isAgent ? 'flex-end' : 'flex-start', gap: 8, alignItems: 'flex-start', margin: '8px 0', width: '100%' }}>
      <style>{`.em-row .em-card{max-width:min(680px,100%)}@media (max-width:640px){.em-row .em-av{display:none !important}.em-row .em-card{max-width:100%}}`}</style>
      {!isAgent && (
        <div className="em-av" aria-hidden style={{ width: 28, height: 28, borderRadius: '50%', background: 'var(--peach)', border: '2px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, color: 'var(--coral)', flexShrink: 0, marginTop: 2 }}>
          {initial}
        </div>
      )}
      <div className="em-card" style={{ flex: '1 1 auto', minWidth: 0, border: `1px solid ${isAgent ? `color-mix(in srgb, ${accent} 28%, var(--border))` : 'var(--border)'}`, borderRadius: 14, overflow: 'hidden', background: '#fff' }}>
        {/* Who, when, and which way it went */}
        <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--border)', background: isAgent ? `color-mix(in srgb, ${accent} 6%, #fff)` : 'var(--canvas)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, fontWeight: 700, color: isAgent ? accent : '#15803d', background: isAgent ? `color-mix(in srgb, ${accent} 12%, #fff)` : '#ecfdf3', borderRadius: 20, padding: '2px 8px', flexShrink: 0 }}>
              {isAgent ? <SentPlane /> : <InboxIn />}
              {isAgent ? (isAuto ? 'Email sent automatically' : 'Email sent') : 'Email received'}
            </span>
            {isAgent && <VoiceTag kind={(msg as any)?.metadata?.voice} />}
            {when && <span style={{ marginLeft: 'auto', fontSize: 11.5, color: 'var(--slate)', whiteSpace: 'nowrap' }} title={isAgent ? 'Sent' : 'Received'}>{when}</span>}
          </div>
          {isAgent ? (
            <p style={{ margin: '6px 0 0', fontSize: 12.5, color: 'var(--slate)', lineHeight: 1.45, overflowWrap: 'anywhere' }}>
              Sent from <b style={{ color: 'var(--ink)', fontWeight: 600 }}>{businessName || fromName}</b>{fromEmail ? ` <${fromEmail}>` : ''}
              {to ? <> to <span style={{ color: 'var(--ink)' }}>{to}</span></> : null}
              <span> · replies come back to this inbox</span>
            </p>
          ) : (
            <div style={{ marginTop: 6, minWidth: 0 }}>
              <p style={{ margin: 0, fontSize: 13.5, fontWeight: 700, color: 'var(--ink)', overflowWrap: 'anywhere' }}>
                {fromName}{fromEmail && fromName !== fromEmail ? <span style={{ fontWeight: 400, color: 'var(--slate)', fontSize: 12.5 }}>{` <${fromEmail}>`}</span> : null}
              </p>
              {to && <p style={{ margin: '2px 0 0', fontSize: 12, color: 'var(--slate)', overflowWrap: 'anywhere' }}>to {to}</p>}
            </div>
          )}
          {cc && <p style={{ margin: '2px 0 0', fontSize: 12, color: 'var(--slate)', overflowWrap: 'anywhere' }}>Cc {cc}</p>}
        </div>

        {/* Subject */}
        {subject && (
          <div style={{ padding: '10px 14px 0' }}>
            <p style={{ margin: 0, fontSize: 14, fontWeight: 700, color: 'var(--ink)', overflowWrap: 'anywhere' }}>{subject}</p>
          </div>
        )}

        {/* Body */}
        <div ref={bodyRef} style={{ padding: '8px 14px 14px' }}>
          {(showFull || !text) && html ? (
            // The full formatted email, in a sandboxed frame: no scripts and
            // not same-origin, so nothing in a customer's email can touch the
            // inbox even if it got past the sanitiser (which runs again here,
            // for rows stored before it). Drag the corner to make it taller.
            <div style={{ resize: 'vertical', overflow: 'hidden', height: estimateEmailHeight(html, bodyW - 28), minHeight: 120, maxHeight: '85vh', border: '1px solid var(--border)', borderRadius: 10, background: '#fff' }}>
              <iframe title={`Email: ${subject || 'message'}`} sandbox="allow-popups allow-popups-to-escape-sandbox" referrerPolicy="no-referrer"
                srcDoc={emailFrameDoc(html)} style={{ width: '100%', height: '100%', border: 'none', display: 'block' }} />
            </div>
          ) : text ? (
            <p style={{ margin: 0, fontSize: 13.5, lineHeight: 1.55, color: 'var(--ink)', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{text}</p>
          ) : pending ? (
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: '9px 11px', border: '1px dashed var(--border)', borderRadius: 10, background: 'var(--canvas)' }}>
              <span style={{ color: 'var(--slate)', marginTop: 1 }}>{ico(<><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></>, 14)}</span>
              <div style={{ minWidth: 0 }}>
                <p style={{ margin: 0, fontSize: 13, color: 'var(--ink)', fontWeight: 600 }}>We couldn’t load this email’s text yet.</p>
                {pendingWhy && <p style={{ margin: '2px 0 0', fontSize: 12, color: 'var(--slate)', overflowWrap: 'anywhere' }}>Why: {pendingWhy}.</p>}
              </div>
            </div>
          ) : !attachments.length && !html ? (
            <p style={{ margin: 0, fontSize: 13, color: 'var(--slate)', fontStyle: 'italic' }}>This email has no message text.</p>
          ) : null}

          {/* Attachments */}
          {attachments.length > 0 && (
            <div style={{ marginTop: 12, display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              <style>{`.em-media{transition:border-color .18s ease,box-shadow .18s ease,transform .18s cubic-bezier(.2,.8,.2,1)}.em-media:hover{border-color:#c9d6e8;box-shadow:0 2px 10px rgba(15,23,42,.07)}.em-media:active{transform:scale(.98)}`}</style>
              {attachments.map((a, i) => {
                const dl = a._sent ? a.url : emailAttachmentUrl(msg, a, attToken)
                const kind = a._sent && (a.kind === 'image' || a.kind === 'video') ? a.kind : emailAttachmentKind(a)
                if (dl && kind && onOpenMedia) {
                  return (
                    <button key={i} type="button" className="em-media" onClick={() => onOpenMedia(a._sent ? { url: a.url } : { index: a._i })} title={`View ${a.name || 'attachment'}`}
                      style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '5px 11px 5px 5px', borderRadius: 9, border: '1px solid var(--border)', background: 'var(--canvas)', color: 'var(--ink)', fontSize: 12.5, maxWidth: 240, cursor: 'zoom-in', font: 'inherit' }}>
                      <span style={{ position: 'relative', width: 32, height: 32, borderRadius: 6, overflow: 'hidden', background: '#e8edf4', flexShrink: 0 }}>
                        {kind === 'image'
                          ? <img src={a.thumbUrl ? toPublicUrl(a.thumbUrl) : sizedImageUrl(dl, 32)} onError={sizedImageFallback(dl)} alt="" loading="lazy" decoding="async" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                          : <>
                              <video src={dl} preload="metadata" muted style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                              <span style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', background: 'rgba(0,0,0,0.25)' }}>
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><polygon points="6 4 20 12 6 20 6 4"/></svg>
                              </span>
                            </>}
                      </span>
                      <span style={{ fontSize: 12.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.name}</span>
                      {a.size ? <span style={{ color: 'var(--slate)', fontSize: 11, flexShrink: 0 }}>{fmtBytes(a.size)}</span> : null}
                    </button>
                  )
                }
                const isPdf = /pdf/i.test(String(a.type || a.mime || a.mimeType || '')) || /\.pdf$/i.test(String(a.name || ''))
                const chip = (
                  <span className="em-media" title={dl ? `Open ${a.name || 'attachment'}` : a.name} style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: isPdf ? '5px 11px 5px 5px' : '7px 11px', borderRadius: 9, border: '1px solid var(--border)', background: 'var(--canvas)', color: 'var(--ink)', fontSize: 12.5, maxWidth: 280 }}>
                    {isPdf
                      ? <span aria-hidden style={{ width: 32, height: 32, borderRadius: 6, background: '#fee2e2', color: '#dc2626', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 9.5, fontWeight: 800, letterSpacing: '.02em', flexShrink: 0 }}>PDF</span>
                      : <Paperclip />}
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.name}</span>
                    {a.size ? <span style={{ color: 'var(--slate)', fontSize: 11 }}>{fmtBytes(a.size)}</span> : null}
                    {dl && <Download />}
                  </span>
                )
                return dl
                  ? <a key={i} href={dl} target="_blank" rel="noopener noreferrer" style={{ textDecoration: 'none' }}>{chip}</a>
                  : <span key={i}>{chip}</span>
              })}
            </div>
          )}

          {/* The older email this one replies to, collapsed */}
          {quoted && !showFull && (
            <div style={{ marginTop: 12 }}>
              <button type="button" onClick={() => setShowQuoted(v => !v)} aria-expanded={showQuoted}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'none', border: '1px solid var(--border)', borderRadius: 8, padding: '5px 10px', color: 'var(--slate)', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
                <Chevron open={showQuoted} />
                {isAgent ? 'Earlier messages' : quotedOn ? `Replying to your email from ${quotedOn}` : 'Replying to your earlier email'}
              </button>
              {showQuoted && (
                <div style={{ marginTop: 8, paddingLeft: 12, borderLeft: '3px solid var(--border)' }}>
                  <p style={{ margin: 0, fontSize: 12.5, lineHeight: 1.5, color: 'var(--slate)', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{quoted}</p>
                </div>
              )}
            </div>
          )}

          {/* Formatted version */}
          {html && text && (
            <button type="button" onClick={() => setShowFull(v => !v)}
              style={{ marginTop: 12, marginLeft: quoted && !showFull ? 0 : undefined, display: 'block', background: '#eef4ff', border: 'none', borderRadius: 8, padding: '7px 12px', color: '#2563eb', fontSize: 12.5, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
              {showFull ? 'Show less' : 'View full message'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
