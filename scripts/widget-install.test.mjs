// Runnable tests for knowing the chat widget is on a business's website, and
// the install guide (lib/widget-install).
//
//   npx tsx scripts/widget-install.test.mjs
//
// Zero-dependency. Exits non-zero if any check fails.

import { siteHost, pageUrl, isLocalHost, validSlug, installState, seenAgo, platforms, installPrompt, widgetTag } from '../lib/widget-install.ts'

let failures = 0
const ok = (cond, name) => { if (cond) console.log('  ok  ', name); else { failures++; console.log('  FAIL', name) } }
const now = new Date('2026-10-27T10:00:00Z')
const ago = mins => new Date(now.getTime() - mins * 60_000).toISOString()

console.log('which site it loaded on')
ok(siteHost('https://www.roxyaquarium.com.au') === 'roxyaquarium.com.au', 'from the Origin, without www.')
ok(siteHost(null, 'https://shop.example.com/products/tank?id=4') === 'shop.example.com', 'from the Referer when there is no Origin')
ok(siteHost('null', 'https://a.com/') === 'a.com', 'a "null" Origin falls back to the Referer')
ok(siteHost('http://localhost:3000') === 'localhost', 'localhost, without the port')
ok(siteHost('file:///Users/me/site.html') === null, 'a file on disk is not a site')
ok(siteHost('chrome-extension://abc') === null, 'nor is a browser extension')
ok(siteHost(undefined, undefined) === null, 'nothing sent: nothing recorded')
ok(siteHost('not a url') === null, 'a header that is not an address')

console.log('the page it was on')
ok(pageUrl('https://a.com/checkout?email=x@y.com#z') === 'https://a.com/checkout', 'the query and fragment are left out (they can carry personal details)')
ok(pageUrl('javascript:alert(1)') === null, 'only web addresses')

console.log('testing addresses')
for (const h of ['localhost', 'app.localhost', '127.0.0.1', '192.168.1.20', '10.0.0.4', '172.20.1.1', 'mysite.test', 'mac.local', '[::1]']) ok(isLocalHost(h), `${h} is testing`)
for (const h of ['roxyaquarium.com.au', '172.15.0.1', 'shop.vercel.app']) ok(!isLocalHost(h), `${h} is a real site`)

console.log('slugs')
ok(validSlug('roxy-aquarium') && validSlug('roxy') && validSlug('a1'), 'letters, digits and dashes')
ok(!validSlug('Roxy') && !validSlug('-roxy') && !validSlug('roxy-') && !validSlug('ro xy') && !validSlug('') && !validSlug(5), 'anything else is refused')

console.log('installed or not')
{
  ok(installState([], now).state === 'none', 'never seen: not installed')
  ok(installState([{ host: 'localhost', first_seen_at: ago(30), last_seen_at: ago(5) }], now).state === 'testing', 'only seen on localhost: testing')
  const live = installState([
    { host: 'localhost', first_seen_at: ago(90), last_seen_at: ago(1) },
    { host: 'old.example.com', first_seen_at: ago(60 * 24 * 90), last_seen_at: ago(60 * 24 * 40) },
    { host: 'roxyaquarium.com.au', first_seen_at: ago(60 * 24 * 3), last_seen_at: ago(60 * 24 * 13) },
  ], now)
  ok(live.state === 'live' && live.live?.host === 'roxyaquarium.com.au', 'seen on a real site in the last 14 days: live')
  ok(live.sites.map(s => s.host).join(',') === 'roxyaquarium.com.au,old.example.com,localhost', 'real sites first, newest first, testing last')
  const stale = installState([{ host: 'roxyaquarium.com.au', first_seen_at: ago(60 * 24 * 60), last_seen_at: ago(60 * 24 * 15) }], now)
  ok(stale.state === 'stale' && !stale.live, 'not seen for over 14 days: stale')
}

console.log('how long ago')
ok(seenAgo(ago(0.5), now) === 'just now', 'under a minute: just now')
ok(seenAgo(ago(1), now) === '1 minute ago' && seenAgo(ago(5), now) === '5 minutes ago', 'minutes')
ok(seenAgo(ago(180), now) === '3 hours ago', 'hours')
ok(seenAgo(ago(60 * 24 * 2), now) === '2 days ago', 'days')

console.log('the install guide')
{
  const list = platforms('roxy')
  const by = k => list.find(p => p.key === k)
  ok(widgetTag('roxy') === '<script src="https://colvy.com/widget.js" data-slug="roxy" async></script>', 'the tag is the one widget.js expects')
  ok(list.filter(p => p.code).every(p => p.code.includes('roxy') && p.code.includes('https://colvy.com/widget.js')), 'every snippet loads widget.js for this workspace')
  ok(by('html').code === widgetTag('roxy'), 'HTML: the tag itself')
  ok(/next\/script/.test(by('nextjs').code) && /data-slug="roxy"/.test(by('nextjs').code), 'Next.js: next/script, with the slug')
  ok(/is:inline/.test(by('astro').code), 'Astro: not bundled')
  ok(/tagPosition: 'bodyClose'/.test(by('nuxt').code), 'Nuxt: at the end of the body')
  ok(by('shopify').code === null && by('shopify').steps.length === 3, 'Shopify: no code (theme editor), three steps')
  ok(by('wordpress').code === null && /plugin/i.test(by('wordpress').where), 'WordPress: the Colvy plugin')
  ok(new Set(list.map(p => p.key)).size === list.length, 'each platform once')

  const prompt = installPrompt('roxy', by('nextjs'))
  ok(prompt.startsWith('Add the Colvy chat widget to my Next.js site.'), 'the prompt names the platform')
  ok(prompt.includes(widgetTag('roxy')) && prompt.includes('"roxy"') && prompt.includes('next/script'), 'it carries the tag, the slug and the platform’s code')
  const shop = installPrompt('roxy', by('shopify'))
  ok(/1\. Connect your store/.test(shop) && !/For example/.test(shop), 'a no-code platform gets its steps instead of code')
  ok(!/For example/.test(installPrompt('roxy', by('html'))), 'HTML doesn’t repeat the tag')
}

console.log(failures ? `\n${failures} failed` : '\nall passed')
process.exit(failures ? 1 : 0)
