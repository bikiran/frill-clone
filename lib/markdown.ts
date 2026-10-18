// A small, dependency-free Markdown → HTML renderer for blog article bodies.
// Authors are trusted (super-admins), but we still HTML-escape first and only
// re-introduce a fixed set of safe tags, so a stray '<' in copy can't break the
// page or inject markup. Supports: ## / ### headings, paragraphs, - / * and
// 1. lists, > blockquotes, --- rules, ![alt](src "caption") images, fenced ```
// code, and inline **bold**, *italic*, `code`, [links](url). Plus, for richer
// articles:
//   > [!TIP] Optional title        a callout box. Kinds: TIP, NOTE, EXAMPLE,
//   > Body line, - list items      TRY ("Try it in Colvy"), WARNING.
//   | A | B |  + |---|---| rows     a table.
//   ```chat                        a conversation mock-up, one line each:
//   title: Business · SMS            header (optional)
//   them: / you: / ai: / draft:      customer, business, AI reply, AI draft
//   event: Payment received          a centred status line
//   card: Title | detail | Button    a link card (payment, booking, upload)
//   ```

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

// Inline formatting, applied to already-escaped text.
function inline(s: string): string {
  return s
    .replace(/`([^`]+)`/g, (_m, c) => `<code>${c}</code>`)
    .replace(/\*\*([^*]+)\*\*/g, (_m, c) => `<strong>${c}</strong>`)
    .replace(/(^|[^*])\*([^*]+)\*/g, (_m, pre, c) => `${pre}<em>${c}</em>`)
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_m, text, href) => {
      const safe = /^(https?:\/\/|\/|mailto:|#)/i.test(href) ? href : '#'
      const ext = /^https?:\/\//i.test(safe)
      return `<a href="${safe}"${ext ? ' target="_blank" rel="noopener"' : ''}>${text}</a>`
    })
}

const CALLOUTS: Record<string, string> = { TIP: 'Tip', NOTE: 'Note', EXAMPLE: 'Example', TRY: 'Try it in Colvy', WARNING: 'Heads up' }

// The body of a callout: paragraphs split on blank lines, "- " lines as a list.
function blockBody(lines: string[]): string {
  const out: string[] = []
  let para: string[] = [], items: string[] = []
  const flush = () => {
    if (para.length) { out.push(`<p>${inline(esc(para.join(' ')))}</p>`); para = [] }
    if (items.length) { out.push(`<ul>${items.map(it => `<li>${inline(esc(it))}</li>`).join('')}</ul>`); items = [] }
  }
  for (const l of lines) {
    if (/^\s*$/.test(l)) { flush(); continue }
    if (/^\s*[-*]\s+/.test(l)) { if (para.length) { out.push(`<p>${inline(esc(para.join(' ')))}</p>`); para = [] } items.push(l.replace(/^\s*[-*]\s+/, '')); continue }
    if (items.length) flush()
    para.push(l.trim())
  }
  flush()
  return out.join('')
}

// ```chat fenced block → a phone-style conversation.
function renderChat(lines: string[]): string {
  let title = '', sub = ''
  const rows: string[] = []
  for (const raw of lines) {
    const m = raw.match(/^\s*(title|sub|them|customer|you|business|ai|draft|event|card)\s*:\s?(.*)$/i)
    if (!m) continue
    const kind = m[1].toLowerCase(), text = m[2].trim()
    if (kind === 'title') { const [t, ...rest] = text.split('·'); title = t.trim(); sub = rest.join('·').trim(); continue }
    if (kind === 'sub') { sub = text; continue }
    if (kind === 'event') { rows.push(`<div class="chat-event">${inline(esc(text))}</div>`); continue }
    if (kind === 'card') {
      const [t, d, b] = text.split('|').map(x => x.trim())
      rows.push(`<div class="chat-row out"><div class="chat-card"><strong>${inline(esc(t || ''))}</strong>${d ? `<span>${inline(esc(d))}</span>` : ''}${b ? `<em>${esc(b)}</em>` : ''}</div></div>`)
      continue
    }
    const side = kind === 'them' || kind === 'customer' ? 'in' : 'out'
    const tag = kind === 'ai' ? '<span class="chat-tag">Colvy AI</span>' : kind === 'draft' ? '<span class="chat-tag">AI draft · waiting for you</span>' : ''
    rows.push(`<div class="chat-row ${side}"><div class="chat-bubble${kind === 'ai' || kind === 'draft' ? ' ai' : ''}${kind === 'draft' ? ' draft' : ''}">${tag}${inline(esc(text))}</div></div>`)
  }
  const head = title ? `<div class="chat-head"><span class="chat-avatar">${esc(title[0] || '')}</span><span><strong>${inline(esc(title))}</strong>${sub ? `<small>${inline(esc(sub))}</small>` : ''}</span></div>` : ''
  return `<div class="chat">${head}<div class="chat-body">${rows.join('')}</div></div>`
}

const cells = (row: string) => row.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map(c => c.trim())

export function renderMarkdown(md: string): string {
  const lines = String(md || '').replace(/\r\n/g, '\n').split('\n')
  const out: string[] = []
  let i = 0
  let para: string[] = []
  const flushPara = () => {
    if (para.length) { out.push(`<p>${inline(esc(para.join(' ')))}</p>`); para = [] }
  }

  while (i < lines.length) {
    const line = lines[i]

    if (/^```/.test(line)) {            // fenced code block (```chat: a conversation)
      flushPara()
      const chat = /^```\s*chat\s*$/i.test(line)
      i++
      const code: string[] = []
      while (i < lines.length && !/^```/.test(lines[i])) { code.push(lines[i]); i++ }
      i++ // closing fence
      out.push(chat ? renderChat(code) : `<pre><code>${esc(code.join('\n'))}</code></pre>`)
      continue
    }
    if (/^\s*\|.*\|\s*$/.test(line) && /^\s*\|?\s*:?-{3,}/.test(lines[i + 1] || '')) {  // table
      flushPara()
      const head = cells(line)
      i += 2
      const body: string[][] = []
      while (i < lines.length && /^\s*\|.*\|\s*$/.test(lines[i])) { body.push(cells(lines[i])); i++ }
      out.push(`<div class="table-wrap"><table><thead><tr>${head.map(h => `<th>${inline(esc(h))}</th>`).join('')}</tr></thead><tbody>${body.map(r => `<tr>${r.map(c => `<td>${inline(esc(c))}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`)
      continue
    }
    if (/^\s*$/.test(line)) { flushPara(); i++; continue }
    if (/^###\s+/.test(line)) { flushPara(); out.push(`<h3>${inline(esc(line.replace(/^###\s+/, '')))}</h3>`); i++; continue }
    if (/^##\s+/.test(line)) { flushPara(); out.push(`<h2>${inline(esc(line.replace(/^##\s+/, '')))}</h2>`); i++; continue }
    if (/^(---|\*\*\*|___)\s*$/.test(line)) { flushPara(); out.push('<hr />'); i++; continue }
    if (/^!\[[^\]]*\]\([^)]+\)\s*$/.test(line)) {  // standalone image, optional "caption"
      flushPara()
      const m = line.match(/^!\[([^\]]*)\]\(\s*(\S+)(?:\s+"([^"]*)")?\s*\)/)!
      const src = m && /^(https?:\/\/|\/)/i.test(m[2]) ? m[2] : ''
      if (src) out.push(`<figure><img src="${esc(src).replace(/"/g, '&quot;')}" alt="${esc(m[1]).replace(/"/g, '&quot;')}" loading="lazy" />${m[3] ? `<figcaption>${inline(esc(m[3]))}</figcaption>` : ''}</figure>`)
      i++; continue
    }
    if (/^>\s?/.test(line)) {            // blockquote (grouped), or a > [!TIP] callout
      flushPara()
      const quote: string[] = []
      while (i < lines.length && /^>\s?/.test(lines[i])) { quote.push(lines[i].replace(/^>\s?/, '')); i++ }
      const c = quote[0].match(/^\[!(TIP|NOTE|EXAMPLE|TRY|WARNING)\]\s*(.*)$/i)
      if (c) {
        const kind = c[1].toUpperCase()
        out.push(`<aside class="callout callout-${kind.toLowerCase()}"><p class="callout-title">${inline(esc(c[2] || CALLOUTS[kind]))}</p>${blockBody(quote.slice(1))}</aside>`)
      } else {
        out.push(`<blockquote>${inline(esc(quote.join(' ')))}</blockquote>`)
      }
      continue
    }
    if (/^\s*[-*]\s+/.test(line)) {      // unordered list
      flushPara()
      const items: string[] = []
      while (i < lines.length && /^\s*[-*]\s+/.test(lines[i])) { items.push(lines[i].replace(/^\s*[-*]\s+/, '')); i++ }
      out.push(`<ul>${items.map(it => `<li>${inline(esc(it))}</li>`).join('')}</ul>`)
      continue
    }
    if (/^\s*\d+\.\s+/.test(line)) {     // ordered list
      flushPara()
      const items: string[] = []
      while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i])) { items.push(lines[i].replace(/^\s*\d+\.\s+/, '')); i++ }
      out.push(`<ol>${items.map(it => `<li>${inline(esc(it))}</li>`).join('')}</ol>`)
      continue
    }
    para.push(line.trim()); i++
  }
  flushPara()
  return out.join('\n')
}

// Rough reading time from raw markdown/plain text (~200 wpm).
export function readingMinutes(text: string): number {
  const words = String(text || '').trim().split(/\s+/).filter(Boolean).length
  return Math.max(1, Math.round(words / 200))
}
