'use client'

// Above the inbox composer on a WhatsApp thread: whether WhatsApp can send,
// a WhatsApp opt-out, and the 24-hour customer service window. Inside the
// window the composer sends free text and files as usual; once it has closed,
// WhatsApp only takes an approved template, so this offers the business's
// approved utility templates with their variables to fill in
// (/api/whatsapp/window, /api/whatsapp/send).

import { useCallback, useEffect, useMemo, useState } from 'react'
import { authFetch } from '@/lib/auth-fetch'
import { fillTemplate, serviceWindow, windowLeftWords } from '@/lib/whatsapp-core'
import WhatsAppGlyph from '@/components/WhatsAppGlyph'

type Tpl = { id: string; name: string; language: string; category: string; body: string; variables: string[]; labels: string[] }
type WindowInfo = { canSend: boolean; reason: string | null; reasonText: string | null; hasNumber: boolean; optOut: string; window: { open: boolean; closesAt: string | null; lastInboundAt: string | null }; templates: Tpl[] }

const bar = (bg: string, border: string): React.CSSProperties => ({ display: 'flex', alignItems: 'flex-start', gap: 9, margin: '0 0 8px', padding: '9px 12px', borderRadius: 10, background: bg, border: `1px solid ${border}`, flexWrap: 'wrap' })
const inputStyle: React.CSSProperties = { width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)', fontSize: 13, boxSizing: 'border-box', fontFamily: 'inherit', background: '#fff' }

export default function WhatsAppComposerBar({ conversationId, refreshKey, contactName, agentName, onSent, onError }: {
  conversationId: string
  refreshKey?: string | null            // the latest customer message id: a new one reopens the window
  contactName?: string | null
  agentName: string
  onSent: () => void | Promise<void>
  onError: (text: string) => void
}) {
  const [info, setInfo] = useState<WindowInfo | null>(null)
  const [now, setNow] = useState(() => Date.now())
  const [tplId, setTplId] = useState('')
  const [vars, setVars] = useState<Record<string, string>>({})
  const [sending, setSending] = useState(false)

  const load = useCallback(async () => {
    try {
      const r = await authFetch(`/api/whatsapp/window?conversationId=${encodeURIComponent(conversationId)}`)
      if (r.ok) setInfo(await r.json())
    } catch {}
  }, [conversationId])
  useEffect(() => { setInfo(null); setTplId(''); setVars({}); load() }, [conversationId, refreshKey, load])
  // The countdown, and the moment the window closes, without a reload.
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 30_000); return () => clearInterval(t) }, [])

  const win = useMemo(() => info ? serviceWindow(info.window.lastInboundAt, now) : null, [info, now])
  const tpl = info?.templates.find(t => t.id === tplId) || null
  const filled = tpl ? fillTemplate(tpl.body, vars) : null

  const pick = (id: string) => {
    setTplId(id)
    const t = info?.templates.find(x => x.id === id)
    const first = String(contactName || '').trim().split(/\s+/)[0] || ''
    // A variable labelled as the customer's name starts with their first name.
    const pre: Record<string, string> = {}
    t?.variables.forEach((v, i) => { if (first && /name/i.test(t.labels[i] || '') && !/^\+?\d/.test(first)) pre[v] = first })
    setVars(pre)
  }

  const send = async () => {
    if (!tpl || !filled || filled.missing.length || sending) return
    setSending(true)
    try {
      const r = await authFetch('/api/whatsapp/send', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ conversationId, templateId: tpl.id, variables: vars, agentName }) })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) { onError(d.error || 'The template wasn’t sent.'); return }
      setTplId(''); setVars({})
      await onSent()
    } catch (e: any) { onError(e?.message || 'The template wasn’t sent.') }
    finally { setSending(false) }
  }

  if (!info || !win) return null
  if (!info.canSend) return (
    <div style={bar('#fffbeb', '#fde68a')}>
      <WhatsAppGlyph size={16} color="#b45309" />
      <span style={{ flex: 1, minWidth: 0, fontSize: 12.5, color: '#92400e', fontWeight: 600, lineHeight: 1.4 }}>{info.reasonText || 'WhatsApp can’t send for this business right now.'}</span>
    </div>
  )
  if (info.optOut !== 'ok') return (
    <div style={bar('#fef2f2', '#fecaca')}>
      <WhatsAppGlyph size={16} color="#b91c1c" />
      <span style={{ flex: 1, minWidth: 0, fontSize: 12.5, color: '#991b1b', fontWeight: 600, lineHeight: 1.4 }}>
        {info.optOut === 'opted_out' ? 'This customer replied STOP on WhatsApp, so they can’t be messaged there until they send START.' : 'Couldn’t check whether this customer opted out of WhatsApp, so sending is paused. Try again shortly.'}
      </span>
    </div>
  )
  if (win.open) return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 7, margin: '0 0 6px', fontSize: 11.5, color: '#15803d', fontWeight: 600 }}>
      <WhatsAppGlyph size={13} color="#16a34a" />
      <span>24-hour window open · {windowLeftWords(win.msLeft)}</span>
    </div>
  )
  return (
    <div style={{ ...bar('#fffbeb', '#fde68a'), flexDirection: 'column', alignItems: 'stretch' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <WhatsAppGlyph size={16} color="#b45309" />
        <span style={{ flex: 1, minWidth: 0, fontSize: 12.5, color: '#92400e', fontWeight: 700, lineHeight: 1.4 }}>The 24-hour window has closed — send a template</span>
      </div>
      <span style={{ fontSize: 12, color: '#92400e', lineHeight: 1.45 }}>
        {win.lastInboundAt ? 'WhatsApp only allows free messages within 24 hours of the customer’s last message.' : 'The customer hasn’t messaged on WhatsApp yet, so it starts with an approved template.'} Once they reply, you can write freely again.
      </span>
      {info.templates.length === 0 ? (
        <span style={{ fontSize: 12, color: '#92400e', fontWeight: 600 }}>No approved templates yet. Ask Colvy to add one for your business.</span>
      ) : (
        <>
          <select value={tplId} onChange={e => pick(e.target.value)} style={inputStyle} aria-label="WhatsApp template">
            <option value="">Choose a template…</option>
            {info.templates.map(t => <option key={t.id} value={t.id}>{t.name.replace(/_/g, ' ')} ({t.language})</option>)}
          </select>
          {tpl && (
            <>
              {tpl.variables.length > 0 && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 8 }}>
                  {tpl.variables.map((v, i) => (
                    <label key={v} style={{ minWidth: 0 }}>
                      <span style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#92400e', marginBottom: 3 }}>{tpl.labels[i] || `Variable ${v}`}</span>
                      <input value={vars[v] || ''} onChange={e => setVars(x => ({ ...x, [v]: e.target.value }))} maxLength={200} style={inputStyle} />
                    </label>
                  ))}
                </div>
              )}
              <div style={{ padding: '8px 10px', borderRadius: 8, background: '#fff', border: '1px solid #fde68a', fontSize: 13, color: 'var(--ink)', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{filled?.text}</div>
              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <button type="button" onClick={send} disabled={sending || !!filled?.missing.length}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 8, border: 'none', background: '#16a34a', color: '#fff', fontSize: 12.5, fontWeight: 700, cursor: sending || filled?.missing.length ? 'not-allowed' : 'pointer', opacity: sending || filled?.missing.length ? 0.6 : 1 }}>
                  <WhatsAppGlyph size={14} color="#fff" />{sending ? 'Sending…' : 'Send template'}
                </button>
              </div>
            </>
          )}
        </>
      )}
    </div>
  )
}
