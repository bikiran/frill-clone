'use client'

import { useRef, useEffect, useState } from 'react'

// A lightweight rich-text editor built on contentEditable + execCommand — no
// external dependency. Supports bold/italic/underline/strikethrough, headings,
// lists, quote, links, inserting/growing tables, and optional @mentions. Emits
// HTML on input (debounced) and on blur. Remount it per record with a `key` so
// the initial value loads cleanly without fighting the caret.
const CELL = 'border:1px solid #d4d4d8;padding:6px 8px;min-width:40px;vertical-align:top;'

type Mention = { id: string; name: string }

export default function RichTextEditor({
  value, onChange, placeholder = 'Add a description…', mentions, minHeight = 120, maxHeight = 360, bordered = true,
}: {
  value: string
  onChange: (html: string) => void
  placeholder?: string
  mentions?: Mention[]
  minHeight?: number
  maxHeight?: number | string
  bordered?: boolean
}) {
  const ref = useRef<HTMLDivElement>(null)
  const timer = useRef<any>(null)
  const [menu, setMenu] = useState<{ x: number; y: number; items: Mention[]; active: number } | null>(null)

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

  const Btn = ({ on, title, children }: any) => (
    <button type="button" title={title}
      onMouseDown={(e) => e.preventDefault()}
      onClick={on}
      style={{ minWidth: 28, height: 28, padding: '0 7px', borderRadius: 6, border: '1px solid var(--border)', background: '#fff', color: 'var(--ink)', fontSize: 13, fontWeight: 700, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
      {children}
    </button>
  )

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
      `}</style>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, padding: 6, borderBottom: '1px solid var(--border)', background: 'var(--canvas)', position: 'sticky', top: 0, zIndex: 2 }}>
        <Btn title="Bold" on={() => exec('bold')}><b>B</b></Btn>
        <Btn title="Italic" on={() => exec('italic')}><i>I</i></Btn>
        <Btn title="Underline" on={() => exec('underline')}><u>U</u></Btn>
        <Btn title="Strikethrough" on={() => exec('strikeThrough')}><s>S</s></Btn>
        <span style={{ width: 1, background: 'var(--border)', margin: '0 2px' }} />
        <Btn title="Heading" on={() => formatBlock('H2')}>H₂</Btn>
        <Btn title="Subheading" on={() => formatBlock('H3')}>H₃</Btn>
        <Btn title="Normal text" on={() => formatBlock('P')}>¶</Btn>
        <span style={{ width: 1, background: 'var(--border)', margin: '0 2px' }} />
        <Btn title="Bulleted list" on={() => exec('insertUnorderedList')}>•≡</Btn>
        <Btn title="Numbered list" on={() => exec('insertOrderedList')}>1.≡</Btn>
        <Btn title="Quote" on={() => formatBlock('BLOCKQUOTE')}>❝</Btn>
        <Btn title="Link" on={addLink}>🔗</Btn>
        <Btn title="Clear formatting" on={() => exec('removeFormat')}>⌫</Btn>
        <span style={{ width: 1, background: 'var(--border)', margin: '0 2px' }} />
        <Btn title="Insert table" on={insertTable}>▦</Btn>
        <Btn title="Add row to table" on={addRow}>＋Row</Btn>
        <Btn title="Add column to table" on={addCol}>＋Col</Btn>
      </div>
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
