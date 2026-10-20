// Australian Business Numbers. Pure: runs on the server and in the browser.
//
// An ABN is 11 digits with a check built in (the ATO's algorithm): subtract 1
// from the first digit, multiply each digit by its weight
// (10, 1, 3, 5, 7, 9, 11, 13, 15, 17, 19), add them up; a real ABN's sum is a
// multiple of 89. "51 824 753 556" (the ATO's example) passes.

const WEIGHTS = [10, 1, 3, 5, 7, 9, 11, 13, 15, 17, 19]

/** Does this 11-digit string pass the ABN check? */
export function abnChecksumOk(digits: string): boolean {
  if (!/^\d{11}$/.test(digits)) return false
  const d = digits.split('').map(Number)
  d[0] -= 1
  if (d[0] < 0) return false
  return d.reduce((s, n, i) => s + n * WEIGHTS[i], 0) % 89 === 0
}

/** The 11 digits of a valid ABN (spaces and dashes allowed in the input), or null. */
export function cleanAbn(raw: unknown): string | null {
  const d = String(raw ?? '').replace(/[\s-]/g, '')
  return abnChecksumOk(d) ? d : null
}

/** 51824753556 → "51 824 753 556". Anything else is returned as given. */
export function formatAbn(abn: string | null | undefined): string {
  const s = String(abn || '')
  return s.replace(/^(\d{2})(\d{3})(\d{3})(\d{3})$/, '$1 $2 $3 $4')
}

/** For a form: '' (empty is fine, ABN is optional), the clean digits, or an error. */
export function parseOptionalAbn(raw: unknown): { ok: boolean; abn: string | null; error?: string } {
  const s = String(raw ?? '').trim()
  if (!s) return { ok: true, abn: null }
  const d = s.replace(/[\s-]/g, '')
  if (!/^\d{11}$/.test(d)) return { ok: false, abn: null, error: 'An ABN has 11 digits, e.g. 51 824 753 556.' }
  if (!abnChecksumOk(d)) return { ok: false, abn: null, error: 'That ABN isn’t valid. Check the digits against the ABN Lookup.' }
  return { ok: true, abn: d }
}
