// The slug lists in lib/marketing-routes.ts decide which marketing addresses
// exist: each [param] route builds only those and 404s anything else. They
// mirror the data maps in the pages (client components, so the server can't
// import them). This checks the two agree, so a page added to a map but not
// to its list doesn't quietly 404, and a list entry with no page doesn't
// reach the sitemap.
//
//   node scripts/marketing-routes.test.mjs
//
// Zero-dependency. Exits non-zero if any check fails.

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const read = p => readFileSync(ROOT + p, 'utf8')

let failures = 0
const ok = (cond, name, detail) => { if (cond) console.log('  ok  ', name); else { failures++; console.log('  FAIL', name, detail ? JSON.stringify(detail) : '') } }

/** An exported string array from lib/marketing-routes.ts. */
function list(name) {
  const src = read('lib/marketing-routes.ts')
  const m = src.match(new RegExp(`export const ${name}: string\\[\\] = \\[([\\s\\S]*?)\\]`))
  if (!m) throw new Error(`${name} not found in lib/marketing-routes.ts`)
  return [...m[1].matchAll(/'([^']+)'/g)].map(x => x[1])
}

/** The top-level keys of a page's data map ("  key: {" lines up to its closing "}"). */
function mapKeys(path, start) {
  const lines = read(path).split('\n')
  const i = lines.findIndex(l => l.startsWith(start))
  if (i < 0) throw new Error(`${start} not found in ${path}`)
  const keys = []
  for (const l of lines.slice(i + 1)) {
    if (l.startsWith('}')) break
    const m = l.match(/^ {2}'?([a-z0-9-]+)'?: \{/)
    if (m) keys.push(m[1])
  }
  return keys
}

/** Addresses next.config.js redirects elsewhere (e.g. /industries/ecommerce → /for/ecommerce). */
function redirected(prefix) {
  return [...read('next.config.js').matchAll(/source: '\/([^']+)'/g)].map(m => m[1]).filter(s => s.startsWith(prefix + '/')).map(s => s.slice(prefix.length + 1))
}

const ROUTES = [
  ['product', 'PRODUCT_FEATURES', 'app/product/[feature]/Client.tsx', 'const PAGES'],
  ['channels', 'CHANNEL_SLUGS', 'app/channels/[slug]/Client.tsx', 'const CH:'],
  ['solutions', 'SOLUTION_SLUGS', 'app/solutions/[slug]/Client.tsx', 'const PAGES'],
  ['industries', 'INDUSTRY_SLUGS', 'app/industries/[slug]/Client.tsx', 'const IND:'],
  ['phones', 'PHONE_SLUGS', 'app/phones/[slug]/page.tsx', 'const PH:'],
  ['ai-assistant', 'AI_SLUGS', 'app/ai-assistant/[slug]/page.tsx', 'const AI:'],
  ['integrations', 'INTEGRATION_SLUGS', 'app/integrations/[slug]/page.tsx', 'const INTG:'],
]

for (const [route, name, path, start] of ROUTES) {
  console.log(`/${route}/…`)
  const listed = list(name)
  const pages = mapKeys(path, start)
  const moved = redirected(route)
  ok(pages.length > 0, `${path} has pages`)
  ok(new Set(listed).size === listed.length, `${name} has no repeats`)
  const missing = pages.filter(s => !listed.includes(s) && !moved.includes(s))
  ok(!missing.length, `every page is in ${name} (or redirected)`, missing)
  const extra = listed.filter(s => !pages.includes(s))
  ok(!extra.length, `every slug in ${name} has a page`, extra)
}

console.log('each [param] route only builds its list')
for (const [route, name, path] of ROUTES) {
  const dir = path.slice(0, path.lastIndexOf('/'))
  let guard = ''
  for (const f of ['page.tsx', 'layout.tsx']) { try { const s = read(`${dir}/${f}`); if (s.includes('dynamicParams = false')) guard = s } catch {} }
  ok(!!guard && guard.includes(`${name}.map(`) && guard.includes(`${name}.includes(`) && guard.includes('notFound()'), `/${route}/[…]: generateStaticParams from ${name}, dynamicParams = false, notFound()`)
}

console.log(failures ? `\n${failures} failed` : '\nall passed')
process.exit(failures ? 1 : 0)
