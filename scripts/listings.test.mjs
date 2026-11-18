// Marketplace listings: the parts that need no database. Codes (tidying,
// suggesting, finding one in a text), prices, page addresses both ways, the
// words for the business to paste, checking what the business typed, and the
// link plumbing the listing page relies on (own pages get ?clv=, the
// 'marketplace' channel counts as public).
//
//   npx tsx scripts/listings.test.mjs

import {
  cleanCode, suggestCode, findCodeInText, parsePrice, priceText, listingUrl, listingRefFromUrl,
  displayUrl, localNumber, listingCopy, enquiryLine, cleanListing, sourceLabel, conditionLabel, MAX_PHOTOS,
} from '../lib/listings.ts'
import { isOwnSurface } from '../lib/link-stitch.ts'
import { isPublicChannel, PUBLIC_CHANNEL_LABEL, PUBLIC_LINK_CHANNELS } from '../lib/link-channels.ts'

let passed = 0, failed = 0
function ok(name, cond) { if (cond) { passed++; console.log('  ✓', name) } else { failed++; console.error('  ✗', name) } }
function eq(name, a, b) { ok(`${name} (got ${JSON.stringify(a)})`, JSON.stringify(a) === JSON.stringify(b)) }

console.log('codes')
eq('tidied to capitals and digits', cleanCode(' tank-4 '), 'TANK4')
eq('too short is refused', cleanCode('ab'), null)
eq('too long is refused', cleanCode('ABCDEFGHIJKLM'), null)
eq('nothing is refused', cleanCode(''), null)
eq('a telling word and the number', suggestCode('4ft glass aquarium with stand'), 'AQUAR4')
eq('filler words are skipped; no number gets 1', suggestCode('Used tank for sale'), 'TANK1')
eq('and 2 when 1 is taken', suggestCode('Used tank for sale', ['TANK1']), 'TANK2')
eq('a plain word is not a code', cleanCode('tank'), null)
eq('digits alone are not a code', cleanCode('1234'), null)
eq('no letters at all', suggestCode('123'), 'ITEM123')
eq('made unique against taken codes', suggestCode('Glass tank 4ft', ['GLASS4']), 'GLASS42')
eq('and again', suggestCode('Glass tank 4ft', ['GLASS4', 'GLASS42']), 'GLASS43')
ok('a suggestion is always a valid code', ['', 'a', 'Fish!!', '50L cube', 'Ölkännchen 2', '1234', 'Tank'].every(t => cleanCode(suggestCode(t)) === suggestCode(t)))

console.log('finding a code in a text')
const codes = ['TANK4', 'TANK', 'LIGHT2']  // 'TANK' (no digit) can never match
eq('whole word, any case', findCodeInText('Hi is tank4 still available?', codes), 'TANK4')
eq('the longest match wins', findCodeInText('TANK4 or TANK?', codes), 'TANK4')
eq('an everyday word never matches', findCodeInText('my tank is leaking', codes), null)
eq('inside another word does not count', findCodeInText('my fishtank4ever', codes), null)
eq('punctuation around it is fine', findCodeInText('(LIGHT2)', codes), 'LIGHT2')
eq('no codes, no match', findCodeInText('hello', []), null)
eq('empty text', findCodeInText('', codes), null)

console.log('prices')
eq('dollars', parsePrice('$250'), 25000)
eq('cents', parsePrice('249.95'), 24995)
eq('thousands separator', parsePrice('1,200'), 120000)
eq('a number', parsePrice(80), 8000)
eq('empty', parsePrice(''), null)
eq('not a price', parsePrice('cheap'), null)
eq('negative refused', parsePrice(-5), null)
eq('whole dollars print without cents', priceText(25000), '$250')
eq('cents print', priceText(24995), '$249.95')
eq('no price prints nothing', priceText(null), '')

console.log('page addresses')
eq('on colvy.com: the business subdomain', listingUrl('https://colvy.com', 'ReefShop', 'TANK4'), 'https://reefshop.colvy.com/item/tank4')
eq('elsewhere: slug in the path', listingUrl('http://127.0.0.1:3456', 'reefshop', 'TANK4'), 'http://127.0.0.1:3456/item/reefshop/tank4')
eq('subdomain form read back', listingRefFromUrl('https://reefshop.colvy.com/item/tank4?clv=123'), { slug: 'reefshop', host: 'reefshop.colvy.com', code: 'TANK4' })
eq('path form read back', listingRefFromUrl('http://127.0.0.1:3456/item/reefshop/tank4'), { slug: 'reefshop', host: '127.0.0.1', code: 'TANK4' })
eq('another page is not a listing', listingRefFromUrl('https://reefshop.colvy.com/book/reefshop'), null)
eq('the media viewer (/m/) is not a listing', listingRefFromUrl('https://reefshop.colvy.com/m/abc123'), null)
eq('a single segment off colvy.com is not one', listingRefFromUrl('https://example.com/item/tank4'), null)
eq('a bad code is not one', listingRefFromUrl('https://reefshop.colvy.com/item/x'), null)
eq('not a string', listingRefFromUrl(null), null)
eq('display form', displayUrl('https://reefshop.colvy.com/item/tank4?clv=1'), 'reefshop.colvy.com/item/tank4')

console.log('phone numbers')
eq('mobile', localNumber('+61412345678'), '0412 345 678')
eq('landline', localNumber('+61391234567'), '03 9123 4567')
eq('already local', localNumber('0412345678'), '0412 345 678')
eq('not Australian: left alone', localNumber('+14155550100'), '+14155550100')

console.log('words to paste')
{
  const c = listingCopy({ title: '4ft glass tank', code: 'TANK4' }, 'https://reefshop.colvy.com/item/tank4', '0412 345 678')
  ok('listing line has the short address', c.forListing.includes('reefshop.colvy.com/item/tank4'))
  ok('listing line has the code and number', c.forListing.includes('text TANK4 to 0412 345 678'))
  ok('reply has the full link', c.reply.includes('https://reefshop.colvy.com/item/tank4'))
  ok('reply names the item', c.reply.includes('4ft glass tank'))
  ok('text body carries the code', c.smsBody.includes('(TANK4)'))
  const n = listingCopy({ title: 'Lamp', code: 'LAMP' }, 'https://x.colvy.com/item/lamp', null)
  ok('no number: no text line', !n.forListing.includes('text ') && !n.reply.includes('Or text'))
  eq('enquiry line from the page', enquiryLine({ title: 'Lamp', price_cents: 4000, currency: 'aud', source: 'gumtree' }, 'page'), 'Enquiry about “Lamp” ($40) · Gumtree · from the listing page')
  eq('enquiry line from a text', enquiryLine({ title: 'Lamp', price_cents: null, currency: 'aud', source: 'facebook_marketplace' }, 'sms'), 'Enquiry about “Lamp” · Facebook Marketplace · texted the listing code')
  eq('labels', [sourceLabel('ebay'), sourceLabel('nope'), conditionLabel('like_new'), conditionLabel('x')], ['eBay', 'Marketplace', 'Used, like new', ''])
}

console.log('checking what the business typed')
{
  const good = cleanListing({ title: '  Tank  ', price: '$250', condition: 'good', source: 'gumtree', photos: ['https://cdn.example.com/a.jpg', 'javascript:alert(1)', ''], pickup: ' Shop ', external_url: 'https://www.facebook.com/marketplace/item/1', code: 'tank-4', product: { platform: 'shopify', id: 9, name: 'Tank', url: 'https://shop.example.com/p/tank' } })
  ok('ok', good.ok && !good.error)
  eq('tidied', { t: good.value.title, p: good.value.price_cents, c: good.value.code, s: good.value.source, ph: good.value.photos, pk: good.value.pickup }, { t: 'Tank', p: 25000, c: 'TANK4', s: 'gumtree', ph: ['https://cdn.example.com/a.jpg'], pk: 'Shop' })
  eq('product kept', good.value.product, { platform: 'shopify', id: '9', name: 'Tank', url: 'https://shop.example.com/p/tank' })
  eq('defaults', (({ source, condition, code, price_cents }) => ({ source, condition, code, price_cents }))(cleanListing({ title: 'X' }).value), { source: 'facebook_marketplace', condition: null, code: null, price_cents: null })
  eq('price in cents also accepted', cleanListing({ title: 'X', price_cents: 1999 }).value.price_cents, 1999)
  eq('no title', cleanListing({ title: '  ' }).error, 'Give the listing a title.')
  eq('bad price', cleanListing({ title: 'X', price: 'cheap' }).ok, false)
  eq('bad code', cleanListing({ title: 'X', code: 'a!' }).ok, false)
  eq('bad listing link', cleanListing({ title: 'X', external_url: 'facebook dot com' }).ok, false)
  eq('too many photos', cleanListing({ title: 'X', photos: Array.from({ length: MAX_PHOTOS + 1 }, (_, i) => `https://x.example.com/${i}.jpg`) }).ok, false)
  eq('unknown store platform dropped', cleanListing({ title: 'X', product: { platform: 'etsy', id: 1 } }).value.product, null)
}

console.log('link plumbing')
const co = { slug: 'reefshop', website: null, website_domains: null }
ok('its listing page on its subdomain is its own', isOwnSurface('https://reefshop.colvy.com/item/tank4', co))
ok('its listing page on colvy.com is its own', isOwnSurface('https://colvy.com/item/reefshop/tank4', co))
ok('another business’s listing is not', !isOwnSurface('https://colvy.com/item/othershop/tank4', co))
ok('marketplace links are public (clicks are anonymous until they chat)', isPublicChannel('marketplace'))
ok('and have a readable name in Link Reports', PUBLIC_CHANNEL_LABEL.marketplace === 'Marketplace listing')
ok('but are not a choice in the Links Generator', !PUBLIC_LINK_CHANNELS.some(c => c.id === 'marketplace'))

console.log(`\n${passed} passed, ${failed} failed`)
process.exit(failed ? 1 : 0)
