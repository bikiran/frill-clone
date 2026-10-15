'use client'

import { ReactNode } from 'react'
import type { Stage } from '@/components/ScrollStory'
import { Msg, CHIP } from '@/components/ScrollStory'
import { ActionCard, StatusCard, ChatCard, NoteCard, ReviewCard, SlotsCard, ReportCard, ListCard, TrailCard } from '@/components/story/StoryCards'

// The workflow each /for/* page walks through: hero copy, the journey rail,
// a five-beat scroll story built from real-looking Colvy cards, the steps in
// plain words (each naming the feature that does it), and what you can measure.
// Demo businesses and people are made up; every capability is real.

export type ForStep = { title: string; body: string; uses: string; href: string }
export type ForContent = {
  accent: string
  eyebrow: string
  h1: string
  sub: string
  rail: string[]
  heroCards: string[]               // keys from `cards`, shown fanned out in the hero
  stages: Stage[]
  cards: Record<string, ReactNode>
  order: string[]
  steps: ForStep[]
  measure: { title: string; body: string }[]
  works: string[]
}

const CORAL = '#ff6a4d', BLUE = '#2b59ff', GREEN = '#00a876', PURPLE = '#7c5cff', AMBER = '#d97706', TEAL = '#0d9488', PINK = '#e8467c'
const LIVE = '#0ea5e9'

export const FOR_CONTENT: Record<string, ForContent> = {
  // ── Ecommerce ────────────────────────────────────────────────────────────────
  ecommerce: {
    accent: CORAL,
    eyebrow: 'Colvy for ecommerce',
    h1: 'Every DM can become an order.',
    sub: 'Answer Instagram, Messenger, SMS, email and live chat in one inbox, with each buyer’s Shopify or WooCommerce orders right beside the chat. Sell, track and follow up without switching apps.',
    rail: ['Instagram DM', 'Customer matched', 'Payment link', 'Paid order', 'Tracking update', 'Review'],
    heroCards: ['dm', 'pay', 'order'],
    stages: [
      {
        key: 'ask', eyebrow: 'A buyer asks', title: 'Answer in seconds, on any channel.',
        body: 'DMs, texts, emails and chats land in one inbox. The AI drafts a reply from your product info, and your team checks it and sends.',
        bg: '#ff6a4d', ink: '#fff4ef',
        poses: { dm: { x: -95, y: -150, r: -5 }, sms: { x: 110, y: -95, r: 4 }, em: { x: -120, y: 20, r: 3 }, draft: { x: 60, y: 140, r: -2 } },
      },
      {
        key: 'match', eyebrow: 'Customer matched', title: 'You know who you’re talking to.',
        body: 'Colvy matches the buyer by phone or email and shows their past orders and spend next to the conversation.',
        bg: '#1f2a6b', ink: '#cdd8ff',
        poses: { dm: { x: -90, y: -170, s: 0.8, o: 0.4, r: -4 }, profile: { x: 0, y: -10 }, past: { x: 70, y: 170, r: 2 } },
      },
      {
        key: 'sell', eyebrow: 'Sell in the chat', title: 'Send the link. Get paid.',
        body: 'Send a payment link, or create the order for them. When they pay, it lands in your store as a paid order and the sale is recorded.',
        bg: '#0b5a44', ink: '#c9f6dc',
        poses: { profile: { x: -110, y: -120, s: 0.8, o: 0.35, r: -3 }, pay: { x: 80, y: -40, r: 3 }, order: { x: -20, y: 130, r: -2 } },
      },
      {
        key: 'track', eyebrow: 'Where’s my order?', title: 'Answered before it’s asked twice.',
        body: 'Order updates go out by SMS, and the AI answers “where’s my order?” from the real order and its tracking.',
        bg: '#0c4a6e', ink: '#cdeeff',
        poses: { order: { x: -120, y: -150, s: 0.8, o: 0.35, r: -4 }, wismo: { x: 30, y: -20 }, ship: { x: -40, y: 175, r: 2 } },
      },
      {
        key: 'return', eyebrow: 'They come back', title: 'Carts won back. Reviews in.',
        body: 'Abandoned-cart follow-ups, back-in-stock texts and review requests go out on their own, and you can see the sales they bring in.',
        bg: '#7a0019', ink: '#ffc9dc',
        poses: { cart: { x: -95, y: -150, r: -4 }, review: { x: 100, y: -20, r: 3 }, revenue: { x: -40, y: 150, r: -2 } },
      },
    ],
    cards: {
      dm: <Msg ch="Instagram" color={CHIP.Instagram} who="Ella Murphy" text="Is the oak side table back in stock? Want it before Friday 🙏" time="now" />,
      sms: <Msg ch="SMS" color={CHIP.SMS} who="Josh Kerr" text="Can I change the colour on order #10476?" time="3m" />,
      em: <Msg ch="Email" color={CHIP.Email} who="Priya Shah" text="Do you deliver to Hobart, and how much?" time="11m" />,
      draft: <ChatCard title="Ella Murphy" sub="Instagram · 2 previous orders" channel="Instagram" lines={[{ from: 'them', text: 'Is the oak side table back in stock?' }, { from: 'ai', text: 'Yes! 4 left in natural oak, $189. Want me to send a payment link?' }]} chips={[{ text: 'Checked stock', tone: '#0f766e' }]} />,
      profile: <StatusCard title="Ella Murphy" badge="Returning" badgeTone="#2563eb" sub="ella.m@example.com · 0412 555 230 · Instagram" strip="3 orders · $642 spent · last order 6 weeks ago" stripTone="#2563eb" width={300} />,
      past: <ListCard title="Orders" badge="Shopify" rows={[{ name: '#10391 Linen throw', sub: 'Delivered · $89', tag: 'Paid', tone: '#16a34a' }, { name: '#10244 Table lamp', sub: 'Delivered · $164', tag: 'Paid', tone: '#16a34a' }]} width={300} />,
      pay: <ActionCard icon="card" tint="#4f46e5" title="Pay $189.00" sub="Oak side table · natural" left="Sent to Ella · Instagram" right="✓ Paid" />,
      order: <StatusCard title="Order #10482" badge="Paid" sub="Ella Murphy · Express post · Brunswick VIC" strip="● Sale recorded from the chat · $189" />,
      wismo: <ChatCard title="Josh Kerr" sub="SMS" channel="SMS" lines={[{ from: 'them', text: 'Hey, where’s my order?' }, { from: 'ai', text: 'It left our warehouse yesterday. Tracking 33KJX8812 says it arrives Thursday.' }]} chips={[{ text: 'Order #10476 found' }, { text: 'Tracking checked', tone: '#0369a1' }]} />,
      ship: <NoteCard label="SMS · Order update" text="Your order #10476 is on its way! Track it here: colvy.link/t4Kp" left="Sent automatically" right="Opened" />,
      cart: <NoteCard label="SMS · Cart reminder" text="Still thinking about the rattan pendant? It’s waiting in your cart. Any questions, just reply." left="Sent 2h after checkout" right="Ordered ✓" />,
      review: <ReviewCard text="Gorgeous table and they answered my DM in minutes. Will buy again!" reply="Thanks Ella, enjoy it!" />,
      revenue: <ReportCard title="Revenue via chats · example" figure="$4,820" caption="last 30 days" bars={[3, 5, 4, 6, 5, 7, 9]} rows={[['Payment links', '$2,140'], ['Carts won back', '$1,310']]} tone="#be123c" />,
    },
    order: ['past', 'profile', 'order', 'pay', 'ship', 'wismo', 'em', 'sms', 'dm', 'draft', 'revenue', 'review', 'cart'],
    steps: [
      { title: 'Every channel in one inbox', body: 'Instagram and Messenger DMs, SMS, email and your website chat arrive as one thread per customer.', uses: 'Shared inbox', href: '/inbox-crm' },
      { title: 'See their orders', body: 'Connect Shopify or WooCommerce and each buyer’s orders, spend and tracking sit beside the chat.', uses: 'Orders in the inbox', href: '/product/orders' },
      { title: 'Answer with AI, approve with a tap', body: 'The AI drafts replies from your product info and stock. You decide what it may send by itself.', uses: 'AI agents', href: '/ai-assistant' },
      { title: 'Take payment in the chat', body: 'Send a secure payment link or create the order for them. Paid orders and sales are recorded automatically.', uses: 'Payment links', href: '/product/payments' },
      { title: 'Keep them updated', body: 'Order updates and delay notices go out by SMS, and order-status questions get answered from the real order.', uses: 'Order automation', href: '/product/orders' },
      { title: 'Win back and grow', body: 'Follow up abandoned carts, text waiting customers when stock is back and ask happy buyers for a review.', uses: 'Carts, waitlists & reviews', href: '/product/abandoned-carts' },
    ],
    measure: [
      { title: 'Sales from conversations', body: 'Paid payment links and orders that came from a chat, recorded against the conversation.' },
      { title: 'Carts won back', body: 'Abandoned carts that turned into orders after a follow-up.' },
      { title: 'Link clicks to revenue', body: 'Which links in your messages and campaigns were clicked, and the orders that followed.' },
    ],
    works: ['Shopify', 'WooCommerce', 'Stripe', 'Instagram', 'Messenger', 'Gmail', 'Google Reviews'],
  },

  // ── Real estate ─────────────────────────────────────────────────────────────
  'real-estate': {
    accent: BLUE,
    eyebrow: 'Colvy for real estate',
    h1: 'First to reply wins the buyer.',
    sub: 'Portal enquiry emails, Facebook messages, website chat and texts land in one inbox. Reply with the listing, see when it’s opened, book the inspection and stay in touch after the sale.',
    rail: ['Portal enquiry', 'Fast reply', 'Listing opened', 'Inspection booked', 'Application', 'Review'],
    heroCards: ['portal', 'opened', 'slots'],
    stages: [
      {
        key: 'enquiry', eyebrow: 'Every enquiry', title: 'One inbox for every lead.',
        body: 'Portal emails, Facebook messages, website chat and texts arrive as one thread per buyer, so nobody waits for a reply.',
        bg: '#1d3fd6', ink: '#dbe4ff',
        poses: { portal: { x: -90, y: -150, r: -5 }, fbm: { x: 115, y: -60, r: 4 }, chat: { x: -110, y: 70, r: 3 }, txt: { x: 90, y: 160, r: -3 } },
      },
      {
        key: 'reply', eyebrow: 'Reply fast', title: 'Send the listing. See it opened.',
        body: 'The AI drafts an answer from your listing notes. Send the listing link and see when it’s opened, on what device and how often.',
        bg: '#13234f', ink: '#c9d6ff',
        poses: { portal: { x: -130, y: -170, s: 0.78, o: 0.35, r: -4 }, draft: { x: 10, y: -40 }, opened: { x: -30, y: 160, r: 2 } },
      },
      {
        key: 'inspect', eyebrow: 'Book the inspection', title: 'They pick a time. You get reminders.',
        body: 'Buyers choose a private inspection time on your booking page. SMS reminders go out the day before and two hours before.',
        bg: '#0b5a44', ink: '#c9f6dc',
        poses: { opened: { x: -140, y: -170, s: 0.75, o: 0.3, r: -4 }, slots: { x: 50, y: -50, r: 2 }, remind: { x: -50, y: 150, r: -2 } },
      },
      {
        key: 'apply', eyebrow: 'Applications', title: 'No more chasing paperwork.',
        body: 'Send a form with uploads and a signature in the same conversation. Responses and documents come back to you in Colvy.',
        bg: '#3b1d6e', ink: '#e4d7ff',
        poses: { slots: { x: 150, y: -170, s: 0.75, o: 0.3, r: 4 }, form: { x: -20, y: -30 }, task: { x: 60, y: 160, r: 2 } },
      },
      {
        key: 'after', eyebrow: 'After the keys', title: 'Stay the agent they call next time.',
        body: 'Ask for a review at handover, and set follow-up tasks so past clients hear from you when it counts.',
        bg: '#7a0019', ink: '#ffc9dc',
        poses: { form: { x: -130, y: -160, s: 0.75, o: 0.3, r: -4 }, review: { x: 70, y: -40, r: 3 }, follow: { x: -40, y: 150, r: -2 } },
      },
    ],
    cards: {
      portal: <Msg ch="Email" color={CHIP.Email} who="Portal enquiry" text="14 Bay St, Brighton: is it still available? Can I inspect Saturday?" time="now" />,
      fbm: <Msg ch="Messenger" color={CHIP.Messenger} who="Sam Okafor" text="What are the body corporate fees on the Elwood unit?" time="4m" />,
      chat: <Msg ch="Live chat" color={LIVE} who="Website visitor" text="Do you do free appraisals in Hampton?" time="9m" />,
      txt: <Msg ch="SMS" color={CHIP.SMS} who="Lucy Tran" text="Running 10 min late to the open home!" time="12m" />,
      draft: <ChatCard title="Hannah Lee" sub="Email · Portal enquiry" channel="Email" lines={[{ from: 'them', text: 'Is 14 Bay St still available?' }, { from: 'ai', text: 'Yes, it is! Here’s the listing with floor plans. Would Saturday 10:15 suit for a private inspection?' }]} chips={[{ text: 'Listing link added', tone: '#1d4ed8' }]} />,
      opened: <ActionCard icon="link" tint="#2563eb" title="Listing link opened 3×" sub="iPhone · Brighton · last opened 8 min ago" left="Sent to Hannah · Email" right="Opened" rightTone="#2563eb" />,
      slots: <SlotsCard title="Private inspection" day="Saturday 19 Oct · 14 Bay St" slots={['9:30', '9:45', '10:00', '10:15', '10:30', '10:45']} picked="10:15" footer="✓ Hannah booked 10:15" />,
      remind: <NoteCard label="SMS · Reminder" text="See you tomorrow at 10:15 for 14 Bay St, Brighton. Need to change it? Tap here." left="Sent the day before" right="Confirmed" />,
      form: <StatusCard title="Rental application" badge="Received" badgeTone="#7c3aed" sub="Hannah Lee · 14 Bay St, Brighton" strip="ID, payslips and signature attached" stripTone="#7c3aed" />,
      task: <ActionCard icon="check" tint="#0f766e" title="Call Hannah re: application" sub="Due today · assigned to Marcus" left="Task" right="Open" rightTone="#0f766e" />,
      review: <ReviewCard text="Marcus replied within minutes and made the whole process easy." reply="Thanks Hannah, enjoy the new home!" />,
      follow: <ActionCard icon="bell" tint="#b45309" title="Check in with Hannah" sub="Repeats every 6 months" left="Follow-up task" right="Scheduled" rightTone="#b45309" />,
    },
    order: ['txt', 'chat', 'fbm', 'portal', 'draft', 'opened', 'remind', 'slots', 'task', 'form', 'follow', 'review'],
    steps: [
      { title: 'Bring every enquiry in', body: 'Connect the email address your portal enquiries go to, plus Facebook, website chat and SMS.', uses: 'Shared inbox', href: '/inbox-crm' },
      { title: 'Reply in minutes', body: 'The AI drafts a reply from your listing notes and knowledge. You check it and send.', uses: 'AI drafts', href: '/ai-assistant' },
      { title: 'Know when they’re interested', body: 'Links you send are tracked, so you see when the listing was opened, how often and on what device.', uses: 'Tracked links', href: '/product/links' },
      { title: 'Let them book inspections', body: 'Share your booking page for private inspections and appraisals. Reminders go out by SMS.', uses: 'Online booking', href: '/product/booking' },
      { title: 'Collect applications', body: 'Send a form with file uploads and a signature, right in the conversation.', uses: 'Forms', href: '/channels/forms' },
      { title: 'Follow up for years', body: 'Ask for a review at handover and set repeating follow-up tasks for past clients.', uses: 'Tasks & reviews', href: '/product/tasks' },
    ],
    measure: [
      { title: 'Reply speed', body: 'How fast enquiries get a first reply, and which are still waiting.' },
      { title: 'Listing interest', body: 'Who opened which listing link, how many times and when.' },
      { title: 'Inspections booked', body: 'Every inspection booked, rescheduled or cancelled, with reminders sent.' },
    ],
    works: ['Gmail', 'Facebook', 'Messenger', 'Live chat', 'SMS', 'Google Reviews'],
  },

  // ── Multi-location retail ───────────────────────────────────────────────────
  'multi-location-retail': {
    accent: TEAL,
    eyebrow: 'Colvy for multi-location retail',
    h1: 'Every store, one inbox.',
    sub: 'Give each store its own local number and answer every store from one shared inbox. Check stock store by store, take payment before pickup and see how each location is doing.',
    rail: ['Store number', 'Shared inbox', 'Stock by store', 'Paid before pickup', 'Review', 'Store insights'],
    heroCards: ['stores', 'stock', 'compare'],
    stages: [
      {
        key: 'stores', eyebrow: 'Every store', title: 'A local number for each store.',
        body: 'Buy a local number for every location from inside Colvy. Calls and texts to all of them are answered from one shared inbox.',
        bg: '#0f766e', ink: '#ccfbf1',
        poses: { stores: { x: -20, y: -60 }, call: { x: 120, y: 150, r: 3 }, sms1: { x: -150, y: 160, r: -4 } },
      },
      {
        key: 'stock', eyebrow: 'Stock by store', title: '“Have you got it at Geelong?”',
        body: 'Colvy checks stock store by store, so your team or the AI gives the right answer the first time.',
        bg: '#134e4a', ink: '#d1fae5',
        poses: { stores: { x: -140, y: -170, s: 0.75, o: 0.3, r: -4 }, ask: { x: -20, y: -40 }, stock: { x: 60, y: 150, r: 2 } },
      },
      {
        key: 'pickup', eyebrow: 'Click and collect', title: 'Paid before they walk in.',
        body: 'Send a payment link from the chat. The order lands as paid and the store has it ready.',
        bg: '#0b5a44', ink: '#c9f6dc',
        poses: { stock: { x: -140, y: -160, s: 0.75, o: 0.3, r: -4 }, pay: { x: 70, y: -40, r: 3 }, ready: { x: -40, y: 140, r: -2 } },
      },
      {
        key: 'reviews', eyebrow: 'Reputation', title: 'Every review gets a reply.',
        body: 'Google reviews come into Colvy and the AI drafts a reply in your voice for a person to approve, or sends it within the rules you set.',
        bg: '#7c2d12', ink: '#ffedd5',
        poses: { ready: { x: 140, y: -170, s: 0.75, o: 0.3, r: 4 }, review: { x: -10, y: -10 }, review2: { x: 70, y: 160, r: 3, s: 0.92 } },
      },
      {
        key: 'compare', eyebrow: 'Store by store', title: 'See which store is winning.',
        body: 'Insights by location and link sales by outlet show where chats turn into sales, and where they don’t.',
        bg: '#1e1b4b', ink: '#e0e7ff',
        poses: { review: { x: -140, y: -170, s: 0.75, o: 0.3, r: -4 }, compare: { x: 20, y: -10 }, outlet: { x: -70, y: 170, r: -2 } },
      },
    ],
    cards: {
      stores: <ListCard title="Numbers" badge="3 stores" rows={[{ name: 'Richmond', sub: '03 9012 4410 · calls & SMS', tag: 'Store', tone: '#0d9488' }, { name: 'Geelong', sub: '03 5201 7733 · calls & SMS', tag: 'Store', tone: '#0d9488' }, { name: 'Ballarat', sub: '03 5300 2190 · calls & SMS', tag: 'Store', tone: '#0d9488' }]} width={310} />,
      call: <Msg ch="Phone" color={CHIP.Phone} who="Call · Geelong line" text="Answered by Mel in the browser · 2:14" time="now" />,
      sms1: <Msg ch="SMS" color={CHIP.SMS} who="Ben Hollis" text="Are you open late Thursday in Ballarat?" time="5m" />,
      ask: <ChatCard title="Ruby Walsh" sub="Instagram" channel="Instagram" lines={[{ from: 'them', text: 'Have you got the large terracotta pots at Geelong?' }, { from: 'ai', text: 'Geelong has 6 in stock right now. Want me to hold one for you?' }]} />,
      stock: <ReportCard title="Stock · Terracotta pot (large)" figure="14" caption="across 3 stores" rows={[['Richmond', '8'], ['Geelong', '6'], ['Ballarat', '0']]} tone="#0d9488" width={280} />,
      pay: <ActionCard icon="card" tint="#4f46e5" title="Pay $64.00" sub="Terracotta pot · large" left="Sent to Ruby · Instagram" right="✓ Paid" />,
      ready: <StatusCard title="Order #5520" badge="Paid" sub="Ruby Walsh · Pickup · Geelong" strip="● Ready for pickup" stripTone="#0f766e" />,
      review: <ReviewCard who="Google · Geelong" text="Asked on Instagram, paid online, picked up in 10 minutes. So easy." reply="Thanks Ruby! See you next time." />,
      review2: <ReviewCard who="Google · Richmond" when="1d ago" text="Helpful staff and they called me back the same day." />,
      compare: <ReportCard title="Conversations by store · example" figure="1,284" caption="last 30 days" bars={[5, 6, 5, 7, 8, 7, 9]} rows={[['Richmond', '612'], ['Geelong', '438'], ['Ballarat', '234']]} tone="#4f46e5" />,
      outlet: <ReportCard title="Link sales by outlet · example" figure="$7,930" rows={[['Richmond', '$4,100'], ['Geelong', '$2,610']]} tone="#0d9488" width={270} />,
    },
    order: ['outlet', 'sms1', 'call', 'stores', 'ask', 'stock', 'ready', 'pay', 'review2', 'review', 'compare'],
    steps: [
      { title: 'A number for every store', body: 'Buy Australian local numbers in minutes and assign each to its location. Calls ring in the browser and the mobile app.', uses: 'Business numbers', href: '/business-phone-number-australia' },
      { title: 'One shared inbox', body: 'Calls, texts, DMs and email for every store in one place, with the customer’s history beside each conversation.', uses: 'Shared inbox', href: '/inbox-crm' },
      { title: 'Stock by store', body: 'Your team and the AI agents check availability store by store before they answer.', uses: 'AI agents', href: '/ai-assistant' },
      { title: 'Paid before pickup', body: 'Send a payment link from the conversation; the paid order is ready to collect.', uses: 'Payment links', href: '/product/payments' },
      { title: 'Answer every review', body: 'Google reviews come into Colvy, with AI-drafted replies in your voice.', uses: 'Reviews', href: '/solutions/reviews' },
      { title: 'Compare locations', body: 'Insights by location and Link Reports by outlet show how each store converts.', uses: 'Insights', href: '/product/insights' },
    ],
    measure: [
      { title: 'Each location', body: 'Conversations and sales for each store, side by side.' },
      { title: 'Sales by outlet', body: 'Link-driven sales broken down by the store that sent the link.' },
      { title: 'Calls answered and missed', body: 'Every call on every store number, with recordings and AI summaries.' },
    ],
    works: ['Shopify', 'WooCommerce', 'Stripe', 'Google Reviews', 'Instagram', 'Messenger'],
  },

  // ── Service businesses ──────────────────────────────────────────────────────
  'service-businesses': {
    accent: AMBER,
    eyebrow: 'Colvy for service businesses',
    h1: 'From missed call to five-star review.',
    sub: 'For trades, salons, cleaners and clinics. Text back the calls you miss on the job, see photos before you quote, take deposits, let customers book online and ask for a review when you’re done.',
    rail: ['Missed call', 'Text back', 'Photos', 'Quote & deposit', 'Booked', 'Review'],
    heroCards: ['missed', 'photos', 'slots'],
    stages: [
      {
        key: 'missed', eyebrow: 'On the tools', title: 'Missed a call? They get a text.',
        body: 'When you can’t pick up, Colvy texts the caller straight away from your business number. Their reply waits in your inbox.',
        bg: '#b45309', ink: '#fff3dd',
        poses: { missed: { x: -60, y: -120, r: -3 }, textback: { x: 70, y: 70, r: 3 } },
      },
      {
        key: 'photos', eyebrow: 'Before you quote', title: 'See the job first.',
        body: 'Send an upload link and the customer sends photos or video of the job at full quality, straight into the conversation.',
        bg: '#78350f', ink: '#fde8c8',
        poses: { textback: { x: -140, y: -170, s: 0.75, o: 0.3, r: -4 }, upload: { x: 50, y: -60, r: 2 }, photos: { x: -50, y: 120, r: -2 } },
      },
      {
        key: 'quote', eyebrow: 'Quote and deposit', title: 'Quote it. Take the deposit.',
        body: 'Send the quote and a payment link in the same thread. Colvy can follow up quotes that haven’t been answered.',
        bg: '#0b5a44', ink: '#c9f6dc',
        poses: { photos: { x: -150, y: -170, s: 0.75, o: 0.3, r: -4 }, quote: { x: 30, y: -40 }, deposit: { x: -40, y: 150, r: -2 } },
      },
      {
        key: 'book', eyebrow: 'Online booking', title: 'They book the time that suits.',
        body: 'Your booking page shows real availability and can take a deposit. Reminders go out the day before and two hours before.',
        bg: '#0c4a6e', ink: '#cdeeff',
        poses: { deposit: { x: 150, y: -170, s: 0.75, o: 0.3, r: 4 }, slots: { x: -30, y: -40, r: -2 }, remind: { x: 60, y: 150, r: 2 } },
      },
      {
        key: 'review', eyebrow: 'Job done', title: 'Ask for the review.',
        body: 'A review request goes out after the booking is completed, with a link to book again next time.',
        bg: '#7a0019', ink: '#ffc9dc',
        poses: { slots: { x: -150, y: -170, s: 0.75, o: 0.3, r: -4 }, ask: { x: 60, y: -50, r: 3 }, review: { x: -30, y: 140, r: -2 } },
      },
    ],
    cards: {
      missed: <Msg ch="Phone" color={CHIP.Phone} who="Missed call" text="0413 555 902 · while you were on a job" time="now" />,
      textback: <NoteCard label="SMS · Missed-call text back" text="Sorry we missed your call! This is Coastline Plumbing. Reply here and we’ll get back to you shortly." left="Sent automatically" right="Customer replied" />,
      upload: <ActionCard icon="upload" tint="#b45309" title="Upload link sent" sub="“Send us a few photos of the leak”" left="Sent to Dan · SMS" right="3 photos received" rightTone="#b45309" />,
      photos: <StatusCard title="Dan Fischer · photos" badge="Full quality" badgeTone="#b45309" sub="3 photos · 1 video · Kitchen sink, Torquay" strip="Saved to the conversation" stripTone="#b45309" />,
      quote: <ChatCard title="Dan Fischer" sub="SMS" channel="SMS" lines={[{ from: 'us', text: 'Quote for the sink: $420 incl. parts. A $100 deposit locks in Thursday.' }, { from: 'them', text: 'Sounds good, sending it now' }]} chips={[{ text: 'Quote follow-up on', tone: '#0369a1' }]} />,
      deposit: <ActionCard icon="card" tint="#4f46e5" title="Deposit $100.00" sub="Kitchen sink repair" left="Sent to Dan · SMS" right="✓ Paid" />,
      slots: <SlotsCard title="Plumbing call-out" day="Thursday 24 Oct" slots={['7:30', '9:00', '10:30', '12:00', '1:30', '3:00']} picked="9:00" footer="✓ Dan booked 9:00 · deposit paid" />,
      remind: <NoteCard label="SMS · Reminder" text="See you tomorrow at 9:00am. Need to change it? Tap here to reschedule." left="Sent the day before" right="Confirmed" />,
      ask: <NoteCard label="SMS · Review request" text="Thanks for having us, Dan! Would you mind leaving a quick review? It really helps." left="After the job" right="Review left ★★★★★" rightTone="#d97706" />,
      review: <ReviewCard text="Texted back while they were on another job, came Thursday as booked. Brilliant." reply="Thanks Dan, call us any time!" />,
    },
    order: ['missed', 'textback', 'photos', 'upload', 'deposit', 'quote', 'remind', 'slots', 'review', 'ask'],
    steps: [
      { title: 'Text back missed calls', body: 'Switch on missed-call text back and every caller you miss gets a text from your business number.', uses: 'Business phone', href: '/business-phone-number-australia' },
      { title: 'Get photos before you quote', body: 'Send an upload link; photos and video arrive at full quality in the conversation.', uses: 'Upload links', href: '/inbox-crm' },
      { title: 'Quote and take a deposit', body: 'Send the quote and a payment link in one thread. Unanswered quotes can be followed up.', uses: 'Payment links', href: '/product/payments' },
      { title: 'Online booking with reminders', body: 'Customers book real availability, pay a deposit if you ask, and get SMS reminders.', uses: 'Online booking', href: '/product/booking' },
      { title: 'Ask for the review', body: 'A review request goes out when the booking is completed.', uses: 'Reviews', href: '/solutions/reviews' },
      { title: 'Never lose a job in the inbox', body: 'Tasks, assignments and reminders make sure every enquiry gets a reply.', uses: 'Tasks', href: '/product/tasks' },
    ],
    measure: [
      { title: 'Missed calls recovered', body: 'Missed calls that got a text back or a call back, and the ones still waiting.' },
      { title: 'Bookings and deposits', body: 'Bookings by service, deposits paid, reschedules and cancellations.' },
      { title: 'Reviews', body: 'Review requests sent, reviews received and replies posted.' },
    ],
    works: ['Stripe', 'Google Reviews', 'SMS', 'Instagram', 'Messenger', 'Gmail'],
  },

  // ── Restaurants ─────────────────────────────────────────────────────────────
  restaurants: {
    accent: PINK,
    eyebrow: 'Colvy for restaurants',
    h1: 'Nothing missed during service.',
    sub: 'Calls, Instagram, Facebook and texts in one inbox your team can check between tables. Instant answers about hours and menus, function enquiries with deposits, a reply to every review and SMS to regulars.',
    rail: ['Call or DM', 'Instant answer', 'Function enquiry', 'Deposit paid', 'Review', 'Regulars back'],
    heroCards: ['dm', 'answer', 'deposit'],
    stages: [
      {
        key: 'service', eyebrow: 'During service', title: 'One inbox for the whole team.',
        body: 'Calls, Instagram, Facebook and texts land in one shared inbox. Missed calls can get an automatic text back.',
        bg: '#be185d', ink: '#ffe4ef',
        poses: { dm: { x: -100, y: -150, r: -5 }, fbm: { x: 110, y: -60, r: 4 }, missed: { x: -110, y: 70, r: 3 }, textback: { x: 80, y: 165, r: -3, s: 0.95 } },
      },
      {
        key: 'answers', eyebrow: 'Instant answers', title: '“Are you open Monday?” Done.',
        body: 'The AI answers hours (including public holidays) and menu questions from your notes, and passes anything tricky to your team.',
        bg: '#4c1658', ink: '#f6cdfa',
        poses: { dm: { x: -140, y: -170, s: 0.75, o: 0.3, r: -4 }, answer: { x: 10, y: -20 } },
      },
      {
        key: 'functions', eyebrow: 'Functions', title: 'Functions sorted in one thread.',
        body: 'Send an enquiry form for the details, then a payment link for the deposit, all in the same conversation.',
        bg: '#0b5a44', ink: '#c9f6dc',
        poses: { answer: { x: -140, y: -170, s: 0.75, o: 0.3, r: -4 }, form: { x: 40, y: -50, r: 2 }, deposit: { x: -40, y: 140, r: -2 } },
      },
      {
        key: 'reviews', eyebrow: 'Reputation', title: 'Reply to every review.',
        body: 'Google reviews come into Colvy and the AI drafts a reply in your voice, for you to approve or send within the rules you set.',
        bg: '#7c2d12', ink: '#ffedd5',
        poses: { deposit: { x: 150, y: -170, s: 0.75, o: 0.3, r: 4 }, review: { x: -10, y: -30 }, review2: { x: 60, y: 160, r: 3, s: 0.92 } },
      },
      {
        key: 'regulars', eyebrow: 'Regulars', title: 'Fill the quiet nights.',
        body: 'Text customers who opted in about a new menu or a midweek special. Replies land in your inbox and you see who clicked.',
        bg: '#1e1b4b', ink: '#e0e7ff',
        poses: { review: { x: -140, y: -170, s: 0.75, o: 0.3, r: -4 }, broadcast: { x: 40, y: -40, r: 2 }, report: { x: -50, y: 150, r: -2 } },
      },
    ],
    cards: {
      dm: <Msg ch="Instagram" color={CHIP.Instagram} who="Zoe Park" text="Do you have gluten-free pasta? Coming Friday with friends!" time="now" />,
      fbm: <Msg ch="Messenger" color={CHIP.Messenger} who="Liam Byrne" text="Can we do a 30th for 25 people in December?" time="6m" />,
      missed: <Msg ch="Phone" color={CHIP.Phone} who="Missed call" text="0422 555 117 · during dinner service" time="8m" />,
      textback: <NoteCard label="SMS · Missed-call text back" text="Sorry we missed you, it’s busy in here! Reply with what you need and we’ll get back to you." left="Sent automatically" right="Replied" />,
      answer: <ChatCard title="Zoe Park" sub="Instagram" channel="Instagram" lines={[{ from: 'them', text: 'Are you open on the Monday public holiday?' }, { from: 'ai', text: 'We are! 5pm to 10pm this Monday. Gluten-free pasta is available on request too.' }]} chips={[{ text: 'Holiday hours checked', tone: '#0369a1' }]} />,
      form: <StatusCard title="Function enquiry" badge="Received" badgeTone="#7c3aed" sub="Liam Byrne · Sat 14 Dec · 25 guests" strip="Set menu B · dietary notes attached" stripTone="#7c3aed" />,
      deposit: <ActionCard icon="card" tint="#4f46e5" title="Deposit $500.00" sub="30th birthday · Sat 14 Dec" left="Sent to Liam · Messenger" right="✓ Paid" />,
      review: <ReviewCard text="Answered my DM in a minute and the gluten-free pasta was the best I’ve had." reply="Thank you Zoe, see you again soon!" />,
      review2: <ReviewCard when="1d ago" text="Booked our function over Messenger, everything was organised perfectly." />,
      broadcast: <NoteCard label="SMS · Broadcast" text="New autumn menu starts Wednesday. Tuesday locals’ night: two courses for $45. Reply BOOK to grab a table." left="Sent to 640 who opted in" right="112 clicked" />,
      report: <ReportCard title="Broadcast results · example" figure="112 clicks" caption="from 640 delivered" rows={[['Click rate', '17.5%'], ['Function deposits', '$1,500']]} tone="#be185d" width={270} />,
    },
    order: ['textback', 'missed', 'fbm', 'dm', 'answer', 'deposit', 'form', 'review2', 'review', 'report', 'broadcast'],
    steps: [
      { title: 'One inbox for the floor', body: 'Calls, Instagram, Facebook, texts and email in one place your whole team can check.', uses: 'Shared inbox', href: '/inbox-crm' },
      { title: 'Text back missed calls', body: 'Callers you miss during service get an automatic text so they don’t book elsewhere.', uses: 'Business phone', href: '/business-phone-number-australia' },
      { title: 'Instant answers', body: 'The AI answers hours, holiday hours and menu questions from your notes.', uses: 'AI agents', href: '/ai-assistant' },
      { title: 'Functions with deposits', body: 'Collect function details with a form, then take the deposit with a payment link.', uses: 'Forms & payments', href: '/product/payments' },
      { title: 'Reply to every review', body: 'Google reviews in one list, with AI-drafted replies in your voice.', uses: 'Reviews', href: '/solutions/reviews' },
      { title: 'Text your regulars', body: 'SMS broadcasts to customers who opted in, with delivery and clicks tracked.', uses: 'Broadcasts', href: '/product/broadcasts' },
    ],
    measure: [
      { title: 'Enquiries answered', body: 'How many calls and messages came in, and how fast they were answered.' },
      { title: 'Function deposits', body: 'Deposits paid through payment links, by date.' },
      { title: 'Broadcast results', body: 'Delivered, clicks and sales for every SMS you send.' },
    ],
    works: ['Instagram', 'Messenger', 'SMS', 'Stripe', 'Google Reviews', 'Gmail'],
  },
}

export const FOR_ORDER = ['ecommerce', 'multi-location-retail', 'service-businesses', 'restaurants', 'real-estate']
export const FOR_ACCENTS = { CORAL, BLUE, GREEN, PURPLE, AMBER, TEAL, PINK }
