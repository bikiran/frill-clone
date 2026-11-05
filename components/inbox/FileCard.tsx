'use client'

// A file sent or received in a conversation (a quote PDF, a spreadsheet…), as
// a card: a tile in the file type's colour, the file's name, its type and
// size, and a download button. Sellio-style, instead of a bare underlined name.

type FileAtt = { url: string; name?: string; type?: string; size?: number }

const TONES: Record<string, string> = {
  PDF: '#ef4444',
  DOC: '#2563eb', DOCX: '#2563eb', PAGES: '#2563eb', RTF: '#2563eb',
  XLS: '#16a34a', XLSX: '#16a34a', CSV: '#16a34a', NUMBERS: '#16a34a',
  PPT: '#f97316', PPTX: '#f97316', KEY: '#f97316',
  ZIP: '#a16207', RAR: '#a16207', '7Z': '#a16207',
  TXT: '#64748b', JSON: '#64748b',
}
const BY_MIME: [RegExp, string][] = [
  [/pdf/i, 'PDF'], [/wordprocessingml|msword/i, 'DOCX'], [/spreadsheetml|ms-excel/i, 'XLSX'],
  [/csv/i, 'CSV'], [/presentationml|ms-powerpoint/i, 'PPTX'], [/zip/i, 'ZIP'], [/^text\//i, 'TXT'],
]

/** The colour for a file type ("PDF" → red), slate when unknown. */
export const fileTone = (ext: string) => TONES[ext] || '#64748b'

const KINDS: Record<string, string> = {
  PDF: 'PDF document', DOC: 'Word document', DOCX: 'Word document', PAGES: 'Pages document',
  XLS: 'Excel spreadsheet', XLSX: 'Excel spreadsheet', CSV: 'Spreadsheet (CSV)', NUMBERS: 'Numbers spreadsheet',
  PPT: 'PowerPoint', PPTX: 'PowerPoint', KEY: 'Keynote', ZIP: 'ZIP archive', TXT: 'Text file',
}

/** "PDF", "DOCX"… from the name, else the type; "" when neither says. */
export function fileExt(name?: string, type?: string): string {
  const m = String(name || '').split('?')[0].match(/\.([a-z0-9]{1,7})$/i)
  if (m) return m[1].toUpperCase()
  for (const [re, ext] of BY_MIME) if (re.test(type || '')) return ext
  return ''
}

/** 248 KB, 1.4 MB. */
export function fileSize(bytes?: number): string {
  if (!bytes || bytes <= 0) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / 1024 / 1024).toFixed(bytes < 10 * 1024 * 1024 ? 1 : 0)} MB`
}

/**
 * The message's own words, without the "📎 name" lines a file-only message is
 * saved with (they're for the conversation list and older apps; the card
 * already says it).
 */
export function withoutFileLines(content: string | null | undefined, files: FileAtt[]): string {
  const text = String(content || '')
  if (!files.length || !text) return text
  const names = new Set(files.map(f => String(f.name || '').trim()).filter(Boolean))
  return text.split('\n').filter(line => {
    const m = line.trim().match(/^📎\s*(.+?)(?::\s*https?:\/\/\S+)?$/u)
    return !(m && names.has(m[1].trim()))
  }).join('\n').trim()
}

export default function FileCard({ a, mine, plain }: { a: FileAtt; mine?: boolean; plain?: boolean }) {
  const name = a.name || 'File'
  const ext = fileExt(a.name, a.type)
  const tone = fileTone(ext)
  const meta = [ext ? (KINDS[ext] || `${ext} file`) : 'File', fileSize(a.size)].filter(Boolean).join(' · ')
  // `plain`: the card on its own (a file-only message); otherwise inside a
  // coloured bubble, where it sits as a soft panel.
  return (
    <a href={a.url} target="_blank" rel="noopener" download={name} title={`Open ${name}`}
      className={`tm-file${plain ? ' plain' : mine ? ' on' : ''}`} style={{ ['--ft' as string]: tone } as React.CSSProperties}>
      <span className="tm-file-ic" aria-hidden="true">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /></svg>
        {ext && ext.length <= 4 ? <em>{ext}</em> : null}
      </span>
      <span className="tm-file-tx">
        <b>{name}</b>
        <small>{meta}</small>
      </span>
      <span className="tm-file-go" aria-hidden="true">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 4v11" /><polyline points="7 10 12 15 17 10" /><path d="M5 20h14" /></svg>
      </span>
    </a>
  )
}

/**
 * A conversation whose newest message is only files, in the list: a small
 * chip in the file type's colour with the file's name ("Jeb Order Labels.pdf",
 * "+2" for more), instead of "📎 name" text. `children` replaces the name (the
 * list's search highlight).
 */
export function FilePreviewChip({ name, more, photo, children }: { name: string; more: number; photo?: boolean; children?: React.ReactNode }) {
  const ext = photo ? '' : fileExt(name)
  const tone = photo ? '#0ea5e9' : fileTone(ext)
  return (
    <span className="lfp" style={{ ['--ft' as string]: tone } as React.CSSProperties} title={more ? `${name} and ${more} more` : name}>
      <span className="lfp-ic" aria-hidden="true">
        {photo
          ? <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="3" /><circle cx="9" cy="9" r="2" /><path d="m21 15-5-5L5 21" /></svg>
          : <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /></svg>}
      </span>
      <span className="lfp-nm">{children ?? name}</span>
      {more ? <span className="lfp-more">+{more}</span> : null}
    </span>
  )
}
