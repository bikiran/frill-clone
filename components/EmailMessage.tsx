'use client'

import { useState } from 'react'

// Coax-style email card. Emails used to render as one flattened blob of
// stripped text (with CSS leaking in). This shows the real thing: From/To/Cc,
// subject, the formatted body, quoted history collapsed behind "View full
// message", and attachments with a download.

const ico = (path: React.ReactNode, size = 14) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>{path}</svg>
)
const ArrowIn = () => ico(<><line x1="7" y1="17" x2="17" y2="7"/><polyline points="7 7 17 7 17 17"/></>, 13)
const ArrowOut = () => ico(<><line x1="17" y1="7" x2="7" y2="17"/><polyline points="17 17 17 7 7 7"/></>, 13)
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

export default function EmailMessage({ msg, agentColor }: { msg: any; agentColor?: string }) {
  const [showFull, setShowFull] = useState(false)
  const isAgent = msg.sender_type === 'agent'

  const from = firstAddress(msg.email_from) || { name: msg.sender_name || '', email: msg.sender_email || '' }
  const fromEmail = from.email || msg.sender_email || ''
  const fromName = from.name || msg.sender_name || fromEmail
  const to = msg.email_to || ''
  const cc = msg.email_cc || ''
  const subject = msg.email_subject || ''
  const html = msg.email_html || ''
  const quoted = msg.email_quoted || ''
  const attachments: any[] = Array.isArray(msg.email_attachments) ? msg.email_attachments : []

  const fmtBytes = (n: number) => n > 1048576 ? `${(n / 1048576).toFixed(1)} MB` : n > 1024 ? `${Math.round(n / 1024)} KB` : `${n} B`

  return (
    <div style={{ maxWidth: 640, margin: '8px auto', width: '100%' }}>
      <div style={{ border: '1px solid #e3e9f2', borderRadius: 14, overflow: 'hidden', background: '#fff' }}>
        {/* Address bar */}
        <div style={{ padding: '12px 16px', borderBottom: '1px solid #eef2f7', background: '#f9fbfd' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: to ? 5 : 0 }}>
            <span style={{ color: isAgent ? (agentColor || '#2563eb') : '#15803d', display: 'flex' }}>
              {isAgent ? <ArrowOut /> : <ArrowIn />}
            </span>
            <span style={{ fontSize: 12.5, color: 'var(--slate)' }}>From</span>
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {fromName}{fromName !== fromEmail && fromEmail ? ` <${fromEmail}>` : ''}
            </span>
          </div>
          {to && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ width: 13 }} />
              <span style={{ fontSize: 12.5, color: 'var(--slate)' }}>To</span>
              <span style={{ fontSize: 12.5, color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{to}</span>
            </div>
          )}
          {cc && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 3 }}>
              <span style={{ width: 13 }} />
              <span style={{ fontSize: 12.5, color: 'var(--slate)' }}>Cc</span>
              <span style={{ fontSize: 12.5, color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{cc}</span>
            </div>
          )}
        </div>

        {/* Subject */}
        {subject && (
          <div style={{ padding: '10px 16px 0' }}>
            <p style={{ margin: 0, fontSize: 14, fontWeight: 700, color: 'var(--ink)' }}>{subject}</p>
          </div>
        )}

        {/* Body */}
        <div style={{ padding: '10px 16px 14px' }}>
          {showFull && html ? (
            // Full formatted email (sanitised server-side).
            <div style={{ fontSize: 13.5, lineHeight: 1.55, color: 'var(--ink)', overflowX: 'auto' }}
              dangerouslySetInnerHTML={{ __html: html }} />
          ) : (
            <p style={{ margin: 0, fontSize: 13.5, lineHeight: 1.55, color: 'var(--ink)', whiteSpace: 'pre-wrap' }}>
              {cleanPreview(msg.content)}
            </p>
          )}

          {/* Attachments */}
          {attachments.length > 0 && (
            <div style={{ marginTop: 12, display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {attachments.map((a, i) => {
                const dl = a.url || (msg.gmail_message_id && a.attachmentId
                  ? `/api/email/attachment?messageId=${encodeURIComponent(msg.gmail_message_id)}&attachmentId=${encodeURIComponent(a.attachmentId)}&name=${encodeURIComponent(a.name || 'file')}&conversationId=${encodeURIComponent(msg.conversation_id)}`
                  : null)
                const chip = (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '7px 11px', borderRadius: 9, border: '1px solid #e3e9f2', background: '#f9fbfd', color: 'var(--ink)', fontSize: 12.5, maxWidth: 240 }}>
                    <Paperclip />
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

          {/* Expand / collapse */}
          {(html || quoted) && (
            <button type="button" onClick={() => setShowFull(v => !v)}
              style={{ marginTop: 12, background: '#eef4ff', border: 'none', borderRadius: 8, padding: '7px 12px', color: '#2563eb', fontSize: 12.5, fontWeight: 600, cursor: 'pointer' }}>
              {showFull ? 'Show less' : 'View full message'}
            </button>
          )}

          {/* Quoted history (plain-text fallback when there's no HTML) */}
          {showFull && !html && quoted && (
            <div style={{ marginTop: 10, paddingLeft: 12, borderLeft: '3px solid #e3e9f2' }}>
              <p style={{ margin: 0, fontSize: 12.5, lineHeight: 1.5, color: 'var(--slate)', whiteSpace: 'pre-wrap' }}>{quoted}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
