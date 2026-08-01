'use client'

import { useState, useEffect, useRef } from 'react'
import { uploadDirect } from '@/lib/upload-attachment'
import { supabase } from '@/lib/supabase'

// Coax-style email composer: From (the mailbox) · To · Cc · Subject · Signature
// · body. The signature is chosen from the company's saved library (or "None"),
// and new ones can be added inline — matching the Coax "Signature ▾ / + Add" UX.

interface Sig { id: string; name: string; body: string; is_default?: boolean }

interface Props {
  conversationId: string
  companyId: string | null
  toEmail: string
  defaultSubject: string
  fromLabel?: string           // "Roxy Aquarium <aquarium.roxy@gmail.com>"
  signature?: string | null    // the mailbox's own signature (fallback default)
  agentName?: string
  onSent: () => void
}

export default function EmailComposer({
  conversationId, companyId, toEmail, defaultSubject, fromLabel, signature, agentName, onSent,
}: Props) {
  const [to, setTo] = useState(toEmail)
  const [cc, setCc] = useState('')
  const [showCc, setShowCc] = useState(false)
  const [bcc, setBcc] = useState('')
  const [showBcc, setShowBcc] = useState(false)
  const [subject, setSubject] = useState(defaultSubject)
  const [sending, setSending] = useState(false)
  const [err, setErr] = useState('')

  // Rich-text body (contentEditable). We keep an html snapshot in state to
  // drive the empty/placeholder + send-enabled checks, and read the live DOM on
  // send so formatting is preserved.
  const editorRef = useRef<HTMLDivElement>(null)
  const [bodyHtml, setBodyHtml] = useState('')
  const [showEmoji, setShowEmoji] = useState(false)
  const syncBody = () => setBodyHtml(editorRef.current?.innerHTML || '')
  const bodyText = () => (editorRef.current?.innerText || '').trim()
  const exec = (cmd: string, val?: string) => { editorRef.current?.focus(); document.execCommand(cmd, false, val); syncBody() }
  const insertAtCursor = (text: string) => { editorRef.current?.focus(); document.execCommand('insertText', false, text); syncBody() }
  const EMOJIS = ['😀', '😊', '🙏', '👍', '🎉', '✅', '❤️', '🐟', '📦', '⭐', '😅', '🙌']

  // Insert an image inline (uploaded to storage, referenced by URL so it renders
  // in the customer's email client).
  const imgInputRef = useRef<HTMLInputElement>(null)
  const [imgBusy, setImgBusy] = useState(false)
  const onPickImage = async (file: File | null) => {
    if (!file) return
    setImgBusy(true); setErr('')
    try {
      const url = await uploadDirect(file, `email-inline/${companyId || 'x'}`, file.name)
      if (!url) throw new Error('Upload failed')
      editorRef.current?.focus()
      document.execCommand('insertHTML', false, `<img src="${url}" alt="${(file.name || '').replace(/"/g, '')}" style="max-width:100%;border-radius:8px" /><br>`)
      syncBody()
    } catch (e: any) { setErr(e.message || 'Could not add image') }
    finally { setImgBusy(false); if (imgInputRef.current) imgInputRef.current.value = '' }
  }

  // Templates (saved quick responses) — insert a canned reply into the body.
  const [templates, setTemplates] = useState<{ id: string; title: string; body: string; shortcut?: string }[]>([])
  const [showTemplates, setShowTemplates] = useState(false)
  useEffect(() => {
    if (!companyId) return
    ;(async () => {
      try {
        const { data } = await (supabase as any).from('quick_responses').select('*').eq('company_id', companyId).order('created_at', { ascending: true })
        setTemplates(data || [])
      } catch {}
    })()
  }, [companyId])
  const insertTemplate = (t: { body?: string }) => {
    const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    editorRef.current?.focus()
    document.execCommand('insertHTML', false, esc(t.body || '').replace(/\n/g, '<br>') + '<br>')
    syncBody(); setShowTemplates(false)
  }

  // AI assist: rewrite the current draft more clearly/professionally.
  const [aiBusy, setAiBusy] = useState(false)
  const improveWithAI = async () => {
    const text = bodyText()
    if (!text) { setErr('Write a draft first, then improve it with AI'); return }
    setAiBusy(true); setErr('')
    try {
      const res = await fetch('/api/ai', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ companyId, task: 'improve', text, tone: 'professional' }),
      })
      const d = await res.json()
      if (!res.ok || !d.result) throw new Error(d.error || 'AI could not help right now')
      if (editorRef.current) {
        editorRef.current.innerHTML = String(d.result).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>')
        syncBody()
      }
    } catch (e: any) { setErr(e.message || 'AI could not help right now') }
    finally { setAiBusy(false) }
  }

  // ── Signatures ─────────────────────────────────────────────────────────────
  // 'mailbox' = the mailbox's built-in signature; '' = none; otherwise a library id.
  const [sigs, setSigs] = useState<Sig[]>([])
  const [sigId, setSigId] = useState<string>(signature ? 'mailbox' : '')
  const [addingSig, setAddingSig] = useState(false)
  const [newSigName, setNewSigName] = useState('')
  const [newSigBody, setNewSigBody] = useState('')
  const [savingSig, setSavingSig] = useState(false)

  useEffect(() => { setTo(toEmail) }, [toEmail])
  useEffect(() => { setSubject(defaultSubject) }, [defaultSubject])

  const loadSigs = async () => {
    if (!companyId) return
    try {
      const res = await fetch(`/api/email/accounts?companyId=${companyId}`)
      const d = await res.json()
      const list: Sig[] = d.signatures || []
      setSigs(list)
      // Prefer a library default; otherwise keep the mailbox signature if present.
      const def = list.find(s => s.is_default)
      if (def) setSigId(def.id)
      else if (!signature) setSigId('')
    } catch {}
  }
  useEffect(() => { loadSigs() }, [companyId])

  const selectedSigBody = (): string => {
    if (sigId === 'mailbox') return signature || ''
    if (!sigId) return ''
    return sigs.find(s => s.id === sigId)?.body || ''
  }

  const saveNewSig = async () => {
    if (!newSigName.trim() || !newSigBody.trim() || !companyId) return
    setSavingSig(true)
    try {
      await fetch('/api/email/accounts', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ companyId, action: 'save_signature', name: newSigName.trim(), sigBody: newSigBody, is_default: sigs.length === 0 }),
      })
      setNewSigName(''); setNewSigBody(''); setAddingSig(false)
      await loadSigs()
      // Select the one we just made (match by name).
      // loadSigs may set a default; re-select the new one after it lands.
      setTimeout(() => setSigs(cur => { const made = cur.find(s => s.name === newSigName.trim()); if (made) setSigId(made.id); return cur }), 0)
    } catch (e: any) { setErr(e.message || 'Could not save signature') }
    finally { setSavingSig(false) }
  }

  const send = async () => {
    if (!to.trim()) { setErr('Add a recipient'); return }
    const text = bodyText()
    if (!text) { setErr('Write a message'); return }
    setSending(true); setErr('')
    try {
      const res = await fetch('/api/email/reply', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          conversationId, to: to.trim(), cc: cc.trim() || null, bcc: bcc.trim() || null,
          subject: subject.trim() || defaultSubject,
          content: text,                      // plain-text version (preview / fallback)
          html: editorRef.current?.innerHTML || '',
          agentName,
          signature: selectedSigBody(),       // explicit — '' means no signature
        }),
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error || 'Send failed')
      if (editorRef.current) editorRef.current.innerHTML = ''
      setBodyHtml(''); setCc(''); setShowCc(false); setBcc(''); setShowBcc(false)
      onSent()
    } catch (e: any) {
      setErr(e.message || 'Could not send')
    } finally { setSending(false) }
  }

  const field: React.CSSProperties = { flex: 1, border: 'none', outline: 'none', fontSize: 13, background: 'transparent', color: 'var(--ink)', minWidth: 0 }
  const rowLabel: React.CSSProperties = { fontSize: 12, color: 'var(--slate)', width: 54, flexShrink: 0 }
  const row: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderBottom: '1px solid var(--border)' }

  const sigPreview = selectedSigBody()

  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: 12, background: '#fff', overflow: 'hidden' }}>
      <div style={{ ...row, background: 'var(--canvas)' }}>
        <span style={rowLabel}>From</span>
        <span style={{ ...field, color: 'var(--slate)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{fromLabel || 'Your mailbox'}</span>
      </div>
      <div style={row}>
        <span style={rowLabel}>To</span>
        <input value={to} onChange={e => setTo(e.target.value)} style={field} placeholder="customer@example.com" />
        {(!showCc || !showBcc) && (
          <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
            {!showCc && (
              <button type="button" onClick={() => setShowCc(true)}
                style={{ background: 'none', border: 'none', color: '#2563eb', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                Cc
              </button>
            )}
            {!showBcc && (
              <button type="button" onClick={() => setShowBcc(true)}
                style={{ background: 'none', border: 'none', color: '#2563eb', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                Bcc
              </button>
            )}
          </div>
        )}
      </div>
      {showCc && (
        <div style={row}>
          <span style={rowLabel}>Cc</span>
          <input value={cc} onChange={e => setCc(e.target.value)} style={field} placeholder="cc@example.com, another@example.com" />
        </div>
      )}
      {showBcc && (
        <div style={row}>
          <span style={rowLabel}>Bcc</span>
          <input value={bcc} onChange={e => setBcc(e.target.value)} style={field} placeholder="bcc@example.com" />
        </div>
      )}
      <div style={row}>
        <span style={rowLabel}>Subject</span>
        <input value={subject} onChange={e => setSubject(e.target.value)} style={field} placeholder="Subject" />
      </div>

      {/* Signature selector + inline add (Coax-style). */}
      <div style={row}>
        <span style={rowLabel}>Signature</span>
        <select value={sigId} onChange={e => setSigId(e.target.value)}
          style={{ ...field, cursor: 'pointer', flex: 'unset', maxWidth: 220 }}>
          <option value="">No signature</option>
          {signature && <option value="mailbox">Mailbox default</option>}
          {sigs.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        <button type="button" onClick={() => { setAddingSig(v => !v); setErr('') }}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 4, border: '1px solid var(--border)', background: '#fff', color: 'var(--ink)', borderRadius: 8, padding: '5px 10px', fontSize: 12, fontWeight: 700, cursor: 'pointer', flexShrink: 0 }}>
          + Add
        </button>
      </div>
      {addingSig && (
        <div style={{ padding: '10px 12px', borderBottom: '1px solid var(--border)', background: 'var(--canvas)', display: 'flex', flexDirection: 'column', gap: 8 }}>
          <input value={newSigName} onChange={e => setNewSigName(e.target.value)} placeholder="Signature name (e.g. Roxy — Sales)"
            style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)', fontSize: 13, outline: 'none' }} />
          <textarea value={newSigBody} onChange={e => setNewSigBody(e.target.value)} rows={3} placeholder={'Kind regards,\nRoxy Aquarium'}
            style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)', fontSize: 13, outline: 'none', resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.5 }} />
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button type="button" onClick={() => { setAddingSig(false); setNewSigName(''); setNewSigBody('') }}
              style={{ border: 'none', background: 'none', color: 'var(--slate)', fontSize: 12.5, fontWeight: 700, cursor: 'pointer' }}>Cancel</button>
            <button type="button" onClick={saveNewSig} disabled={savingSig || !newSigName.trim() || !newSigBody.trim()}
              style={{ border: 'none', background: 'var(--coral)', color: '#fff', borderRadius: 8, padding: '7px 14px', fontSize: 12.5, fontWeight: 700, cursor: 'pointer', opacity: (savingSig || !newSigName.trim() || !newSigBody.trim()) ? 0.6 : 1 }}>{savingSig ? 'Saving…' : 'Save signature'}</button>
          </div>
        </div>
      )}

      {/* Rich-text formatting toolbar */}
      <style>{`.email-rte[data-empty="true"]:before{content:attr(data-ph);color:#9ca3af;pointer-events:none;}`}</style>
      <div style={{ display: 'flex', alignItems: 'center', gap: 2, padding: '6px 8px', borderBottom: '1px solid var(--border)', flexWrap: 'wrap', position: 'relative' }}>
        {([
          ['bold', 'B', { fontWeight: 800 }],
          ['italic', 'i', { fontStyle: 'italic', fontFamily: 'Georgia, serif' }],
          ['underline', 'U', { textDecoration: 'underline' }],
          ['strikeThrough', 'S', { textDecoration: 'line-through' }],
        ] as const).map(([cmd, label, st]) => (
          <button key={cmd} type="button" title={cmd} onMouseDown={e => { e.preventDefault(); exec(cmd) }}
            style={{ width: 28, height: 28, borderRadius: 6, border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--ink)', fontSize: 14, ...st }}>{label}</button>
        ))}
        <span style={{ width: 1, height: 18, background: 'var(--border)', margin: '0 4px' }} />
        <button type="button" title="Bullet list" onMouseDown={e => { e.preventDefault(); exec('insertUnorderedList') }}
          style={{ width: 28, height: 28, borderRadius: 6, border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--slate)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>
        </button>
        <button type="button" title="Numbered list" onMouseDown={e => { e.preventDefault(); exec('insertOrderedList') }}
          style={{ width: 28, height: 28, borderRadius: 6, border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--slate)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="10" y1="6" x2="21" y2="6"/><line x1="10" y1="12" x2="21" y2="12"/><line x1="10" y1="18" x2="21" y2="18"/><path d="M4 6h1v4"/><path d="M4 10h2"/><path d="M6 18H4c0-1 2-2 2-3s-1-1.5-2-1"/></svg>
        </button>
        <span style={{ width: 1, height: 18, background: 'var(--border)', margin: '0 4px' }} />
        <button type="button" title="Emoji" onMouseDown={e => { e.preventDefault(); setShowEmoji(v => !v) }}
          style={{ width: 28, height: 28, borderRadius: 6, border: 'none', background: showEmoji ? 'var(--peach)' : 'transparent', cursor: 'pointer', color: 'var(--slate)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/></svg>
        </button>
        <button type="button" title="Insert image" disabled={imgBusy} onMouseDown={e => { e.preventDefault(); imgInputRef.current?.click() }}
          style={{ width: 28, height: 28, borderRadius: 6, border: 'none', background: 'transparent', cursor: imgBusy ? 'wait' : 'pointer', color: 'var(--slate)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg>
        </button>
        <input ref={imgInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={e => onPickImage(e.target.files?.[0] || null)} />
        {templates.length > 0 && (
          <button type="button" title="Insert a saved template" onMouseDown={e => { e.preventDefault(); setShowTemplates(v => !v) }}
            style={{ width: 28, height: 28, borderRadius: 6, border: 'none', background: showTemplates ? 'var(--peach)' : 'transparent', cursor: 'pointer', color: 'var(--slate)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
          </button>
        )}
        {showTemplates && templates.length > 0 && (
          <div style={{ position: 'absolute', top: '100%', left: 8, zIndex: 20, background: '#fff', border: '1px solid var(--border)', borderRadius: 10, boxShadow: '0 10px 30px rgba(0,0,0,0.12)', padding: 6, width: 260, maxHeight: 260, overflowY: 'auto' }}>
            <p style={{ margin: '2px 8px 6px', fontSize: 11, fontWeight: 800, color: 'var(--slate)', textTransform: 'uppercase' }}>Templates</p>
            {templates.map(t => (
              <button key={t.id} type="button" onMouseDown={e => { e.preventDefault(); insertTemplate(t) }}
                style={{ display: 'block', width: '100%', textAlign: 'left', border: 'none', background: 'transparent', cursor: 'pointer', padding: '7px 8px', borderRadius: 8 }}>
                <span style={{ display: 'block', fontSize: 13, fontWeight: 700, color: 'var(--ink)' }}>{t.title || t.shortcut || 'Template'}</span>
                <span style={{ display: 'block', fontSize: 11.5, color: 'var(--slate)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{(t.body || '').slice(0, 60)}</span>
              </button>
            ))}
          </div>
        )}
        {showEmoji && (
          <div style={{ position: 'absolute', top: '100%', left: 8, zIndex: 20, background: '#fff', border: '1px solid var(--border)', borderRadius: 10, boxShadow: '0 10px 30px rgba(0,0,0,0.12)', padding: 8, display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 2 }}>
            {EMOJIS.map(em => (
              <button key={em} type="button" onMouseDown={e => { e.preventDefault(); insertAtCursor(em); setShowEmoji(false) }}
                style={{ width: 30, height: 30, border: 'none', background: 'transparent', cursor: 'pointer', fontSize: 18, borderRadius: 6 }}>{em}</button>
            ))}
          </div>
        )}
      </div>
      <div ref={editorRef} contentEditable suppressContentEditableWarning onInput={syncBody}
        className="email-rte" data-ph="Write your reply…" data-empty={(!bodyHtml || bodyHtml === '<br>') ? 'true' : 'false'}
        style={{ minHeight: 130, maxHeight: 300, overflowY: 'auto', outline: 'none', padding: '12px', fontSize: 13.5, lineHeight: 1.55, color: 'var(--ink)' }} />

      {sigPreview && (
        <div style={{ padding: '0 12px 8px' }}>
          <p style={{ margin: 0, fontSize: 11.5, color: 'var(--slate)', borderTop: '1px dashed var(--border)', paddingTop: 8, whiteSpace: 'pre-wrap' }}>
            {sigPreview}
          </p>
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 12px', borderTop: '1px solid var(--border)', background: 'var(--canvas)' }}>
        <span style={{ fontSize: 12, color: err ? '#dc2626' : 'var(--slate)' }}>
          {err || (sigPreview ? 'Signature will be appended' : ' ')}
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button type="button" onClick={improveWithAI} disabled={aiBusy} title="Improve this draft with AI"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '8px 12px', borderRadius: 9, border: '1px solid #e9d5ff', background: '#faf5ff', color: '#7c3aed', fontSize: 12.5, fontWeight: 700, cursor: aiBusy ? 'wait' : 'pointer' }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z"/></svg>
            {aiBusy ? 'Improving…' : 'AI improve'}
          </button>
          <button type="button" onClick={send} disabled={sending}
          style={{ padding: '9px 20px', borderRadius: 9, border: 'none', background: 'var(--coral)', color: '#fff', fontSize: 13.5, fontWeight: 700, cursor: sending ? 'wait' : 'pointer', display: 'flex', alignItems: 'center', gap: 7 }}>
          {sending ? 'Sending…' : 'Send email'}
          {!sending && (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
          )}
          </button>
        </div>
      </div>
    </div>
  )
}
