'use client'

import { useRef, useEffect, useState } from 'react'
import { createPortal } from 'react-dom'

// A lightweight rich-text editor built on contentEditable + execCommand — no
// external dependency. Supports bold/italic/underline/strikethrough, headings,
// lists, quote, links, inserting/growing tables, and optional @mentions. Emits
// HTML on input (debounced) and on blur. Remount it per record with a `key` so
// the initial value loads cleanly without fighting the caret.
const CELL = 'border:1px solid #d4d4d8;padding:6px 8px;min-width:40px;vertical-align:top;'

type Mention = { id: string; name: string }

export default function RichTextEditor({
  value, onChange, placeholder = 'Add a description…', mentions, minHeight = 120, maxHeight = 360, bordered = true,
  enableVoice = false, companyId, big = false, toolbarPortal,
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
}) {
  const ref = useRef<HTMLDivElement>(null)
  const timer = useRef<any>(null)
  const [menu, setMenu] = useState<{ x: number; y: number; items: Mention[]; active: number } | null>(null)
  const [rec, setRec] = useState<'idle' | 'recording' | 'uploading'>('idle')
  const [recSecs, setRecSecs] = useState(0)
  const recRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const streamRef = useRef<MediaStream | null>(null)
  const tickRef = useRef<any>(null)

  const insertVoiceBlock = (url: string, secs: number) => {
    const label = new Date().toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
    const html = `<div class="rte-voice" contenteditable="false"><span class="rte-voice-lbl"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>Voice note · ${label}</span><audio controls src="${url}"></audio></div><p><br></p>`
    ref.current?.focus()
    document.execCommand('insertHTML', false, html)
    emit()
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
    if (ref.current) ref.current.innerHTML = value || ''
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
        /* Bordered inline voice note, Evernote-style. */
        .rte-content .rte-voice, .note-body .rte-voice { display: flex; align-items: center; gap: 12px; padding: 10px 14px; margin: 10px 0; border: 1px solid var(--border); border-radius: 12px; background: #fbfbfd; }
        .rte-content .rte-voice-lbl, .note-body .rte-voice-lbl { display: inline-flex; align-items: center; gap: 6px; font-size: 12.5px; font-weight: 700; color: var(--coral); white-space: nowrap; }
        .rte-content .rte-voice audio, .note-body .rte-voice audio { height: 36px; flex: 1; min-width: 160px; }
      `}</style>
      {(() => {
      const toolbarNode = (
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: big ? 5 : 4, padding: big ? '9px 10px' : 6, borderBottom: toolbarPortal ? 'none' : '1px solid var(--border)', background: toolbarPortal ? 'transparent' : 'var(--canvas)', position: toolbarPortal ? 'static' : 'sticky', top: 0, zIndex: 2, borderRadius: bordered ? 0 : 12, boxShadow: (big && !toolbarPortal) ? '0 1px 0 rgba(0,0,0,0.03)' : 'none' }}>
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
        onBlur={() => { emit(); setTimeout(() => setMenu(null), 150) }}
        style={{ minHeight, maxHeight, overflowY: 'auto', padding: bordered ? '10px 12px' : '4px 0', fontSize: 16, lineHeight: 1.6, color: 'var(--ink)' }}
      />

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
