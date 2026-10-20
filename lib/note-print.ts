// A note as a printable page, laid out like the orders packing slip
// (components/OrderPrintDoc): the business's logo and name on the left, "NOTE"
// with the date and author on the right, an accent rule, then the title, the
// body and the checklist as a ruled table (tick box, photo, item, SKU, qty).
// Pure string building; the notes page opens it in a new window and prints.

export type PrintChecklistItem = { text: string; done: boolean; image?: string | null; qty?: number; sku?: string | null; price?: string | null; due?: string | null }
export type PrintNote = {
  title: string
  bodyHtml: string            // already cleaned for print (noteBodyForPrint)
  checklist: PrintChecklistItem[]
  tags?: string[]
  notebook?: string | null
  reminderAt?: string | null
  updatedAt?: string | null
  author?: string | null
  images?: { url: string; name?: string }[]
  voiceNotes?: { name: string; duration?: string }[]
}
export type PrintCompany = { name?: string | null; logoUrl?: string | null; accent?: string | null }

const esc = (s: unknown) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const safeUrl = (u: unknown) => /^(https?:|data:image\/|\/)/i.test(String(u || '')) ? String(u) : ''
const safeColor = (c: unknown) => /^#[0-9a-f]{3,8}$/i.test(String(c || '')) ? String(c) : '#ff7a6b'

const fmtDate = (iso?: string | null, withTime = false) => {
  if (!iso) return ''
  const d = new Date(iso)
  if (isNaN(d.getTime())) return ''
  return d.toLocaleString('en-AU', withTime
    ? { day: '2-digit', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' }
    : { day: '2-digit', month: 'short', year: 'numeric' })
}

const TICK = '<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="#fff" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>'
const MIC = '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/></svg>'

/**
 * The note body ready for print, in the browser: voice-note cards become one
 * tidy line ("Voice note · name · 0:02"), players, buttons and scripts go, and
 * event-handler attributes are dropped.
 */
export function noteBodyForPrint(html: string): string {
  if (typeof DOMParser === 'undefined') return html || ''
  const doc = new DOMParser().parseFromString(`<div id="r">${html || ''}</div>`, 'text/html')
  const root = doc.getElementById('r')!
  root.querySelectorAll('.rte-voice').forEach(card => {
    const name = card.querySelector('.rte-voice-name')?.textContent?.trim() || 'Voice note'
    const dur = card.querySelector('.rte-voice-dur')?.textContent?.trim() || ''
    const chip = doc.createElement('div')
    chip.className = 'np-voice'
    chip.innerHTML = `${MIC}<span><b>Voice note</b> · ${esc(name)}${dur ? ` · ${esc(dur)}` : ''}</span>`
    card.replaceWith(chip)
  })
  root.querySelectorAll('script, style, iframe, object, embed, audio, video, button, input, select, textarea, form').forEach(el => el.remove())
  root.querySelectorAll('*').forEach(el => {
    for (const a of Array.from(el.attributes)) {
      if (/^on/i.test(a.name) || a.name === 'contenteditable') el.removeAttribute(a.name)
      if ((a.name === 'href' || a.name === 'src') && /^\s*javascript:/i.test(a.value)) el.removeAttribute(a.name)
    }
  })
  // Drop empty trailing paragraphs the editor leaves behind.
  while (root.lastElementChild && /^(P|DIV)$/.test(root.lastElementChild.nodeName) && !root.lastElementChild.textContent?.trim() && !root.lastElementChild.querySelector('img')) root.lastElementChild.remove()
  return root.innerHTML
}

export function renderNotePrintHtml(note: PrintNote, company: PrintCompany = {}): string {
  const accent = safeColor(company.accent)
  const name = company.name || 'Notes'
  const logo = safeUrl(company.logoUrl)
  const items = note.checklist || []
  const done = items.filter(i => i.done).length
  const hasImg = items.some(i => safeUrl(i.image))
  const hasSku = items.some(i => i.sku)
  const hasQty = items.some(i => (i.qty || 1) !== 1)
  const hasPrice = items.some(i => i.price)
  const pct = items.length ? Math.round((done / items.length) * 100) : 0
  const updated = fmtDate(note.updatedAt, true)
  const body = (note.bodyHtml || '').trim()
  const tags = (note.tags || []).filter(Boolean)

  const rows = items.map(i => {
    const img = safeUrl(i.image)
    return `<tr class="${i.done ? 'np-done' : ''}">
<td class="np-boxcell"><span class="np-box${i.done ? ' np-on' : ''}">${i.done ? TICK : ''}</span></td>
${hasImg ? `<td class="np-imgcell">${img ? `<img src="${esc(img)}" alt="">` : '<span class="np-noimg"></span>'}</td>` : ''}
<td class="np-item">${esc(i.text)}${i.due ? `<div class="np-due">Due ${esc(fmtDate(i.due))}</div>` : ''}</td>
${hasSku ? `<td class="np-sku">${esc(i.sku || '—')}</td>` : ''}
${hasQty ? `<td class="np-qty">${esc(i.qty || 1)}</td>` : ''}
${hasPrice ? `<td class="np-price">${esc(i.price || '')}</td>` : ''}
</tr>`
  }).join('')

  return `<!doctype html><html lang="en-AU"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(note.title || 'Note')}</title>
<style>
@page{size:A4;margin:14mm}
*{box-sizing:border-box;-webkit-print-color-adjust:exact;print-color-adjust:exact}
body{margin:0;background:#fff;color:#0f172a;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;font-size:13px;line-height:1.55}
.np{max-width:720px;margin:0 auto;padding:22px 20px 26px}
.np-head{display:flex;justify-content:space-between;align-items:flex-start;gap:16px;padding-bottom:14px;border-bottom:3px solid ${accent}}
.np-from{display:flex;align-items:center;gap:12px;min-width:0}
.np-logo{height:44px;max-width:140px;object-fit:contain}
.np-initial{width:44px;height:44px;border-radius:9px;background:${accent};color:#fff;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:18px;flex-shrink:0}
.np-co{font-size:17px;font-weight:800}
.np-small{font-size:11.5px;color:#64748b}
.np-right{text-align:right;flex-shrink:0}
.np-kind{font-size:20px;font-weight:800;letter-spacing:-0.02em}
.np-sub{font-size:13px;font-weight:700;color:${accent};margin-top:2px}
.np-title{font-size:24px;font-weight:800;letter-spacing:-0.02em;margin:18px 0 8px;line-height:1.25}
.np-meta{display:flex;flex-wrap:wrap;gap:6px;align-items:center;margin-bottom:6px}
.np-tag{display:inline-block;padding:2px 9px;border-radius:999px;background:#f1f5f9;border:1px solid #e2e8f0;font-size:11px;font-weight:600;color:#334155}
.np-rem{font-size:11.5px;font-weight:700;color:#b45309}
.np-label{font-size:10.5px;text-transform:uppercase;letter-spacing:0.05em;color:#64748b;font-weight:700}
.np-body{margin-top:14px;font-size:13.5px;line-height:1.65;overflow-wrap:anywhere}
.np-body p{margin:0 0 8px}
.np-body h1,.np-body h2,.np-body h3{margin:14px 0 6px;line-height:1.3}
.np-body ul,.np-body ol{margin:0 0 8px;padding-left:22px}
.np-body img{max-width:100%;border-radius:8px}
.np-body a{color:${accent}}
.np-voice{display:flex;align-items:center;gap:8px;margin:8px 0;padding:7px 11px;border:1px solid #e2e8f0;border-radius:8px;background:#f8fafc;font-size:12px;color:#334155;width:fit-content;max-width:100%}
.np-section{margin-top:20px}
.np-sechead{display:flex;justify-content:space-between;align-items:center;gap:12px}
.np-progress{display:flex;align-items:center;gap:8px;font-size:12px;font-weight:700;color:#334155}
.np-bar{width:120px;height:6px;border-radius:999px;background:#e2e8f0;overflow:hidden}
.np-bar i{display:block;height:100%;background:${accent}}
table{width:100%;border-collapse:collapse;margin-top:8px}
th{text-align:left;font-size:10.5px;text-transform:uppercase;letter-spacing:0.05em;color:#64748b;font-weight:700;padding:8px 8px;border-bottom:2px solid #0f172a}
td{font-size:13px;padding:8px 8px;border-bottom:1px solid #e2e8f0;vertical-align:middle}
tr{break-inside:avoid}
.np-boxcell{width:30px}
.np-box{display:inline-flex;align-items:center;justify-content:center;width:18px;height:18px;border:1.8px solid #94a3b8;border-radius:5px;background:#fff}
.np-box.np-on{background:${accent};border-color:${accent}}
.np-done .np-item{color:#64748b}
.np-imgcell{width:46px}
.np-imgcell img,.np-noimg{display:block;width:36px;height:36px;border-radius:6px;object-fit:cover;border:1px solid #e2e8f0;background:#f1f5f9}
.np-item{font-weight:500}
.np-due{font-size:11px;color:#b45309;font-weight:600;margin-top:2px}
.np-sku{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:11.5px;color:#475569;white-space:nowrap}
.np-qty{text-align:center;font-weight:700;width:52px}
.np-price{text-align:right;white-space:nowrap;width:80px}
th.np-qty{text-align:center} th.np-price{text-align:right}
.np-gallery{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-top:8px}
.np-gallery img{width:100%;height:150px;object-fit:cover;border-radius:8px;border:1px solid #e2e8f0}
.np-foot{margin-top:22px;padding-top:10px;border-top:1px solid #e2e8f0;font-size:11px;color:#94a3b8;display:flex;justify-content:space-between;gap:12px}
@media (max-width:520px){.np{padding:16px 14px}.np-head{flex-direction:column;gap:10px}.np-right{text-align:left}.np-title{font-size:20px}.np-gallery{grid-template-columns:repeat(2,1fr)}.np-sku{display:none}}
</style></head><body><div class="np">
<div class="np-head">
<div class="np-from">${logo ? `<img class="np-logo" src="${esc(logo)}" alt="">` : `<div class="np-initial">${esc((name || 'N')[0].toUpperCase())}</div>`}
<div><div class="np-co">${esc(name)}</div>${note.notebook ? `<div class="np-small">${esc(note.notebook)}</div>` : ''}</div></div>
<div class="np-right"><div class="np-kind">${items.length && !body ? 'CHECKLIST' : 'NOTE'}</div>
${items.length ? `<div class="np-sub">${done} of ${items.length} done</div>` : ''}
${updated ? `<div class="np-small" style="margin-top:2px">Updated ${esc(updated)}</div>` : ''}
${note.author ? `<div class="np-small">By ${esc(note.author)}</div>` : ''}</div>
</div>
<div class="np-title">${esc(note.title || 'Untitled')}</div>
${tags.length || note.reminderAt ? `<div class="np-meta">${tags.map(t => `<span class="np-tag">${esc(t)}</span>`).join('')}${note.reminderAt ? `<span class="np-rem">Reminder ${esc(fmtDate(note.reminderAt, true))}</span>` : ''}</div>` : ''}
${body ? `<div class="np-body">${body}</div>` : ''}
${(note.voiceNotes || []).map(v => `<div class="np-voice">${MIC}<span><b>Voice note</b> · ${esc(v.name)}${v.duration ? ` · ${esc(v.duration)}` : ''}</span></div>`).join('')}
${items.length ? `<div class="np-section"><div class="np-sechead"><span class="np-label">Checklist</span>
<span class="np-progress">${done}/${items.length}<span class="np-bar"><i style="width:${pct}%"></i></span></span></div>
<table><thead><tr><th></th>${hasImg ? '<th></th>' : ''}<th>Item</th>${hasSku ? '<th>SKU</th>' : ''}${hasQty ? '<th class="np-qty">Qty</th>' : ''}${hasPrice ? '<th class="np-price">Price</th>' : ''}</tr></thead>
<tbody>${rows}</tbody></table></div>` : ''}
${(note.images || []).length ? `<div class="np-section"><span class="np-label">Photos</span><div class="np-gallery">${(note.images || []).map(im => safeUrl(im.url) ? `<img src="${esc(safeUrl(im.url))}" alt="${esc(im.name || '')}">` : '').join('')}</div></div>` : ''}
<div class="np-foot"><span>${esc(name)}</span><span>Printed ${esc(fmtDate(new Date().toISOString(), true))}</span></div>
</div></body></html>`
}
