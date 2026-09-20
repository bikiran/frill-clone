// A small, dependency-free Markdown → HTML renderer for blog article bodies.
// Authors are trusted (super-admins), but we still HTML-escape first and only
// re-introduce a fixed set of safe tags, so a stray '<' in copy can't break the
// page or inject markup. Supports: ## / ### headings, paragraphs, - / * and
// 1. lists, > blockquotes, --- rules, ![alt](src) images, fenced ``` code, and
// inline **bold**, *italic*, `code`, [links](url).

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

    if (/^```/.test(line)) {            // fenced code block
      flushPara(); i++
      const code: string[] = []
      while (i < lines.length && !/^```/.test(lines[i])) { code.push(lines[i]); i++ }
      i++ // closing fence
      out.push(`<pre><code>${esc(code.join('\n'))}</code></pre>`)
      continue
    }
    if (/^\s*$/.test(line)) { flushPara(); i++; continue }
    if (/^###\s+/.test(line)) { flushPara(); out.push(`<h3>${inline(esc(line.replace(/^###\s+/, '')))}</h3>`); i++; continue }
    if (/^##\s+/.test(line)) { flushPara(); out.push(`<h2>${inline(esc(line.replace(/^##\s+/, '')))}</h2>`); i++; continue }
    if (/^(---|\*\*\*|___)\s*$/.test(line)) { flushPara(); out.push('<hr />'); i++; continue }
    if (/^!\[[^\]]*\]\([^)]+\)\s*$/.test(line)) {  // standalone image
      flushPara()
      const m = line.match(/^!\[([^\]]*)\]\(([^)]+)\)/)!
      const src = /^(https?:\/\/|\/)/i.test(m[2]) ? m[2] : ''
      if (src) out.push(`<figure><img src="${src}" alt="${esc(m[1])}" loading="lazy" /></figure>`)
      i++; continue
    }
    if (/^>\s?/.test(line)) {            // blockquote (grouped)
      flushPara()
      const quote: string[] = []
      while (i < lines.length && /^>\s?/.test(lines[i])) { quote.push(lines[i].replace(/^>\s?/, '')); i++ }
      out.push(`<blockquote>${inline(esc(quote.join(' ')))}</blockquote>`)
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
