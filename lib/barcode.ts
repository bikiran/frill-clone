// Minimal, dependency-free Code128-B barcode → inline SVG. Enough to make a
// tracking number on a printed shipping label actually scannable by a warehouse
// gun. Supports ASCII 32–126 (covers alphanumeric tracking numbers).

// Canonical Code128 module-width patterns (index 0–106; 106 = stop, 7 widths).
const PATTERNS = [
  '212222', '222122', '222221', '121223', '121322', '131222', '122213', '122312', '132212', '221213',
  '221312', '231212', '112232', '122132', '122231', '113222', '123122', '123221', '223211', '221132',
  '221231', '213212', '223112', '312131', '311222', '321122', '321221', '312212', '322112', '322211',
  '212123', '212321', '232121', '111323', '131123', '131321', '112313', '132113', '132311', '211313',
  '231113', '231311', '112133', '112331', '132131', '113123', '113321', '133121', '313121', '211331',
  '231131', '213113', '213311', '213131', '311123', '311321', '331121', '312113', '312311', '332111',
  '314111', '221411', '431111', '111224', '111422', '121124', '121421', '141122', '141221', '112214',
  '112412', '122114', '122411', '142112', '142211', '241211', '221114', '413111', '241112', '134111',
  '111242', '121142', '121241', '114212', '124112', '124211', '411212', '421112', '421211', '212141',
  '214121', '412121', '111143', '111341', '131141', '114113', '114311', '411113', '411311', '113141',
  '114131', '311141', '411131', '211412', '211214', '211232', '2331112',
]
const START_B = 104
const STOP = 106

/**
 * Renders `text` as a Code128-B barcode SVG string. `moduleWidth` is the width
 * of one narrow bar (in the SVG's user units), `height` the bar height.
 */
export function barcodeSVG(text: string, opts: { moduleWidth?: number; height?: number } = {}): string {
  const mw = opts.moduleWidth ?? 1.6
  const h = opts.height ?? 46
  const clean = String(text || '').replace(/[^\x20-\x7e]/g, '') || '0'

  const codes: number[] = [START_B]
  for (const ch of clean) codes.push(ch.charCodeAt(0) - 32)
  let sum = START_B
  codes.slice(1).forEach((v, i) => { sum += v * (i + 1) })
  codes.push(sum % 103) // checksum
  codes.push(STOP)

  let x = 0
  let rects = ''
  for (const code of codes) {
    const pat = PATTERNS[code] || PATTERNS[0]
    for (let i = 0; i < pat.length; i++) {
      const w = parseInt(pat[i], 10) * mw
      if (i % 2 === 0) rects += `<rect x="${x.toFixed(2)}" y="0" width="${w.toFixed(2)}" height="${h}"/>`
      x += w
    }
  }
  const width = x
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width.toFixed(0)}" height="${h}" viewBox="0 0 ${width.toFixed(0)} ${h}" fill="#000" shape-rendering="crispEdges" preserveAspectRatio="none">${rects}</svg>`
}
