'use client'

import { useRef, useEffect } from 'react'

// A lightweight rich-text editor built on contentEditable + execCommand — no
// external dependency. Supports bold/italic/underline/strikethrough, headings,
// lists, quote, links, and inserting/growing tables. Emits HTML on input
// (debounced) and on blur. Remount it per record with a `key` so the initial
// value loads cleanly without fighting the caret.
const CELL = 'border:1px solid #d4d4d8;padding:6px 8px;min-width:40px;vertical-align:top;'

export default function RichTextEditor({
  value, onChange, placeholder = 'Add a description…',
}: {
  value: string
  onChange: (html: string) => void
  placeholder?: string
}) {
  const ref = useRef<HTMLDivElement>(null)
  const timer = useRef<any>(null)

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

  // Find the table the caret is inside (if any).
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

  // Toolbar buttons must not steal focus (which would drop the selection), so
  // we preventDefault on mousedown and act on click.
  const Btn = ({ on, title, children }: any) => (
    <button type="button" title={title}
      onMouseDown={(e) => e.preventDefault()}
      onClick={on}
      style={{ minWidth: 28, height: 28, padding: '0 7px', borderRadius: 6, border: '1px solid var(--border)', background: '#fff', color: 'var(--ink)', fontSize: 13, fontWeight: 700, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
      {children}
    </button>
  )

  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden', background: '#fff' }}>
      <style>{`
        .rte-content:empty:before { content: attr(data-ph); color: #9ca3af; }
        .rte-content:focus { outline: none; }
        .rte-content table { border-collapse: collapse; }
        .rte-content td, .rte-content th { border: 1px solid #d4d4d8; padding: 6px 8px; }
        .rte-content h2 { font-size: 17px; font-weight: 800; margin: 8px 0 4px; }
        .rte-content h3 { font-size: 15px; font-weight: 800; margin: 8px 0 4px; }
        .rte-content ul, .rte-content ol { padding-left: 22px; margin: 4px 0; }
        .rte-content blockquote { border-left: 3px solid var(--border); margin: 6px 0; padding: 2px 0 2px 12px; color: var(--slate); }
        .rte-content a { color: var(--coral); text-decoration: underline; }
        .rte-content p { margin: 4px 0; }
      `}</style>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, padding: 6, borderBottom: '1px solid var(--border)', background: 'var(--canvas)' }}>
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
        onInput={emitSoon}
        onBlur={emit}
        style={{ minHeight: 120, maxHeight: 360, overflowY: 'auto', padding: '10px 12px', fontSize: 13.5, lineHeight: 1.55, color: 'var(--ink)' }}
      />
    </div>
  )
}
