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

console.log('every page has its own search title and description')
{
  // The maps live in lib/page-meta.ts, one per route (PRODUCT_META, PHONE_META…).
  const META_NAME = { product: 'PRODUCT_META', channels: 'CHANNEL_META', solutions: 'SOLUTION_META', industries: 'INDUSTRY_META', phones: 'PHONE_META', 'ai-assistant': 'AI_META', integrations: 'INTEGRATION_META' }
  const src = read('lib/page-meta.ts')
  for (const [route, name, path] of ROUTES) {
    const i = src.indexOf(`export const ${META_NAME[route]}:`)
    const meta = i < 0 ? null : [...src.slice(i, src.indexOf('\n}\n', i)).matchAll(/^ {2}(?:'|")?([a-z0-9-]+)(?:'|")?: \{ ?title:/gm)].map(m => m[1])
    const missing = meta ? list(name).filter(s => !meta.includes(s)) : list(name)
    ok(!!meta && !missing.length, `/${route}/[…]: a ${META_NAME[route]} entry for every slug in ${name}`, missing)
    const dir = path.slice(0, path.lastIndexOf('/'))
    let uses = false
    for (const f of ['page.tsx', 'layout.tsx']) { try { if (read(`${dir}/${f}`).includes(`const META = ${META_NAME[route]}`)) uses = true } catch {} }
    ok(uses, `/${route}/[…]: its metadata reads ${META_NAME[route]}`)
  }
}

console.log('every compare page has its copy, search title, FAQs and hub card')
{
  const listed = list('COMPARE_SLUGS')
  const cmp = mapKeys('app/compare/[slug]/Client.tsx', 'const CMP')
  const meta = mapKeys('lib/compare-meta.ts', 'export const COMPARE_META')
  const faqs = [...read('lib/seo-faqs.ts').matchAll(/^ {2}'compare\/([a-z0-9-]+)': \[/gm)].map(m => m[1])
  const cards = [...read('app/compare/Client.tsx').matchAll(/\{ slug: '([a-z0-9-]+)'/g)].map(m => m[1])
  const slugType = (read('app/compare/[slug]/Client.tsx').match(/^type Slug = (.*)$/m) || [])[1] || ''
  ok(new Set(listed).size === listed.length, 'COMPARE_SLUGS has no repeats')
  for (const [what, keys] of [['a CMP entry (page copy)', cmp], ['a COMPARE_META entry', meta], ['FAQs in lib/seo-faqs', faqs], ['a card on the /compare hub', cards]]) {
    const missing = listed.filter(s => !keys.includes(s))
    const extra = keys.filter(s => !listed.includes(s))
    ok(!missing.length && !extra.length, `every compare slug has ${what}, and nothing else does`, { missing, extra })
  }
  const untyped = listed.filter(s => !slugType.includes(`'${s}'`))
  ok(!untyped.length, 'every compare slug is in the table\'s Slug type', untyped)
}

console.log('every search description fits in a Google result (160 characters)')
{
  const MAX = 160
  const unq = x => x.replace(/\\'/g, "'").replace(/\\\\/g, '\\')
  const STR = `'((?:[^'\\\\]|\\\\.)*)'`
  const found = []
  const take = (file, re) => { for (const m of read(file).matchAll(re)) found.push([file, unq(m[1])]) }
  // Description maps (every description: in these files is a page's search description)
  for (const f of ['lib/compare-meta.ts', 'lib/for-pages.ts', 'lib/page-meta.ts'])
    take(f, new RegExp(`description: ["']((?:[^"'\\\\]|\\\\.)*)["']`, 'g'))
  take('lib/topic-pages.ts', new RegExp(`metaDescription: ${STR}`, 'g'))
  // The site default, and pageMeta({ … description: '…' }) on every page and layout
  take('app/layout.tsx', new RegExp(`^  description:\\s*${STR}`, 'gm'))
  const { readdirSync, statSync } = await import('node:fs')
  const walk = d => readdirSync(ROOT + d).flatMap(n => { const p = `${d}/${n}`; return statSync(ROOT + p).isDirectory() ? walk(p) : /\/(page|layout)\.tsx$/.test(p) ? [p] : [] })
  for (const f of walk('app')) {
    for (const call of read(f).matchAll(/pageMeta\(\{[\s\S]*?\}\)/g)) {
      const m = call[0].match(new RegExp(`description: ${STR}`)); if (m) found.push([f, unq(m[1])])
    }
  }
  // Blog posts: the search description, else the excerpt
  for (const f of ['lib/blog.ts', 'lib/blog-latest.ts', 'lib/blog-industries.ts']) {
    for (const block of read(f).split(/\n\s+slug: '/).slice(1)) {
      const slug = block.slice(0, block.indexOf("'"))
      const seo = block.match(new RegExp(`\\n\\s+seoDescription: ${STR}`)), ex = block.match(new RegExp(`\\n\\s+excerpt: ${STR}`))
      if (ex) found.push([`${f} (${slug})`, unq((seo || ex)[1])])
    }
  }
  const long = found.filter(([, d]) => d.length > MAX).map(([f, d]) => `${f}: ${d.length}`)
  ok(found.length > 100, `found the search descriptions (${found.length})`)
  ok(!long.length, `none over ${MAX} characters`, long)
}

console.log('llms.txt lists every page, so AI assistants find it')
{
  const src = read('lib/llms.ts')
  const listed = new Set([...src.matchAll(/path: '\/([^']*)'/g)].map(m => m[1]))
  const topics = [...read('lib/topic-pages.ts').matchAll(/^ {2}'([a-z0-9-]+)': \{\n {4}slug:/gm)].map(m => m[1])
  const staticSrc = read('lib/marketing-routes.ts').match(/export const STATIC_MARKETING_ROUTES: string\[\] = \[([\s\S]*?)\]/)[1]
  const statics = [...staticSrc.matchAll(/'([^'\n]*)'/g)].map(m => m[1])
  ok(statics.length > 20, `read the static pages (${statics.length})`)
  const missing = statics.filter(p => !listed.has(p) && !topics.includes(p))
  ok(!missing.length, 'every static page is in its PAGES list (or a topic page)', missing)
  const groups = [...src.matchAll(/\{ name: '[^']+', base: '([a-z-]+)', slugs: ([A-Z_]+), meta: ([A-Z_]+) \}/g)].map(m => m[1])
  const routes = ROUTES.map(r => r[0])
  ok(routes.every(r => groups.includes(r)), 'every [param] route is one of its FEATURE_GROUPS', routes.filter(r => !groups.includes(r)))
  ok(src.includes('allMarketingPaths()') && src.includes("'## Every page'"), 'llms-full.txt lists every sitemap page (allMarketingPaths)')
  ok(src.includes('Object.values(COMPARE_META).map(m => m.name)'), 'the competitors it names come from the compare pages')
}

console.log(failures ? `\n${failures} failed` : '\nall passed')
process.exit(failures ? 1 : 0)
