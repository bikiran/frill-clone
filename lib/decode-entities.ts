/**
 * Decode HTML entities in text that came from WordPress/WooCommerce.
 *
 * WooCommerce stores and returns product names, titles and customer names with
 * HTML entities — "Wishlist &#8211; Roxy Aquarium", "Pro&#039;s Choice",
 * "Raymundo &ndash; #12972". Rendered as-is they show the raw entity. React
 * escapes output, so we can't lean on the browser to decode; do it explicitly.
 *
 * Covers the numeric forms (&#8211; and &#x2013;) plus the named entities that
 * actually turn up in store data. Anything unrecognised is left untouched.
 */

const NAMED: Record<string, string> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'",
  nbsp: ' ', ndash: '\u2013', mdash: '\u2014',
  lsquo: '\u2018', rsquo: '\u2019', ldquo: '\u201C', rdquo: '\u201D',
  hellip: '\u2026', trade: '\u2122', copy: '\u00A9', reg: '\u00AE',
  deg: '\u00B0', frac12: '\u00BD', frac14: '\u00BC', frac34: '\u00BE',
  times: '\u00D7', divide: '\u00F7', eacute: '\u00E9', egrave: '\u00E8',
  agrave: '\u00E0', ccedil: '\u00E7', ouml: '\u00F6', uuml: '\u00FC',
  auml: '\u00E4', szlig: '\u00DF', pound: '\u00A3', euro: '\u20AC',
  cent: '\u00A2', middot: '\u00B7', bull: '\u2022',
}

export function decodeEntities(input: string | null | undefined): string {
  if (input == null) return ''
  const s = String(input)
  if (!s.includes('&')) return s
  return s.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (whole, body) => {
    if (body[0] === '#') {
      const code = body[1] === 'x' || body[1] === 'X'
        ? parseInt(body.slice(2), 16)
        : parseInt(body.slice(1), 10)
      if (Number.isFinite(code) && code > 0 && code <= 0x10FFFF) {
        try { return String.fromCodePoint(code) } catch { return whole }
      }
      return whole
    }
    const named = NAMED[body] ?? NAMED[body.toLowerCase()]
    return named ?? whole
  })
}
