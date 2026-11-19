import type { BlogPost } from '@/lib/blog'

// Case studies and playbooks (November 2026). The Roxy Aquarium case studies
// describe how the store uses Colvy, as its owner described it: no figures,
// no quotes, store locations and handles left out at the owner's request.
// Every feature named is one Colvy has (inbox channels, customer matching,
// locations, gallery, payment links, deliveries, tickets with response and
// resolution times, DOA claims, tasks, calendar, Marketplace listings).
// Example conversations and names are made up.

const CORAL = '#ff6a4d', BLUE = '#2b59ff', TEAL = '#0d9488'

export const STORY_POSTS: BlogPost[] = [
  {
    slug: 'roxy-aquarium-one-inbox',
    cover: '/blog/roxy-aquarium-one-inbox/cover.jpg',
    title: 'Case study: How Colvy helped Roxy Aquarium bring scattered customer messages into one inbox',
    excerpt: 'Roxy Aquarium’s customers wrote in from everywhere: email, the website, live chat, Facebook, Messenger and Instagram. The challenge, the solution and what changed when it all moved into one shared inbox in Colvy.',
    seoDescription: 'Case study: how aquarium store Roxy Aquarium moved email, website, live chat, Facebook, Messenger and Instagram messages into one Colvy inbox.',
    category: 'Case study', accent: TEAL, icon: 'inbox',
    date: '2026-11-19T10:30:00+11:00', dateLabel: 'Nov 19, 2026', readTime: '6 min read', author: 'The Colvy Team',
    takeaways: [
      'Customers pick the channel. A shop that answers in six places needs one place to see them all.',
      'One inbox means one history: whoever replies sees what was said before, on any channel.',
      'Stores, assignments and notes make it clear who is answering, so nobody gets two replies, or none.',
      'Start with the channels your customers use most, then add the rest.',
    ],
    content: `| At a glance | |
|---|---|
| **Business** | Roxy Aquarium |
| **Industry** | Aquarium and pet store |
| **Where** | Melbourne: more than one store, plus an online shop |
| **The challenge** | Customer messages scattered across email, the website, live chat, Facebook, Messenger and Instagram |
| **The solution** | One shared Colvy inbox for every channel, with one history per customer |
| **Colvy features used** | [Shared inbox](/product/inbox), [Facebook and Instagram](/channels/meta), [email](/channels/email), [live chat](/channels/chat-widget), [website forms](/channels/forms), [calls and texts](/channels/phones), locations, assignments and notes |

Fish keepers ask a lot of questions, and that's a good thing. What's in stock? Will this fish get along with the ones I've got? Why has the water gone cloudy? When will my order arrive? For Roxy Aquarium, the questions were never the problem. Where they arrived was.

## The challenge: messages from everywhere

Roxy Aquarium's customers got in touch by:

- **email**
- the **website**, through its contact form
- **live chat** on the online shop
- **Facebook**, as comments on posts
- **Messenger**
- **Instagram**, as messages and comments

Each one had its own app, its own notifications and its own history. Answering customers meant checking all of them, all day.

That's not anyone's fault. It's what happens when customer conversations are spread across apps that were each built for something else:

- Someone has to keep checking every app, or messages sit unseen.
- A message seen on one person's phone isn't seen by the rest of the team.
- Two people answer the same customer, or each assumes the other did.
- When a customer moves from Instagram to a phone call, the history doesn't come with them, so they explain it all again.
- Nobody can say, at a glance, what's still waiting for a reply.

With more than one store, there was one more question on top: which store is this customer talking to?

## The solution: one inbox for every channel

Roxy Aquarium connected its channels to one shared inbox in Colvy:

- **Facebook and Instagram**: Messenger chats, Instagram messages, and comments on posts, all through the shop's [Facebook Page](/channels/meta).
- **Email**: the shop's [email address](/channels/email), with attachments and replies kept in the thread.
- **Live chat**: Colvy's [chat widget](/channels/chat-widget) on the website.
- **Website forms**: [enquiry forms](/channels/forms) that land as conversations, not emails to forward.
- **Calls and texts**: a [business number](/channels/phones) for the shop.

![The Colvy inbox, with conversations from Messenger, Instagram, live chat, email and SMS in one list](/blog/roxy-aquarium-one-inbox/inbox.jpg "Every conversation in one list. The small badge on each customer shows where they wrote from. (Example conversations.)")

Each conversation shows where it came from, and the reply goes back the same way. A Messenger question gets a Messenger reply, and an email gets an email. The customer never has to switch apps to hear back.

### One customer, one history

Customers don't stick to one channel. Someone might comment on an Instagram post, ask the price on Messenger, then call to check stock before driving in.

Colvy links those conversations to one customer, together with their orders from the online shop. So whoever picks up the next message sees the whole story: what they asked last time, what they bought and what's still open.

\`\`\`chat
title: Example · Messenger
them: Hi, I asked on Instagram last week about a heater for my 2ft tank. Is it back in stock?
you: Hi Sam! Yes, it came in yesterday. Want us to put one aside at the shop?
\`\`\`

### Clear on who's answering

With more than one store, "who's got this one?" matters. In Colvy:

- **Each channel belongs to a store**, and the inbox can show one store's conversations or all of them.
- **A conversation can be assigned** to the person handling it, so it's obvious who's on it.
- **Internal notes and @mentions** stay with the conversation, out of the customer's sight. A question for the other store doesn't need a separate group chat.

### Nothing waits unnoticed

Unread conversations stay at the top with a count, and the team gets notifications on their phones from the Colvy app. When a customer has been waiting, the conversation shows for how long. What's waiting is visible to everyone, not just to whoever happened to see the notification.

### Even Marketplace buyers find their way in

Facebook Marketplace chats go to a personal profile, and no app can read those. So each Marketplace listing gets its own page in Colvy, with the photos, price and details, plus buttons to chat, message the shop's Page on Messenger, text or call. Buyers can also text the listing's short code. Either way, the conversation arrives in the inbox with the listing attached.

![A reef aquarium with clownfish](/blog/roxy-aquarium-one-inbox/reef.jpg "Fish keepers ask a lot of questions. Every one of them now lands in the same place.")

## The results

| Before | With Colvy |
|---|---|
| Six apps to check | One inbox |
| Each channel with its own history | One history per customer, with their orders |
| Messages seen by whoever's phone they reached | The whole team sees the same conversations |
| No clear owner for a reply | Assigned conversations, with notes for the team |
| Hard to tell what's waiting | Unread at the top, with how long each customer has waited |

Customers hear back from the business, not from whoever happened to see the notification. A new team member can pick up any conversation without asking what happened before.

> [!TIP] Bringing your own messages together
> - Start with the channels your customers use most. For many shops, that's Messenger, Instagram and email.
> - Add the chat widget to your website, so web visitors land in the same inbox.
> - Invite your team, and give each channel a store if you have more than one.
> - Turn on notifications in the Colvy app, so nothing waits for someone to open a laptop.

Read next: [how Colvy helped Roxy Aquarium grow](/blog/roxy-aquarium-growing-with-colvy), and [why a business can't run on social media alone](/blog/social-media-isnt-enough-for-business). See the [shared inbox](/product/inbox), or [start free](/signup).`,
  },
  {
    slug: 'roxy-aquarium-growing-with-colvy',
    cover: '/blog/roxy-aquarium-growing-with-colvy/cover.jpg',
    title: 'Case study: How Colvy helped Roxy Aquarium, an aquarium and pet store, grow its business',
    excerpt: 'Showing the fish in stock, taking the payment in the chat, answering on time, tracking problems as tickets, and running the shop on tasks and a calendar. The challenge, the solution and the results.',
    seoDescription: 'Case study: how aquarium and pet store Roxy Aquarium grows with Colvy: one inbox, a gallery, payment links, on-time support, tickets, tasks, a calendar.',
    category: 'Case study', accent: CORAL, icon: 'cart',
    date: '2026-11-19T10:15:00+11:00', dateLabel: 'Nov 19, 2026', readTime: '7 min read', author: 'The Colvy Team',
    takeaways: [
      'A shop grows in small moments: a customer is ready to buy, and the shop is ready to answer, show and take the payment.',
      'Show the actual stock. Photos and videos from a shared gallery answer "what does it look like?" in one tap.',
      'Anything that takes more than one reply becomes a ticket, with an owner and a time it’s due.',
      'Tasks and a shared calendar turn "someone should" into a name and a date.',
    ],
    content: `| At a glance | |
|---|---|
| **Business** | Roxy Aquarium |
| **Industry** | Aquarium and pet store |
| **Where** | Melbourne: more than one store, plus an online shop |
| **The challenge** | Turning more questions into sales, keeping support on time, and keeping the stores and the online shop organised |
| **The solution** | One customer record behind every conversation, payment, ticket, task and booking |
| **Colvy features used** | [Shared inbox](/product/inbox), [gallery](/product/gallery), [payment links](/product/payments), deliveries, [tickets](/solutions/customer-support), DOA claims, [tasks](/product/tasks), [calendar](/product/calendar) |

Growth in a shop rarely comes from one big change. It comes from hundreds of small moments. A customer is ready to buy, and the shop is ready to answer the question, show them the stock and take the payment before they lose interest. Or a problem gets sorted properly, so they come back.

## The challenge

For an aquarium and pet store, those moments happen all day, across every channel:

- **Questions that are really sales.** "Have you got any rams in?" is a customer ready to buy, if they get an answer and can see the fish.
- **Sales that stall.** "I'll take it" is easy to lose when paying means a trip to the shop or a bank transfer.
- **Support after the sale.** A heater stops working, the water turns cloudy, or a new fish isn't eating. Customers want answers quickly.
- **Problems that take more than one reply,** like a warranty claim, a special order or livestock that arrives dead.
- **A team spread across stores,** with jobs to share and deliveries to keep track of.

Roxy Aquarium wanted every one of those moments to go well, every day, without depending on someone's memory.

## The solution

| What the shop needs | How it uses Colvy |
|---|---|
| Answer every customer, wherever they write | One shared inbox |
| Show customers the actual stock | The gallery |
| Take payment while the customer is keen | Payment links |
| Reply on time, every time | Notifications, assignments and waiting times |
| Sort out problems properly | Tickets and DOA claims |
| Know who's doing what | Tasks |
| Know what's on, and when | The calendar |

### 1. One inbox for every message

Customers write to Roxy Aquarium by email, through the website, on live chat, and on Facebook, Messenger and Instagram. In Colvy, all of it lands in one [shared inbox](/product/inbox), with one history per customer. That came first, and everything below builds on it. Read the [case study on bringing scattered messages into one inbox](/blog/roxy-aquarium-one-inbox).

### 2. Showing the stock: the gallery

Fish keepers want to see the actual fish, not a stock photo. The team keeps photos and videos of what's in the tanks in Colvy's [gallery](/product/gallery), sorted into folders, and sends them into any chat in a tap. Photos that customers send, like a picture of their own tank, are kept there too.

\`\`\`chat
title: Example · Instagram
them: Have you got any electric blue rams in at the moment?
you: We do! Here's a video from this morning's tank.
event: Video sent from the gallery
them: They look great. Can I get two?
\`\`\`

### 3. Taking the payment in the chat

The moment a customer says "I'll take it" is the moment to take the payment. With [payment links](/product/payments), the team sends a secure link in the same conversation, and the customer pays by card on their phone. The conversation shows when it's paid, and the sale is recorded against that customer.

\`\`\`chat
title: Example · Instagram
you: Lovely! Here's the link for the two rams. We'll have them bagged and ready for pick-up this afternoon.
card: Payment request | 2 electric blue rams | Pay now
event: Payment received
\`\`\`

From there, the order can be picked up in store or booked in for delivery, and the customer can be sent a tracking link.

![A goldfish bowl with orange fish](/blog/roxy-aquarium-growing-with-colvy/fishbowl.jpg "A sale that starts with a question and ends with a payment, all in one conversation.")

### 4. Support on time

What happens after the sale matters as much as the sale, and an answer a day late can feel like no answer at all. Colvy helps the team reply on time:

- **Unread conversations stay at the top**, and the team gets phone notifications.
- **Each conversation shows how long the customer has been waiting.**
- **Conversations are assigned**, so it's clear who is replying.
- **Quick replies** cover the questions that come up every week, like water testing, quarantine and opening hours.

### 5. Tickets for anything that takes more than one reply

Some things can't be sorted in one message: a faulty filter that needs a warranty claim, a special order from a supplier, or livestock that arrives dead. In Colvy, those become [support tickets](/solutions/customer-support), raised from the conversation, email or the help centre.

Each ticket has an owner, a status, and due times for the first response and the fix. The team can see at a glance what's on track and what's running late.

For livestock, Colvy has a **DOA (dead on arrival) claim**, linked to the customer's order. The team can refund part of an item's quantity, so one fish out of five is refunded fairly and quickly.

### 6. Running the business on tasks

A shop runs on jobs that need doing: call a customer back, order more of a fish that keeps selling out, do the water change on a display tank, check the quarantine tanks. With [tasks](/product/tasks), every job has a name, an owner and a due date. Tasks can be created straight from a conversation, so "we'll let you know when they're in" becomes a task with someone's name on it.

![A whiteboard covered in sticky notes](/blog/roxy-aquarium-growing-with-colvy/tasks.jpg "From sticky notes to tasks with an owner and a due date.")

@mentions bring a teammate in when needed, and everyone can see what's done and what's due, at either store.

### 7. A calendar everyone can see

Deliveries, pick-ups, bookings and tasks with due dates show up on Colvy's [calendar](/product/calendar), day by day, linked to the customer they're for. Everyone sees what's on today, so a promised delivery doesn't depend on one person's memory.

## The results

None of these tools is magic on its own. What makes the difference is that they all work from the same customer record:

- The conversation knows what the customer has bought.
- The payment is recorded against the customer.
- The ticket links back to the order.
- The task links back to the conversation that started it.

Nothing has to be copied between apps, and nothing depends on someone remembering.

| Before | With Colvy |
|---|---|
| "What does it look like?" meant a trip to the shop | Photos and videos sent from the gallery in a tap |
| "I'll take it" meant paying later | A payment link in the same chat |
| Problems tracked in someone's head | Tickets with an owner and due times |
| Jobs on sticky notes | Tasks with a name and a due date |
| Deliveries remembered by one person | A calendar the whole team can see |

For Roxy Aquarium, that means more questions answered while the customer is still keen, more sales closed in the chat, and problems sorted properly instead of forgotten. And the team knows what to do each day.

> [!TRY] Try it in your shop
> - Connect your channels and invite the team.
> - Put photos of your best sellers in the gallery, ready to send.
> - Send a payment link the next time a customer says "I'll take it".
> - Turn the next "we'll let you know" into a task with a due date.

Read next: [the case study on bringing scattered messages into one inbox](/blog/roxy-aquarium-one-inbox), and [why a business can't run on social media alone](/blog/social-media-isnt-enough-for-business). Or [start free](/signup).`,
  },
  {
    slug: 'social-media-orders-customers-gap',
    cover: '/blog/social-media-orders-customers-gap/cover.jpg',
    title: 'Why social media alone can’t keep your orders and customers in sync',
    excerpt: 'Social media is excellent for being discovered and starting conversations. But your orders live in your store, and each platform keeps its conversations inside its own walls. Here’s why that gap matters, and how Colvy closes it while you keep using social media.',
    seoDescription: 'Social media doesn’t connect to your orders or customer records. Why that gap matters, and how Colvy brings your chats, orders and customers together.',
    category: 'Playbooks', accent: TEAL, icon: 'cart',
    date: '2026-11-20T09:00:00+11:00', dateLabel: 'Nov 20, 2026', readTime: '7 min read', author: 'The Colvy Team',
    takeaways: [
      'Social media is built for discovery and conversation, not for running orders or keeping customer records.',
      'Orders placed on your website or in store don’t appear in a social inbox, so every order question means checking several systems.',
      'Each platform keeps conversations, contacts and data inside its own app, under rules it sets.',
      'Colvy brings social messages, orders and customer records into one place, so you can keep using social media without depending on it.',
    ],
    content: `Social media has given small businesses something they never had before: a shopfront in front of millions of people. Customers find you in their feed, comment on a post, and send a message to ask a question. For many businesses, that's now where most first conversations begin.

That's worth a great deal. But there's an important difference between starting a conversation with a customer and looking after that customer. Once someone has bought from you, the details that matter (their orders, payments, deliveries and history with your business) live somewhere else. That's where social media, on its own, starts to fall short.

## Where the gap shows up

### Your orders aren't where the conversation is

A customer sends a message on Instagram: "Has my order shipped yet?" It's a simple question, but the answer isn't in Instagram. It's in your online store, or in your point of sale if they bought in person.

So your team switches between apps. They find the message, search the store for the customer's name, hope it's the right person, check the status, then come back and reply. Repeat that for every order question in a busy week and it adds up to hours of work, and slower answers for your customers.

### The same customer is a different person everywhere

On Instagram, a customer is a profile name and a photo. In your online store, she's a full name with an email address. At the counter, she paid by card and left a phone number. To your business she's one loyal customer. To your systems, she's three strangers.

Social platforms don't connect to your store's customer records, and your store doesn't know who's messaging you. Without that link, a returning customer can be treated like a first enquiry, and nobody can see what she has bought before.

### Each platform keeps things within its own walls

This isn't a criticism; it's simply how the platforms are designed. Each one is built to keep activity inside its own app, with its own inbox, its own shop features and its own insights. The platform decides:

- what you can see about the people who contact you
- how long you have to reply. On Messenger and Instagram, for example, replies are limited once 24 hours have passed since the customer's last message, and generally aren't allowed at all after seven days.
- which conversations can be connected to outside tools. Facebook Marketplace chats with a personal profile, for example, can't be.
- when features change, and how

When a business runs entirely inside these walls, its customer relationships do too.

### The tools stop at the message

A social inbox is good at chat. It isn't designed to take a payment for an order, issue a refund, schedule a delivery, raise a support ticket, or remind a teammate to follow up next week. Those jobs end up spread across other systems, with the conversation in one place and the work in another.

## How Colvy closes the gap

Colvy sits between your social channels and the rest of your business. Messages still arrive from Facebook, Instagram and the other places your customers like to use, but they land somewhere that also knows your orders, your customers and your team.

![An Instagram conversation in Colvy, with the customer’s online orders and an in-store sale listed above the chat](/blog/social-media-orders-customers-gap/orders-in-chat.jpg "Her online orders and an in-store sale, right above her Instagram message. (Example data.)")

### Orders beside every conversation

Connect your [WooCommerce](/integrations/woocommerce) or [Shopify](/integrations/shopify) store, and in-store sales from Prexty POS, and a customer's orders appear right above the conversation: what they've spent, how many orders they've placed, the latest status, and whether they're new or returning. "Has my order shipped?" can be answered in the same window it was asked.

### One customer, one record

Colvy matches orders to customers by email address and phone number. When the same person contacts you on Instagram, by email and by text, those conversations can be linked to one customer. Their whole history stays in one place, whichever channel they use next.

### Do the work from the conversation

From the same screen, your team can send a [payment link](/product/payments), record a sale, refund an order, schedule a delivery, send tracking details, raise a ticket or add a [task](/product/tasks) for a teammate. The conversation and the work stay together.

### Room to move when a platform's rules get in the way

If a platform's reply window has closed and the customer has given you a phone number or email address, you can carry on by [SMS](/channels/sms) or [email](/channels/email) from the same conversation. For Facebook Marketplace, Colvy gives each listing a code and a link that brings buyers into a conversation your team can manage.

### A customer list that belongs to you

Followers belong to the platform. Your customers in Colvy are your own records: names, contact details, orders and conversations. With their consent, you can reach them through [SMS and email campaigns](/product/broadcasts), without paying to boost a post.

## Keep using social media, with Colvy alongside it

None of this means stepping back from social media. Keep posting, keep showing your work, and keep being found. Colvy helps you make more of it:

- **Messages and comments in one inbox.** [Messenger, Instagram messages and comments on your posts](/channels/meta) arrive alongside email, website chat and texts.
- **Replies on the channel they chose.** A Messenger question gets a Messenger reply, so the customer never has to switch apps.
- **Public or private replies to comments.** Answer a comment on your post, or move the conversation into a private message, from Colvy.
- **Help when it's busy.** An [AI agent](/ai-agents) can draft replies using what Colvy knows about your products and the customer, for your team to check and send.
- **Links you can follow through.** Share [trackable links](/product/links) in your posts and chats, and see which ones lead to a sale.

## Social media alone, or with Colvy

| | Social media alone | Social media with Colvy |
|---|---|---|
| Customer messages | A separate inbox in each app | Facebook, Instagram, email, website chat and SMS in one shared inbox |
| Orders | Checked separately in your store or point of sale | Shown beside the conversation, online and in store |
| Customer records | A different profile on each platform | One customer, matched by email and phone |
| After the reply window closes | Limited by the platform's rules | Carry on by SMS or email when the customer has shared their details |
| Payments, refunds and deliveries | Handled in other systems | Handled from the conversation |
| Reaching past customers | Paid promotion to followers | Your own list, with consent, by SMS and email |

> [!TIP] Three small steps to start
> - Connect your Facebook Page, your Instagram account and your online store to one inbox.
> - When you take an order through a social chat, ask for an email address or phone number, so the chat and the order can be matched.
> - Keep your posting routine as it is. Let social media bring people in, and let Colvy look after what happens next.

## Read next

- [Why a business can’t run on social media alone](/blog/social-media-isnt-enough-for-business)
- [Case study: how Roxy Aquarium brought scattered customer messages into one inbox](/blog/roxy-aquarium-one-inbox)

Social media is a wonderful way to be found, and it will keep being one. Running a business through it alone, though, means working inside walls you don't control, with your orders and customers on the other side. Colvy brings them together, so you can use social media for what it does best and run everything else from a place that's yours. [Start free](/signup), or [see how the inbox works](/product/inbox).`,
  },
  {
    slug: 'social-media-isnt-enough-for-business',
    cover: '/blog/social-media-isnt-enough-for-business/cover.jpg',
    title: 'Why a business can’t run on social media alone',
    excerpt: 'Social media is brilliant at bringing customers to you. Running the relationship after that is your job, and social apps were never built for it. Here’s what goes missing, and how to keep hold of it.',
    seoDescription: 'Social media brings customers in, but it can’t run your business. Lost messages, access problems, thin data, missing tools, and how to fix them.',
    category: 'Playbooks', accent: BLUE, icon: 'split',
    date: '2026-11-19T10:00:00+11:00', dateLabel: 'Nov 19, 2026', readTime: '7 min read', author: 'The Colvy Team',
    takeaways: [
      'Social platforms are built to connect people with businesses. What happens after the first message is up to you.',
      'Messages spread across apps get lost, and access often depends on one person’s login.',
      'You see the platform’s numbers, not your customer’s whole history with you.',
      'Use social media to be found. Run the relationship from one place your business controls.',
    ],
    content: `There are a lot of social platforms: Facebook, Instagram, Messenger, TikTok, WhatsApp and more. They're very good at what they're designed for. They put businesses in front of people who'd never have found them, and they make it easy for those people to get in touch. No doubt about it.

But a first message isn't a customer relationship. Taking it from there, answering, following up, selling, sorting out problems and remembering who's who, is the business's job. Social apps were never built for that part.

## What social media does well

Give the platforms their due. They're the best tools there are for:

- **being found** by people nearby, or people who share an interest
- **showing your work**, with photos, videos and stories
- **starting conversations** with a comment or a message
- **social proof**, in the form of followers, reviews and recommendations

Keep doing all of that. The problems start after the conversation begins.

## Where social media falls short for running a business

### 1. Conversations get lost

Every platform has its own inbox. On some, messages from people you haven't talked to before land in a separate requests folder. Comments, messages and mentions arrive in different places, on whichever phone is signed in.

The result is familiar. A message sits unseen for days, or two people reply to the same customer. Nobody can say what's still waiting.

### 2. Access belongs to a person, not the business

Business pages and accounts are often run from someone's personal login. When that person is away, leaves, or gets locked out, the business can lose its view of its own customer conversations. Sharing one password around the team causes its own problems, and doesn't show who said what.

### 3. You only see what the platform shows you

Platform insights tell you about posts: reach, likes and views. They don't tell you that the person who commented last week has bought from you twice in store, emailed about a delivery, and is about to ask for a refund. Tracking which conversation turned into a sale is hard when the conversation and the sale live in different systems.

### 4. There are no tools for the work after the message

A social inbox is a place to chat. It isn't built for:

- support tickets with an owner and a due time
- tasks and follow-ups with a name on them
- order history, refunds and claims
- payments recorded against the customer
- quick replies shared across a team
- a shared view of what's waiting, and for how long

### 5. The rules can change overnight

Platforms change their features, limits and algorithms on their own schedule. A change made for millions of users can quietly change how your customers reach you. You have no say in it.

### 6. Your audience isn't your customer list

Followers belong to the platform. You can't export them, see their contact details, or reach them all without paying to boost a post. If you want to tell your regulars about new stock, a list you've built yourself, with their consent, is worth far more.

## Use social to be found. Run the business from one place.

This is where Colvy comes in. Keep posting, keep being found. Then bring every conversation, and everything that follows it, into one place your business controls.

| Social apps on their own | With Colvy |
|---|---|
| A separate inbox in each app | [One inbox](/product/inbox) for Messenger, Instagram, Facebook comments, WhatsApp, email, website chat, SMS and calls |
| History stuck in each platform | One customer, one history, with their orders and payments |
| Access through someone's personal login | Team members with their own logins and permissions |
| Reach and likes | Each customer's conversations, orders and payments in one profile |
| Chat only | [Payment links](/product/payments), tickets, [tasks](/product/tasks), the [calendar](/product/calendar) and AI agents |
| Followers that belong to the platform | Your own contact list, with consent for [SMS and email campaigns](/product/broadcasts) |

When someone leaves the team, you remove their access in Colvy, and every conversation stays with the business. When a platform changes how its inbox works, your history and tools stay where they are.

![Writing a list in a notebook](/blog/social-media-isnt-enough-for-business/notebook.jpg "Your customer records should be yours: complete, shared with your team, and in one place.")

## What this looks like in practice

Roxy Aquarium, an aquarium and pet store in Melbourne, was getting messages from email, its website, live chat, Facebook, Messenger and Instagram. Read the case studies: [how they brought them into one inbox](/blog/roxy-aquarium-one-inbox), and [how they use Colvy to grow](/blog/roxy-aquarium-growing-with-colvy).

> [!TIP] A simple way to start
> - List every place customers contact you. Most businesses find more than they expected.
> - Connect the busiest ones to one shared inbox first.
> - Give everyone who answers customers their own login.
> - Start building your own customer list, with consent, from every conversation.

Social media will keep bringing people to your door. With the right tools behind it, you'll keep them, and outgrow competitors who are still answering from five different apps. [Start free](/signup).`,
  },
]
