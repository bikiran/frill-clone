'use client'

import { useEffect, useMemo, useRef, useState } from 'react'

// Agents page → Try it: pick a recent conversation for the agent to answer
// "as if it came in on". A searchable list with the customer, channel and the
// last message, instead of a long native dropdown.

export type PickConv = { id: string; name: string; channel: string; preview: string; at: string | null }

const EASE = 'cubic-bezier(.22,1,.36,1)'
const ico = (d: React.ReactNode, s = 14) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flexShrink: 0 }}>{d}</svg>
const CH: Record<string, { label: string; icon: React.ReactNode }> = {
  sms: { label: 'SMS', icon: ico(<><rect x="5" y="2" width="14" height="20" rx="2" /><line x1="12" y1="18" x2="12.01" y2="18" /></>, 12) },
  chat: { label: 'Chat', icon: ico(<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />, 12) },
  email: { label: 'Email', icon: ico(<><rect x="2" y="4" width="20" height="16" rx="2" /><polyline points="22 6 12 13 2 6" /></>, 12) },
  phone: { label: 'Phone', icon: ico(<path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.8 19.8 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.12 4.18 2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z" />, 12) },
  facebook: { label: 'Messenger', icon: ico(<path d="M21 11.5a8.4 8.4 0 0 1-9 8.4 9 9 0 0 1-3.8-.8L3 21l1.9-5.1A8.4 8.4 0 1 1 21 11.5z" />, 12) },
  instagram: { label: 'Instagram', icon: ico(<><rect x="2" y="2" width="20" height="20" rx="5" /><circle cx="12" cy="12" r="4" /><line x1="17.5" y1="6.5" x2="17.51" y2="6.5" /></>, 12) },
  whatsapp: { label: 'WhatsApp', icon: ico(<path d="M21 11.5a8.4 8.4 0 0 1-12.5 7.4L3 21l2.1-5.4A8.4 8.4 0 1 1 21 11.5z" />, 12) },
}
const chOf = (c: string) => CH[c] || CH.chat
const Search = () => ico(<><circle cx="11" cy="11" r="7" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></>, 15)
const Chevron = () => ico(<polyline points="6 9 12 15 18 9" />, 16)
const Tick = () => ico(<polyline points="20 6 9 17 4 12" />, 15)
const Plus = () => ico(<><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></>, 15)

/** Last-message text without emoji and call/heart markers, so the list reads cleanly. */
export function cleanPreview(text: string): string {
  const raw = String(text || '').trim()
  // A reaction ("❤️ to 'All good.'") reads better as words.
  const react = raw.match(/^[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}\u{200D}\s]+to\s+["'‘“](.*)["'’”]$/u)
  if (react) return `Reacted to “${react[1]}”`
  return raw
    .replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}\u{200D}]/gu, '')
    .replace(/\s+/g, ' ').trim()
}
const initials = (n: string) => (n.trim().split(/\s+/).slice(0, 2).map(w => w[0]).join('') || '?').toUpperCase()
const when = (iso: string | null) => {
  if (!iso) return ''
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000)
  if (m < 60) return `${Math.max(1, m)}m`
  const h = Math.round(m / 60)
  if (h < 24) return `${h}h`
  const d = Math.round(h / 24)
  return d < 7 ? `${d}d` : new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })
}
const HUES = [12, 28, 200, 160, 262, 330, 45, 180]
const hue = (s: string) => HUES[Array.from(s).reduce((a, c) => a + c.charCodeAt(0), 0) % HUES.length]

export default function ConversationPicker({ id, value, convs, onChange }: { id?: string; value: string; convs: PickConv[]; onChange: (id: string) => void }) {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const [hi, setHi] = useState(0)
  const box = useRef<HTMLDivElement>(null)
  const search = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLUListElement>(null)
  const pop = useRef<HTMLDivElement>(null)
  const sel = convs.find(c => c.id === value) || null

  const list = useMemo(() => {
    const t = q.trim().toLowerCase()
    const hits = t ? convs.filter(c => `${c.name} ${c.preview} ${chOf(c.channel).label}`.toLowerCase().includes(t)) : convs
    return [null, ...hits] as (PickConv | null)[]   // null = a new customer
  }, [convs, q])

  useEffect(() => {
    if (!open) return
    const off = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', off)
    setTimeout(() => { search.current?.focus({ preventScroll: true }); pop.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }) }, 30)
    return () => document.removeEventListener('mousedown', off)
  }, [open])
  useEffect(() => { setHi(0) }, [q, open])
  useEffect(() => { listRef.current?.querySelector<HTMLElement>(`[data-i="${hi}"]`)?.scrollIntoView({ block: 'nearest' }) }, [hi])

  const pick = (c: PickConv | null) => { onChange(c?.id || ''); setOpen(false); setQ('') }
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setHi(h => Math.min(list.length - 1, h + 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setHi(h => Math.max(0, h - 1)) }
    else if (e.key === 'Enter') { e.preventDefault(); pick(list[hi] ?? null) }
    else if (e.key === 'Escape') { e.preventDefault(); setOpen(false) }
  }

  return (
    <div className="cp" ref={box}>
      <style>{CSS}</style>
      <button id={id} type="button" className={`cp-trigger ${open ? 'open' : ''}`} aria-haspopup="listbox" aria-expanded={open} onClick={() => setOpen(o => !o)}>
        {sel ? (
          <>
            <span className="cp-av" style={{ background: `hsl(${hue(sel.name)} 70% 94%)`, color: `hsl(${hue(sel.name)} 55% 38%)` }}>{initials(sel.name)}</span>
            <span className="cp-main"><span className="cp-name">{sel.name}</span><span className="cp-sub">{chOf(sel.channel).icon}{chOf(sel.channel).label}{sel.preview ? ` · ${sel.preview}` : ''}</span></span>
          </>
        ) : (
          <>
            <span className="cp-av new"><Plus /></span>
            <span className="cp-main"><span className="cp-name">A new customer</span><span className="cp-sub">No earlier messages</span></span>
          </>
        )}
        <span className="cp-chev"><Chevron /></span>
      </button>

      {open && (
        <div className="cp-pop" ref={pop} onKeyDown={onKey}>
          <div className="cp-search"><Search /><input ref={search} value={q} onChange={e => setQ(e.target.value)} placeholder="Search customers or messages" aria-label="Search conversations" /></div>
          <ul className="cp-list" role="listbox" ref={listRef} aria-label="Conversations">
            {list.map((c, i) => {
              const on = (c?.id || '') === value
              return (
                <li key={c?.id || 'new'} data-i={i} role="option" aria-selected={on} className={`cp-opt ${i === hi ? 'hi' : ''}`} onMouseEnter={() => setHi(i)} onMouseDown={e => e.preventDefault()} onClick={() => pick(c)}>
                  {c ? (
                    <>
                      <span className="cp-av" style={{ background: `hsl(${hue(c.name)} 70% 94%)`, color: `hsl(${hue(c.name)} 55% 38%)` }}>{initials(c.name)}</span>
                      <span className="cp-main">
                        <span className="cp-row"><span className="cp-name">{c.name}</span><span className="cp-ch">{chOf(c.channel).icon}{chOf(c.channel).label}</span><span className="cp-time">{when(c.at)}</span></span>
                        <span className="cp-prev">{c.preview || 'No messages yet'}</span>
                      </span>
                    </>
                  ) : (
                    <>
                      <span className="cp-av new"><Plus /></span>
                      <span className="cp-main"><span className="cp-name">A new customer</span><span className="cp-prev">No earlier messages, nothing on file</span></span>
                    </>
                  )}
                  <span className="cp-tick">{on && <Tick />}</span>
                </li>
              )
            })}
            {list.length === 1 && q && <li className="cp-none">No conversations match “{q}”</li>}
          </ul>
        </div>
      )}
    </div>
  )
}

const CSS = `
.cp{position:relative;min-width:0}
.cp .cp-trigger{display:flex;align-items:center;gap:10px;width:100%;min-height:46px;padding:7px 10px 7px 8px;border-radius:12px;border:1px solid var(--border);background:#fff!important;font-family:inherit;text-align:left;cursor:pointer;color:inherit;transition:border-color .2s ease,box-shadow .2s ease}
.cp-trigger:hover{border-color:color-mix(in srgb,var(--slate) 35%,var(--border))}
.cp-trigger.open,.cp-trigger:focus-visible{outline:none;border-color:var(--coral);box-shadow:0 0 0 3px color-mix(in srgb,var(--coral) 15%,transparent)}
.cp-av{width:30px;height:30px;flex-shrink:0;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;font-size:11.5px;font-weight:800;letter-spacing:.02em}
.cp-av.new{background:var(--canvas,#f3f4f6);color:var(--slate)}
.cp-main{display:flex;flex-direction:column;min-width:0;flex:1}
.cp-name{font-size:13.5px;font-weight:700;color:var(--ink);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.cp-sub,.cp-prev{display:flex;align-items:center;gap:4px;font-size:12px;color:var(--slate);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;min-width:0}
.cp-prev{display:block}
.cp-chev{display:inline-flex;color:var(--slate);transition:transform .25s ${EASE}}
.cp-trigger.open .cp-chev{transform:rotate(180deg)}
.cp-pop{scroll-margin:90px 0;position:absolute;z-index:40;top:calc(100% + 6px);left:0;right:0;min-width:300px;background:#fff;border:1px solid var(--border);border-radius:16px;box-shadow:0 18px 40px -12px rgba(15,23,42,.22),0 2px 6px rgba(15,23,42,.05);overflow:hidden;transform-origin:top center;animation:cpIn .22s ${EASE} both}
@keyframes cpIn{from{opacity:0;transform:translateY(-4px) scale(.98)}to{opacity:1;transform:none}}
@media (prefers-reduced-motion:reduce){.cp-pop{animation:none}}
.cp-search{display:flex;align-items:center;gap:8px;padding:10px 12px;border-bottom:1px solid var(--border);color:var(--slate)}
.cp .cp-search input{flex:1;min-width:0;height:auto;padding:2px 0;border:none!important;outline:none!important;box-shadow:none!important;border-radius:0;font-size:14px;font-family:inherit;color:var(--ink);background:transparent!important}
.cp-list{list-style:none;margin:0;padding:6px;max-height:min(340px,50vh);overflow-y:auto;overscroll-behavior:contain}
.cp-opt{display:flex;align-items:center;gap:10px;padding:8px;border-radius:11px;cursor:pointer;transition:background .15s ease}
.cp-opt.hi{background:var(--canvas,#f6f7f9)}
.cp-opt[aria-selected="true"]{background:color-mix(in srgb,var(--coral) 7%,#fff)}
.cp-row{display:flex;align-items:center;gap:8px;min-width:0}
.cp-row .cp-name{flex-shrink:1;min-width:0}
.cp-ch{display:inline-flex;align-items:center;gap:4px;flex-shrink:0;padding:1px 7px;border-radius:999px;background:var(--canvas,#f3f4f6);font-size:11px;font-weight:700;color:var(--slate)}
.cp-time{margin-left:auto;flex-shrink:0;font-size:11.5px;color:var(--slate)}
.cp-tick{width:16px;flex-shrink:0;display:inline-flex;color:var(--coral)}
.cp-none{padding:14px 10px;font-size:13px;color:var(--slate);text-align:center}
@media (max-width:560px){.cp-pop{min-width:0}}
`
