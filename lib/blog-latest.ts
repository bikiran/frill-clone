import type { BlogPost } from '@/lib/blog'

// The newest articles (November 2026), kept here so lib/blog.ts doesn't keep
// growing. Same rules as the rest of the blog: Colvy's own writing about what
// the product actually does, with made-up example businesses and no invented
// numbers, quotes or customers.

const CORAL = '#ff6a4d', BLUE = '#2b59ff', PURPLE = '#7c5cff', GREEN = '#00c48c', TEAL = '#0d9488'

export const LATEST_POSTS: BlogPost[] = [
  {
    slug: 'why-you-can-trust-colvy',
    cover: '/ai/human-in-control.jpg',
    title: 'Why you can trust Colvy with your customer conversations',
    excerpt: 'Your inbox holds your customers’ numbers, messages and orders. Here’s exactly how Colvy looks after them: who you’re dealing with, what we do with your data, how the AI stays in check, and what we won’t claim.',
    category: 'Buyer’s guide', accent: CORAL, icon: 'lock',
    date: '2026-11-06T17:00:00+11:00', dateLabel: 'Nov 6, 2026', readTime: '6 min read', author: 'The Colvy Team',
    takeaways: [
      'Colvy is run by a team in Australia, with published AUD pricing, month-to-month plans and a 14-day free trial.',
      'Your data is encrypted in transit and at rest, card payments go through Stripe, and you can export your contacts and conversations at any time.',
      'Connected Gmail is used only to run your inbox: never sold, never used for ads, never used to train general AI models.',
      'AI agents draft first. You decide, agent by agent, what they may send on their own, and one switch pauses them all.',
      'Refund permissions, a refund PIN and locked connection keys keep a growing team in check.',
    ],
    content: `Moving your customer conversations into new software is a big decision. Your inbox holds your customers’ phone numbers, their messages, their orders and sometimes their complaints. Before you hand that to anyone, you should know exactly who they are and what they’ll do with it.

So here it is, plainly. No badges we haven’t earned, no made-up reviews, just what Colvy does.

## You’re dealing with real people, in Australia

Colvy is built and supported by a team in Australia. When you need help, you talk to a person who knows the product, not a ticket queue.

- Call or text us on **0485 059 215**, or email **support@colvy.com**.
- Or leave your name and number in the [Let’s talk form](#lets-talk) at the bottom of this page and we’ll get back to you.

## Pricing you can see before you sign up

Every plan is on our [pricing page](/pricing) in Australian dollars. Plans are month to month, there’s a 14-day free trial, and you can cancel whenever you like. No contract to get out of, and no per-seat surprises: the Inbox and Everything plans include unlimited team members.

Texts beyond your monthly allowance use prepaid credits that you top up yourself, with optional auto top-up, so a busy month can’t turn into a surprise bill.

## Your data stays yours

- **Encrypted.** Traffic is encrypted in transit with TLS, and your data is encrypted at rest on managed cloud infrastructure, with automated, regular backups.
- **Limited access.** Inside Colvy, access to customer data is limited and role-based, and only granted when it’s genuinely needed.
- **Yours to take with you.** Export your contacts and conversations at any time, and ask us to delete your data when you leave.
- **Cards never touch Colvy.** Payments go through Stripe, a PCI DSS Level 1 provider. We never see or store card numbers.

## Your Gmail, handled with care

If you connect a Gmail account, Colvy asks Google for exactly two permissions: to read messages, so your customers’ emails appear in your inbox, and to send the replies your team writes or approves. Colvy can’t delete or change anything in your Gmail.

We don’t sell Gmail data, use it for advertising, or use it to train general AI models. People at Colvy don’t read it unless you ask us to (in a support request, say), it’s needed for security, or the law requires it. You can disconnect at any time, and the full details are in our [privacy policy](/privacy).

## AI that asks first

Colvy’s AI agents can answer questions, follow up carts and move bookings. Every agent starts by **drafting** replies for your team to send, edit or discard. You decide, agent by agent and topic by topic, when one may send on its own, and one switch pauses them all.

Customers hear from your business, in the tone you set in Business Memory, whoever wrote the message.

## Controls for a growing team

More staff shouldn’t mean less control.

- **Who sees what.** You decide what each person on your team can see and do.
- **Refunds with a PIN.** Choose who can refund, and require a refund PIN for the rest.
- **Locked keys.** Connection keys for your phone numbers, Meta, email and Google stay locked away from team members.

Read more in [Growing team, same control](/blog/refund-security-for-growing-teams).

## Marketing the right way

Messages you send to customers should be ones they’re happy to get. Campaign emails carry unsubscribe and preference links, and contacts who reach you through Colvy aren’t treated as signed up for marketing unless they’ve agreed to it. Our guide to [SMS marketing consent in Australia](/blog/sms-marketing-consent-australia) explains the rules in plain English.

## Out in the open

- A public [changelog](/changelog), so you can see what’s changed and when.
- A [status page](/status) for how Colvy is running right now.
- A [security page](/security), with how to report a security issue to us responsibly.

## What we won’t claim

You won’t find badges here for certifications we haven’t earned, or testimonials we wrote ourselves. If your business needs specific security or compliance answers, ask us and we’ll answer them straight.

## The easiest way to decide

Try it with your own customers. [Start free](/signup) for 14 days with no card, or [leave your number](#lets-talk) and someone from our team will walk you through it.`,
  },
  {
    slug: 'best-crm-software-or-most-capable',
    cover: '/photos/crm.jpg',
    title: 'Do you want the best CRM software, or the most capable CRM software?',
    excerpt: 'Most “best CRM software” lists count features. For a small team, the CRM that wins is the one that does the most work on an ordinary day: it fills itself in, lives where the conversations happen, and follows up for you.',
    category: 'Buyer’s guide', accent: CORAL, icon: 'idea',
    date: '2026-11-06T15:00:00+11:00', dateLabel: 'Nov 6, 2026', readTime: '5 min read', author: 'The Colvy Team',
    takeaways: [
      '“Best CRM software” lists rank tools by how many features they have. Capability is how much work the CRM does on an ordinary day.',
      'A capable CRM fills itself in from every text, call, email, DM and order, without anyone typing it up.',
      'Your team should reply from inside it, so it’s never a step behind the real conversations.',
      'Try the Tuesday afternoon test: can everyone see the customer’s whole story without anyone logging it?',
      'A traditional enterprise CRM still suits a large sales team with a dedicated CRM admin.',
    ],
    content: `Type “best CRM software” into a search bar and you get the same lists every year: a dozen tools, each with a star rating and a long grid of ticks. Pipelines, custom fields, workflow builders, forecasting, a marketplace of add-ons.

Those lists answer one question well: *which CRM has the most features?* That isn’t always the question a small business is asking. The better one is: **which CRM will do the most work for us on an ordinary Tuesday?**

That’s the difference between the best CRM on paper and the most capable CRM in practice.

## “Best” usually means “most features”

A long feature list is a promise of what you *could* do. To get there, someone has to design the pipeline stages, decide on the fields, build the automations and keep everyone logging their calls and emails. Big companies hire a CRM admin for exactly that.

Most growing businesses don’t have one. So the CRM gets set up on a quiet weekend, used keenly for a fortnight, and then slowly falls behind the real conversations happening in text messages, Instagram DMs and on the shop phone.

A CRM that’s behind is worse than no CRM at all, because people stop trusting it.

## “Capable” means it does the work

A capable CRM is judged by what happens without anyone remembering to do it:

- **It fills itself in.** Every text, call, email, Instagram DM, Messenger chat and website chat lands on the customer’s profile by itself. Orders from your online store or point of sale do too.
- **It’s where the conversation happens.** Your team replies from inside it, so there’s nothing to copy across later. If your CRM is a separate app from the one you talk to customers in, it will always be a step behind.
- **It follows up.** Reminders are a start. Better is a reply already drafted, a cart followed up or a booking moved, with you deciding what goes out on its own.
- **People actually open it.** On a phone, behind the counter, between jobs. If it only works at a desk, half your team will never see it.

## The Tuesday afternoon test

Here’s a quick way to compare any two CRMs. Picture a made-up bike shop, Harbour Bike Co., on a normal Tuesday:

1. At 1pm a customer texts to ask whether their bike service is done.
2. At 3pm the same customer calls, and someone else answers.
3. At 5pm they send an Instagram DM asking for new brake pads too.

Now ask of each CRM: did the person who took the call see the text? Does whoever opens the DM see both? And did anyone have to type anything into the CRM for that to be true?

\`\`\`chat
title: Harbour Bike Co. · Instagram
them: Hey, can you put new brake pads on while it’s in?
event: Texted at 1:04pm · Called at 3:12pm, call summary on the timeline
draft: Sure thing, Alex. We’ll fit the pads and it’ll be ready by 10am tomorrow. Want a text when it’s done?
\`\`\`

If the honest answer starts with “well, if Sam logged it”, that CRM may be the best on paper, but it isn’t capable in practice.

## Best on paper vs capable in practice

| What to look at | Best on a features list | Most capable in practice |
|---|---|---|
| Where conversations live | In other apps, logged by hand | In the CRM itself: SMS, calls, email, Instagram, Messenger, live chat |
| Customer records | Updated when someone remembers | Filled in from every message, call and order |
| Follow-ups | Reminders you set yourself | Drafted for you, sent when you say so |
| Getting started | Pipelines and fields to design first | Connect your channels and start replying |
| Who uses it | People at a desk | Everyone, on their phone too |

None of this means features don’t matter. If you run a large sales team with territories, forecasting and a dedicated CRM admin, a traditional enterprise CRM may well be the right call. The point is to choose for how your business actually talks to customers.

## Six questions to ask before you choose

1. Can my team reply to customers from inside it, on every channel we use today?
2. Do calls show up on the customer’s record without anyone typing notes?
3. Can it see orders from our online store and point of sale?
4. Can it draft replies and follow-ups, and can I decide what it sends on its own?
5. Will my team use it on their phones?
6. What will it cost when we add three more people?

> [!TIP] Test it with a real week
> Pick three recent customers and replay their messages through each CRM you’re considering. The one that tells their whole story with the least typing is your most capable option.

## Where Colvy fits

We built Colvy to be the capable kind. It’s one inbox for SMS, calls, Instagram, Messenger, email and live chat (WhatsApp is coming soon), with a business phone number, an AI CRM that builds each customer’s profile from their conversations and orders, email and SMS campaigns, and AI agents that draft replies first and only send on their own when you say so.

It won’t replace an enterprise CRM on a 200-person sales floor. For a team that lives in its messages, it means the CRM finally keeps up.

## Have questions? Let’s talk

Not sure which kind your business needs? [Leave your name and number](#lets-talk) at the bottom of this page and someone from our team will get back to you, or [start free](/signup) and connect your channels today.`,
  },
  {
    slug: 'name-your-ai-agents',
    cover: '/solutions/hub.jpg',
    title: 'Give your AI agents a name and a face',
    excerpt: 'Five agents working in one inbox read better as a team than as job titles. Give each one its own name, shape and colour (or a photo) and see at a glance which agent did what.',
    category: 'Product', accent: PURPLE, icon: 'ai',
    date: '2026-11-06T09:00:00+11:00', dateLabel: 'Nov 6, 2026', readTime: '4 min read', author: 'The Colvy Team',
    takeaways: [
      'Each of the five agents can have its own name, up to 30 characters.',
      'Pick one of 12 shapes and slide the colour, or upload a photo such as your logo.',
      'Your team sees the name and face on the agent’s drafts and replies and in the “answering” bar, so it’s clear who did what.',
      'The name is for your team: customers still hear from your business, in the voice you set in Business Memory.',
      'Change it whenever you like, or reset an agent to its own look.',
    ],
    content: `“Support Agent drafted a reply. Sales Agent followed up a cart. Reception Agent moved a booking.” Once all five of Colvy’s AI agents are switched on, the job titles start to blur together in a busy inbox.

So now each one can have a name and a face of its own. Kai answers order questions, Mia follows up carts, Nova books appointments. Your team learns them the way they learn a new colleague, and spotting who did what takes a glance instead of a read.

## What you can change

Open **AI agents** and tap an agent’s face. A small panel opens with four things:

- **Name.** Anything up to 30 characters. Leave it empty and the agent keeps its role name.
- **Shape.** Twelve to choose from: a rounded square, a cushion, a flower, a star, a pebble, a capsule, a ghost, a gem, a cookie, a circle, a speech bubble and a splat.
- **Colour.** Slide it anywhere around the colour wheel. The eyes stay white and readable whatever you pick.
- **A photo.** Upload a JPG, PNG or WebP instead: your logo, your shop mascot, the shop dog.

Changes save as you make them, and **Reset** puts the agent back to its own shape and colour.

> [!TIP] Pick names that don’t clash with your team
> If someone on the floor is called Sam, don’t call an agent Sam. A different first letter for each agent also helps when you’re scanning a long list of drafts.

## Where you’ll see them

The face isn’t only on the settings page. When an agent is working on a conversation, the bar above the reply box says so:

\`\`\`chat
title: Reef & Fin Aquatics · SMS
them: Is the 60cm tank in stock at Oakleigh?
event: Kai is answering this conversation · suggests replies for your team to send
draft: Hi Sam, yes, we’ve got three at Oakleigh today. Want us to put one aside for you?
\`\`\`

Its drafts and replies carry the same name and face, and so does the team strip on the AI agents page, where each agent shows whether it’s working, off or paused. The faces are animated, too: they blink, and on a computer their eyes follow your pointer around the page.

## What customers see

The name is for your team. Customers keep hearing from your business, in the tone and sign-off you set in **Business Memory**, whether a person or an agent wrote the message. If you want your agents to introduce themselves by name, say so in Business Memory, the same way you’d set any other house rule.

## Still drafts first

None of this changes how much an agent does on its own. Every agent starts by drafting replies for your team to send, edit or discard. You decide, agent by agent and topic by topic, when one may send on its own, and one switch pauses them all.

[Try the faces on our AI agents page](/ai-agents#customise), then [start free](/signup) and give your own team names.`,
  },
  {
    slug: 'phone-calls-written-up',
    cover: '/channels/phones.jpg',
    title: 'Every phone call, written up: summaries, to-dos and a transcript',
    excerpt: 'A call ends and the details are already in the customer’s conversation: a short summary, the to-dos it raised, the recording and a transcript by speaker. Here’s how to get the most out of it.',
    category: 'Product', accent: BLUE, icon: 'phone',
    date: '2026-11-05T09:00:00+11:00', dateLabel: 'Nov 5, 2026', readTime: '5 min read', author: 'The Colvy Team',
    takeaways: [
      'Each call lands in the customer’s conversation as a card: direction, length, mood and who handled it.',
      'A short summary and suggested to-dos appear after the call; add them as tasks with one tap.',
      'The recording and a transcript, grouped by speaker, sit right under it.',
      'Call logs show your total talk time, split into incoming and outgoing, for the period you choose.',
    ],
    content: `Phone calls are where the details get lost. Someone promises a callback with a quote, the call ends, the next customer walks in, and the promise lives on a sticky note, if anywhere.

In Colvy, a call ends up in the same conversation as the customer’s texts, emails and messages, written up for you.

## The call card

Every call shows as a card in the customer’s conversation:

- **Which way it went and how long.** An arrow for incoming or outgoing, and the length as a small chip.
- **The mood.** A short read of how the call went, so a frustrated customer stands out before you call back.
- **Who handled it.** The teammate who took the call, by name.
- **A summary.** A few lines on what was asked and what was agreed. Long ones fold away behind *Read more*.

\`\`\`chat
title: Call · 9:23 · Handled by Alex
event: Outgoing call to Priya · positive
card: Summary | Followed up the 8ft tank enquiry. Gave dimensions and prices for the 8ft and 6ft options. Priya wants a full package quote by email. | Read more
\`\`\`

## The to-dos it raised

Under the summary, Colvy suggests the tasks the call created, like *Send Priya a quote for the full package*. Tick the ones you want, set a reminder, and save them. If a matching task already exists, you can add the new step to it as a checklist item instead of creating a duplicate.

> [!TIP] Clear the to-dos before the next call
> Thirty seconds right after the call is all it takes. A task with a reminder beats “I’ll remember” every time.

## Recording and transcript

The recording plays right in the card, and you can download it. The transcript groups the conversation by speaker, so you can skim to the part where the price was agreed. When there’s a translation, you can switch between the languages.

That makes the call searchable history for whoever picks the conversation up next. They don’t have to ask the customer to repeat themselves.

## Talk time at a glance

**Call logs** show your total talk time for the period you choose, split into incoming and outgoing, next to the list of calls. The app shows it for today, the last 7 days and the last 30. It’s a quick way to see how much of the week went on the phone, and whether a missed-call text or a booking link could save some of it.

## On the go

The Colvy app shows the same card: summary, to-dos, recording and transcript. You can clear the to-dos from the car park.

[See Colvy’s phone features](/phones) or [start free](/signup).`,
  },
  {
    slug: 'schedule-deliveries-in-the-chat',
    cover: '/blog/online-store-wheres-my-order/tags.jpg',
    title: 'Book the delivery where the conversation is',
    excerpt: 'Big, heavy or local orders need a delivery day, not a tracking number. Schedule it from the customer’s conversation, keep the whole team on the same calendar, and follow it through to delivered.',
    category: 'Industry guides', accent: GREEN, icon: 'map',
    date: '2026-11-04T09:00:00+11:00', dateLabel: 'Nov 4, 2026', readTime: '5 min read', author: 'The Colvy Team',
    takeaways: [
      'Schedule a delivery from the conversation: the address, phone and order are filled in for you.',
      'Pick a day and a window (Morning, Afternoon, Evening or a set time range), then add notes for the driver.',
      'It goes on the team calendar, and a “Delivery scheduled” card drops into the conversation.',
      'The customer is only texted the details if you choose to.',
      'Mark it delivered, reschedule or cancel it from the chat, and find it on the calendar and in the bell.',
    ],
    content: `Some orders don’t go in a satchel. A tank and its cabinet, a sofa, a pallet of pavers, a cake for Saturday: they need a day, a time window and someone who knows the gate code.

That usually means a phone call, a note in a diary and a spreadsheet nobody else can find. In Colvy it lives in the customer’s conversation.

## Scheduling one

From the reply box’s **+** menu, or the **Delivery** row in the customer’s details, choose **Schedule delivery**. Colvy fills in what it already knows:

- **The address**, from the customer’s latest open order, or from their profile.
- **Their phone number.**
- **The order** it’s for, if there is one.

Pick the day and a window (*Morning*, *Afternoon*, *Evening*, *9am–12pm*, *12pm–5pm* or *After 7pm*), add a note for the driver, and save. Everything can be changed before you do.

\`\`\`chat
title: Reef & Fin Aquatics · SMS
them: Can you deliver the 8ft tank this week?
event: Delivery scheduled · Thursday, Evening · 14 Banksia Rd, Coburg
you: All booked in for Thursday evening. We’ll need two people on your side to carry it in.
\`\`\`

## Telling the customer

Saving puts the delivery on the team calendar and drops a **Delivery scheduled** card into the conversation, so whoever reads the thread next sees it. The customer is only told if you turn on **Text them the details**. Sometimes you want to confirm by phone first.

> [!TIP] Put the awkward details in the note
> “Heavy: two people.” “Gate code 1234.” “Ring on arrival, baby asleep.” The note travels with the delivery, so the driver doesn’t have to scroll back through the chat.

## Following it through

The card in the chat stays small: one line with the day, the window and the status. Tap it to open the delivery’s details: when and for whom, the address with directions, the order it’s for and the driver’s notes. From there you can mark it delivered (or not delivered yet), reschedule it, which drops a “Delivery rescheduled” line into the conversation, or cancel it.

The same deliveries show on the **Calendar** and in the bell, so the person loading the van in the morning doesn’t need to open a single conversation. The order is one tap away from the delivery, too.

## Where it helps most

- **Furniture, appliances and big-ticket retail**, where every delivery needs a window.
- **Garden supplies, building materials and pallets**, booked by the day.
- **Florists, bakeries and caterers**, where the time matters as much as the address.
- **Aquariums and pet stores** delivering tanks, livestock and set-ups.

[Start free](/signup) and schedule your next delivery from the chat.`,
  },
  {
    slug: 'refund-security-for-growing-teams',
    cover: '/integrations/stripe.jpg',
    title: 'Growing team, same control: refund permissions, a refund PIN and locked keys',
    excerpt: 'As more people answer customers, refunds and connection keys need a lock. Decide who can refund, ask for a PIN on every refund, and keep your store and channel keys out of reach.',
    category: 'Product', accent: CORAL, icon: 'lock',
    date: '2026-11-03T09:00:00+11:00', dateLabel: 'Nov 3, 2026', readTime: '4 min read', author: 'The Colvy Team',
    takeaways: [
      '“Issue refunds” is its own permission: owners and admins always have it, everyone else only if you give it to them.',
      'Turn on a refund PIN and every refund needs it, on the web and in the app.',
      'Five wrong tries lock refunds for 15 minutes, and every change is in the activity log.',
      'The same refund twice within two minutes is refused.',
      'Store, channel and payment keys can’t be read or changed by team members.',
    ],
    content: `The first person you hire to answer customers changes what “access” means. They need to see orders and reply quickly. They probably don’t need to send money back, or see the key that connects your store.

Colvy now draws those lines for you.

## Who can refund

**Issue refunds** is its own permission, under Orders in each team member’s settings. Owners and admins always have it. Everyone else has it only if you switch it on for them, and switching on the rest of the Orders tools doesn’t include it.

It covers every way money goes back: refunding an order, a refund or store credit on a dead-on-arrival claim, and refunding a payment link. Colvy checks it on our servers for each refund, so it doesn’t depend on a button being hidden in the app.

## A PIN for every refund

For an extra lock, the owner can turn on a **refund PIN** under **Business settings → Payments → Refund security**. From then on, every refund asks for it, on the web and in the Colvy app.

- Five wrong tries lock refunds for 15 minutes.
- Changing or removing the PIN needs the current one. If it’s forgotten, Colvy support can clear it.
- Turning it on or off and every wrong try go to the activity log.

> [!TIP] Give the PIN to the people who do refunds, not the whole shop
> Pair the permission with the PIN: the permission decides who sees the refund button, and the PIN makes sure it’s really them pressing it.

## No double refunds

A second identical refund for the same order within two minutes is refused. It’s a small thing that saves an awkward phone call to your payment provider after a double tap on a slow connection.

## Keys stay with the owner

The keys that connect Colvy to your store, your phone numbers, Facebook and Instagram, your email and your Google Business Profile used to be readable by anyone signed in to the workspace. Now team members can’t read or change them. Colvy’s servers use them on your behalf, and the settings pages only show whether each one is connected.

## What to do now

1. Check who has **Issue refunds** in your team settings.
2. Turn on the refund PIN if more than a couple of people handle orders.
3. Tell the team, so the first PIN prompt doesn’t come as a surprise.

[See Colvy’s payments](/product/payments) or [start free](/signup).`,
  },
  {
    slug: 'files-in-every-conversation',
    cover: '/channels/forms.jpg',
    title: 'Quotes, labels and photos: files that look like files',
    excerpt: 'A PDF a customer emails you, a quote you text them, photos of a damaged delivery: every file now shows as a proper card in the conversation, opens in place and is named in your conversation list.',
    category: 'Product', accent: TEAL, icon: 'inbox',
    date: '2026-11-02T09:00:00+11:00', dateLabel: 'Nov 2, 2026', readTime: '3 min read', author: 'The Colvy Team',
    takeaways: [
      'Files show as cards in the file type’s colour, with the name, the kind of file and its size.',
      'Files a customer emails you now appear under their email, on the web and in the app.',
      'PDFs and photos open in your browser or the phone’s viewer instead of downloading.',
      'The conversation list names the file (“Order labels.pdf”) when it’s all the message had.',
      'Files you email go as real attachments, not links.',
    ],
    content: `Files are half the work in a lot of conversations: the quote, the invoice, the shipping labels, the photos of what arrived broken. They should be as easy to read as the messages around them.

## A card for every file

A file in a conversation now shows as a card: a tile in the file type’s colour (red for PDFs, green for spreadsheets, blue for Word documents), the file’s name, what it is and how big it is, like *PDF document · 69 KB*, and a button to download it. In an email, photos and videos get the same card with the picture in the tile, and open in the inbox’s viewer.

The same cards show in the Colvy app, in emails you receive and send, and in the email composer before you send.

## Emailed files, in plain sight

When a customer emails you a file, it now appears under their email, on the web and in the app. Before, an email with only an attachment could look empty.

\`\`\`chat
title: Email · Order labels
event: Coral Coast Wholesale sent a file with no message
card: Order labels.pdf | PDF document · 69 KB | Open
\`\`\`

PDFs and photos open in place, in your browser or your phone’s viewer, instead of filling up your downloads folder.

## Named in the list

When the newest message in a conversation is only a file, the conversation list shows the file instead of a blank line: a small chip in the file’s colour with its name, and “+2” when more came with it. You can tell the labels from the invoice before you open anything.

## Sent as real attachments

Files you send by email go as proper attachments, so they show up in your customer’s mail app like any other attachment. In the thread, the email you sent shows its files as cards too, so the whole team can see exactly what went out.

> [!TIP] Send the file, not a link to it
> Customers keep emails with attachments. A link can expire or end up in a spam filter, but an attached quote stays in their inbox until they’re ready to say yes.

[Start free](/signup) and see your files the way your customers send them.`,
  },
]
