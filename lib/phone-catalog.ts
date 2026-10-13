// What the AI phone agent knows about the business's product names, so it can
// hear them and find them:
//   • speech recognition is told the likely words (Deepgram "hints"), so
//     "neon tetras" isn't heard as "new interest";
//   • a stock question that matches nothing is retried with the products that
//     sound closest ("rominos" → Rummy Nose Tetra).
//
// The names come from the store (WooCommerce, most popular first, or the
// synced Shopify products), cleaned down to what people say ("Rummy Nose
// Tetra (3cm) - 5 pack" → "Rummy Nose Tetra"), and are kept on an
// agent_policies row (role "phone", action "catalog") so no lookup happens
// while a caller waits. Refreshed when stale, during a call's greeting.

const ROLE = 'phone'
const ACTION = 'catalog'
const MAX_NAMES = 1500
const STALE_MS = 12 * 3600_000

export type PhoneCatalog = { names: string[]; places: string[]; at: string | null }

// ── Names people say ─────────────────────────────────────────────────────────

const SIZE = /\b\d+(?:\.\d+)?\s*(?:cm|mm|m|l|lt|ltr|litres?|liters?|ml|g|kg|gal|inch(?:es)?|in|w|watt|pk|pack|pcs?|x)\b/gi

/** "Rummy Nose Tetra (3cm) - 5 pack" → "Rummy Nose Tetra". Empty when nothing sayable is left. */
export function spokenName(title: string): string {
  let s = String(title || '')
    .replace(/&amp;/g, '&').replace(/<[^>]+>/g, ' ')
    .replace(/\([^)]*\)|\[[^\]]*\]/g, ' ')
    .split(/\s[-–—|:]\s|,|\//)[0]
    .replace(SIZE, ' ')
    .replace(/\b(?:x\s*)?\d+(?:\.\d+)?\b/g, ' ')
    .replace(/[^A-Za-z&' ]+/g, ' ')
    .replace(/\s+/g, ' ').trim()
  s = s.split(' ').filter(Boolean).slice(0, 5).join(' ')
  return s.length >= 3 ? s : ''
}

/** Unique spoken names, first occurrence wins (so popularity order is kept). */
export function spokenNames(titles: string[], max = MAX_NAMES): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const t of titles) {
    const n = spokenName(t)
    const k = n.toLowerCase()
    if (!n || seen.has(k)) continue
    seen.add(k); out.push(n)
    if (out.length >= max) break
  }
  return out
}

// ── Sounds-like matching ─────────────────────────────────────────────────────

const letters = (s: string) => s.toLowerCase().replace(/[^a-z]/g, '')
/** A rough sound key: common spellings folded together, vowels after the first letter dropped, doubles collapsed. */
export function soundKey(s: string): string {
  let t = letters(s)
    .replace(/ph/g, 'f').replace(/ck/g, 'k').replace(/q/g, 'k').replace(/x/g, 'ks')
    .replace(/c(?=[eiy])/g, 's').replace(/c/g, 'k').replace(/z/g, 's').replace(/y/g, 'i')
    .replace(/gh/g, 'g').replace(/wh/g, 'w').replace(/kn/g, 'n')
  if (!t) return ''
  t = t[0] + t.slice(1).replace(/[aeiouhw]/g, '')
  return t.replace(/(.)\1+/g, '$1')
}
const bigrams = (s: string) => { const out: string[] = []; for (let i = 0; i < s.length - 1; i++) out.push(s.slice(i, i + 2)); return out }
function dice(a: string, b: string): number {
  if (!a || !b) return 0
  if (a === b) return 1
  const A = bigrams(a), B = bigrams(b)
  if (!A.length || !B.length) return 0
  const counts = new Map<string, number>()
  for (const g of A) counts.set(g, (counts.get(g) || 0) + 1)
  let hit = 0
  for (const g of B) { const c = counts.get(g) || 0; if (c > 0) { hit++; counts.set(g, c - 1) } }
  return (2 * hit) / (A.length + B.length)
}

// "guppies" → "guppy", "tetras" → "tetra" (callers say plurals; product names are singular).
const singular = (s: string) => s.split(/\s+/).map(w => w.replace(/ies$/i, 'y').replace(/([^s])s$/i, '$1')).join(' ')

/** How alike a heard phrase and a product name are, by spelling and by sound (0–1). */
export function soundScore(heard: string, name: string): number {
  if (singular(heard) !== heard) return Math.max(soundScoreOne(heard, name), soundScoreOne(singular(heard), name))
  return soundScoreOne(heard, name)
}
function soundScoreOne(heard: string, name: string): number {
  const h = letters(heard), n = letters(name)
  if (!h || !n) return 0
  if (n.includes(h) && h.length >= 4) return 0.95
  // Also compare against the name without its last word ("Rummy Nose Tetra" → "Rummy Nose"),
  // since callers often drop the kind of fish.
  const words = name.split(' ')
  const head = words.length > 1 ? words.slice(0, -1).join(' ') : name
  const score = (x: string) => {
    const a = soundKey(heard), b = soundKey(x)
    // Very short sound keys ("ml") match far too much to count.
    return Math.max(dice(h, letters(x)), a.length >= 3 && b.length >= 3 ? dice(a, b) * 0.95 : 0)
  }
  return Math.max(score(name), score(head))
}

/** The products whose names sound most like what the caller said. */
export function closestProducts(heard: string, names: string[], n = 3, min = 0.6): { name: string; score: number }[] {
  const q = String(heard || '').trim()
  if (!q) return []
  return names.map(name => ({ name, score: soundScore(q, name) }))
    .filter(x => x.score >= min)
    .sort((a, b) => b.score - a.score)
    .slice(0, n)
}

// ── Hints for speech recognition ─────────────────────────────────────────────

/** Words speech recognition should expect: the business, its stores, its best-known products. Kept short (Deepgram keyterms are limited). */
export function phoneHints(companyName: string, catalog: PhoneCatalog | null, maxTerms = 40, maxChars = 600): string[] {
  const out: string[] = []
  let chars = 0
  const add = (t: string) => {
    const s = String(t || '').replace(/[,"<>&]/g, ' ').replace(/\s+/g, ' ').trim()
    if (!s || s.length < 3 || out.some(o => o.toLowerCase() === s.toLowerCase())) return
    if (out.length >= maxTerms || chars + s.length + 1 > maxChars) return
    out.push(s); chars += s.length + 1
  }
  add(companyName)
  for (const p of catalog?.places || []) add(p)
  for (const n of catalog?.names || []) add(n)
  return out
}

// ── Loading and caching ──────────────────────────────────────────────────────

const memo = new Map<string, { at: number; cat: PhoneCatalog | null }>()

/** The saved names (one small row; remembered for 10 minutes per server). */
export async function getPhoneCatalog(db: any, companyId: string): Promise<PhoneCatalog | null> {
  const hit = memo.get(companyId)
  // Names are kept 10 minutes; "none yet" only a minute, so a fresh save shows up quickly.
  if (hit && Date.now() - hit.at < (hit.cat ? 600_000 : 60_000)) return hit.cat
  let cat: PhoneCatalog | null = null
  try {
    const { data } = await db.from('agent_policies').select('limits')
      .eq('company_id', companyId).eq('role_key', ROLE).eq('action_key', ACTION).limit(1)
    const l = data?.[0]?.limits
    if (l && Array.isArray(l.names)) cat = { names: l.names, places: Array.isArray(l.places) ? l.places : [], at: l.at || null }
  } catch {}
  memo.set(companyId, { at: Date.now(), cat })
  return cat
}

async function wooTitles(db: any, companyId: string): Promise<string[] | null> {
  const { data } = await db.from('woocommerce_integrations').select('store_url, consumer_key, consumer_secret')
    .eq('company_id', companyId).eq('is_active', true).order('created_at', { ascending: true }).limit(1)
  const s = data?.[0]
  if (!s?.store_url || !s.consumer_key) return null
  const auth = Buffer.from(`${s.consumer_key}:${s.consumer_secret}`).toString('base64')
  const base = `${String(s.store_url).replace(/\/$/, '')}/wp-json/wc/v3/products?per_page=100&status=publish&orderby=popularity&order=desc&_fields=name`
  const page = async (n: number) => {
    const res = await fetch(`${base}&page=${n}`, { headers: { Authorization: `Basic ${auth}` }, signal: AbortSignal.timeout(15000) })
    if (!res.ok) throw new Error(`WooCommerce ${res.status}`)
    return { rows: (await res.json()) as any[], pages: Number(res.headers.get('x-wp-totalpages') || 1) }
  }
  const first = await page(1)
  const more = await Promise.all(Array.from({ length: Math.min(first.pages, 20) - 1 }, (_, i) => page(i + 2).then(p => p.rows, () => [])))
  return [...first.rows, ...more.flat()].map((p: any) => String(p?.name || '')).filter(Boolean)
}

async function shopifyTitles(db: any, companyId: string): Promise<string[] | null> {
  const { data } = await db.from('shopify_products').select('name').eq('company_id', companyId).limit(3000)
  return data?.length ? data.map((p: any) => String(p.name || '')).filter(Boolean) : null
}

/**
 * Re-read the store's product names and save them. Skipped while the saved
 * copy is fresh, unless forced. Never throws; returns what's saved.
 */
export async function refreshPhoneCatalog(db: any, companyId: string, opts: { force?: boolean } = {}): Promise<PhoneCatalog | null> {
  const current = await getPhoneCatalog(db, companyId)
  if (!opts.force && current?.at && Date.now() - Date.parse(current.at) < STALE_MS) return current
  try {
    const [titles, locs] = await Promise.all([
      wooTitles(db, companyId).catch(() => null).then(t => t || shopifyTitles(db, companyId).catch(() => null)),
      Promise.resolve(db.from('company_locations').select('label, suburb').eq('company_id', companyId)).then((r: any) => r.data || [], () => []),
    ])
    if (!titles) return current
    // Suburbs are what callers say ("the Oakleigh store"); a label only when there's no suburb.
    const places = Array.from(new Set<string>(locs.map((l: any) => String(l.suburb || l.label || '').trim()).filter((x: string) => x && x.length <= 40)))
    const cat: PhoneCatalog = { names: spokenNames(titles), places, at: new Date().toISOString() }
    const row = { autonomy: 'off', limits: cat, updated_at: cat.at }
    const { data: existing } = await db.from('agent_policies').select('id').eq('company_id', companyId).eq('role_key', ROLE).eq('action_key', ACTION).limit(1)
    if (existing?.[0]) await db.from('agent_policies').update(row).eq('id', existing[0].id)
    else await db.from('agent_policies').insert({ company_id: companyId, role_key: ROLE, action_key: ACTION, ...row })
    memo.set(companyId, { at: Date.now(), cat })
    return cat
  } catch (e: any) {
    console.error('[phone catalog] refresh failed', e?.message || e)
    return current
  }
}
