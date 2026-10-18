// Blog content for /blog and /blog/[slug]. These are Colvy's own articles —
// original, practical pieces on customer communication for SMBs. No fabricated
// third-party stats, quotes or customer names; advice is general and honest.

const CORAL = '#ff6a4d', BLUE = '#2b59ff', PURPLE = '#7c5cff', GREEN = '#00c48c', TEAL = '#0d9488'

export type BlogSection = { h: string; p: string[] }
export type BlogPost = {
  slug: string
  title: string
  excerpt: string
  category: string
  accent: string
  icon: string
  date: string          // ISO, for <time> + sorting
  dateLabel: string     // human label
  readTime: string
  author: string
  cover?: string        // optional hero image (else the accent gradient tile)
  // Body — either the structured form (intro + sections + takeaways) used by the
  // original seed posts, OR a Markdown `content` string used by newer posts and
  // by anything authored in the super-admin editor.
  intro?: string
  sections?: BlogSection[]
  takeaways?: string[]
  content?: string      // Markdown body (takes precedence when present)
}

export const POSTS: BlogPost[] = [
  {
    slug: 'aquarium-pet-store-playbook',
    cover: '/blog/aquarium-pet-store-playbook/cover.jpg',
    title: "Fish, frags and “is it back yet?”: a messaging playbook for aquarium and pet stores",
    excerpt: "Back-in-stock texts, shipment-day campaigns, kind DOA claims and 10pm care questions: the five moments that fill an aquarium store’s inbox, and how to handle each one with less typing.",
    category: 'Industry guides', accent: TEAL, icon: 'bolt',
    date: '2026-10-18T10:00:00+11:00', dateLabel: 'Oct 18, 2026', readTime: '8 min read', author: 'The Colvy Team',
    takeaways: [
      "A back-in-stock list turns “is it back yet?” into a text that sells the day stock lands.",
      "Send shipment news to the customers who keep those species, not your whole list.",
      "An upload link plus a refund, credit or resend from the chat makes DOA claims quick and fair.",
      "Let the AI draft care answers from your own guides and live stock, and review before it sends.",
      "Order updates and automatic review requests remove the follow-up work after every sale.",
    ],
    content: `It’s Saturday, a quarter past ten. The livestock boxes from the wholesaler arrived an hour ago and half of them are still acclimatising. The shop phone has rung four times. Instagram has three new messages asking the same thing: “Are the otos back yet?” And somewhere in your email is a customer with a photo of a shrimp that didn’t make it home.

If you run an aquarium or pet store, you know this morning. The work itself (keeping animals healthy, giving good advice) is the part you love. It’s the messages around it that pile up.

This guide walks through the five moments that create most of those messages, and how to handle each one with less typing and fewer “sorry, just seeing this now” replies.

![A spotted angelfish turning past coral](/blog/aquarium-pet-store-playbook/angelfish.jpg "Livestock sells out fast and arrives on a schedule nobody controls. Most of your messages follow that rhythm.")

## 1. Turn “is it back yet?” into a sale

Every store has its regulars: the plants, fish and foods that sell out within a day of landing. Right now, the only way customers find out they’re back is to ask you, or to catch the right Instagram story.

A back-in-stock list fixes that. When a product sells out on your website, a **Notify me** form appears on the product page. Customers leave a mobile number or an email, and when the stock comes back Colvy texts them once, with a link straight to the product.

\`\`\`chat
title: Reef & Fin Aquatics · SMS
event: Otocinclus (pack of 6) is back in stock
you: Hi Sam, good news, Otocinclus (pack of 6) is back in stock at Reef & Fin Aquatics! reefandfin.com.au/otos Reply STOP to opt out.
them: Legend. Can you hold 2 packs for me till 3?
you: Done, they’re in a breeder box with your name on it 🐟
\`\`\`

A few details that matter more than they sound:

- **It works on WooCommerce and Shopify.** The Colvy plugin adds the form on WooCommerce; on Shopify it’s a theme block.
- **Texts never land at 6am.** If stock is updated outside 9am–8pm, the messages wait until the morning.
- **The AI can sign people up too.** If someone asks in chat whether you’ll get more, they can be added to the list from that conversation.

> [!TIP] List the things you only get sometimes
> Add your irregular stock as products even when they’re sold out: the rare plecos, the seasonal pond fish, that one brand of frozen food. Every sold-out page then collects a list of buyers who are ready to pay the day it lands.

[How back-in-stock lists work](/product/waitlists)

## 2. Shipment day: tell the right people, not everyone

Some arrivals deserve more than a back-in-stock text. A big shipment of discus, a new coral supplier or the first pond fish of spring are news, and your best customers want to hear it first.

The trick is not blasting your whole list. In an SMS campaign you can pick who hears about it:

| Arrival | Who to text |
|---|---|
| New discus shipment | Customers who’ve **bought from the discus category** before |
| Coral frag sale | Customers tagged **reef** |
| Pond season opening | Customers who’ve **bought pond products** before |
| Quiet regulars | Customers who **haven’t ordered in 6 months** |

Colvy counts the audience before you send, shows the cost, and checks consent for every number. Anyone who has replied STOP is skipped, and texts are held outside quiet hours unless you switch that off for a send.

![Goldfish crowding the surface of a pond](/blog/aquarium-pet-store-playbook/goldfish.jpg "Shipment days are news. Tell the customers who actually keep those fish.")

> [!NOTE] What it costs
> The Inbox and Everything plans include 3,000 texts a month. After that, texts come out of prepaid SMS credit that you top up yourself, so a big campaign can never surprise you with a bill. When you schedule a campaign, Colvy holds the estimated cost and refunds whatever doesn’t go out.

## 3. Dead on arrival, handled kindly

It happens to every store that sells livestock. A customer gets home, and something didn’t make it. How you handle the next ten minutes decides whether they come back.

The usual way is painful. You ask for a photo, the customer sends a blurry MMS, you ask for the order number, you dig through your store admin, and you finally process a refund in another tab.

Here’s the same conversation in Colvy:

\`\`\`chat
title: Reef & Fin Aquatics · SMS
them: Hey, one of the shrimp from yesterday’s order was dead in the bag when I opened it 😞
you: So sorry about that. Could you send a quick photo or video so we can sort it straight away?
card: Secure file upload | Photos or videos, full quality | Upload
event: Sam uploaded 2 videos
you: Thanks Sam, so sorry again. Here’s store credit for the shrimp: use code DOA-4821 at checkout on your next order.
\`\`\`

What’s happening behind it:

1. **The upload link** keeps photos and videos at full quality (texted videos get crushed), and the files land in the conversation. You can see when the link was opened, and on what device.
2. **The DOA panel** sits next to the chat when the customer matches a WooCommerce or Shopify customer. Look up the order, pick the items, and choose a **refund** to the original payment method, **store credit** (a one-time coupon locked to their email), or a **resend** that’s flagged for your team to pack.
3. **The message to the customer** is written for you, and you can edit the wording for each outcome.

> Fast, fair DOA handling is the cheapest marketing a livestock store will ever do.

> [!TIP] Put your guarantee in Business Memory
> Write your livestock guarantee once (for example “claims within 24 hours of delivery, with a photo”) in Business Memory. The AI then quotes your actual policy every time instead of improvising.

## 4. Questions at 10pm, answered from your own advice

Aquarium customers ask a *lot* of questions, and most of them come after hours: “Will these be OK with my betta?” “What temperature for cherry shrimp?” “Do you have any Java fern in stock?”

Colvy’s AI drafts replies using things you’ve already written: your care guides, website and help articles, plus live stock and prices from your store. Answers start as drafts that someone checks before sending.

\`\`\`chat
title: Reef & Fin Aquatics · Instagram
them: Do you have cherry shrimp in stock? And will they be ok with my betta?
draft: Yes, we’ve got cherry shrimp in stock at $6 each. Bettas can see shrimp as a snack, so our care guide suggests plenty of moss or plants for hiding, and adding the shrimp first so they settle in. Want us to set some aside?
\`\`\`

When you trust it, you can let the AI send some kinds of replies by itself, like opening hours or order status. Every reply it sends must be backed by a live check in the same run. There’s a daily limit, and a **Pause all agents** switch for the days you’d rather answer everything yourself.

![A round fishbowl with goldfish against a dark background](/blog/aquarium-pet-store-playbook/fishbowl.jpg "The best answers are your answers. The AI should repeat your care advice, not invent its own.")

> [!TIP] Turn your website into a help centre
> Colvy can import your existing website and care guides into a help centre, grouped into topics. That gives customers a page to browse and gives the AI something accurate to answer from.

[See how Colvy’s AI works](/ai-assistant)

## 5. “Where’s my order?” before they ask

Live animals make customers anxious about delivery, and fair enough. Order status messages answer the question before it’s asked:

- **Processing:** “Thanks, we’ve got your order and we’re packing it.”
- **Dispatched:** with the tracking link included when there is one.
- **Picked up:** a different thank-you for click & collect.

Each status has its own message you can edit (leave one blank and it simply won’t send). They go by SMS or email, usually on the channel the customer last used. If someone still asks “where’s my order?”, the AI answers from the live order and tracking.

[See order messages and tracking](/product/orders)

## Bonus: the review you didn’t have to ask for

Happy customers rarely think to leave a review. Colvy can ask them automatically after an order is completed, 24 hours later by default, by chat, SMS or email. It skips anyone who has already reviewed you on Google. When reviews come in, the AI can draft a reply in your voice, and 1–3 star reviews go to a real person with a task attached.

---

## Your Saturday, with the busywork handled

| Moment | What Colvy does |
|---|---|
| Stock arrives | Texts everyone on the back-in-stock list (in sending hours) |
| Big shipment | Campaign to the customers who keep those species |
| DOA message | Upload link, then refund, credit or resend from the chat |
| After-hours questions | AI drafts from your care guides and live stock |
| Orders | Status updates with tracking, plus answers to “where’s my order?” |
| A week later | A review request, and a drafted reply when it lands |

None of this replaces the advice you give across the counter. It just stops the messages from eating the time you’d rather spend there.

[Start free](/signup) or [see Colvy for ecommerce](/for/ecommerce).`,
  },
  {
    slug: 'salon-barber-no-shows',
    cover: '/blog/salon-barber-no-shows/cover.jpg',
    title: "The empty chair: how salons and barbers cut no-shows without nagging",
    excerpt: "No-shows aren’t a character flaw, they’re a design problem. Easy booking, deposits where they make sense, one-tap reminders and guilt-free rescheduling put clients back in the chair.",
    category: 'Industry guides', accent: CORAL, icon: 'scissors',
    date: '2026-10-18T09:00:00+11:00', dateLabel: 'Oct 18, 2026', readTime: '6 min read', author: 'The Colvy Team',
    takeaways: [
      "Replace DM back-and-forth with one booking link in your bio, on Google and on your site.",
      "Set deposits per service: none for quick trims, a deposit or full payment for long or date-specific work.",
      "Reminders the day before and two hours before, answered with a single letter, do most of the work.",
      "A manage link on every confirmation makes rescheduling early easier than not showing up.",
      "Missed-call text-back, rebook nudges and review requests keep clients coming back without extra admin.",
    ],
    content: `The 2:15 colour didn’t turn up. No call, no message. The chair sits empty for an hour and a half, and there’s nobody you can fill it with at ten minutes’ notice.

Every salon, barber and beauty studio has a version of this. No-shows aren’t a moral failing of your clients. Usually they forgot, or something came up and cancelling felt awkward. The fix isn’t nagging. It’s making the right thing (turning up, or rescheduling early) the easiest thing.

Here’s how to build that, step by step.

## 1. Make booking the easy path

Lots of bookings still start as a DM: “Hey, got anything Thursday arvo?” Then come six messages of back-and-forth about times, and the booking never quite gets confirmed.

Give people one link instead. Your Colvy booking page shows your services, prices and live free times. Put it in your Instagram bio, your Google Business Profile and your website (there’s a WordPress shortcode). Clients pick a time, pay if you ask them to, and get a confirmation by text and email with a calendar invite.

When someone does ask in a DM, the Reception Agent can check your calendar and reply with real times and the link:

\`\`\`chat
title: Studio Nine Hair · Instagram
them: hey! got anything thursday arvo for a cut and colour?
draft: Hi Mia! Thursday we’ve got 1:30pm or 3:45pm free for a cut and colour (about 2.5 hours). You can grab either one here and it’ll lock it in:
card: Book a cut & colour | Studio Nine Hair · Thursday | Choose a time
\`\`\`

The agent never books on its own: the client picks the time and pays themselves, so there’s no confusion about who agreed to what. Replies start as drafts you approve, and you decide which channels it works on.

[See online booking](/solutions/bookings)

## 2. Ask for a deposit where it makes sense

Deposits do two jobs. They filter out the “maybe” bookings, and they turn a no-show from a total loss into a partial one.

You don’t need them everywhere. Each service can be set to no payment, a deposit, or full payment upfront, all through Stripe:

| Service | Suggested setting | Why |
|---|---|---|
| Quick trim or beard tidy | No payment | Short, easy to rebook |
| Cut and colour | Deposit | Long appointment, product mixed in advance |
| Bridal or event styling | Full payment | Date-specific, can’t be resold |
| Lash or nail sets | Deposit | Long booking, often first-time clients |

While someone is paying, their slot is held so nobody else grabs it. If they abandon the payment, the hold expires and the time goes back on the page.

![A barber using clippers on a client’s fade](/blog/salon-barber-no-shows/barber-cut.jpg "Short services rarely need a deposit. Long ones almost always should.")

## 3. Reminders that do the work for you

A reminder only helps if it’s easy to answer. Colvy sends two by default:

- **The day before**, by SMS and email (only between 8am and 8pm).
- **Two hours before**, by SMS.

And the client can reply with a single letter:

\`\`\`chat
title: Studio Nine Hair · SMS
you: Reminder: Cut & colour with Studio Nine Hair tomorrow at 1:30pm. Reply C to confirm or R to reschedule.
them: R
you: No worries! Pick a new time here:
card: Reschedule your booking | Cut & colour · Studio Nine Hair | Change time
event: Mia moved her booking to Friday 10:00am
\`\`\`

> A reminder that’s easy to answer is a reminder that gets answered.

Colvy is sensible about timing, too. Someone who booked an hour ago doesn’t get a “see you tomorrow” text five minutes later, and the two-hour reminder is skipped if the day-before one has only just gone out.

## 4. Cancellations on your terms

Every confirmation includes a **manage link**, so clients can reschedule or cancel without having to ring you during a foil.

You set the rules:

- **The cut-off:** changes allowed up to 24 hours before, by default. Set anything from no notice to two weeks.
- **Late cancellations:** allow them, or block them so the client has to contact you.
- **Refunds:** a paid booking cancelled before the cut-off is refunded automatically, so you’re not processing refunds by hand.

> [!TIP] Make rescheduling easier than ghosting
> Most no-shows are people who felt awkward cancelling. A visible “Change time” link on every confirmation and reminder gives them a guilt-free way out, and gives you the slot back early enough to fill.

## 5. Stop missing calls while your hands are full

You can’t answer the phone mid-blow-dry. With a Colvy business number, a missed call can trigger an automatic text:

\`\`\`chat
title: Studio Nine Hair · SMS
event: Missed call from 0412 345 678
you: Sorry we missed your call! This is Studio Nine Hair. Reply here and we’ll get back to you shortly.
them: Hi! Just wanted to book my usual with Jess next week 😊
\`\`\`

You choose whether it sends always or only after hours, and edit the wording. It sends at most once every 12 hours per caller, and never to hidden numbers or landlines. The reply lands in the same inbox as your Instagram and Facebook messages, so whoever’s on the front desk can pick it up.

![A nail technician in pink gloves shaping a client’s nails](/blog/salon-barber-no-shows/nails.jpg "Hands busy, phone ringing. The missed-call text keeps the client in the conversation.")

[Get a business number online](/business-phone-number-australia)

## 6. Bring them back (and get the review)

Two small automations do a lot of quiet work after the appointment:

- **The rebook nudge.** For each service, set a gap (say six weeks for a cut, three for a fill) and Colvy sends a friendly “time for your next one?” with the booking link.
- **The review request.** When an appointment ends it’s marked complete, and a review request can follow automatically on the delay you choose. Anyone who’s already reviewed you on Google is skipped. When reviews arrive, the AI can draft replies, and anything 1–3 stars goes to a person.

> [!TRY] Set it up in an afternoon
> 1. Add your services, with durations and prices.
> 2. Choose a payment setting for each one.
> 3. Set your opening hours and cancellation cut-off.
> 4. Put your booking link in your Instagram bio and on Google.
> 5. Turn on missed-call text-back and review requests.

![A barber at work, seen through the shop window](/blog/salon-barber-no-shows/barber-window.jpg "The goal isn’t more admin. It’s more time with the person in the chair.")

---

## The short version

No-shows drop when booking is easy, a deposit backs the long appointments, reminders take one tap to answer, and cancelling early is easier than ghosting. Put those four things in place and the empty chair at 2:15 becomes a rare event instead of a weekly one.

[Start free](/signup) or [see Colvy for service businesses](/for/service-businesses).`,
  },
  {
    slug: 'tradies-missed-calls',
    cover: '/blog/tradies-missed-calls/cover.jpg',
    title: "The job you lost while you were up a ladder: a tradie’s guide to never missing work",
    excerpt: "When your hands are full the phone goes unanswered, and the caller rings the next tradie. A business number, instant text-backs, call summaries and quote follow-ups keep the job yours.",
    category: 'Industry guides', accent: BLUE, icon: 'phone',
    date: '2026-10-17T10:00:00+11:00', dateLabel: 'Oct 17, 2026', readTime: '6 min read', author: 'The Colvy Team',
    takeaways: [
      "A business number on your phone and in the browser keeps work calls off your personal mobile.",
      "Missed-call text-back turns an unanswered call into a conversation within seconds.",
      "Recorded calls arrive with a summary and follow-up tasks, so details never get lost.",
      "Upload links get you full-quality photos and videos before you quote.",
      "Unpaid quotes get a polite follow-up drafted for you, and finished jobs a review request.",
    ],
    content: `You’re halfway up a ladder with both hands in a ceiling. Your phone buzzes in your pocket, stops, and buzzes again. By the time you climb down, there’s no voicemail. That caller has already rung the next electrician on Google.

For plumbers, electricians, builders, cleaners and anyone else who works with their hands, the phone is the business. It’s also the hardest thing to answer, because the moments you’re busiest are exactly the moments you can’t pick up.

This is a practical guide to fixing that without hiring a receptionist.

![An electrician working inside a switchboard](/blog/tradies-missed-calls/switchboard.jpg "The busiest moments of your day are exactly when you can’t answer the phone.")

## 1. Get a business number that isn’t your personal mobile

Your personal mobile on the side of the ute works, until you want a day off, add an apprentice, or stop getting quote requests at 9pm on a Sunday.

A Colvy business number fixes that:

- **Choose your number.** A local landline (02, 03, 07 or 08) or an 04 mobile. Pick a mobile if you want customers to be able to text it.
- **Answer it anywhere.** In the Colvy app on your phone, or in a browser at the office.
- **Ring the whole team at once.** Everyone who’s available rings, and whoever answers first takes the call. Anyone already on a call is skipped.
- **Pass calls on.** Transfer a call to a colleague, and have a quick word with them before you hand it over.

It’s A$15 a month per number with no lock-in. You verify your ID and address online, and it’s usually live within minutes.

[Get a business number online](/business-phone-number-australia)

## 2. Text back every call you miss

This one feature pays for everything else. When a call goes unanswered, Colvy can send the caller a text straight away:

\`\`\`chat
title: Bright Spark Electrical · SMS
event: Missed call from 0423 555 019
you: Sorry we missed your call! This is Bright Spark Electrical. Reply here and we’ll get back to you shortly.
them: Hi, half the power points in our kitchen have stopped working. Can someone come out this week?
you: Hi Priya, Dave here. Sounds like a tripped circuit or a faulty RCD. I can come Thursday morning, would 8am suit?
\`\`\`

Now the job is a conversation, not a missed call. The customer has told you what’s wrong before you’ve even climbed down.

You choose whether it sends every time or only after hours, and you write the wording. It’s sensible about who it texts: at most once every 12 hours per caller, and never to hidden numbers, landlines, 13/1300 numbers, overseas numbers, or anyone who has opted out.

> The caller who gets a text in thirty seconds rarely bothers ringing the next tradie on the list.

![Tools and a phone laid out on a workbench](/blog/tradies-missed-calls/phone-tools.jpg "Your phone is a tool like any other. It should do some of the work on its own.")

## 3. Never write call notes again

Here’s the other half of the phone problem: the calls you *do* answer. You take the details while driving, promise to “text a quote tonight”, and by tonight you’ve forgotten half of it.

Answered calls on your Colvy number are recorded, transcribed and summarised on the customer’s conversation, with follow-up tasks pulled out for you:

> [!EXAMPLE] What lands in your inbox after a call
> **Summary:** Priya (Carlton North) reports half the kitchen power points are dead since a storm on Tuesday. The safety switch keeps tripping. She has a 2-year-old, so wants it fixed this week.
>
> **Follow-ups:**
> - Book a site visit for Thursday 8am
> - Text a call-out fee estimate
> - Ask for a photo of the switchboard

> [!WARNING] Recording calls
> Recording rules differ between states and situations. Check your obligations, and consider telling callers that calls may be recorded (a short voicemail greeting or website note does the job).

## 4. “Can you send me a photo?”

Half of quoting is seeing the problem. But photos texted from a customer’s phone arrive tiny, and videos get crushed to mush.

Send an upload link instead. The customer taps it, picks photos or videos from their camera roll, and the files land in the conversation at full quality:

\`\`\`chat
title: Bright Spark Electrical · SMS
you: Thanks Priya! Could you snap a photo of the switchboard (the box with the switches, usually near the front door)?
card: Secure file upload | Photos or videos, up to 10 files | Upload
event: Priya uploaded 3 photos
you: Perfect, that’s an old ceramic fuse board. I’ll bring a quote for an upgrade on Thursday.
\`\`\`

You’ll also see when the link was opened, and on which kind of device, so you know whether to chase.

![House plans with a measuring tape and a drill](/blog/tradies-missed-calls/plans.jpg "Good quotes start with seeing the job, ideally before you drive there.")

## 5. Follow up quotes without feeling pushy

You sent the quote. They said “looks good, I’ll let you know”. And then nothing. Most tradies don’t follow up because it feels awkward, or because they forget.

Colvy can do it for you. Send the quote or invoice as a payment link from the chat. If it isn’t paid, the Sales Agent drafts a polite follow-up after a few days (three by default, or anywhere from two to seven):

\`\`\`chat
title: Bright Spark Electrical · SMS
card: Switchboard upgrade | Quote · A$1,480 inc GST | Pay deposit
event: 3 days, not paid yet
draft: Hi Priya, just checking you got the quote for the switchboard upgrade. Happy to answer any questions, or I can lock in a date as soon as you’re ready.
\`\`\`

Drafts wait for you to approve, unless you choose to let them send. It only follows up on quotes up to three weeks old, never more than once a month per customer, and only in sending hours.

## 6. Turn finished jobs into reviews

Google reviews are how new customers choose between tradies. After a job, hit **Ask for a review** in the chat and the customer gets a link to your Google profile. Or switch on automatic review requests for completed bookings and orders.

When reviews come in, the Reputation Agent drafts replies in your voice. It can send the 4–5 star replies by itself if you allow it, and anything critical goes to you with a task attached.

![A van on a dusty road at sunset](/blog/tradies-missed-calls/van.jpg "The van, the tools and the phone. Only one of them should follow you home.")

---

## Before and after

| Situation | Without a system | With Colvy |
|---|---|---|
| Missed call up a ladder | Caller rings the next tradie | Instant text back; the job continues by message |
| Answered call while driving | Details forgotten by tonight | Recording, summary and tasks on the customer’s record |
| Quoting | “Can you text me a photo?” | Upload link at full quality |
| Quote goes quiet | Never chased | Polite follow-up drafted after 3 days |
| Job done | Hope they leave a review | One-tap review request, with drafted replies |

> [!TRY] Set it up in 15 minutes
> 1. Get your business number and install the Colvy app.
> 2. Turn on missed-call text-back (after hours only, if you prefer).
> 3. Set your opening hours so texts and agents know when you’re working.
> 4. Put the new number on your website, your Google profile and the van.

[Start free](/signup) or [see Colvy for service businesses](/for/service-businesses).`,
  },
  {
    slug: 'sports-clubs-community-groups',
    cover: '/blog/sports-clubs-community-groups/cover.jpg',
    title: "Rained out at 7am: running a sports club or community group without the group-chat chaos",
    excerpt: "Clubs and community groups juggle the same messages as a small business, run by volunteers. One shared inbox, instant SMS notices, smarter rego forms and member polls take the load off the committee.",
    category: 'Industry guides', accent: GREEN, icon: 'megaphone',
    date: '2026-10-17T09:00:00+11:00', dateLabel: 'Oct 17, 2026', readTime: '5 min read', author: 'The Colvy Team',
    takeaways: [
      "Put the club’s email, Facebook, Instagram and website chat in one inbox the whole committee shares.",
      "Tag members by team and text only the groups a notice is for. Turn quiet hours off for early wash-outs.",
      "Rego forms with branching and fee calculations replace the spreadsheet; payment links collect the fees.",
      "Email newsletters come from your own domain, with unsubscribe handled for you.",
      "Polls, surveys, an ideas board and a roadmap show members the committee is listening.",
    ],
    content: `It’s 6:40 on Saturday morning and it’s been raining all night. The ground is closed. Now someone on the committee has to tell 300 families before they pile into cars, through a Facebook group half of them have muted, a group chat that’s 200 messages deep, and an email list that’s three seasons out of date.

Sports clubs, school P&Cs, community gardens, choirs and volunteer groups run on goodwill and spare evenings. But the communication load is the same as a small business: questions, registrations, payments, news and feedback. And it’s usually handled by whoever happens to have the club’s Facebook password.

Colvy is built for businesses, but a lot of it fits a club or community group remarkably well. Here’s how.

![A coach watching a junior football game from the sideline](/blog/sports-clubs-community-groups/coach.jpg "Clubs run on volunteers. The tools shouldn’t need a full-time admin.")

## 1. One inbox for the whole committee

The first problem is that the club’s messages live in too many places. A parent asks about uniforms on Facebook, someone emails the secretary about registration, a sponsor messages Instagram, and the website chat goes unanswered all weekend.

In Colvy, all of those channels land in one shared inbox:

- **Everyone sees the same list.** No more “did anyone reply to that mum on Facebook?”
- **Assign conversations.** Registration questions to the registrar, sponsorship to the president.
- **Leave internal notes.** “Spoke to her at training, she’s paying cash.” Members never see these.
- **Volunteers come and go; the history stays.** When the treasurer hands over at the AGM, every past conversation stays with the club.

## 2. Wash-outs and urgent notices, sent in a minute

For news that can’t wait, a text beats every app. Tag members by team or group (say **U12 Saturday**, **Masters** or **Netball**), then send an SMS campaign to just those tags:

\`\`\`chat
title: Northside Junior FC · SMS
you: Hi from Northside JFC: all U12 & U13 games are CANCELLED today due to wet grounds. Training is on Tuesday as usual. Reply STOP to opt out.
them: Thanks for the early heads up!
them: Does this count as a bye or will it be rescheduled?
you: It’ll be rescheduled, we’ll confirm the new date this week 👍
\`\`\`

Replies come straight back into the shared inbox, so you’re not managing 300 one-on-one threads from your own phone.

> [!WARNING] Quiet hours and early mornings
> Colvy holds campaign texts outside 9am–8pm by default, which is perfect for news but wrong for a 6:45am wash-out. Turn quiet hours off for that one send and it goes immediately.

> [!NOTE] Texts and plans
> SMS is included in the Inbox and Everything plans (3,000 texts a month), with prepaid credit after that. Email newsletters, forms, polls and surveys work without SMS.

## 3. Registrations that don’t need a spreadsheet

Rego forms are where clubs lose the most volunteer hours. Colvy’s forms handle the logic that paper forms and generic tools can’t:

- **Branching questions.** Junior players get guardian contact and medical sections; seniors skip straight past.
- **Calculations.** Add up fees for siblings or extra uniform items.
- **A proper welcome screen**, with your club colours and a short note from the committee.

Once a form is in, send a payment link in the chat for fees or uniforms, and you’ll see when it’s paid.

![A committee meeting around a table with laptops and coffee](/blog/sports-clubs-community-groups/committee.jpg "Committee nights should be about the club, not chasing forms and payments.")

## 4. A newsletter people actually open

Email is still the best way to send the longer stuff: presentation night, fundraiser results, the canteen roster. Colvy’s email campaigns give you:

- **A simple designer** with your logo and colours.
- **Sending from your own domain**, so it comes from news@yourclub.org.au, not a random address.
- **A working unsubscribe link** on every email, and bounced addresses handled automatically.
- **Reports that lead with clicks.** Opens are shown too, with a note that Apple Mail inflates them.

## 5. Ask members, and show you listened

Clubs are communities, and the best ones ask their members. Colvy’s feedback tools were designed for product teams collecting customer ideas, but they translate neatly:

| Tool | Club use |
|---|---|
| **Polls** | “Which night works for winter training?” |
| **Surveys** | End-of-season feedback from parents and players |
| **Ideas board** | Members suggest and vote on ideas: new lights, a canteen menu, a social night |
| **Roadmap** | Show what’s planned, in progress and done this season |
| **Announcements** | Publish club news; members get an in-app alert and opted-in members an email |

> When members can see their suggestion move from “idea” to “done”, they stop asking whether the committee listens.

## 6. A help centre for the questions you answer every week

Where do I park? What’s the wet-weather policy? When are the photo days? Where do I buy socks?

Write the answers once in a help centre. Point people to it from your website and your replies. Colvy’s AI also uses it to draft answers to new questions, so the volunteer on the inbox mostly just checks and sends:

\`\`\`chat
title: Northside Junior FC · Website chat
them: Hi, where do the U9s play on Saturday? First game for us!
draft: Welcome to the club! U9 games are on the small fields behind the clubhouse at Northside Reserve. There’s parking on Ellis St and the gate opens at 7:30am. Our new families page has a map and a checklist for game day.
\`\`\`

![A misty, empty basketball court surrounded by trees](/blog/sports-clubs-community-groups/court.jpg "Fewer messages for the committee means more volunteers willing to stay on next season.")

---

## Getting started without a big setup

> [!TRY] A weekend setup plan
> 1. Connect the club’s email, Facebook page and Instagram to one inbox.
> 2. Import your member list and tag people by team or group.
> 3. Rebuild your rego form with branching for juniors and seniors.
> 4. Write the ten questions you answer most into the help centre.
> 5. Send your first newsletter, and run a quick poll to test it.

The Free plan includes one poll, one survey and ten help articles, enough to try it with your committee. Upgrade when you’re ready for SMS notices and email newsletters.

[Start free](/signup) or [explore polls and feedback](/solutions/feedback).`,
  },
  {
    slug: 'cafes-restaurants-regulars',
    cover: '/blog/cafes-restaurants-regulars/cover.jpg',
    title: "The rainy Tuesday text: how cafés and restaurants keep regulars coming back",
    excerpt: "Holiday hours, dietary questions, function enquiries and reviews all arrive mid-rush. Here’s how cafés and restaurants answer fast, book the big tables and fill the quiet days, without living on their phones.",
    category: 'Industry guides', accent: PURPLE, icon: 'chat',
    date: '2026-10-16T10:00:00+11:00', dateLabel: 'Oct 16, 2026', readTime: '6 min read', author: 'The Colvy Team',
    takeaways: [
      "Let the AI answer opening-hours questions from your Google profile, and draft everything else.",
      "Catch function enquiries with a form, lock them in with a deposit link, and let follow-ups happen on their own.",
      "Short, rare, well-timed texts to opted-in regulars fill quiet days without feeling like spam.",
      "Reply to every review: drafts for the good ones, a person for the critical ones.",
      "Missed-call text-back keeps the phone from interrupting service.",
    ],
    content: `The lunch rush is in full swing. Two people are waiting at the register, the coffee machine is screaming, and your phone shows three Instagram DMs: “Are you open on the public holiday?” “Do you do gluten-free?” and “Can we book the back room for 20 on Saturday?”

Every one of those is a customer ready to spend money. None of them can be answered right now.

Cafés and restaurants live on regulars. The places that do well aren’t just good at food and coffee. They answer quickly, remember people, and give regulars a reason to come back on a quiet Tuesday. Here’s how to do that without being glued to your phone.

![Baristas and customers in a busy coffee shop under a big COFFEE sign](/blog/cafes-restaurants-regulars/busy.jpg "During service, nobody has a free hand for the phone.")

## 1. Answer the same five questions without stopping service

Most hospitality messages are the same handful of questions: hours, holiday hours, dietary options, parking and bookings. Colvy’s AI answers them from your own information, including your Google Business Profile hours (holiday hours too) and the facts you’ve saved.

\`\`\`chat
title: The Little Grind · Instagram
them: Hey are you open on Monday? Isn’t it a public holiday?
ai: Hi! Yes, we’re open this Monday for the public holiday, 8am–2pm (a little shorter than usual). See you then ☕
them: Amazing. Do you have gluten-free options?
draft: We do! Our banana bread and most of the brunch menu can be made gluten-free. Just let us know when you order. We’re not a coeliac-certified kitchen, though.
\`\`\`

Notice the two kinds of reply. Opening-hours answers are among the ones you can let the AI send by itself, because they’re checked live against your hours. Anything else starts as a draft for a person to tap **Send** on. You set the daily limits, and you can pause every agent at once.

> [!TIP] Write your must-know facts once
> Add the things staff get asked about to Business Memory: dietary options, parking, high chairs, dogs, the kitchen’s closing time. Add the things the AI must never promise, too, like “we can’t guarantee nut-free”.

[See how Colvy’s AI works](/ai-assistant)

## 2. Turn function enquiries into booked functions

“Can we book the back room for 20 on Saturday?” is worth more than fifty coffees, and it’s exactly the kind of message that slips through during a rush.

A few ways to catch it:

- **An enquiry form** with branching questions (birthday, work lunch, wedding) and the details you need: numbers, date, budget, dietaries.
- **A deposit link in the chat** to lock in the date as soon as they say yes.
- **Follow-ups that happen on their own.** If a quote or deposit link isn’t paid, the Sales Agent drafts a friendly nudge after a few days.

\`\`\`chat
title: The Little Grind · SMS
card: Saturday function, back room | 20 guests · deposit A$200 | Pay deposit
event: 3 days, not paid yet
draft: Hi Jess, just checking in about Saturday the 14th. We’re holding the back room for you, and the deposit link above will lock it in. Any questions about the menu, just reply here!
\`\`\`

![A chef plating in an open restaurant kitchen](/blog/cafes-restaurants-regulars/kitchen.jpg "Functions and catering are where the margin is. Don’t let them slip through the DMs.")

## 3. The rainy Tuesday text

Every café has quiet days. A short, well-timed text to people who’ve opted in can turn a slow afternoon into a decent one:

\`\`\`chat
title: The Little Grind · SMS
you: Rainy Tuesday special at The Little Grind ☔ Show this text for a free banana bread with any large coffee, today only, 2–4pm. Reply STOP to opt out.
them: Say less. See you at 2!
\`\`\`

Some rules of thumb:

- **Only text people who’ve opted in.** Colvy checks consent for every number and skips anyone who’s replied STOP.
- **Keep it rare.** Once or twice a month feels like a treat. Weekly feels like spam.
- **Pick the audience.** Tag your locals, your office-lunch crowd or your weekend brunch regulars, and send to the right tag.
- **See what worked.** Every link in a campaign is tracked, so you can see who clicked.

> A text that arrives when the weather turns feels like a friend’s invitation. The same text every Monday feels like an ad.

Prefer email for the bigger news, like a new menu or a winter wine night? Email campaigns come with a simple designer, your own sending domain and a working unsubscribe link.

![Two coffees on a café table while a customer checks their phone](/blog/cafes-restaurants-regulars/phone-table.jpg "The best campaigns are short, rare and well timed.")

## 4. Reviews: ask, reply, and learn

For hospitality, Google reviews are basically your shopfront. Two things help:

**Replying to every review.** Colvy pulls in your Google reviews, and the Reputation Agent drafts a reply in your voice. If you allow it, it sends the 4–5 star replies itself. The 1–3 star ones always come to a person, with a task, because those deserve a human.

> [!EXAMPLE] A drafted reply to a 5-star review
> **Review:** “Best flat white in the inner west, and the staff remembered my name on my second visit!”
>
> **Draft reply:** “Thank you so much! Remembering our regulars is our favourite part of the job. See you for the next flat white ☕”

**Answering comments, too.** Comments on your Facebook and Instagram posts can get drafted replies as well, with spam and abuse flagged for a person instead of answered.

## 5. Calls during service

If your phone rings off the hook at noon, a Colvy business number can text back every call you miss, either always or only after hours. The customer replies by message, and whoever is free picks it up from the shared inbox once the rush dies down.

![A latte with rosetta art being served at the counter](/blog/cafes-restaurants-regulars/latte.jpg "Make the coffee. Let the follow-up happen on its own.")

---

## A week at a café, with the busywork handled

| When | What happens |
|---|---|
| Monday holiday | AI answers “are you open?” with your holiday hours, in seconds |
| Tuesday, raining | A short text to opted-in locals fills the quiet afternoon |
| Wednesday | A function enquiry gets a deposit link; a follow-up is drafted on Saturday |
| Thursday lunch rush | Missed calls get an instant text back |
| Friday | Last week’s reviews have drafted replies waiting for a quick approve |

> [!TRY] Start with one thing
> Connect Instagram, Facebook and your Google profile to one inbox, save your top ten facts in Business Memory, and turn on AI drafts. Once the drafts look right, let the opening-hours answers send themselves.

[Start free](/signup) or [see Colvy for restaurants](/for/restaurants).`,
  },
  {
    slug: 'how-colvy-helps-run-your-business-efficiently',
    cover: '/hero/landing-omni.jpg',
    title: 'How Colvy helps you run your business more efficiently',
    excerpt: 'Most of the time lost in a small business isn’t the work itself. It’s the switching, the chasing and the “did anyone reply to that?”. Here’s where Colvy takes that time back.',
    category: 'Product', accent: CORAL, icon: 'bolt',
    date: '2026-10-15', dateLabel: 'Oct 15, 2026', readTime: '7 min read', author: 'The Colvy Team',
    content: `Ask a busy owner where their week went and you rarely hear “serving customers”. You hear “checking Instagram, then the email, then the shop phone’s voicemail, then finding that order, then texting the customer back”. The work is fine. It’s everything around the work that eats the day.

Colvy is built to remove that layer. Here’s what that looks like in practice, step by step, and what you can switch on today.

## 1. Stop checking six apps

Every channel your customers use lands in one shared inbox: Instagram and Facebook messages, SMS, email, your website chat and phone calls. Each customer’s channels are linked to one profile, so your team works from one list instead of six.

What it saves you: the rounds of checking, and the messages that sat unread because nobody owned that app.

[See the shared inbox](/inbox-crm)

## 2. Know who you’re talking to before you reply

When a message or call comes in, Colvy matches the person to their customer record by phone or email. Their past orders, bookings, payments and conversations sit next to the chat.

What it saves you: the “can I get your order number?” back-and-forth, and searching your store admin in another tab.

## 3. Let the AI write the first draft

Colvy’s AI drafts replies from your own information: your website, help articles, saved facts, opening hours and live order and stock details. Start with drafts that a person checks and sends. When you trust it, choose exactly which kinds of replies it may send by itself.

Your rules apply everywhere. Tell Colvy “we never promise same-day delivery” once in Business Memory and the AI follows it.

What it saves you: typing the same twenty answers every day.

[Meet Colvy’s AI](/ai-assistant)

## 4. Take the sale where the question was asked

When someone says “I’ll take it”, send a payment link in the same conversation or, if your WooCommerce or Shopify store is connected, create the order for them. When they pay, the payment is recorded against the conversation and an order you created is marked paid in your store.

For appointments, share your booking page. Customers pick a time, pay a deposit if you ask for one, and get SMS reminders the day before and two hours before.

What it saves you: “I’ll send you an invoice”, chasing payments and phone tag over times.

## 5. Make the phone part of the system

Get an Australian business number (a local 02, 03, 07 or 08 landline, or an 04 mobile that can also text) and answer it in the browser or the Colvy app. Calls are recorded, transcribed and summarised on the customer’s conversation.

What it saves you: notes on sticky pads, and the “what did they call about?” question after every missed call.

[Get a business number online](/business-phone-number-australia)

## 6. Put follow-ups on autopilot

The follow-ups that bring customers back are the ones that get skipped on a busy day. Colvy can send them for you: order updates, booking reminders, a nudge on an abandoned cart, a text when an item is back in stock and a review request after a happy order or a finished job.

What it saves you: remembering. And it’s often where the extra sales come from.

## 7. See what’s working

Colvy keeps the numbers as the work happens: which links and campaigns were clicked and what sales followed, which conversations turned into orders, how fast enquiries get answered and which goals are slipping. No spreadsheet at the end of the month.

## Where to start

You don’t need to switch everything on at once. A good order:

1. Connect your channels so every message lands in one inbox.
2. Connect your store if you sell online, so orders show beside conversations.
3. Turn on AI drafts and save your most common answers.
4. Add a business number if calls matter to you.
5. Switch on one follow-up, such as review requests, and build from there.

If you want to see how it fits your kind of business, we’ve mapped out the full workflow for [ecommerce](/for/ecommerce), [multi-location retail](/for/multi-location-retail), [service businesses](/for/service-businesses), [restaurants](/for/restaurants) and [real estate](/for/real-estate).`,
    takeaways: ['One inbox for every channel ends the app-checking rounds', 'Customer history beside each chat removes the back-and-forth', 'AI drafts from your own information; you choose what it may send', 'Payments, bookings and follow-ups happen in the same thread'],
  },
  {
    slug: 'unify-customer-conversations',
    cover: '/feature/product.jpg',
    title: 'How to unify every customer conversation into one inbox',
    excerpt: 'SMS, WhatsApp, email, chat, calls and reviews scattered across six tabs? Here’s a practical way to bring them into one thread per customer.',
    category: 'Playbooks', accent: BLUE, icon: 'inbox',
    date: '2026-08-18', dateLabel: 'Aug 18, 2026', readTime: '6 min read', author: 'The Colvy Team',
    intro: 'Most growing businesses don’t have a communication problem — they have a fragmentation problem. The messages are all there; they’re just spread across a helpdesk, a phone app, a social inbox and someone’s personal email. Here’s how to pull them back together.',
    sections: [
      { h: 'Start with a channel audit', p: ['List every way a customer can reach you today: your website chat, SMS, WhatsApp, Instagram and Facebook DMs, email, phone, and review sites. Note who watches each one and how fast it’s answered. You’ll almost always find a channel nobody officially owns — that’s where things fall through.'] },
      { h: 'Thread by customer, not by channel', p: ['A ticket-per-message model treats the same person as five strangers. Aim instead for one thread per customer that carries every channel and the full history, so whoever picks it up can see the whole story — the order, the last call, the unresolved question.'] },
      { h: 'Make ownership obvious', p: ['Unification only sticks if it’s clear who’s responsible for a conversation at any moment. Assignment, @mentions and simple statuses (open, waiting, done) turn a shared inbox from chaos into a system your whole team can trust.'] },
    ],
    takeaways: ['Audit every channel and name an owner for each', 'Thread conversations by customer, not by message', 'Use assignment and statuses so nothing is “someone else’s job”'],
  },
  {
    slug: 'reduce-first-response-time',
    cover: '/channels/chat-widget.jpg',
    title: 'Five ways to cut your first-response time without hiring',
    excerpt: 'Speed is the easiest way to feel bigger than you are. Five changes that shrink the wait — no new headcount required.',
    category: 'Customer support', accent: TEAL, icon: 'bolt',
    date: '2026-07-29', dateLabel: 'Jul 29, 2026', readTime: '5 min read', author: 'The Colvy Team',
    intro: 'First-response time is the gap between a customer reaching out and hearing something human back. You don’t need a bigger team to shrink it — you need fewer places to look and less to retype.',
    sections: [
      { h: 'Put every channel in one place', p: ['Half of slow replies are just slow noticing. When SMS, chat, email and DMs land in one inbox, the clock starts the moment any of them arrives — not whenever someone remembers to check that app.'] },
      { h: 'Save your best answers', p: ['You answer the same twenty questions constantly. Turn them into saved replies your whole team can send in a tap. It’s the single highest-leverage change most small teams can make in an afternoon.'] },
      { h: 'Let AI draft the first pass', p: ['An assistant that knows your docs can draft an accurate reply for a teammate to glance at, tweak and send. You stay in control of every message — you just skip the blank page.'] },
      { h: 'Set an honest expectation', p: ['A short auto-acknowledgement (“Thanks — we’ll be back within an hour”) buys goodwill and reduces the follow-up “are you there?” messages that clog your queue.'] },
    ],
    takeaways: ['One inbox means the clock never starts late', 'Saved replies handle your top 20 questions instantly', 'AI drafts the first pass; a human still approves it'],
  },
  {
    slug: 'reviews-that-grow-your-rating',
    cover: '/channels/google-reviews.jpg',
    title: 'Asking for reviews at the right moment',
    excerpt: 'The difference between a review request that works and one that’s ignored is usually timing. Here’s when to ask.',
    category: 'Growth', accent: GREEN, icon: 'star',
    date: '2026-07-08', dateLabel: 'Jul 8, 2026', readTime: '4 min read', author: 'The Colvy Team',
    intro: 'Your rating is often the first thing a new customer sees — and the best time to grow it is right after you’ve made someone happy. The trick is asking at that moment, every time, without it feeling like a chore.',
    sections: [
      { h: 'Ask on the high note', p: ['The window is small: just after a delivery arrives, a problem is resolved, or a great call ends. Ask then — not a week later when the feeling has faded.'] },
      { h: 'Make it one tap', p: ['Every extra step loses people. A single link straight to your review page, sent by SMS or email, converts far better than “please search for us and leave a review”.'] },
      { h: 'Reply to every review', p: ['Responding — to the glowing ones and the critical ones — signals you’re paying attention, and it’s a ranking factor on most platforms. Keep replies short, human and specific.'] },
    ],
    takeaways: ['Trigger requests on the happy moment, automatically', 'One tap beats a scavenger hunt', 'Reply to every review, good or bad'],
  },
  {
    slug: 'close-the-feedback-loop',
    cover: '/suite/roadmap.jpg',
    title: 'Closing the feedback loop: from idea to changelog',
    excerpt: 'Collecting feedback is easy. Turning it into trust means telling people what you did with it. Here’s the full loop.',
    category: 'Product', accent: PURPLE, icon: 'idea',
    date: '2026-06-20', dateLabel: 'Jun 20, 2026', readTime: '6 min read', author: 'The Colvy Team',
    intro: 'The businesses customers love aren’t the ones that collect the most feedback — they’re the ones that visibly act on it. That means connecting the idea, the roadmap and the announcement into a single loop that comes back to the person who asked.',
    sections: [
      { h: 'Capture ideas where they happen', p: ['Requests hide inside chats, calls and emails. Give your team a one-click way to turn any of those into a logged idea, so good suggestions stop evaporating.'] },
      { h: 'Prioritise in the open', p: ['A public roadmap does two jobs at once: it helps customers vote on what matters, and it sets honest expectations about what’s coming and what isn’t. Openness beats a suggestion box nobody can see into.'] },
      { h: 'Tell them when it ships', p: ['This is the step most teams skip. When a feature ships, notify the people who asked for it — ideally in the same thread where they first raised it. That single message turns a feature release into a loyalty moment.'] },
    ],
    takeaways: ['Turn conversations into logged ideas in one click', 'Prioritise on a public roadmap, not in private', 'Close the loop: notify the people who asked when it ships'],
  },
  {
    slug: 'sell-in-the-chat',
    cover: '/feature/phones.jpg',
    title: 'Selling in the chat: turning conversations into revenue',
    excerpt: 'Support and sales aren’t separate conversations. Here’s how to help customers buy without leaving the thread.',
    category: 'Growth', accent: CORAL, icon: 'tag',
    date: '2026-05-27', dateLabel: 'May 27, 2026', readTime: '5 min read', author: 'The Colvy Team',
    intro: 'Every “do you have this in stock?” is a sale waiting to happen. The friction is usually the handoff — the moment you send someone away to a separate checkout and hope they come back. Remove that, and conversations start closing.',
    sections: [
      { h: 'Keep context beside the chat', p: ['When you can see what a customer bought before and what they’re asking now, recommending the right thing is easy — and it feels like service, not a pitch.'] },
      { h: 'Take payment in the thread', p: ['Build the order and send a secure payment link right where you’re already talking. No “go to our website, add to cart, check out” — just tap and pay.'] },
      { h: 'Follow up on the maybes', p: ['Not everyone buys on the spot. A gentle, automated nudge on an unanswered quote or an abandoned cart recovers sales that would otherwise quietly disappear.'] },
    ],
    takeaways: ['Every enquiry is a potential sale — treat it like one', 'Send payment links in the thread, no detour to checkout', 'Automate follow-ups so “maybe” doesn’t become “never”'],
  },
  {
    slug: 'switching-tools-without-losing-your-mind',
    cover: '/about/hero.jpg',
    title: 'Switching support tools without losing your mind (or your data)',
    excerpt: 'Dreading a migration? A calm, low-risk way to move platforms — keep your number, your history and your sanity.',
    category: 'Playbooks', accent: CORAL, icon: 'bolt',
    date: '2026-05-06', dateLabel: 'May 6, 2026', readTime: '7 min read', author: 'The Colvy Team',
    intro: 'The fear of switching keeps a lot of teams stuck on tools they’ve outgrown. But a migration doesn’t have to mean downtime or lost history. Done in the right order, you can move in an afternoon and never miss a message.',
    sections: [
      { h: 'Export before you do anything', p: ['Your data is yours. Before you switch, pull a clean export of contacts, conversations and any custom fields. A tool that makes this hard is telling you something — good platforms let you leave as easily as you joined.'] },
      { h: 'Port your number, don’t replace it', p: ['Customers have your number saved. Porting keeps it, so nothing breaks on their end. Line this up early — number ports take a little lead time regardless of platform.'] },
      { h: 'Run both for a day', p: ['Overlap the old and new tools for a short window so nothing in flight gets dropped. Once the new inbox is catching everything, switch off the old one and cancel — no long contracts to trap you.'] },
    ],
    takeaways: ['Export your data first — and insist on being able to', 'Port your number instead of getting a new one', 'Overlap briefly so no in-flight conversation is lost'],
  },

  // ── Buyer-intent articles (Markdown body) ──────────────────────────────────
  {
    slug: 'best-shared-inbox-for-small-business',
    cover: '/channels/email.jpg',
    title: 'The best shared inbox for small business (what to actually look for)',
    excerpt: 'A shared inbox turns scattered messages into one team queue. Here’s how to choose one that fits a small team — and the traps to avoid.',
    category: 'Buyer’s guide', accent: BLUE, icon: 'inbox',
    date: '2026-09-12', dateLabel: 'Sep 12, 2026', readTime: '7 min read', author: 'The Colvy Team',
    content: `A shared inbox is where a small team answers customers together — one queue, clear ownership, and the full history in one place. Instead of a support email that only one person watches (or a phone nobody officially owns), everyone sees the same conversations and can pick them up.

If you're comparing options, here's what actually matters for a small business — and what tends to look good in a demo but frustrate you later.

## What a shared inbox should do

- **Pull every channel into one queue.** Email, live chat, SMS, WhatsApp, Instagram and Facebook DMs, and phone should land in the same place. If you still have to open five apps, you don't have a shared inbox — you have five inboxes.
- **Thread by customer, not by message.** The same person messaging on Instagram today and email next week should be one conversation with one history, not two strangers.
- **Make ownership obvious.** Assignment, @mentions and simple statuses (open, waiting, done) are what stop things falling through the cracks.
- **Show who the customer is.** Their past orders, previous messages and notes should sit right next to the conversation so anyone can help without asking them to repeat themselves.

## Questions to ask before you buy

1. **Which channels are included, and which cost extra?** Some tools charge per channel or lock WhatsApp and calling behind the top tier.
2. **How is it priced as you grow?** Per-seat pricing can get expensive fast for a small team. Look for a plan that fits the size you are now.
3. **Can you start free?** You should be able to try it on real conversations before committing.
4. **Does it include a lightweight CRM?** A shared inbox without customer context just moves the chaos.
5. **How hard is it to leave?** Insist on being able to export your data and port your phone number.

## Traps to avoid

- **Enterprise help desks in disguise.** Powerful, but heavy to set up and priced for large teams. A small business usually wants something that works on day one.
- **Per-message "ticket" models** that treat a returning customer as a brand-new stranger every time.
- **Channels that are "coming soon."** Buy what's shipping today, not the roadmap.

## Where Colvy fits

Colvy is built for exactly this: one shared inbox across Messenger, Instagram, WhatsApp, SMS, email, live chat and phone, with a lightweight CRM beside every conversation — and a free plan so you can try it on real messages first. If you're weighing options, start free and see how one queue feels.`,
  },
  {
    slug: 'manage-instagram-dms-for-business',
    cover: '/channels/meta.jpg',
    title: 'How to manage Instagram DMs for business (without living in the app)',
    excerpt: 'Instagram DMs are where a lot of buying decisions happen now. Here’s how to answer them fast, as a team, without missing one.',
    category: 'Playbooks', accent: PURPLE, icon: 'inbox',
    date: '2026-09-05', dateLabel: 'Sep 5, 2026', readTime: '6 min read', author: 'The Colvy Team',
    content: `For a lot of small businesses, Instagram DMs are the new contact form. People ask "do you have this in stock?", "how much?", "can you deliver?" — and whoever replies fastest often gets the sale. The problem is the Instagram app isn't built for a team, and DMs get buried under likes and comments.

Here's how to handle Instagram DMs like a real support channel.

## Connect DMs to a proper inbox

Answering from your phone doesn't scale past one person — there's no assignment, no history, and no way to tell if a message was already handled. Connect your Instagram business account to a shared inbox so DMs land in the same queue as your other channels, and anyone on the team can pick them up.

## Reply fast with saved replies

You get the same questions constantly: price, availability, hours, delivery. Turn your best answers into saved replies your whole team can send in a tap. Fast, consistent answers are what turn a DM into a sale.

## Keep the whole customer in view

When a DM is tied to the customer's profile — past orders, previous chats, notes — you can answer "is my order shipped?" without asking them to explain who they are. That context is the difference between a reply and a good reply.

## Don't forget comments and story replies

Buying questions show up in comments and story replies too, not just the DM tab. Make sure those reach the same inbox so nothing slips.

## Set an expectation when you're closed

A short auto-reply ("Thanks — we'll get back to you within a few hours") buys goodwill and cuts down the "hello??" follow-ups.

## The takeaway

You don't need to live in the Instagram app to be great at DMs — you need them in one place, fast answers ready to go, and the customer's history beside every message. Colvy brings Instagram DMs, comments and story replies into one shared inbox alongside your other channels, so your team can answer quickly without missing a thing.`,
  },
  {
    slug: 'whatsapp-business-shared-inbox-guide',
    cover: '/channels/whatsapp.jpg',
    title: 'WhatsApp Business shared inbox: a practical guide for teams',
    excerpt: 'The WhatsApp Business app stops at one phone. Here’s how to let a whole team answer WhatsApp — with history, assignment and saved replies.',
    category: 'Buyer’s guide', accent: GREEN, icon: 'inbox',
    date: '2026-08-29', dateLabel: 'Aug 29, 2026', readTime: '6 min read', author: 'The Colvy Team',
    content: `WhatsApp is where a lot of customers would rather message you — it's fast, familiar and personal. But the WhatsApp Business app is designed for one person on one phone. The moment two people need to answer, or you want history and reporting, you've outgrown it.

A WhatsApp shared inbox fixes that. Here's what it is and how to set it up.

## Why one phone doesn't scale

- Only one device is really "logged in" at a time.
- No way to assign a chat or see who's handling it.
- No shared history when someone's off — the context lives on their phone.
- No saved replies across the team, no reporting.

## What a shared inbox adds

- **A whole team on one number.** Everyone answers from the same WhatsApp number, in the same queue.
- **Assignment and statuses** so it's clear who owns a chat and what's still open.
- **Customer history** — past orders and previous conversations beside the chat.
- **Saved replies and, optionally, AI-drafted first passes** for the questions you answer all day.

## Getting started

1. **Use the WhatsApp Business Platform (API), not just the app.** A shared inbox connects through the official Business API so multiple agents can answer one number.
2. **Connect it to your inbox tool** and map it to the right team.
3. **Load your saved replies** for your top questions.
4. **Set expectations** with a friendly away message outside hours.

## A note on templates

Outside the 24-hour window after a customer messages you, WhatsApp requires pre-approved message templates for business-initiated messages. A good inbox handles this for you and keeps you compliant.

## Where Colvy fits

Colvy gives your team one shared inbox for WhatsApp — with assignment, customer history and saved replies — right alongside Instagram, Messenger, SMS, email and live chat. One number, one queue, the whole team.`,
  },
]

export function getPost(slug: string): BlogPost | undefined {
  return POSTS.find(p => p.slug === slug)
}
export function relatedPosts(slug: string, n = 3): BlogPost[] {
  const current = getPost(slug)
  const rest = POSTS.filter(p => p.slug !== slug)
  const sameCat = rest.filter(p => p.category === current?.category)
  const others = rest.filter(p => p.category !== current?.category)
  return [...sameCat, ...others].slice(0, n)
}
export const CATEGORIES = Array.from(new Set(POSTS.map(p => p.category)))
