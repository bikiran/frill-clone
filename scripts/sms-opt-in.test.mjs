// Runnable tests for the SMS opt-in rule (lib/channel-choice-server
// readSmsOptIn / smsOptInFrom): a website chat visitor who gave a mobile and
// left "Continue this conversation by text" unticked isn't texted, nor is a
// contact that came only from the website chat form, unless something else
// lets the business text them.
//
// The coupon, tracking and review-request routes ask this rule before they
// text a number they found on the conversation or the contact (rather than
// one they were given), so these are the cases those fallbacks depend on.
//
//   npx tsx scripts/sms-opt-in.test.mjs
//
// Zero-dependency: a tiny fake Supabase client stands in for the database.
// Made-up companies, contacts and numbers only. Exits non-zero if any check fails.

import { readSmsOptIn, smsOptInFrom } from '../lib/channel-choice-server.ts'

let failures = 0
const ok = (cond, name, extra) => { if (cond) console.log('  ok  ', name); else { failures++; console.log('  FAIL', name, extra === undefined ? '' : JSON.stringify(extra)) } }

// conversations and contacts, read by eq() filters. `brokenList` makes the
// "all of this contact's conversations" read fail (the single-row reads work).
function fakeDb({ conversations = [], contacts = [] }, { brokenList = false } = {}) {
  const tables = { conversations, contacts }
  return {
    from(table) {
      const filters = []
      const rows = () => (tables[table] || []).filter(r => filters.every(f => f(r)))
      const q = {
        select() { return q },
        eq(c, v) { filters.push(r => r[c] === v); return q },
        limit() { return q },
        maybeSingle() { return Promise.resolve({ data: rows()[0] || null, error: null }) },
        then(res, rej) {
          return Promise.resolve(brokenList ? { data: null, error: { message: 'connection refused' } } : { data: rows(), error: null }).then(res, rej)
        },
      }
      return q
    },
  }
}

const CO = 'co-1'
const MOBILE = '0412 345 678'
// A website chat (only the widget sets visitor_id) where the visitor typed a mobile.
const chat = (over = {}) => ({ id: 'cv-chat', company_id: CO, contact_id: 'ct-1', channel: 'widget', visitor_id: 'v-1', sms_number: MOBILE, sms_enabled: false, ...over })
const widgetContact = (over = {}) => ({ id: 'ct-1', company_id: CO, phone: MOBILE, source: 'widget', consent_basis: null, ...over })
const ask = (db, o) => readSmsOptIn(db, { companyId: CO, ...o })

console.log('A website chat visitor who typed a mobile')
{
  const db = fakeDb({ conversations: [chat()], contacts: [widgetContact()] })
  ok(await ask(db, { conversationId: 'cv-chat', phone: MOBILE }) === false, 'box left unticked: not texted')
}
{
  const db = fakeDb({ conversations: [chat({ sms_enabled: true })], contacts: [widgetContact()] })
  ok(await ask(db, { conversationId: 'cv-chat', phone: MOBILE }) === true, 'box ticked: may be texted')
}
{
  // The chat has since been answered by text (channel 'sms'); it is still the widget's conversation.
  const db = fakeDb({ conversations: [chat({ channel: 'sms' })], contacts: [widgetContact()] })
  ok(await ask(db, { conversationId: 'cv-chat', phone: MOBILE }) === false, 'still unticked after the thread moved channel: not texted')
}
{
  const db = fakeDb({ conversations: [chat(), { id: 'cv-sms', company_id: CO, contact_id: 'ct-1', channel: 'sms', sms_number: MOBILE, sms_enabled: true }], contacts: [widgetContact()] })
  ok(await ask(db, { conversationId: 'cv-chat', phone: MOBILE }) === true, 'unticked, but they also have an SMS conversation: may be texted')
}
{
  const db = fakeDb({ conversations: [chat()], contacts: [widgetContact({ consent_basis: 'express' })] })
  ok(await ask(db, { conversationId: 'cv-chat', phone: MOBILE }) === true, 'unticked, but consent is recorded on the contact: may be texted')
}
{
  const db = fakeDb({ conversations: [chat()], contacts: [widgetContact()] }, { brokenList: true })
  ok(await ask(db, { conversationId: 'cv-chat', phone: MOBILE }) === false, 'their other conversations can’t be read: not texted')
}

console.log('A contact that came only from the website chat form, asked about on another thread')
{
  // A call thread with no number of its own; the mobile is on the contact.
  const call = { id: 'cv-call', company_id: CO, contact_id: 'ct-1', channel: 'phone', sms_number: null, sms_enabled: false }
  const db = fakeDb({ conversations: [call, chat()], contacts: [widgetContact()] })
  ok(await ask(db, { conversationId: 'cv-call', phone: MOBILE }) === false, 'never ticked the box on any chat: not texted')
  const db2 = fakeDb({ conversations: [call, chat({ sms_enabled: true })], contacts: [widgetContact()] })
  ok(await ask(db2, { conversationId: 'cv-call', phone: MOBILE }) === true, 'ticked it on one of their chats: may be texted')
  // The contact row handed over by the caller (as the coupon route does).
  ok(await ask(db, { conversationId: 'cv-call', contactId: 'ct-1', contact: widgetContact(), phone: MOBILE }) === false, 'same answer when the caller passes the contact row')
  const db3 = fakeDb({ conversations: [call, chat()], contacts: [widgetContact()] }, { brokenList: true })
  ok(await ask(db3, { conversationId: 'cv-call', phone: MOBILE }) === false, 'their conversations can’t be read: not texted')
}

console.log('Nothing asks for an opt-in (the STOP check alone applies)')
{
  const order = { id: 'cv-order', company_id: CO, contact_id: 'ct-2', channel: 'chat', sms_number: MOBILE, sms_enabled: true }
  const shopper = { id: 'ct-2', company_id: CO, phone: MOBILE, source: 'woocommerce', consent_basis: null }
  const db = fakeDb({ conversations: [order], contacts: [shopper] })
  ok(await ask(db, { conversationId: 'cv-order', phone: MOBILE }) === null, 'an order conversation and a contact from the store')
  const call = { id: 'cv-call', company_id: CO, contact_id: 'ct-2', channel: 'phone', sms_number: MOBILE, sms_enabled: false }
  const db2 = fakeDb({ conversations: [call], contacts: [shopper] })
  ok(await ask(db2, { conversationId: 'cv-call', phone: MOBILE }) === null, 'a call thread holding the caller’s number (sms_enabled is only the column default there)')
  // A website chat where no mobile was typed, for a contact known from elsewhere.
  const db3 = fakeDb({ conversations: [chat({ contact_id: 'ct-2', sms_number: null })], contacts: [shopper] })
  ok(await ask(db3, { conversationId: 'cv-chat', phone: MOBILE }) === null, 'a website chat without a typed mobile, contact from the store')
  ok(await ask(db, { conversationId: 'cv-none' }) === null, 'no number to text')
}

console.log('smsOptInFrom (the rule itself)')
ok(smsOptInFrom({ conv: chat(), contact: widgetContact(), contactConvs: [] }) === false, 'unticked website chat, nothing else: false')
ok(smsOptInFrom({ conv: chat({ visitor_id: null, channel: 'widget' }), contact: null, contactConvs: [] }) === false, 'a widget conversation with no contact at all: false')
ok(smsOptInFrom({ conv: null, contact: widgetContact({ consent_basis: 'inferred' }), contactConvs: [] }) === null, 'a website chat contact with recorded consent is not "widget only"')

console.log(failures ? `\n${failures} check(s) failed` : '\nAll checks passed')
process.exit(failures ? 1 : 0)
