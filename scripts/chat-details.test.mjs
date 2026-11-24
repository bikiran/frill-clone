// Website chat: the details a visitor gives before the chat starts (name,
// email, mobile), checked the same way in the widget and on the server.
//
//   npx tsx scripts/chat-details.test.mjs

import { checkChatDetails, chatPhone, isChatEmail, isChatName, cleanChatName, DEFAULT_CHAT_FIELDS } from '../lib/chat-details.ts'

let passed = 0, failed = 0
function ok(name, cond) { if (cond) { passed++; console.log('  ✓', name) } else { failed++; console.error('  ✗', name) } }
function eq(name, a, b) { ok(`${name} (got ${JSON.stringify(a)})`, JSON.stringify(a) === JSON.stringify(b)) }

console.log('The chat that got through: name "g", email "g", mobile "+61"')
eq('refused, on the name first', checkChatDetails({ name: 'g', email: 'g', mobile: '+61' }), { ok: false, field: 'name', error: 'Please enter your name (at least 2 letters).' })
eq('with a real name, refused on the email', checkChatDetails({ name: 'Grace', email: 'g', mobile: '+61' }), { ok: false, field: 'email', error: 'Please enter a valid email, like name@example.com.' })
eq('with a real email too, refused on the mobile', checkChatDetails({ name: 'Grace', email: 'grace@example.com', mobile: '+61' }), { ok: false, field: 'mobile', error: 'Please enter a valid mobile number, like 0412 345 678.' })
eq('the widget turned "0" into "+61": also refused', checkChatDetails({ name: 'Grace', mobile: '0' }).ok, false)

console.log('Names')
for (const n of ['Jo', 'Grace', 'Mary-Jane O’Neil', '李明', 'Zoë', '  Sam   Lee  ']) ok(`"${n}" is a name`, isChatName(n))
for (const n of ['g', '1', '12', '.', '-', 'x1']) ok(`"${n}" isn't`, !isChatName(n))
eq('spaces tidied', cleanChatName('  Sam   Lee  '), 'Sam Lee')
eq('at most 120 characters', cleanChatName('a'.repeat(200)).length, 120)

console.log('Emails')
for (const e of ['grace@example.com', 'first.last@sub.example.com.au', 'a+tag@b.co', ' grace@example.com ']) ok(`"${e}" is an email`, isChatEmail(e))
for (const e of ['g', 'g@g', 'g@g.c', '@example.com', 'grace@', 'grace @example.com', 'grace@example..com', 'grace@.com']) ok(`"${e}" isn't`, !isChatEmail(e))

console.log('Mobiles')
const phones = [
  ['0412 345 678', '+61412345678'], ['0412345678', '+61412345678'], ['412 345 678', '+61412345678'],
  ['61412345678', '+61412345678'], ['+61 412 345 678', '+61412345678'], ['+61 0412 345 678', '+61412345678'],
  ['(02) 9876 5432', '+61298765432'], ['0061 412 345 678', '+61412345678'],
  ['+64 21 123 4567', '+64211234567'], ['+1 415 555 0123', '+14155550123'],
]
for (const [raw, want] of phones) eq(`"${raw}"`, chatPhone(raw), want)
for (const raw of ['+61', '0', '61', '04', '0412 345', '0412 345 6789', '+61 512 345 678', '98765432', '1300 123 456', 'call me', '+0412345678', '+1234567', '']) eq(`"${raw}" isn't a number`, chatPhone(raw), null)

console.log('The business’s form')
eq('the default asks for a name', checkChatDetails({ email: 'grace@example.com' }), { ok: false, field: 'name', error: 'Please enter your name.' })
eq('name only is enough by default', checkChatDetails({ name: 'Grace' }), { ok: true, name: 'Grace', email: null, phone: null })
eq('all three, saved tidy', checkChatDetails({ name: ' Grace  Lee ', email: ' grace@example.com ', mobile: '0412 345 678' }), { ok: true, name: 'Grace Lee', email: 'grace@example.com', phone: '+61412345678' })
const strict = { name: { show: true, required: true }, email: { show: true, required: true }, mobile: { show: true, required: true } }
eq('email required', checkChatDetails({ name: 'Grace', mobile: '0412345678' }, strict), { ok: false, field: 'email', error: 'Please enter your email.' })
eq('mobile required', checkChatDetails({ name: 'Grace', email: 'grace@example.com' }, strict), { ok: false, field: 'mobile', error: 'Please enter your mobile number.' })
const noName = { name: { show: false, required: true }, email: { show: true, required: false }, mobile: { show: true, required: false } }
eq('a hidden field is never required', checkChatDetails({ email: 'grace@example.com' }, noName), { ok: true, name: null, email: 'grace@example.com', phone: null })
eq('nothing at all', checkChatDetails({}, noName), { ok: false, field: null, error: 'Please fill in at least one field.' })
eq('an optional email, filled in wrong, still refused', checkChatDetails({ name: 'Grace', email: 'grace@' }).ok, false)
eq('the default form', DEFAULT_CHAT_FIELDS.name.required && !DEFAULT_CHAT_FIELDS.email.required && !DEFAULT_CHAT_FIELDS.mobile.required, true)

console.log(`\n${passed} passed, ${failed} failed`)
process.exit(failed ? 1 : 0)
