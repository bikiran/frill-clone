import type { BlogPost } from '@/lib/blog'

// Feature guides for things people search for, written around what Colvy
// does today (checked against the code). Made-up businesses and people.
// Photos are the matching feature pages' own.

const CORAL = '#ff6a4d', BLUE = '#2b59ff', PURPLE = '#7c5cff', GREEN = '#00c48c', AMBER = '#d97706'

export const FEATURE_POSTS: BlogPost[] = [
  {
    slug: 'missed-call-text-back',
    cover: '/phones/missed-call-text-back.jpg',
    title: 'Missed call text back: what to send, when to send it, and the rules',
    excerpt: 'Most people who reach voicemail hang up and ring the next business. A short text straight after a missed call keeps them. What a good missed-call text says, when it should and shouldn’t go out, and how to set it up in Colvy.',
    seoDescription: 'What a missed call text back should say, when it should and shouldn’t send, examples you can copy, and how to turn it on in Colvy for your business number.',
    category: 'Playbooks', accent: CORAL, icon: 'phone',
    date: '2026-11-14T00:58:00+11:00', dateLabel: 'Nov 14, 2026', readTime: '7 min read', author: 'The Colvy Team',
    takeaways: [
      'A missed call is usually a customer who’ll ring someone else. A text within a minute keeps the conversation going.',
      'Say who you are, that you missed them, and the easiest next step, like your booking link. Keep it short and never salesy.',
      'Send it once, not on every missed call, and never to landlines, hidden numbers or people who replied STOP.',
      'Their reply should land in the same conversation as the missed call, so whoever calls back has the context.',
    ],
    content: `A plumber is under a sink. A hairdresser is mid-colour. A café owner is on the coffee machine at 8:15am. The phone rings, nobody can answer, and the caller does what most people do with voicemail: hangs up and rings the next business on the list.

Missed call text back fixes that. When nobody answers, the caller gets a short text a moment later, and the conversation carries on by text instead of ending.

## What a good missed-call text says

Three things, in one or two sentences:

1. **Who you are.** The caller may not have saved your number.
2. **That you missed them,** and that you’ll be in touch.
3. **The easiest next step:** your booking link, or “reply here”.

\`\`\`chat
title: Hollis Plumbing · SMS
you: Sorry we missed your call, this is Hollis Plumbing. We’re on a job right now. Reply with what you need and we’ll get back to you within the hour.
them: Hi, hot water system is leaking, can someone come today?
\`\`\`

A few that work for different businesses:

| Business | Missed-call text |
|---|---|
| Salon or clinic | Sorry we missed you, it’s Bloom Hair. You can book online any time: {booking_link}. Or reply and we’ll call you back. |
| Restaurant | Sorry we missed your call, it’s Little Fig. Book a table here: {booking_link}, or reply with your question. |
| Trades | Sorry we missed your call, it’s Hollis Plumbing. Reply with what you need and a photo if you can, and we’ll get back to you shortly. |
| Shop | Sorry we missed you, it’s Fern & Co. Reply here with your question and we’ll get straight back to you. |

## When it should (and shouldn’t) go out

A good missed-call text is polite, not pushy. So the rules matter as much as the words. In Colvy it goes out once when a call wasn’t answered (it rang out, went to voicemail, or the caller hung up while it rang) and **never**:

- when someone actually answered;
- to a hidden number, a short code, a landline or an overseas number;
- to your own numbers or your team;
- to anyone who replied STOP, a blocked contact, or a conversation marked as spam;
- more than once per caller every 12 hours, or the gap you choose;
- while you’re open, if you’ve chosen to send it only when you’re closed.

Keep it about their call. A reply to someone who just rang you isn’t the place for a promotion, and it should always say who you are.

![A phone showing a text message](/blog/sms-marketing-consent-australia/phone-hand.jpg "Short, polite, and about their call: that’s a missed-call text people reply to.")

## Which number it comes from

Australian landline numbers (02, 03, 07 and 08) can’t send texts. In Colvy the missed-call text goes from the number they called if it can text, like an 04 mobile number, and otherwise from your usual texting number. Their reply lands in the same conversation as the missed call, so whoever rings back sees the call, the text and the reply together.

> [!TRY] Turn it on in Colvy
> Go to Settings → Calls & SMS and switch on missed-call text back. Write your message, add {booking_link} if you take bookings (restaurants get the table booking page), and choose whether it sends any time nobody answers or only when you’re closed.

## Better still: answer more calls

A text is the safety net. A few things catch more calls in the first place:

- **[Ring the right people](/phones/simultaneous-ring)**: every available teammate at once, or [one after another](/phones/cascade-ring).
- **[Forward to your mobile](/phones/call-forwarding)** after hours, with “press 1 to accept” so your voicemail can’t swallow the call.
- **An [AI receptionist](/phones/ai-receptionist)** that answers when nobody picks up, takes a message and texts the caller what they need. Read our [AI receptionist guide](/blog/ai-receptionist-small-business).

## Getting started

1. Connect your business number (or [get one](/business-phone-number-australia)).
2. Turn on missed-call text back and write your message.
3. Ring your own number from your mobile, don’t answer, and see what arrives.

[Start free](/signup) and stop losing the callers you couldn’t answer.`,
  },
  {
    slug: 'virtual-phone-number-australia',
    cover: '/phones/numbers-porting.jpg',
    title: 'Virtual phone numbers in Australia: local, mobile or 1800?',
    excerpt: 'A virtual business number rings wherever you are: your browser, your mobile, your team’s phones. What the Australian number types are, which ones can text, what you need to get one, what it costs, and how to keep the number you have.',
    seoDescription: 'Virtual phone numbers in Australia explained: local 02, 03, 07 and 08, 04 mobile and 1800 numbers, which can text, what you need to get one, and the cost.',
    category: 'Buyer’s guide', accent: BLUE, icon: 'phone',
    date: '2026-11-14T00:57:00+11:00', dateLabel: 'Nov 14, 2026', readTime: '8 min read', author: 'The Colvy Team',
    takeaways: [
      'A virtual number isn’t tied to a desk phone: calls ring in a browser, an app or your mobile.',
      'Local numbers (02, 03, 07, 08) look local and take calls; 04 mobile numbers can also text; 1800 numbers are free for callers and take calls only.',
      'Australian rules require your name, business name and proof of a street address before a number is connected.',
      'You can keep your existing number by porting it, usually in 1 to 3 weeks.',
    ],
    content: `A “virtual” phone number is just a business number that isn’t tied to a phone line in a building. Calls come in over the internet and ring wherever you’ve set them to: a browser tab, an app on your phone, your teammates’ phones, or your own mobile. Customers ring a normal Australian number, and you never give out your personal one.

Here’s what to choose, and what to expect.

## The kinds of Australian numbers

| Type | Looks like | Good for | Texts? |
|---|---|---|---|
| Local | 02, 03, 07, 08 + 8 digits | A local presence in your city | No, calls only |
| Mobile | 04xx xxx xxx | Calls and two-way texting | Yes |
| 1800 | 1800 xxx xxx | Free calls for customers Australia-wide | No, calls only |

The local area codes are **02** for NSW and the ACT, **03** for Victoria and Tasmania, **07** for Queensland, and **08** for South Australia, WA and the NT.

Calls to 1800 numbers are free for the caller, from landlines and mobiles. That makes them good for businesses that serve the whole country, but they cost the business more to carry.

Colvy offers local, mobile and 1800 numbers. It doesn’t offer 1300 or 13 numbers today.

> [!NOTE] Want to text?
> Australian landline numbers can’t send or receive texts. If you want two-way SMS, choose an 04 mobile number. Many businesses have both: a local number on the website and a mobile number for texting, all in the same inbox.

## What you need to get one

Australian rules mean a few details are checked before a number is connected: your name and business name, an Australian street address, and proof of that address, like a recent utility bill or bank statement. Mobile numbers also need a date of birth. In Colvy that’s one short form, and the number is usually ready within a couple of minutes of paying.

![A person making a call on a mobile phone](/phones/international.jpg "Customers ring a normal Australian number; you answer wherever you are.")

## Where calls ring

With Colvy, calls ring in your web browser and in the Colvy app for iPhone and Android. For each number you choose what happens:

- **Ring everyone available at once** (the default), or [ring people one at a time](/phones/cascade-ring) in your order.
- **[Forward to a mobile or landline](/phones/call-forwarding)**, always or only when you’re closed, with “press 1 to accept”.
- **Play a [press-1 menu](/phones/ivr)**, with a different menu out of hours.
- **[Voicemail](/phones/voicemail)** when nobody answers, plus a [missed-call text](/blog/missed-call-text-back).

Every call and text lands in the same shared inbox as your email, website chat, Instagram and Messenger.

## What it costs on Colvy

- **Just a number that forwards to your mobile:** the Business number plan is A$35 a month, with one local or mobile number, forwarding (always or after hours), voicemail, every call in the Colvy app and 100 call minutes a month; each minute after that is 20c.
- **Numbers for the whole team’s inbox:** on the Inbox and Everything plans, local and mobile numbers are A$15 a month each, and an 1800 number is A$25 a month. Call minutes are metered, and the plans include 3,000 SMS a month.

Prices are in Australian dollars and include GST. There’s no lock-in contract. See [pricing](/pricing).

## Keep the number you have

Already have a number on your cards and your van? Port it. In Colvy, request a port (Settings → Calls & SMS) with your current provider’s account details, a recent bill and a signed authority. Our team handles the paperwork with the carriers and emails you at each step. Most ports take 1 to 3 weeks. Keep your current service running until we tell you it’s done, and don’t cancel with your old provider first.

## Getting started

1. Decide: local for presence, mobile for texting, 1800 for free calls.
2. Fill in the short verification form and choose your number.
3. Choose where calls ring, and turn on voicemail and missed-call text back.

Read our guides to [call forwarding](/blog/call-forwarding-small-business-australia) and [online phone systems](/blog/online-phone-system-small-business), or [get your number now](/business-phone-number-australia).`,
  },
  {
    slug: 'order-update-notifications',
    cover: '/photos/orders.jpg',
    title: 'Order update texts and emails: when to notify customers, and when not to',
    excerpt: 'Customers love knowing their order is on its way. They don’t love three emails about a mistake you fixed in a minute, or a refund notice that spoils a surprise. How to get order notifications right, with Colvy’s Notify customer tick.',
    seoDescription: 'When to send order update texts and emails, when to hold them back, and how Colvy’s Notify customer tick works for WooCommerce and Shopify orders.',
    category: 'Product', accent: GREEN, icon: 'cart',
    date: '2026-11-14T00:56:00+11:00', dateLabel: 'Nov 14, 2026', readTime: '6 min read', author: 'The Colvy Team',
    takeaways: [
      'Most order changes deserve a message: completed, ready for pickup, cancelled, refunded.',
      'Some don’t: fixing a mistake, a change the customer already knows about, or a surprise gift.',
      'In Colvy, “Notify customer” is ticked by default when you complete, cancel or refund an order. Untick it and the customer isn’t texted or emailed about that change.',
      'With the Colvy WordPress plugin, WooCommerce’s own customer email for that change stays unsent too.',
    ],
    content: `Good order updates are one of the easiest ways to look professional. “Your order is ready for pickup” saves a phone call. “Your refund is on its way” saves a worried email.

But not every change to an order should reach the customer. Here’s how to tell the difference, and how Colvy lets you choose each time.

## When to notify the customer

Send a message when the customer needs to know or do something:

- **Completed or ready:** it’s shipped, delivered, or ready to collect.
- **Cancelled:** and why, if it wasn’t their choice.
- **Refunded:** how much, and when they’ll see it.
- **Something changed:** a delay, a substitution, a new delivery day.

## When to hold it back

There are times when a message does more harm than good:

- **Fixing your own mistake.** You marked the wrong order completed and changed it back. The customer doesn’t need two emails about it.
- **They already know.** You sorted the refund on the phone a minute ago and told them.
- **It’s a surprise.** The flowers are for Mum, and Mum’s number is on the order.
- **Housekeeping.** Tidying up old orders, or orders paid in store.

## The Notify customer tick

In Colvy, when you complete, cancel or refund a WooCommerce or Shopify order (from the Orders page, the order in a conversation, or the app), there’s a **Notify customer** tick. It’s on by default, so customers hear about changes unless you decide otherwise.

Untick it, and Colvy doesn’t text or email the customer about that change: no completed message, no review request that would normally follow it, nothing.

\`\`\`chat
title: Petal & Stem · Orders
event: Order #1042 marked completed · Notify customer unticked
you: (no message sent: it’s a surprise for Mum on Sunday)
\`\`\`

The same tick appears when you ask Colvy AI to complete, cancel or refund an order for you, on the confirmation card before anything happens.

![Shopping bags held at a shop counter](/solutions/sales.jpg "Customers hear about changes unless you choose otherwise, one order at a time.")

## What about the store’s own emails?

- **Shopify:** changes made from Colvy don’t trigger Shopify’s own customer emails. Colvy’s message takes their place, and the tick decides whether it goes.
- **WooCommerce:** WooCommerce sends its own customer emails, like “Completed order”. With the Colvy WordPress plugin (version 3.0.8 or later) installed, unticking Notify customer keeps WooCommerce’s email for that change unsent too.

The hold is short-lived. It covers the change you just made, not the order forever, so a later change with the tick on notifies the customer as normal.

## Getting started

1. Connect your WooCommerce or Shopify store to Colvy.
2. On WooCommerce, update the Colvy plugin to the latest version.
3. Complete, cancel and refund orders from Colvy, and untick Notify customer when a message would do more harm than good.

Read more about [orders in the inbox](/product/orders) and our guide to [“where’s my order?”](/blog/online-store-wheres-my-order).`,
  },
  {
    slug: 'internal-notes-voice-notes',
    cover: '/photos/notes.jpg',
    title: 'Internal notes and voice notes: how your team talks about customers, privately',
    excerpt: 'The customer should never see “she’s been difficult, check with Sam first”. How internal notes, @mentions, photos and voice notes let your team talk about a customer right beside the conversation, without anything being sent.',
    seoDescription: 'How internal notes, @mentions, photos and voice notes let your team talk about a customer beside the conversation in Colvy, without the customer seeing a thing.',
    category: 'Product', accent: AMBER, icon: 'pen',
    date: '2026-11-14T00:55:00+11:00', dateLabel: 'Nov 14, 2026', readTime: '6 min read', author: 'The Colvy Team',
    takeaways: [
      'Internal notes sit in the conversation, clearly marked Team only, and are never sent to the customer.',
      '@mention a teammate in a note and they’re notified, with a link straight to the conversation.',
      'Notes can carry photos, files and voice notes recorded in the Colvy app.',
      'Orders have their own notes too, and open tasks and notes show up as a heads-up on the order.',
    ],
    content: `Every team needs to talk about customers: “She’s already had one refund, check with Sam”, “He prefers a call after 5”, “The photo of the damage is below”. When that talk happens in a group chat or a sticky note, it’s lost by tomorrow. When it happens in an email thread, it’s one wrong click from being sent to the customer.

Internal notes put it where it belongs: in the conversation, visible to your team, invisible to the customer.

## Internal notes in the conversation

In Colvy, switch the reply box to **Note** and write. The note appears in the conversation thread as a warm, clearly marked card, with a lock, a **Team only** label, who wrote it and when. It’s never sent to the customer, whichever channel the conversation is on.

\`\`\`chat
title: Riverside Garden Centre · Internal note
you: @Sam this is the third delivery issue for this customer. Can you call her before we rebook? Photos of the damaged pot are attached.
\`\`\`

## @mentions that reach the right person

Type @ and pick a teammate, and they’re notified with a link straight to the conversation. No more “did you see my message about Mrs Chen?”

![A team planning tasks together](/photos/tasks.jpg "Notes live beside the conversation, so the context is there when someone picks it up.")

## Photos, files and voice notes

Notes aren’t just text:

- **Photos and files** attach to a note like they do to a message, shown as thumbnails and file cards.
- **Voice notes** recorded in the Colvy app on your phone play right in the conversation, on the web and in the app. Handy when you’re in the warehouse or on the road and typing isn’t practical.

## Notes on orders

Orders have their own timeline of notes. Add a note to an order, @mention a teammate, and they get a link to that order. When anyone opens the order, a heads-up shows the customer’s own note, your team’s notes and any open tasks, before they pick, pack or refund it.

## Notes on the customer

Some things belong to the customer, not one conversation: “prefers email”, “wholesale account”, “allergic to lilies”. Add them to the customer’s Notes in the contact panel, beside every conversation with them.

> [!TIP] Keep notes useful
> Write notes for the next person, not for yourself: what happened, what’s next, and who’s doing it. And keep anything you wouldn’t want the customer to read polite. Notes are private, but they’re still about a real person.

## Getting started

1. Open any conversation and switch the reply box to **Note**.
2. @mention a teammate and try it.
3. Record a voice note from the Colvy app on your phone.

Read about [notes](/product/notes) and [the shared inbox](/product/inbox), or [start free](/signup).`,
  },
  {
    slug: 'ai-receptionist-small-business',
    cover: '/phones/ai-receptionist.jpg',
    title: 'AI receptionist for small business: what it does, what it won’t, and how to set it up',
    excerpt: 'An AI receptionist answers the calls you can’t: after hours, or when everyone’s busy. What a good one handles, where it should hand over to a person, and how Colvy’s AI receptionist works, from the greeting to the call-back task.',
    seoDescription: 'What an AI receptionist can do for a small business, what it shouldn’t do, and how Colvy’s AI receptionist answers calls, takes messages and texts callers.',
    category: 'Buyer’s guide', accent: PURPLE, icon: 'ai',
    date: '2026-11-14T00:54:00+11:00', dateLabel: 'Nov 14, 2026', readTime: '8 min read', author: 'The Colvy Team',
    takeaways: [
      'An AI receptionist is best at the calls nobody can take: after hours, or when everyone’s busy.',
      'It should answer the common questions, take a message and text the caller what they need, then hand over to a person.',
      'Choose when it answers: out of hours, when nobody picks up, or always, and try it on your own number first.',
      'It shouldn’t make promises it can’t keep. Colvy’s tells callers free times and texts a booking link, but never books on its own.',
    ],
    content: `Most small businesses don’t need a full-time receptionist. They need the phone answered at the moments nobody can: before opening, after closing, at lunch, and when every pair of hands is busy. That’s where an AI receptionist earns its keep.

## What a good AI receptionist handles

Think of it as your best front-desk person on their first week: great at the common questions, and quick to pass anything tricky to you. With Colvy’s [AI receptionist](/phones/ai-receptionist) you choose what it can do:

| Skill | What it does |
|---|---|
| Opening hours | Today’s and the week’s hours, including holiday hours from Google |
| Answers from your knowledge | Delivery, returns, care advice and anything else you’ve taught it |
| Order status | The caller’s own orders, matched to the number they call from |
| Stock | Whether something is in stock, and its price |
| Bookings | Tells callers free times for a service and texts them a link to book and pay |
| Take a message | Creates a call-back task and alerts your team |
| Text links and details | Texts the caller your address, website or a link to upload photos |

You also choose what it says first, so it greets callers in your words.

## What it shouldn’t do

A receptionist that over-promises is worse than voicemail. A few lines Colvy’s won’t cross:

- **It never books on its own.** It tells the caller what’s free and texts a link, so they choose and pay themselves.
- **It won’t share someone else’s order.** Order status is matched to the caller’s number; anything else needs the order number and the email or postcode.
- **It takes a message instead of guessing.** Anything it can’t answer from what you’ve taught it becomes a call-back task for your team.

![A busy team answering calls](/phones/command-centre.jpg "The calls nobody can take: after hours, at lunch, and when everyone is busy.")

## When it answers

You choose one of four modes:

- **Test numbers only:** only calls from numbers you list, so you can try it on your own mobile first.
- **Out of hours:** when you’re closed (by your opening hours, including Google holiday hours), the AI answers straight away. While you’re open, calls ring your team as normal.
- **When nobody answers:** your team’s phones ring first, and if nobody picks up, the AI answers instead of voicemail.
- **Always:** the AI answers every call.

Most businesses start with **test numbers**, then move to **when nobody answers**.

\`\`\`chat
title: Bloom Hair · Call
event: Missed by the team · answered by the AI receptionist
them: Hi, do you have anything free for a cut on Saturday?
ai: Yes, there’s 10:30am or 2pm on Saturday. I’ll text you a link so you can pick one and book.
event: Booking link texted
\`\`\`

## What it costs

Colvy’s AI receptionist is included on the Inbox and Everything plans. Its calls use your metered call minutes, like any other call. See [pricing](/pricing).

## Getting started

1. Connect your business number to Colvy.
2. Teach your AI what it needs to know: hours, services, policies and FAQs.
3. Turn on the skills you want and write your greeting.
4. Start on **test numbers**, ring it yourself, then switch to **when nobody answers**.

Read about [Colvy’s AI agents](/blog/meet-your-ai-team) and [missed call text back](/blog/missed-call-text-back), or [start free](/signup).`,
  },
]
