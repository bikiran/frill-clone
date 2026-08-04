'use client'

import { useRef, useEffect, useState } from 'react'
import { createPortal } from 'react-dom'

// A lightweight rich-text editor built on contentEditable + execCommand — no
// external dependency. Supports bold/italic/underline/strikethrough, headings,
// lists, quote, links, inserting/growing tables, and optional @mentions. Emits
// HTML on input (debounced) and on blur. Remount it per record with a `key` so
// the initial value loads cleanly without fighting the caret.
const CELL = 'border:1px solid #d4d4d8;padding:6px 8px;min-width:40px;vertical-align:top;'
const FONTS: [string, string][] = [['Sans serif', 'sans-serif'], ['Serif', 'serif'], ['Monospace', 'monospace'], ['Georgia', 'Georgia, serif'], ['Courier', '"Courier New", monospace']]
const SIZES: [string, string][] = [['Small', '2'], ['Normal', '3'], ['Large', '5'], ['Huge', '7']]
const FORE = ['#1a1a1a', '#6b7280', '#dc2626', '#ea580c', '#d97706', '#16a34a', '#2563eb', '#7c3aed', '#db2777', '#ff7a6b']
const HILITE: [string, string][] = [['Yellow', '#fff3bf'], ['Green', '#d3f9d8'], ['Blue', '#d0ebff'], ['Pink', '#ffe3e3'], ['Orange', '#ffe8cc'], ['Purple', '#f3d9fa'], ['None', 'transparent']]

type Mention = { id: string; name: string }

export default function RichTextEditor({
  value, onChange, placeholder = 'Add a description…', mentions, minHeight = 120, maxHeight = 360, bordered = true,
  enableVoice = false, companyId, big = false, toolbarPortal, blockDrag = false,
}: {
  value: string
  onChange: (html: string) => void
  placeholder?: string
  mentions?: Mention[]
  minHeight?: number
  maxHeight?: number | string
  bordered?: boolean
  enableVoice?: boolean
  companyId?: string | null
  big?: boolean
  toolbarPortal?: HTMLElement | null
  blockDrag?: boolean
}) {
  const ref = useRef<HTMLDivElement>(null)
  const timer = useRef<any>(null)
  const [menu, setMenu] = useState<{ x: number; y: number; items: Mention[]; active: number } | null>(null)
  const [pop, setPop] = useState<{ kind: 'font' | 'size' | 'fore' | 'hilite'; x: number; y: number } | null>(null)
  // Block drag-to-reorder (Notion/Evernote style): a floating handle follows the
  // block under the cursor; dragging shows a drop line and moves that block.
  const handleRef = useRef<HTMLButtonElement>(null)
  const indicatorRef = useRef<HTMLDivElement>(null)
  const hoverBlockRef = useRef<HTMLElement | null>(null)
  const dragBlockRef = useRef<HTMLElement | null>(null)
  const dropRef = useRef<{ before: HTMLElement | null } | null>(null)
  const ghostRef = useRef<HTMLElement | null>(null)
  const grabOffRef = useRef(0)
  const hideT = useRef<any>(null)
  const [rec, setRec] = useState<'idle' | 'recording' | 'uploading'>('idle')
  const [recSecs, setRecSecs] = useState(0)
  const recRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const streamRef = useRef<MediaStream | null>(null)
  const tickRef = useRef<any>(null)

  // Inner HTML of an Evernote-style voice card (no inline player — playback is in
  // the bottom AudioDock; buttons wired by document-level delegation in
  // <VoiceBlocks/>). Hidden <audio> feeds the dock.
  const voiceCardInner = (url: string, name: string, dur: string) => {
    const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
    const n = esc(name)
    return `<button class="rte-voice-play" type="button" title="Play" aria-label="Play"><svg viewBox="0 0 24 24" width="15" height="15" fill="currentColor"><path d="M7 5.5v13a1 1 0 0 0 1.5.87l11-6.5a1 1 0 0 0 0-1.74l-11-6.5A1 1 0 0 0 7 5.5z"/></svg></button>` +
      `<span class="rte-voice-lbl"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg><span class="rte-voice-name">${n}</span>${dur ? `<span class="rte-voice-dur">${esc(dur)}</span>` : ''}</span>` +
      `<span class="rte-voice-act">` +
        `<button class="rte-voice-btn" type="button" data-va="rename" title="Rename"><svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg></button>` +
        `<button class="rte-voice-btn" type="button" data-va="download" title="Download"><svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg></button>` +
        `<button class="rte-voice-btn" type="button" data-va="more" title="More options"><svg viewBox="0 0 24 24" width="15" height="15" fill="currentColor"><circle cx="5" cy="12" r="1.7"/><circle cx="12" cy="12" r="1.7"/><circle cx="19" cy="12" r="1.7"/></svg></button>` +
      `</span>` +
      `<audio src="${url}" data-name="${n}" preload="metadata" style="display:none"></audio>`
  }

  const insertVoiceBlock = (url: string, secs: number) => {
    const label = new Date().toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
    const name = `Voice note · ${label}`
    const dur = secs ? `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}` : ''
    const html = `<div class="rte-voice" contenteditable="false" data-voice>${voiceCardInner(url, name, dur)}</div><p><br></p>`
    ref.current?.focus()
    document.execCommand('insertHTML', false, html)
    normalizeVoice()   // hoist the card to a top-level block so drag moves only it
    emit()
  }

  // Upgrade any legacy voice markup in loaded content (old native <audio controls>
  // players, pre-card formats) to the current Evernote-style card.
  const normalizeVoice = () => {
    const root = ref.current; if (!root) return
    let changed = false
    Array.from(root.querySelectorAll('audio')).forEach(au => {
      const a = au as HTMLAudioElement
      const url = a.getAttribute('src') || ''
      if (!url) return
      let card = a.closest('.rte-voice') as HTMLElement | null
      // Already a modern card? (hidden audio + play button, no native controls.)
      if (card && card.querySelector('.rte-voice-play') && !a.hasAttribute('controls')) return
      const durText = card?.querySelector('.rte-voice-dur')?.textContent?.trim() || ''
      let name = a.getAttribute('data-name') || card?.querySelector('.rte-voice-name')?.textContent?.trim() || ''
      if (!name) { try { name = decodeURIComponent(new URL(url, location.href).pathname.split('/').pop() || '').replace(/^\d{10,}-/, '').replace(/\.\w+$/, '') } catch {} }
      if (!name) name = 'Voice note'
      if (!card) { card = document.createElement('div'); a.replaceWith(card) }
      card.className = 'rte-voice'; card.setAttribute('contenteditable', 'false'); card.setAttribute('data-voice', '')
      card.innerHTML = voiceCardInner(url, name, durText)
      changed = true
    })
    // A voice card must be a direct child of the editor, else dragging its
    // wrapper block would carry the adjacent text with it. Hoist any nested card
    // out to the top level (splitting its wrapper).
    Array.from(root.querySelectorAll('.rte-voice')).forEach(el => {
      const card = el as HTMLElement
      while (card.parentElement && card.parentElement !== root) {
        const wrap = card.parentElement
        wrap.after(card)                       // move card just after its wrapper
        if (!wrap.textContent?.trim() && !wrap.querySelector('img,video,audio,table')) wrap.remove()
        changed = true
      }
    })
    if (changed) emit()
  }

  const startVoice = async () => {
    if (!navigator.mediaDevices?.getUserMedia) return
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream
      const mime = MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : (MediaRecorder.isTypeSupported('audio/mp4') ? 'audio/mp4' : '')
      const r = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined)
      chunksRef.current = []
      r.ondataavailable = e => { if (e.data.size) chunksRef.current.push(e.data) }
      const started = Date.now()
      r.onstop = async () => {
        const dur = Math.round((Date.now() - started) / 1000)
        if (!chunksRef.current.length || !companyId) { setRec('idle'); return }
        setRec('uploading')
        try {
          const ext = (r.mimeType || '').includes('mp4') ? 'm4a' : 'webm'
          const file = new File([new Blob(chunksRef.current, { type: r.mimeType || 'audio/webm' })], `Voice ${Date.now()}.${ext}`, { type: r.mimeType || 'audio/webm' })
          const fd = new FormData(); fd.append('file', file); fd.append('companyId', companyId); fd.append('conversationId', 'notes')
          const res = await fetch('/api/inbox/upload', { method: 'POST', body: fd })
          const d = await res.json()
          if (d.url) insertVoiceBlock(d.url, dur)
        } catch {} finally { setRec('idle'); setRecSecs(0) }
      }
      recRef.current = r
      r.start(); setRec('recording'); setRecSecs(0)
      tickRef.current = setInterval(() => setRecSecs(s => s + 1), 1000)
    } catch { setRec('idle') }
  }
  const stopVoice = () => { clearInterval(tickRef.current); try { recRef.current?.stop() } catch {}; streamRef.current?.getTracks().forEach(t => t.stop()) }

  useEffect(() => {
    if (ref.current) { ref.current.innerHTML = value || ''; if (blockDrag || enableVoice) normalizeVoice() }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const emit = () => onChange(ref.current?.innerHTML || '')
  const emitSoon = () => { clearTimeout(timer.current); timer.current = setTimeout(emit, 600) }

  const exec = (cmd: string, arg?: string) => { ref.current?.focus(); document.execCommand(cmd, false, arg); emit() }
  const formatBlock = (tag: string) => exec('formatBlock', tag)

  const addLink = () => {
    const url = window.prompt('Link URL')
    if (url) exec('createLink', url)
  }

  const currentTable = (): HTMLTableElement | null => {
    const sel = window.getSelection()
    let n: Node | null = sel?.anchorNode || null
    while (n && n !== ref.current) {
      if ((n as HTMLElement).tagName === 'TABLE') return n as HTMLTableElement
      n = n.parentNode
    }
    return null
  }

  const insertTable = () => {
    const rows = Math.max(1, Math.min(20, parseInt(window.prompt('Rows', '2') || '2') || 2))
    const cols = Math.max(1, Math.min(10, parseInt(window.prompt('Columns', '2') || '2') || 2))
    let html = '<table style="border-collapse:collapse;width:100%;margin:8px 0;font-size:13px;"><tbody>'
    for (let r = 0; r < rows; r++) {
      html += '<tr>'
      for (let c = 0; c < cols; c++) html += `<td style="${CELL}">${r === 0 ? '<strong>&nbsp;</strong>' : '&nbsp;'}</td>`
      html += '</tr>'
    }
    html += '</tbody></table><p><br></p>'
    exec('insertHTML', html)
  }

  const addRow = () => {
    const t = currentTable(); if (!t) { insertTable(); return }
    const cols = t.rows[0]?.cells.length || 1
    const tr = t.insertRow(-1)
    for (let i = 0; i < cols; i++) { const td = tr.insertCell(-1); td.setAttribute('style', CELL); td.innerHTML = '&nbsp;' }
    emit()
  }
  const addCol = () => {
    const t = currentTable(); if (!t) return
    for (let i = 0; i < t.rows.length; i++) { const td = t.rows[i].insertCell(-1); td.setAttribute('style', CELL); td.innerHTML = '&nbsp;' }
    emit()
  }

  // ── @mentions ──────────────────────────────────────────────────────────────
  const detectMention = () => {
    if (!mentions?.length) return
    const sel = window.getSelection()
    if (!sel || !sel.rangeCount) { setMenu(null); return }
    const range = sel.getRangeAt(0)
    const node = range.startContainer
    if (node.nodeType !== Node.TEXT_NODE) { setMenu(null); return }
    const before = (node.textContent || '').slice(0, range.startOffset)
    const m = before.match(/(?:^|\s)@([\w-]*)$/)
    if (!m) { setMenu(null); return }
    const q = m[1].toLowerCase()
    const items = mentions.filter(t => t.name.toLowerCase().includes(q)).slice(0, 6)
    if (!items.length) { setMenu(null); return }
    const rect = range.getBoundingClientRect()
    setMenu({ x: rect.left || 0, y: (rect.bottom || 0) + 4, items, active: 0 })
  }

  const insertMention = (name: string) => {
    const sel = window.getSelection()
    if (!sel || !sel.rangeCount) return
    const range = sel.getRangeAt(0)
    const node = range.startContainer
    if (node.nodeType !== Node.TEXT_NODE) return
    const caret = range.startOffset
    const before = (node.textContent || '').slice(0, caret)
    const m = before.match(/@([\w-]*)$/)
    if (!m) return
    const r = document.createRange()
    r.setStart(node, caret - m[0].length); r.setEnd(node, caret)
    r.deleteContents()
    const span = document.createElement('span')
    span.className = 'rte-mention'
    span.setAttribute('data-mention', name)
    span.textContent = '@' + name
    r.insertNode(span)
    const sp = document.createTextNode(' ')
    span.after(sp)
    const nr = document.createRange(); nr.setStartAfter(sp); nr.collapse(true)
    sel.removeAllRanges(); sel.addRange(nr)
    setMenu(null); emit()
  }

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!menu) return
    if (e.key === 'ArrowDown') { e.preventDefault(); setMenu(m => m && { ...m, active: (m.active + 1) % m.items.length }) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setMenu(m => m && { ...m, active: (m.active - 1 + m.items.length) % m.items.length }) }
    else if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); insertMention(menu.items[menu.active].name) }
    else if (e.key === 'Escape') { setMenu(null) }
  }

  // ── Block drag-to-reorder ─────────────────────────────────────────────────
  // Deterministic per-Y block lookup (no elementFromPoint) so the hovered line,
  // the handle position, and the line that actually drags are always the same —
  // including in the blank gaps between paragraphs.
  const topBlockAt = (_x: number, y: number): HTMLElement | null => {
    const content = ref.current; if (!content) return null
    const kids = Array.from(content.children) as HTMLElement[]
    if (!kids.length) return null
    for (const c of kids) { const r = c.getBoundingClientRect(); if (y >= r.top && y <= r.bottom) return c }
    let best: HTMLElement | null = null, bestD = Infinity
    for (const c of kids) { const r = c.getBoundingClientRect(); const d = Math.abs((r.top + r.bottom) / 2 - y); if (d < bestD) { bestD = d; best = c } }
    return best
  }
  const positionHandle = (blk: HTMLElement | null) => {
    const h = handleRef.current; if (!h) return
    if (!blk || blk === ref.current) { h.style.opacity = '0'; h.style.pointerEvents = 'none'; hoverBlockRef.current = null; return }
    hoverBlockRef.current = blk
    const r = blk.getBoundingClientRect()
    // Sit the handle in the left gutter, its right edge flush with the block so
    // there's no dead gap the pointer has to cross to grab it.
    h.style.top = `${r.top + Math.min(16, r.height / 2)}px`
    h.style.left = `${Math.max(2, r.left - 32)}px`
    h.style.opacity = '1'; h.style.pointerEvents = 'auto'
  }
  const cancelHide = () => clearTimeout(hideT.current)
  const scheduleHide = () => { clearTimeout(hideT.current); hideT.current = setTimeout(() => { if (!dragBlockRef.current) positionHandle(null) }, 280) }
  const onContentMove = (e: React.MouseEvent) => { if (!blockDrag || dragBlockRef.current) return; cancelHide(); positionHandle(topBlockAt(e.clientX, e.clientY)) }
  const onDragMove = (e: PointerEvent) => {
    e.preventDefault()
    const content = ref.current, ind = indicatorRef.current, ghost = ghostRef.current, drag = dragBlockRef.current
    if (!content || !ind || !ghost || !drag) return
    // The picked-up card follows the cursor.
    ghost.style.top = `${e.clientY - grabOffRef.current}px`
    // Find where it would land by geometry (never elementFromPoint — no jitter,
    // and it can't be fooled by the ghost or the dimmed original).
    const kids = Array.from(content.children).filter(c => c !== drag) as HTMLElement[]
    let before: HTMLElement | null = null
    for (const c of kids) { const r = c.getBoundingClientRect(); if (e.clientY < r.top + r.height / 2) { before = c; break } }
    dropRef.current = { before }
    const cr = content.getBoundingClientRect()
    let lineY: number
    if (before) lineY = before.getBoundingClientRect().top - 1
    else { const last = kids[kids.length - 1]; lineY = last ? last.getBoundingClientRect().bottom + 1 : cr.top + 2 }
    ind.style.opacity = '1'; ind.style.left = `${cr.left}px`; ind.style.width = `${cr.width}px`; ind.style.top = `${lineY}px`
  }
  const onDragUp = () => {
    window.removeEventListener('pointermove', onDragMove)
    const src = dragBlockRef.current, drop = dropRef.current, content = ref.current
    ghostRef.current?.remove(); ghostRef.current = null
    if (src) src.style.opacity = ''
    if (indicatorRef.current) indicatorRef.current.style.opacity = '0'
    document.body.style.cursor = ''; document.body.style.userSelect = ''
    dragBlockRef.current = null; dropRef.current = null
    if (src && content && drop) {
      const before = drop.before
      if (before !== src && src.nextSibling !== before) content.insertBefore(src, before)   // before=null appends
      emit()
    }
    positionHandle(null)
  }
  const onHandleDown = (e: React.PointerEvent) => {
    e.preventDefault()
    const blk = hoverBlockRef.current, content = ref.current; if (!blk || !content) return
    dragBlockRef.current = blk
    const r = blk.getBoundingClientRect()
    grabOffRef.current = e.clientY - r.top
    // A floating clone that visibly "pops" off the page while you drag.
    const ghost = blk.cloneNode(true) as HTMLElement
    Object.assign(ghost.style, {
      position: 'fixed', left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px`, margin: '0',
      pointerEvents: 'none', zIndex: '100060', background: '#fff', borderRadius: '10px', padding: '3px 10px',
      boxShadow: '0 14px 34px rgba(0,0,0,0.22)', transform: 'scale(1.02)', opacity: '0.98', cursor: 'grabbing',
    } as CSSStyleDeclaration)
    document.body.appendChild(ghost); ghostRef.current = ghost
    blk.style.opacity = '0.3'
    document.body.style.cursor = 'grabbing'; document.body.style.userSelect = 'none'
    if (handleRef.current) { handleRef.current.style.opacity = '0'; handleRef.current.style.pointerEvents = 'none' }
    window.addEventListener('pointermove', onDragMove)
    window.addEventListener('pointerup', onDragUp, { once: true })
  }

  const S = big ? 38 : 30
  const Btn = ({ on, title, children, active }: any) => (
    <button type="button" title={title} className="rte-btn"
      onMouseDown={(e) => e.preventDefault()}
      onClick={on}
      style={{ minWidth: S, height: S, padding: `0 ${big ? 9 : 7}px`, borderRadius: 9, border: '1px solid var(--border)', background: active ? 'var(--peach)' : '#fff', color: active ? 'var(--coral)' : 'var(--ink)', fontSize: big ? 15 : 13, fontWeight: 700, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
      {children}
    </button>
  )
  const Sep = () => <span style={{ width: 1, background: 'var(--border)', margin: '0 3px', alignSelf: 'stretch' }} />
  const openPop = (kind: 'font' | 'size' | 'fore' | 'hilite') => (e: React.MouseEvent) => {
    e.preventDefault()
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
    setPop(p => (p && p.kind === kind) ? null : { kind, x: Math.min(r.left, window.innerWidth - 230), y: r.bottom + 6 })
  }
  const applyPop = (cmd: string, val: string) => { exec(cmd, val); setPop(null) }

  return (
    <div style={{ border: bordered ? '1px solid var(--border)' : 'none', borderRadius: bordered ? 10 : 0, overflow: bordered ? 'hidden' : 'visible', background: '#fff' }}>
      <style>{`
        .rte-content:empty:before { content: attr(data-ph); color: #9ca3af; }
        .rte-content:focus { outline: none; }
        .rte-content table { border-collapse: collapse; }
        .rte-content td, .rte-content th { border: 1px solid #d4d4d8; padding: 6px 8px; }
        .rte-content h2 { font-size: 22px; font-weight: 800; margin: 12px 0 6px; }
        .rte-content h3 { font-size: 18px; font-weight: 800; margin: 10px 0 4px; }
        .rte-content ul, .rte-content ol { padding-left: 22px; margin: 4px 0; }
        .rte-content blockquote { border-left: 3px solid var(--border); margin: 6px 0; padding: 2px 0 2px 12px; color: var(--slate); }
        .rte-content a { color: var(--coral); text-decoration: underline; }
        .rte-content p { margin: 4px 0; }
        .rte-content .rte-mention { color: var(--coral); font-weight: 700; background: var(--peach); padding: 0 5px; border-radius: 5px; }
        .rte-btn { transition: background .12s, color .12s, transform .1s, box-shadow .12s; }
        .rte-btn:hover { background: var(--peach); color: var(--coral); border-color: var(--coral); transform: translateY(-1px); box-shadow: 0 2px 6px rgba(0,0,0,0.06); }
        /* Evernote-style inline voice card (player lives in the bottom dock). */
        .rte-voice { display: flex; align-items: center; gap: 12px; padding: 9px 12px; margin: 12px 0; border: 1px solid var(--border,#e5e7eb); border-radius: 12px; background: #fff; box-shadow: 0 1px 2px rgba(0,0,0,0.03); }
        .rte-voice-play { flex-shrink: 0; width: 34px; height: 34px; border-radius: 50%; border: none; background: var(--coral,#ff7a6b); color: #fff; cursor: pointer; display: inline-flex; align-items: center; justify-content: center; }
        .rte-voice-play svg { margin-left: 1px; }
        .rte-voice-lbl { display: inline-flex; align-items: center; gap: 8px; min-width: 0; flex: 1; }
        .rte-voice-lbl > svg { color: var(--coral,#ff7a6b); flex-shrink: 0; }
        .rte-voice-name { font-size: 13px; font-weight: 700; color: var(--ink,#1a1a1a); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .rte-voice-dur { font-size: 11.5px; font-weight: 600; color: var(--slate,#6b7280); flex-shrink: 0; }
        .rte-voice-act { display: inline-flex; align-items: center; gap: 2px; flex-shrink: 0; }
        .rte-voice-btn { width: 30px; height: 30px; border-radius: 8px; border: none; background: transparent; color: var(--slate,#6b7280); cursor: pointer; display: inline-flex; align-items: center; justify-content: center; }
        .rte-voice-btn:hover { background: #f1f3f5; color: var(--ink,#1a1a1a); }
      `}</style>
      {(() => {
      const toolbarNode = (
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: big ? 5 : 4, padding: big ? '9px 10px' : 6, borderBottom: toolbarPortal ? 'none' : '1px solid var(--border)', background: toolbarPortal ? 'transparent' : 'var(--canvas)', position: toolbarPortal ? 'static' : 'sticky', top: 0, zIndex: 2, borderRadius: bordered ? 0 : 12, boxShadow: (big && !toolbarPortal) ? '0 1px 0 rgba(0,0,0,0.03)' : 'none' }}>
        <Btn title="Undo" on={() => exec('undo')}>
          <svg width={big ? 17 : 15} height={big ? 17 : 15} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 14 4 9l5-5"/><path d="M4 9h11a5 5 0 0 1 0 10h-1"/></svg>
        </Btn>
        <Btn title="Redo" on={() => exec('redo')}>
          <svg width={big ? 17 : 15} height={big ? 17 : 15} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 14 5-5-5-5"/><path d="M20 9H9a5 5 0 0 0 0 10h1"/></svg>
        </Btn>
        <Sep />
        <button type="button" title="Font" className="rte-btn" onMouseDown={e => e.preventDefault()} onClick={openPop('font')}
          style={{ height: S, padding: `0 ${big ? 11 : 9}px`, borderRadius: 9, border: '1px solid var(--border)', background: pop?.kind === 'font' ? 'var(--peach)' : '#fff', color: 'var(--ink)', fontSize: big ? 14 : 12.5, fontWeight: 700, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
          Aa<svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
        </button>
        <button type="button" title="Font size" className="rte-btn" onMouseDown={e => e.preventDefault()} onClick={openPop('size')}
          style={{ height: S, padding: `0 ${big ? 11 : 9}px`, borderRadius: 9, border: '1px solid var(--border)', background: pop?.kind === 'size' ? 'var(--peach)' : '#fff', color: 'var(--ink)', fontSize: big ? 14 : 12.5, fontWeight: 700, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
          Size<svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
        </button>
        <Btn title="Text color" on={openPop('fore')} active={pop?.kind === 'fore'}>
          <span style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'center', lineHeight: 1 }}><span style={{ fontWeight: 800 }}>A</span><span style={{ width: 15, height: 3, borderRadius: 2, background: 'var(--coral)', marginTop: 1 }} /></span>
        </Btn>
        <Btn title="Highlight" on={openPop('hilite')} active={pop?.kind === 'hilite'}>
          <svg width={big ? 17 : 15} height={big ? 17 : 15} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m9 11-6 6v3h3l6-6"/><path d="m22 12-4.6 4.6a2 2 0 0 1-2.8 0l-5.2-5.2a2 2 0 0 1 0-2.8L14 4"/></svg>
        </Btn>
        <Sep />
        <Btn title="Bold" on={() => exec('bold')}><b>B</b></Btn>
        <Btn title="Italic" on={() => exec('italic')}><i>I</i></Btn>
        <Btn title="Underline" on={() => exec('underline')}><u>U</u></Btn>
        <Btn title="Strikethrough" on={() => exec('strikeThrough')}><s>S</s></Btn>
        <Sep />
        <Btn title="Heading" on={() => formatBlock('H2')}>H₂</Btn>
        <Btn title="Subheading" on={() => formatBlock('H3')}>H₃</Btn>
        <Btn title="Normal text" on={() => formatBlock('P')}>¶</Btn>
        <Sep />
        <Btn title="Bulleted list" on={() => exec('insertUnorderedList')}>•≡</Btn>
        <Btn title="Numbered list" on={() => exec('insertOrderedList')}>1.≡</Btn>
        <Btn title="Quote" on={() => formatBlock('BLOCKQUOTE')}>❝</Btn>
        <Btn title="Link" on={addLink}>🔗</Btn>
        <Btn title="Clear formatting" on={() => exec('removeFormat')}>⌫</Btn>
        <Sep />
        <Btn title="Insert table" on={insertTable}>▦</Btn>
        <Btn title="Add row to table" on={addRow}>＋Row</Btn>
        <Btn title="Add column to table" on={addCol}>＋Col</Btn>
        {enableVoice && <>
          <Sep />
          {rec === 'idle' && (
            <Btn title="Record a voice note into the text" on={startVoice} active={false}>
              <svg width={big ? 17 : 15} height={big ? 17 : 15} viewBox="0 0 24 24" fill="none" stroke="var(--coral)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>
            </Btn>
          )}
          {rec === 'recording' && (
            <button type="button" onMouseDown={e => e.preventDefault()} onClick={stopVoice} title="Stop recording"
              style={{ height: S, padding: '0 12px', borderRadius: 9, border: 'none', background: '#dc2626', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 7 }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#fff', animation: 'rte-pulse 1s infinite' }} />
              {`${Math.floor(recSecs / 60)}:${String(recSecs % 60).padStart(2, '0')}`} · Stop
            </button>
          )}
          {rec === 'uploading' && <span style={{ alignSelf: 'center', fontSize: 12.5, color: 'var(--slate)', fontWeight: 600, padding: '0 8px' }}>Saving…</span>}
        </>}
      </div>
      )
      // When a portal target is provided, render the toolbar there (e.g. a fixed
      // top bar) instead of inline. Undefined = inline (default, tasks).
      return toolbarPortal === undefined ? toolbarNode : (toolbarPortal ? createPortal(toolbarNode, toolbarPortal) : null)
      })()}
      <style>{`@keyframes rte-pulse { 0%,100% { opacity: 1 } 50% { opacity: .3 } }`}</style>
      <div
        ref={ref}
        className="rte-content"
        contentEditable
        suppressContentEditableWarning
        data-ph={placeholder}
        onInput={() => { emitSoon(); detectMention() }}
        onKeyDown={onKeyDown}
        onKeyUp={detectMention}
        onClick={() => setMenu(null)}
        onMouseMove={onContentMove}
        onMouseLeave={() => { if (!dragBlockRef.current) scheduleHide() }}
        onBlur={() => { emit(); setTimeout(() => setMenu(null), 150) }}
        style={{ minHeight, maxHeight, overflowY: 'auto', padding: bordered ? '10px 12px' : '4px 0', fontSize: 16, lineHeight: 1.6, color: 'var(--ink)' }}
      />

      {blockDrag && (
        <>
          <button ref={handleRef} type="button" onPointerDown={onHandleDown} title="Drag to move this line"
            onMouseEnter={cancelHide} onMouseLeave={() => { if (!dragBlockRef.current) scheduleHide() }}
            style={{ position: 'fixed', top: 0, left: 0, opacity: 0, transform: 'translateY(-50%)', zIndex: 100055, width: 30, height: 30, borderRadius: 9, border: '1px solid var(--border,#e5e7eb)', background: '#fff', boxShadow: '0 3px 10px rgba(0,0,0,0.18)', color: '#374151', cursor: 'grab', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'opacity .12s ease, box-shadow .12s ease', touchAction: 'none' }}>
            <svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor"><circle cx="8" cy="5" r="2.15"/><circle cx="16" cy="5" r="2.15"/><circle cx="8" cy="12" r="2.15"/><circle cx="16" cy="12" r="2.15"/><circle cx="8" cy="19" r="2.15"/><circle cx="16" cy="19" r="2.15"/></svg>
          </button>
          <div ref={indicatorRef} style={{ position: 'fixed', top: 0, left: 0, height: 3, borderRadius: 2, background: 'var(--coral,#ff7a6b)', opacity: 0, zIndex: 100054, pointerEvents: 'none', transform: 'translateY(-50%)', boxShadow: '0 0 0 3px rgba(255,122,107,0.18)', transition: 'opacity .1s' }} />
        </>
      )}

      {pop && (
        <>
          <div onMouseDown={e => { e.preventDefault(); setPop(null) }} style={{ position: 'fixed', inset: 0, zIndex: 100059 }} />
          <div style={{ position: 'fixed', left: pop.x, top: pop.y, zIndex: 100061, background: '#fff', border: '1px solid var(--border)', borderRadius: 12, boxShadow: '0 14px 34px rgba(0,0,0,0.18)', padding: 7, minWidth: (pop.kind === 'fore' || pop.kind === 'hilite') ? 0 : 176 }}>
            {pop.kind === 'font' && FONTS.map(([label, val]) => (
              <button key={val} type="button" onMouseDown={e => { e.preventDefault(); applyPop('fontName', val) }}
                style={{ display: 'block', width: '100%', textAlign: 'left', padding: '8px 11px', border: 'none', borderRadius: 8, background: 'transparent', color: 'var(--ink)', fontFamily: val, fontSize: 14, fontWeight: 600, cursor: 'pointer' }}
                onMouseEnter={e => (e.currentTarget.style.background = 'var(--peach)')} onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>{label}</button>
            ))}
            {pop.kind === 'size' && SIZES.map(([label, val]) => (
              <button key={val} type="button" onMouseDown={e => { e.preventDefault(); applyPop('fontSize', val) }}
                style={{ display: 'block', width: '100%', textAlign: 'left', padding: '8px 11px', border: 'none', borderRadius: 8, background: 'transparent', color: 'var(--ink)', fontSize: val === '2' ? 12 : val === '3' ? 14 : val === '5' ? 17 : 20, fontWeight: 700, cursor: 'pointer' }}
                onMouseEnter={e => (e.currentTarget.style.background = 'var(--peach)')} onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>{label}</button>
            ))}
            {pop.kind === 'fore' && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 6, padding: 3 }}>
                {FORE.map(c => (
                  <button key={c} type="button" title={c} onMouseDown={e => { e.preventDefault(); applyPop('foreColor', c) }}
                    style={{ width: 26, height: 26, borderRadius: 7, border: '1px solid rgba(0,0,0,0.12)', background: c, cursor: 'pointer' }} />
                ))}
              </div>
            )}
            {pop.kind === 'hilite' && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6, padding: 3 }}>
                {HILITE.map(([label, c]) => (
                  <button key={c} type="button" title={label} onMouseDown={e => { e.preventDefault(); applyPop('hiliteColor', c) }}
                    style={{ width: 30, height: 26, borderRadius: 7, border: '1px solid rgba(0,0,0,0.12)', background: c === 'transparent' ? '#fff' : c, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {c === 'transparent' && <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#dc2626" strokeWidth="2" strokeLinecap="round"><line x1="5" y1="5" x2="19" y2="19"/></svg>}
                  </button>
                ))}
              </div>
            )}
          </div>
        </>
      )}

      {menu && (
        <div style={{ position: 'fixed', left: menu.x, top: menu.y, zIndex: 100060, background: '#fff', border: '1px solid var(--border)', borderRadius: 10, boxShadow: '0 12px 30px rgba(0,0,0,0.18)', padding: 5, minWidth: 180, maxWidth: 240 }}>
          {menu.items.map((it, i) => (
            <button key={it.id} type="button"
              onMouseDown={e => { e.preventDefault(); insertMention(it.name) }}
              style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', textAlign: 'left', padding: '7px 9px', border: 'none', borderRadius: 7, background: i === menu.active ? 'var(--peach)' : 'transparent', color: 'var(--ink)', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
              <span style={{ width: 22, height: 22, borderRadius: '50%', background: 'var(--coral)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 800, flexShrink: 0 }}>{it.name.charAt(0).toUpperCase()}</span>
              {it.name}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
