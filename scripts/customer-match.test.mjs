// Runnable tests for the pure customer-matching engine + phone normalization.
//
// The repo has no test runner configured (CI is `next build` + `next lint`), so
// this is a self-contained, zero-dependency harness. Run it with a TS-aware
// runner that resolves the bundler-style (extensionless) imports:
//
//   npx tsx scripts/customer-match.test.mjs
//
// Exits non-zero on the first failure. (Plain `node` strips TS types but does
// not add the `.ts` extension to the lib's relative imports.)

import { computeMatches, maskEmail, maskPhone } from '../lib/customer-match.ts'
import { phoneKey, emailKey, toE164, detectContactInfo } from '../lib/phone.ts'

let passed = 0, failed = 0
function ok(name, cond) {
  if (cond) { passed++; console.log('  ✓', name) }
  else { failed++; console.error('  ✗', name) }
}
function eq(name, a, b) { ok(`${name} (got ${JSON.stringify(a)})`, JSON.stringify(a) === JSON.stringify(b)) }

console.log('phone/email normalization')
eq('phoneKey unifies AU formats', phoneKey('+61 412 345 678'), phoneKey('0412 345 678'))
eq('phoneKey last 9', phoneKey('0412 345 678'), '412345678')
eq('emailKey lowercases + trims', emailKey('  Sarah@Gmail.COM '), 'sarah@gmail.com')
eq('emailKey rejects junk', emailKey('not-an-email'), '')
eq('toE164 AU local', toE164('0412 345 678'), '+61412345678')
ok('detect email in text', detectContactInfo("it's sarah@gmail.com thanks").email?.key === 'sarah@gmail.com')
ok('detect phone in text', detectContactInfo('call me on 0412 345 678').phone?.key === '412345678')

console.log('confirmed platform identity → 100')
{
  const out = computeMatches(
    { platform: 'instagram', platformUserId: 'IG_123', name: 'Sarah' },
    [
      { contactId: 'c1', name: 'Sarah Williams', confirmedPlatformIds: [{ kind: 'instagram', value: 'IG_123' }] },
      { contactId: 'c2', name: 'Someone Else' },
    ])
  ok('auto-confirms the linked contact', out.confirmed?.contactId === 'c1' && out.confirmed?.confidence === 100)
  ok('no suggestions when confirmed', out.suggestions.length === 0)
}

console.log('unique exact email → auto-confirm 95+')
{
  const out = computeMatches(
    { platform: 'instagram', platformUserId: 'IG_X', emails: ['Sarah@gmail.com'] },
    [{ contactId: 'c1', name: 'Sarah', emails: ['sarah@gmail.com'] }, { contactId: 'c2', emails: ['bob@x.com'] }])
  ok('confirms on unique email', out.confirmed?.contactId === 'c1' && out.confirmed.confidence >= 95)
}

console.log('unique exact phone → auto-confirm 95+')
{
  const out = computeMatches(
    { platform: 'instagram', platformUserId: 'IG_X', phones: ['+61 412 345 678'] },
    [{ contactId: 'c1', name: 'Sarah', phones: ['0412 345 678'] }, { contactId: 'c2', phones: ['0400 000 000'] }])
  ok('confirms on unique phone', out.confirmed?.contactId === 'c1' && out.confirmed.confidence >= 95)
}

console.log('ambiguous identifier → NOT auto-confirmed (staff must choose)')
{
  const out = computeMatches(
    { platform: 'instagram', platformUserId: 'IG_X', emails: ['shared@x.com'] },
    [{ contactId: 'c1', emails: ['shared@x.com'] }, { contactId: 'c2', emails: ['shared@x.com'] }])
  ok('no auto-confirm when 2 customers share the email', !out.confirmed)
  ok('surfaces both as ambiguous suggestions', out.suggestions.length === 2 && out.suggestions.every(s => s.ambiguous))
}

console.log('name matching: unique name → suggest (never auto-confirm); shared name → nothing')
{
  const unique = computeMatches(
    { platform: 'instagram', platformUserId: 'IG_X', name: 'Sarah Williams' },
    [{ contactId: 'c1', name: 'Sarah Williams' }])
  ok('a unique exact name is SUGGESTED', !unique.confirmed && unique.suggestions[0]?.contactId === 'c1')
  ok('name suggestion never auto-confirms (stays ≤94)', unique.suggestions[0]?.confidence <= 94 && unique.suggestions[0]?.confidence >= 70)

  const shared = computeMatches(
    { platform: 'instagram', platformUserId: 'IG_X', name: 'Sarah Williams' },
    [{ contactId: 'c1', name: 'Sarah Williams' }, { contactId: 'c2', name: 'Sarah Williams' }])
  ok('a name shared by several customers is NOT suggested alone', !shared.confirmed && shared.suggestions.length === 0)
}

console.log('probable match: combined soft signals cross the floor')
{
  const out = computeMatches(
    { platform: 'instagram', platformUserId: 'IG_X', name: 'Sarah Williams', suburb: 'Preston', orderNumbers: ['10482'] },
    [{ contactId: 'c1', name: 'Sarah Williams', suburbs: ['Preston'], orderNumbers: ['10482'] }])
  ok('suggests with confidence ≥ 70', out.suggestions[0]?.contactId === 'c1' && out.suggestions[0].confidence >= 70)
  ok('never auto-confirms a soft match', !out.confirmed)
  ok('carries evidence', out.suggestions[0].evidence.length >= 2)
}

console.log('at most three suggestions, best first')
{
  const cands = Array.from({ length: 6 }, (_, i) => ({ contactId: 'c' + i, name: 'Sarah Williams', suburbs: ['Preston'], postcodes: ['3072'] }))
  const out = computeMatches({ name: 'Sarah Williams', suburb: 'Preston', postcode: '3072' }, cands)
  ok('caps at 3', out.suggestions.length <= 3)
}

console.log('masking')
ok('maskEmail', maskEmail('sarah@gmail.com').endsWith('@gmail.com') && maskEmail('sarah@gmail.com').includes('•'))
ok('maskPhone', /•/.test(maskPhone('0412345428')) && maskPhone('0412345428').endsWith('428'))

console.log(`\n${passed} passed, ${failed} failed`)
process.exit(failed ? 1 : 0)
