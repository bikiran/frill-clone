// Tell IndexNow search engines (Bing, which ChatGPT search and Copilot use,
// plus Yandex, Seznam, Naver…) which colvy.com pages changed, so they're
// recrawled within hours instead of whenever the crawler next comes by.
//
//   node scripts/indexnow.mjs [--site https://colvy.com] [--since 2026-11-07T00:00:00Z]
//                             [--wait-for-sha <commit>] [--dry-run]
//
// Reads the live sitemap and submits every page whose <lastmod> is after
// --since (default: the last 24 hours), plus /llms.txt and /llms-full.txt
// whenever anything changed (they're built from the same pages). The key is
// the file public/<key>.txt, which the site serves at /<key>.txt to prove the
// submission comes from colvy.com. Run by .github/workflows/indexnow.yml
// after each production deploy. Zero-dependency.

import { readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const arg = (name, fallback = '') => { const i = process.argv.indexOf(`--${name}`); return i > 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[i + 1] : fallback }
const SITE = arg('site', 'https://colvy.com').replace(/\/$/, '')
const DRY = process.argv.includes('--dry-run')
const SHA = arg('wait-for-sha')
const sinceArg = arg('since')
const since = sinceArg && !isNaN(Date.parse(sinceArg)) ? new Date(sinceArg) : new Date(Date.now() - 24 * 3600e3)

const PUBLIC = fileURLToPath(new URL('../public/', import.meta.url))
const keyFile = readdirSync(PUBLIC).find(f => /^[0-9a-f]{32}\.txt$/.test(f))
if (!keyFile) { console.error('No IndexNow key file (public/<32 hex>.txt)'); process.exit(1) }
const KEY = keyFile.slice(0, -4)
const host = new URL(SITE).host

const sleep = ms => new Promise(r => setTimeout(r, ms))

// After a deploy, wait (up to ~5 minutes) until the site serves that commit,
// so the crawler sees the new pages. Carries on anyway if it can't tell.
if (SHA) {
  for (let i = 0; i < 30; i++) {
    try {
      const b = await (await fetch(`${SITE}/api/build-id`, { cache: 'no-store' })).json()
      if (String(b.buildId || '').startsWith(SHA.slice(0, 7))) { console.log(`Live on ${SHA.slice(0, 7)}`); break }
    } catch {}
    if (i === 29) console.log(`Couldn't confirm ${SHA.slice(0, 7)} is live; submitting anyway`)
    else await sleep(10_000)
  }
}

const xml = await (await fetch(`${SITE}/sitemap.xml`, { cache: 'no-store' })).text()
const entries = [...xml.matchAll(/<url>([\s\S]*?)<\/url>/g)].map(m => ({
  loc: (m[1].match(/<loc>([^<]+)<\/loc>/) || [])[1],
  lastmod: (m[1].match(/<lastmod>([^<]+)<\/lastmod>/) || [])[1],
})).filter(e => e.loc)
if (!entries.length) { console.error(`No URLs in ${SITE}/sitemap.xml`); process.exit(1) }

const changed = entries.filter(e => e.lastmod && new Date(e.lastmod) > since).map(e => e.loc)
const urlList = changed.length ? [...changed, `${SITE}/llms.txt`, `${SITE}/llms-full.txt`] : []
console.log(`${entries.length} pages in the sitemap; ${changed.length} changed since ${since.toISOString()}`)
for (const u of urlList) console.log(`  ${u}`)
if (!urlList.length) process.exit(0)
if (DRY) { console.log('Dry run: nothing sent'); process.exit(0) }

// One request reaches every IndexNow engine (they share submissions).
const res = await fetch('https://api.indexnow.org/indexnow', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json; charset=utf-8' },
  body: JSON.stringify({ host, key: KEY, keyLocation: `${SITE}/${KEY}.txt`, urlList: urlList.slice(0, 10000) }),
})
console.log(`IndexNow: ${res.status} ${res.statusText}`)
// 200 = received, 202 = received and the key is still being checked.
process.exit(res.status === 200 || res.status === 202 ? 0 : 1)
