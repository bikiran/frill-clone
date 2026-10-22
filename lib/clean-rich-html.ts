// Rich-text HTML (note, task and announcement bodies) made safe to put into
// the page, in the browser. Shared notes can be edited by anyone with the link
// (app/n/[code]), so a body may hold markup a stranger wrote; it's cleaned
// before it reaches innerHTML in the editor, the public view and the print.
//
// Unlike lib/safe-html (a strict allow-list for public posts and emails) this
// keeps everything the editor itself writes — classes, inline styles, fonts,
// tables, voice cards with their buttons, icons and hidden <audio> — and only
// removes what can run or load code: scripts, frames, plugins, forms, <style>,
// SVG animation, event handlers and javascript:/data: links. The result is
// parsed again until it stops changing, so markup the browser would re-read
// differently (mutation XSS) can't slip through.

const DROP = 'script, iframe, frame, frameset, object, embed, applet, base, link, meta, style, form, input, textarea, select, option, noscript, noembed, noframes, xmp, plaintext, template, math, portal, animate, animatemotion, animatetransform, set, foreignobject, use, discard, handler, listener'
const URL_ATTRS = new Set(['href', 'xlink:href', 'src', 'poster', 'background', 'action', 'formaction', 'data', 'codebase', 'cite', 'dynsrc', 'lowsrc', 'ping', 'srcset', 'imagesrcset'])
const DROP_ATTRS = new Set(['srcdoc', 'formaction', 'action', 'is', 'attributename', 'values', 'from', 'to', 'by'])

/** A URL that can't run anything: no javascript:/vbscript:, and data: only for pictures in src. */
function urlOk(name: string, value: string): boolean {
  const v = value.replace(/[\u0000- \u007f-\u009f]/g, '').toLowerCase()
  if (/^(javascript|vbscript|livescript|mocha):/.test(v)) return false
  if (v.startsWith('data:')) return name === 'src' && /^data:image\/(png|jpe?g|gif|webp|bmp|avif);/.test(v)
  if (name === 'srcset' || name === 'imagesrcset') return !/(javascript|vbscript|data):/.test(v)
  return true
}

function cleanOnce(html: string): string {
  const doc = new DOMParser().parseFromString(`<!doctype html><body>${html}`, 'text/html')
  const root = doc.body
  root.querySelectorAll(DROP).forEach(el => el.remove())
  root.querySelectorAll('*').forEach(el => {
    for (const a of Array.from(el.attributes)) {
      const n = a.name.toLowerCase()
      if (n.startsWith('on') || DROP_ATTRS.has(n) || (URL_ATTRS.has(n) && !urlOk(n, a.value))) el.removeAttribute(a.name)
    }
    // A style can't run script in a current browser, but it can still load an outside URL or old IE expression().
    const st = el.getAttribute('style')
    if (st && /expression\s*\(|javascript:|behavior\s*:|-moz-binding/i.test(st)) el.removeAttribute('style')
  })
  return root.innerHTML
}

/** Rich-text HTML with everything that could run removed. Browser only ('' on the server). */
export function cleanRichHtml(html: string | null | undefined): string {
  if (!html) return ''
  if (typeof DOMParser === 'undefined') return ''
  let out = String(html)
  for (let i = 0; i < 4; i++) {
    const next = cleanOnce(out)
    if (next === out) return out
    out = next
  }
  // Still changing after several passes: something is fighting the parser. Keep only the text.
  const doc = new DOMParser().parseFromString(`<!doctype html><body>${out}`, 'text/html')
  const t = doc.body.textContent || ''
  return t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}
