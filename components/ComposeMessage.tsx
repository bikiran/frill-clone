'use client'

import { authFetch } from '@/lib/auth-fetch'
import { useState, useEffect, useRef } from 'react'
import { supabase } from '@/lib/supabase'

interface Props {
  companyId: string
  senderName?: string
  onClose: () => void
  onStarted?: (conversationId: string) => void
}

type Pick = { id?: string; name?: string | null; phone: string; email?: string | null }

// Looks like a phone number someone is typing: +, digits, spaces, dashes, brackets.
const looksLikeNumber = (s: string) => /^\+?[\d\s()-]{6,}$/.test(s.trim()) && (s.match(/\d/g) || []).length >= 6

// SMS parts: 160 characters (70 with emoji or other non-GSM characters),
// and 153 / 67 per part once a message is split.
function smsParts(text: string): { parts: number; left: number } {
  const unicode = /[^\x00-\x7F£¥èéùìòÇØøÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ¡ÄÖÑÜ§¿äöñüà€]/.test(text)
  const one = unicode ? 70 : 160, many = unicode ? 67 : 153
  const n = [...text].length
  if (n <= one) return { parts: n ? 1 : 0, left: one - n }
  const parts = Math.ceil(n / many)
  return { parts, left: parts * many - n }
}

// Sellio-style "New message": one field to find a contact or type a number,
// then the message, sent as an SMS that opens a conversation.
export default function ComposeMessage({ companyId, senderName, onClose, onStarted }: Props) {
  const [search, setSearch] = useState('')
  const [contacts, setContacts] = useState<Pick[]>([])
  const [searched, setSearched] = useState('')
  const [picked, setPicked] = useState<Pick | null>(null)
  const [active, setActive] = useState(0)
  const [body, setBody] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const [creditBlocked, setCreditBlocked] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const toRef = useRef<HTMLInputElement>(null)
  const bodyRef = useRef<HTMLTextAreaElement>(null)

  // Debounced contact search on name / phone / email (only contacts with a phone can be texted).
  useEffect(() => {
    if (timer.current) clearTimeout(timer.current)
    if (picked) return
    timer.current = setTimeout(async () => {
      // Commas and brackets would break the or() filter.
      const term = search.trim().replace(/[,()]/g, ' ')
      let q = (supabase as any).from('contacts').select('id, name, phone, email').eq('company_id', companyId)
      if (term) q = q.or(`name.ilike.%${term}%,phone.ilike.%${term}%,email.ilike.%${term}%`)
      const { data } = await q.order('name', { ascending: true }).limit(30)
      setContacts((data || []).filter((c: Pick) => c.phone))
      setSearched(search.trim())
      setActive(0)
    }, 220)
    return () => { if (timer.current) clearTimeout(timer.current) }
  }, [search, companyId, picked])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const typedNumber = !picked && looksLikeNumber(search) ? search.trim() : ''
  // What the list offers: the typed number first (if it is one), then matching contacts.
  const options: (Pick & { manual?: boolean })[] = [
    ...(typedNumber ? [{ phone: typedNumber, manual: true }] : []),
    ...(search.trim() ? contacts : []),
  ]
  const targetNumber = picked?.phone || typedNumber
  const { parts, left } = smsParts(body)
  const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform)

  const choose = (c: Pick) => {
    setPicked(c); setSearch(''); setError('')
    setTimeout(() => bodyRef.current?.focus(), 30)
  }

  const send = async () => {
    setError(''); setCreditBlocked(false)
    if (!targetNumber) { setError('Choose a contact or enter a number.'); return }
    if (!body.trim()) { setError('Write a message first.'); return }
    setSending(true)
    try {
      const res = await authFetch('/api/telnyx/sms/send', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ companyId, to: targetNumber, text: body.trim(), senderName }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { setError(data?.error || 'Couldn’t send. Try again.'); setCreditBlocked(data?.reason === 'credit'); setSending(false); return }
      if (data?.conversationId && onStarted) onStarted(data.conversationId)
      onClose()
    } catch (e) {
      setError((e instanceof Error && e.message) || 'Couldn’t send. Try again.')
      setSending(false)
    }
  }

  const onToKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive(a => Math.min(a + 1, options.length - 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(a => Math.max(a - 1, 0)) }
    else if (e.key === 'Enter' && options[active]) { e.preventDefault(); choose(options[active]) }
  }

  return (
    <div className="cmsg-scrim" onClick={onClose}>
      <div className="cmsg" role="dialog" aria-modal="true" aria-labelledby="cmsg-h" onClick={e => e.stopPropagation()}>
        <div className="cmsg-head">
          <div>
            <h3 id="cmsg-h">New message</h3>
            <p>Text a customer from your business number.</p>
          </div>
          <button type="button" className="cmsg-x" onClick={onClose} aria-label="Close" title="Close (Esc)">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
          </button>
        </div>

        <span className="cmsg-label">To</span>
        {picked ? (
          <div className="cmsg-to">
            <span className="cmsg-av">{picked.name ? picked.name.charAt(0).toUpperCase() : <PhoneIcon />}</span>
            <span className="cmsg-to-t">
              <b>{picked.name || picked.phone}</b>
              {picked.name && <small>{picked.phone}</small>}
            </span>
            <button type="button" className="cmsg-chip-x" onClick={() => { setPicked(null); setTimeout(() => toRef.current?.focus(), 30) }} aria-label="Change who this goes to" title="Change">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
            </button>
          </div>
        ) : (
          <div className="cmsg-find">
            <span className="cmsg-find-ic" aria-hidden>
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
            </span>
            <input ref={toRef} autoFocus value={search} onChange={e => setSearch(e.target.value)} onKeyDown={onToKey}
              placeholder="Name, phone number or email" aria-label="To" autoComplete="off"
              role="combobox" aria-expanded={options.length > 0} aria-controls="cmsg-list" className="cmsg-field" />
            {search.trim() !== '' && (
              <div className="cmsg-list" id="cmsg-list" role="listbox">
                {options.map((c, i) => (
                  <button key={c.manual ? 'manual' : c.id} type="button" role="option" aria-selected={i === active}
                    className={`cmsg-opt${i === active ? ' on' : ''}`} onMouseEnter={() => setActive(i)} onClick={() => choose(c)}>
                    <span className={`cmsg-av${c.manual ? ' num' : ''}`}>{c.manual ? <PhoneIcon /> : (c.name || c.phone || '?').charAt(0).toUpperCase()}</span>
                    <span className="cmsg-opt-t">
                      <b>{c.manual ? `Text ${c.phone}` : c.name || c.phone}</b>
                      <small>{c.manual ? 'Not saved as a contact' : c.phone}</small>
                    </span>
                  </button>
                ))}
                {options.length === 0 && searched === search.trim() && (
                  <p className="cmsg-none">No contacts with a phone number match. Type a number to text it.</p>
                )}
              </div>
            )}
          </div>
        )}

        <label className="cmsg-label" htmlFor="cmsg-body">Message</label>
        <textarea id="cmsg-body" ref={bodyRef} value={body} onChange={e => setBody(e.target.value)} rows={5}
          onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); send() } }}
          placeholder={picked?.name ? `Hi ${picked.name.split(' ')[0]}…` : 'Type your message…'} className="cmsg-field cmsg-body" />
        <div className="cmsg-meta">
          <span>{senderName ? `Signed as ${senderName}` : 'Sent as an SMS'}</span>
          <span>{parts > 1 ? `${parts} messages · ${left} left` : `${left} left`}</span>
        </div>

        {error && (
          <p className="cmsg-err">
            {error}
            {creditBlocked && <> <a href="/admin/billing#sms-credits">Top up SMS credit</a></>}
          </p>
        )}

        <div className="cmsg-foot">
          <span className="cmsg-kbd"><kbd>{isMac ? '⌘' : 'Ctrl'}</kbd><kbd>Enter</kbd> to send</span>
          <button type="button" className="cmsg-btn" onClick={onClose}>Cancel</button>
          <button type="button" className="cmsg-btn go" onClick={send} disabled={sending || !targetNumber || !body.trim()}>
            {sending ? <><span className="cmsg-spin" aria-hidden />Sending…</> : <>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M22 2 11 13" /><path d="M22 2 15 22l-4-9-9-4z" /></svg>
              Send
            </>}
          </button>
        </div>
      </div>
      <style>{CMSG_CSS}</style>
    </div>
  )
}

const PhoneIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.5 2.1L8 9.8a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.7.7a2 2 0 0 1 1.7 2z" /></svg>
)

const CMSG_CSS = `
.cmsg-scrim{position:fixed;inset:0;z-index:200;display:flex;align-items:flex-start;justify-content:center;padding:9vh 16px 16px;background:rgba(15,15,20,.32);animation:cmsg-fade .18s ease-out}
.cmsg{width:min(500px,100%);padding:22px 24px 20px;border-radius:28px;background:var(--card,#fff);box-shadow:0 24px 64px -12px rgba(16,24,40,.32),0 0 0 1px rgba(0,0,0,.04);animation:cmsg-in .26s cubic-bezier(.2,.9,.3,1)}
@keyframes cmsg-in{from{transform:translateY(10px) scale(.98);opacity:0}}
@keyframes cmsg-fade{from{opacity:0}}
.cmsg button::before{display:none!important}
.cmsg-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;margin-bottom:18px}
.cmsg-head h3{margin:0;font-family:var(--font-display),-apple-system,"SF Pro Display",sans-serif;font-size:24px;font-weight:700;letter-spacing:-.03em;color:var(--ink)}
.cmsg-head p{margin:3px 0 0;font-size:13.5px;color:#8e8e93}
.cmsg-x{width:36px;height:36px;flex-shrink:0;display:inline-flex;align-items:center;justify-content:center;border:none;border-radius:50%;background:#f4f4f5;color:var(--ink);cursor:pointer;transition:background .15s}
.cmsg-x:hover{background:#e9e9ec}
.cmsg-label{display:block;margin:0 0 8px;font-size:13.5px;font-weight:650;color:var(--ink)}
.cmsg-field{display:block;width:100%;box-sizing:border-box;min-height:46px;padding:12px 14px;border:none!important;border-radius:14px;background:#f4f4f5;font:inherit;font-size:15px;color:var(--ink);outline:none;transition:background .15s,box-shadow .15s}
.cmsg-field::placeholder{color:#a1a1aa}
.cmsg-field:focus,.cmsg-field:focus-visible{background:#fff;box-shadow:0 0 0 1.5px var(--ink)!important;outline:none!important}
.cmsg-find{position:relative;margin-bottom:18px}
.cmsg-find .cmsg-field{padding-left:40px}
.cmsg-find-ic{position:absolute;left:14px;top:14px;color:#a1a1aa;pointer-events:none}
.cmsg-list{position:absolute;left:0;right:0;top:calc(100% + 6px);z-index:2;max-height:248px;overflow-y:auto;padding:6px;border-radius:18px;background:var(--card,#fff);box-shadow:0 18px 40px -10px rgba(16,24,40,.28),0 0 0 1px rgba(0,0,0,.06)}
.cmsg-opt{display:flex;align-items:center;gap:11px;width:100%;padding:8px 10px;border:none;border-radius:12px;background:none;font:inherit;text-align:left;cursor:pointer}
.cmsg-opt.on{background:#f4f4f5}
.cmsg-opt-t,.cmsg-to-t{flex:1;min-width:0;display:flex;flex-direction:column;gap:1px}
.cmsg-opt-t b,.cmsg-to-t b{font-size:14px;font-weight:650;color:var(--ink);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.cmsg-opt-t small,.cmsg-to-t small{font-size:12.5px;color:#8e8e93}
.cmsg-av{width:34px;height:34px;flex-shrink:0;display:inline-flex;align-items:center;justify-content:center;border-radius:50%;background:color-mix(in srgb,var(--coral) 14%,#fff);color:var(--coral);font-size:14px;font-weight:700}
.cmsg-av.num{background:#ecfdf5;color:#059669}
.cmsg-none{margin:0;padding:10px 12px;font-size:13px;color:#8e8e93}
.cmsg-to{display:flex;align-items:center;gap:11px;margin-bottom:18px;padding:8px 8px 8px 10px;border-radius:16px;background:#f7f7f8}
.cmsg-chip-x{width:30px;height:30px;flex-shrink:0;display:inline-flex;align-items:center;justify-content:center;border:none;border-radius:50%;background:#fff;color:#71717a;cursor:pointer;box-shadow:0 0 0 1px rgba(0,0,0,.06)}
.cmsg-chip-x:hover{color:var(--ink)}
.cmsg-body{min-height:120px;resize:vertical;line-height:1.45}
.cmsg-meta{display:flex;justify-content:space-between;gap:10px;margin-top:7px;font-size:12px;color:#a1a1aa}
.cmsg-err{margin:12px 0 0;padding:10px 12px;border-radius:12px;background:#fef2f2;font-size:13px;color:#b91c1c}
.cmsg-err a{margin-left:4px;font-weight:700;color:inherit}
.cmsg-foot{display:flex;align-items:center;gap:8px;margin-top:20px}
.cmsg-kbd{flex:1;font-size:12px;color:#a1a1aa}
.cmsg-kbd kbd{display:inline-block;min-width:18px;margin-right:3px;padding:1px 5px;border-radius:6px;background:#f4f4f5;font:inherit;font-size:11px;font-weight:600;color:#71717a;text-align:center}
@media (hover:none){.cmsg-kbd{visibility:hidden}}
.cmsg-btn{display:inline-flex;align-items:center;justify-content:center;gap:7px;height:44px;padding:0 20px;border:none;border-radius:999px;background:#f4f4f5;font:inherit;font-size:14.5px;font-weight:650;color:var(--ink);cursor:pointer;transition:background .15s,opacity .15s,transform .1s}
.cmsg-btn:hover{background:#ececef}
.cmsg-btn:active:not(:disabled){transform:scale(.97)}
.cmsg-btn.go{padding:0 22px;background:var(--coral);color:#fff}
.cmsg-btn.go:hover{background:var(--coral);filter:brightness(1.05)}
.cmsg-btn:disabled{opacity:.45;cursor:not-allowed}
.cmsg-spin{width:14px;height:14px;border-radius:50%;border:2px solid rgba(255,255,255,.35);border-top-color:#fff;animation:cmsg-rot .7s linear infinite}
@keyframes cmsg-rot{to{transform:rotate(360deg)}}
@media (max-width:560px){
  .cmsg-scrim{align-items:flex-end;padding:0}
  .cmsg{width:100%;border-radius:28px 28px 0 0;padding-bottom:calc(18px + env(safe-area-inset-bottom,0px));animation-name:cmsg-up}
  @keyframes cmsg-up{from{transform:translateY(40px);opacity:0}}
}
[data-theme="dark"] .cmsg,[data-theme="dark"] .cmsg-list{background:#18181b}
[data-theme="dark"] .cmsg-field,[data-theme="dark"] .cmsg-x,[data-theme="dark"] .cmsg-btn:not(.go),[data-theme="dark"] .cmsg-to,[data-theme="dark"] .cmsg-opt.on{background:#27272a}
`
