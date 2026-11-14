import type { BlogPost } from '@/lib/blog'

// Industry guides: how a kind of local business runs its customer side on
// Colvy today. Same rules as the rest of the blog: only what the product
// actually does (checked against the code), made-up example businesses and
// people, no invented numbers, quotes or customers. Photos are Unsplash
// (free licence), kept under public/blog/<slug>/.

const CORAL = '#ff6a4d', BLUE = '#2b59ff', PURPLE = '#7c5cff', GREEN = '#00c48c', TEAL = '#0d9488', AMBER = '#d97706'

export const INDUSTRY_POSTS: BlogPost[] = [
  {
    slug: 'gyms-fitness-studios',
    cover: '/blog/gyms-fitness-studios/cover.jpg',
    title: 'Gyms and fitness studios: turn enquiries into members with Colvy',
    excerpt: 'Trial enquiries on Instagram at 9pm, a 6am class that’s full, a PT client who forgot, and a front desk that’s empty half the day. How gyms, PT studios and yoga and pilates studios run their messages, bookings and marketing in one place.',
    seoDescription: 'How gyms, PT, yoga and pilates studios use Colvy: answer enquiries fast, book classes and PT with reminders and waitlists, and win back quiet members.',
    category: 'Industry guides', accent: CORAL, icon: 'calendar',
    date: '2026-11-13T15:00:00+11:00', dateLabel: 'Nov 13, 2026', readTime: '10 min read', author: 'The Colvy Team',
    takeaways: [
      'Answer trial enquiries within minutes, on whichever channel they came in on. That’s where most new members are won or lost.',
      'Set each class up with a number of spots, so the booking page shows what’s left and a waitlist fills the gaps when someone drops out.',
      'Sell class packs and memberships on your booking page. Members book with them instead of paying each time, and a class cancelled in time goes back on their pass.',
      'Reminders a day and two hours before, with “reply C to confirm”, cut the no-shows that leave a coach teaching an empty room.',
      'Book PT clients on repeat, weekly for up to 26 sessions, so the rhythm doesn’t depend on someone remembering.',
      'Tag members as you go (trial, member, lapsed, the classes they like) so your texts and emails go to the right people.',
    ],
    content: `It’s 9:14pm on a Sunday at a made-up gym, Harbourside Strength. Someone messages on Instagram asking whether beginners can come to the Saturday class. Another person rings, gets no answer and doesn’t leave a message. A regular texts the coach’s personal mobile to say she’ll miss tomorrow’s 6am. And the waitlist for that 6am class is a sticky note on the front desk.

None of this is unusual. Gyms, PT studios, yoga and pilates studios and boxing and CrossFit-style boxes all run on the same things: enquiries that need a fast answer, classes with a fixed number of spots, regulars who come back on a rhythm, and a front desk that’s often nobody at all.

This guide shows how a gym or studio runs that side of the business in Colvy: enquiries, class and PT bookings, paperwork, and the marketing that brings quiet members back.

## What Colvy does for a gym (and what it doesn’t)

Colvy is where your customer conversations, bookings and marketing live: Instagram and Facebook messages, website chat, texts, email and phone calls in one shared inbox, plus online booking, forms, campaigns and reviews.

It also sells class packs (“10 classes for $150”) and memberships billed to the member’s card each week, fortnight or month, through your own Stripe account, and members book classes with them on your booking page. What it doesn’t do: collect direct debits from bank accounts, or run door access. If you need those, keep the system that does them, and let Colvy handle everything around it: the enquiry before someone joins, the class bookings and reminders, the questions and the follow-ups.

## 1. Answer the trial enquiry before it goes cold

Most people looking for a gym message two or three at once. The one that answers first, clearly, with an easy next step, usually gets the trial.

In Colvy, Instagram and Facebook messages, website chat, texts and email land in [one inbox](/product/inbox), so nobody has to check four apps. Your [AI agents](/ai-agents) can answer the common questions straight away, any time of night, from what you’ve taught them: the timetable, prices, parking, what to bring. Anything they’re unsure about comes to your team, with the conversation so far.

\`\`\`chat
title: Harbourside Strength · Instagram
them: Hi! Can a complete beginner come to the Saturday class?
ai: Hi! Yes, Saturday 8am Strength Basics is made for beginners. The coach shows you every move, and your first class is free. Want the link to book a spot?
them: Yes please!
card: Book your free class | Strength Basics · Sat 8:00am · 45 min | Choose a time
\`\`\`

Phone calls count too. If nobody can pick up because every coach is on the floor, Colvy’s [missed-call text back](/phones/missed-call-text-back) can text the caller once, with your booking link in it. Their reply lands in the same conversation as the missed call.

> [!TRY] Set it up in Colvy
> Turn on missed-call text back in Settings → Calls & SMS and add {booking_link} to the message. You can send it only when you’re closed, or any time nobody answers.

## 2. Classes with a set number of spots

Set each class up as a service on your [booking page](/product/booking) with a number of spots: 12 for a reformer class, 20 for a HIIT class, whatever the room holds. The booking page shows how many spots are left in each class, and once a class is full nobody else can book it online.

![A group fitness class on mats in a bright studio](/blog/gyms-fitness-studios/class.jpg "Set the number of spots once, and the booking page does the counting.")

When a class is full, members can join the [waitlist](/product/waitlists) instead: they choose the class, the days, and mornings, afternoons or any time. When someone cancels, Colvy offers the freed-up spot to the people waiting. In a group class, everyone offered keeps their chance until the spots run out.

Then the reminders do the chasing for you:

- **24 hours before:** a text and an email, asking them to reply **C** to confirm or **R** to reschedule.
- **2 hours before:** a short text.
- **Your cancellation window:** set how many hours’ notice you need, and whether late cancellations are allowed or blocked online.

A spot that’s cancelled in time goes back on the timetable and to the waitlist, rather than standing empty.

## 3. Class packs and memberships

Most members don’t want to pay class by class. In Bookings → Passes, set up what you sell:

- **A class pack:** “10 classes for $150, use within 3 months”. Paid once, by card on your booking page, or in cash at the desk.
- **A membership:** “$39 a week, unlimited classes”, or “8 classes a month”. Billed to the member’s card every week, fortnight or month through your own Stripe account, until they cancel.

Each one can cover every class or only some, so a pack can be for yoga and pilates but not PT.

When a member books, they choose **Use my pass** and sign in with a code sent to their email or mobile. A class comes off their pack, or their membership covers it, and they don’t pay again. Cancel within your window and the class goes back on their pass. Cancel late and it’s used, the same as a late cancellation.

At the desk, you see who has what: classes left, when a pack expires, when a membership renews, and whose last payment didn’t go through. You can add a class as a goodwill gesture, give a free trial pack, or use someone’s pass for a booking they made by phone.

> [!TRY] Set it up in Colvy
> Bookings → Passes → For sale → New pass. Connect Stripe first (Settings → Payments) so members can pay by card.

## 4. PT sessions that keep their rhythm

Personal training is the opposite of a class: one client, one coach, the same time each week. Set PT up as its own service with capacity one, choose which coaches take it, and set how long it runs with any buffer before or after.

Two settings make the biggest difference:

- **Take payment online.** Choose no payment, a deposit, or the full price when booking, paid by card through your own Stripe account. A deposit makes a forgotten 6am session much less likely.
- **Book the rhythm.** Open a confirmed booking and repeat it every 1, 2, 3, 4, 6, 8 or 12 weeks, for up to 26 sessions. Colvy shows which dates are free before anything is booked, skips any that aren’t, and sends the client one message with every date.

| Session | How to set it up |
|---|---|
| Group class | 12 to 20 spots, waitlist on, reminders on |
| PT session | 1 spot, the coaches who take it, a deposit |
| Online check-in | A video appointment, 30 minutes |
| Free intro chat | 20 minutes by phone, no payment |

For studios without a front desk, Colvy’s [“I’m here” button](/product/check-in) helps too. From 30 minutes before an in-person session, the client’s booking page shows a big “I’m here” button. When they tap it, the coach gets an alert, without anyone stopping a set to check the door.

## 5. Paperwork before the first session

New members usually need a sign-up form, a health questionnaire or a waiver before they train. Build them once with [Colvy forms](/channels/forms): text, choices, dates, file uploads and a **signature** field, with questions that only appear when they’re relevant (“Do you have an injury we should know about?” → “Tell us more”).

Send the link in the same chat where they booked, and the answers come back into Colvy, where your team can find them before the first session.

> [!NOTE] Keep health details where they belong
> Ask only what a coach needs to train someone safely, and keep detailed medical notes out of texts and group chats.

## 6. Bring quiet members back

Every gym has people who joined in January and haven’t been seen since March. A short, friendly text often does more than another round of ads.

The trick is knowing who’s who. Every enquiry, booking and message in Colvy belongs to a contact, and you can tag them as you go: **trial**, **member**, **lapsed**, **6am crew**, **pilates**. Then a [campaign](/email-sms-marketing) goes to just the people it’s meant for:

\`\`\`chat
title: Harbourside Strength · SMS
you: Hi Sam, it’s Jess from Harbourside. We’ve missed you! Our new 6pm Strength Basics class starts Monday. Want me to hold you a spot? Reply STOP to opt out
them: Oh nice, yes please. Monday works
\`\`\`

Colvy’s AI campaign builder can draft the audience, the message and the timing from a sentence (“text lapsed members about the new evening class”), and you check and edit it before anything sends. After it goes out, the report shows who clicked and replied, and you can send a follow-up to everyone who didn’t click.

Marketing texts and emails need consent and an easy way out. Colvy skips anyone without marketing consent or who has opted out, and stops texting anyone who replies STOP. Our guide to [SMS marketing consent in Australia](/blog/sms-marketing-consent-australia) covers the rest.

## 7. Reviews, referrals and the poster by the door

Good reviews are what people check before they message you. When a booking finishes, Colvy can send a review request, if you use them, and you can reply to every Google review from the inbox.

For the poster by the door, the flyer at the café next door or the link in your Instagram bio, make a [smart link](/product/links) with a QR code. Each poster or post gets its own link, so Link Reports shows which ones brought people to your booking page.

![A gym floor with racks of dumbbells and benches](/blog/gyms-fitness-studios/floor.jpg "Give the poster by the door its own link, and you’ll know if it’s working.")

## A week at a made-up gym, with Colvy

- **Monday 6am:** the 6am class is full. Two people on the waitlist get offered the spots freed up by Sunday’s cancellations. Both book before the coach arrives.
- **Tuesday:** a trial enquiry comes in on Instagram at 9:40pm. The AI agent answers with the beginner class times and the booking link, and she books for Saturday.
- **Wednesday:** a PT client’s Thursday sessions are booked on repeat for the next 12 weeks, with a deposit on each. Two trial members buy a 10-class pack on the booking page after their free class.
- **Friday:** a text to everyone tagged **lapsed** about the new evening class. Four replies by lunchtime, all in the same inbox.
- **Saturday:** the trial member taps “I’m here” at 7:52am. The coach meets her at the door.

## Getting started

1. Connect Instagram, Facebook, your website chat and your business number.
2. Add your classes and PT as services, with spots, coaches, payments and your cancellation window. Then add your class packs and memberships under Bookings → Passes.
3. Turn on reminders, the waitlist and missed-call text back.
4. Build your sign-up form or waiver and save a reply with the link.
5. Teach your AI agents the timetable, prices and FAQs.
6. Start tagging: trial, member, lapsed.

Colvy’s Inbox plan is one price for your whole team, A$179 a month or A$149 a month billed yearly, GST included, with 3,000 texts a month. [Start free](/signup) and set up your timetable this afternoon.`,
  },
  {
    slug: 'local-business-marketing',
    cover: '/blog/local-business-marketing/cover.jpg',
    title: 'Local business marketing: a practical playbook you can run in Colvy',
    excerpt: 'You don’t need a big budget to market a local business. You need the customers you already have, a reason for new ones to trust you, and a way to tell what’s working. A step-by-step playbook, with how to run each step in Colvy.',
    seoDescription: 'A practical local business marketing playbook: reviews, texts and emails customers want, QR codes you can track, and never missing a lead. With how-tos.',
    category: 'Growth', accent: GREEN, icon: 'megaphone',
    date: '2026-11-13T14:00:00+11:00', dateLabel: 'Nov 13, 2026', readTime: '10 min read', author: 'The Colvy Team',
    takeaways: [
      'Start with the customers you already have: they’re cheaper to reach and quicker to say yes than strangers.',
      'Reviews do more selling than ads. Ask at the moment a customer is happiest, and reply to every one.',
      'Give every poster, flyer and Reel its own link or QR code, so you know which ones actually bring people in.',
      'Send fewer, better campaigns to the right people, rather than everything to everyone.',
      'The cheapest lead is the one you already have: answer fast, and never let a missed call go quiet.',
    ],
    content: `Most local businesses don’t have a marketing team. They have an owner who’s also the bookkeeper, the roster and the person who fixes the printer. So “do more marketing” usually turns into a boosted post now and then, and a vague feeling it’s not working.

This playbook is for that owner. It’s six steps, roughly in the order they pay off, and none of them needs an agency. For each one we show how to run it in Colvy, but the ideas work whatever tools you use.

## 1. Start with the customers you already have

The people who’ve already bought from you, booked with you or asked you a question are your best marketing audience by a long way. They know you, they’re local, and they’re much more likely to come back than a stranger is to try you.

The problem is that they’re scattered: some in your phone, some in Instagram DMs, some in an email inbox, some only in your POS. In Colvy, everyone who messages, calls, books or buys becomes a contact, with the whole history in one place.

Make that list useful with **tags**. Tag as you go, from the conversation: **regular**, **new**, **wholesale**, **dog owner**, **interested in classes**. Tags are what turn “send a text to everyone” into “send a text to the people it’s actually for”.

If you sell online or in store, Colvy can also group customers for you once your WooCommerce, Shopify or POS orders are connected: who bought a product or category, who hasn’t ordered in 90 days, who left a cart.

![A shop counter with a customer paying by phone](/blog/local-business-marketing/counter.jpg "Your best marketing list is already standing at your counter.")

## 2. Get found, and get trusted: reviews

When someone searches for “florist near me” or “physio Brunswick”, the businesses with more recent, better reviews get the click. Reviews are the closest thing local businesses have to free advertising.

Two habits make the difference:

- **Ask at the right moment.** Right after a booking finishes, a delivery arrives or a happy customer says thanks in a chat. In Colvy, a booking can send a review request when it’s done, if you use them, and **Ask for a review** in the reply box drafts a short, polite request you can check before sending.
- **Reply to every review.** Thank the good ones by name. Answer the bad ones calmly, once, and offer to fix it. Colvy brings your Google reviews into the inbox so replying takes a minute, not a login hunt.

\`\`\`chat
title: Petal & Stem · SMS
them: The flowers arrived and Mum cried (the good kind). Thank you!!
you: That’s the best message we’ve had all week, thank you for telling us! If you have a moment, a quick Google review helps other locals find us: [link]
them: Done ❤️
\`\`\`

## 3. Make every poster, flyer and post trackable

Local marketing is full of things you can’t measure: the A-frame sign, the flyer at the café, the school newsletter ad, the Reel that did well. Was any of it worth it?

Give each one its own link. In Colvy’s [Links](/product/links), make a link to your booking page, shop or menu for each place you’ll use it, and print its QR code. The link uses your own business address, so the QR code reads as you, not as Colvy.

Link Reports then shows how many people clicked each link and what it led to, like a booking or an order. After a month you’ll know whether the café flyer beat the newsletter ad, and you can spend next month’s budget accordingly.

> [!TIP] One link per place
> Use separate links for the poster in the window, the flyer and your Instagram bio, even if they all go to the same page. That’s what lets you tell them apart later.

## 4. Campaigns people want to get

A text or email to the right people at the right time is still the most reliable way to fill a quiet Tuesday. The rules of thumb:

- **SMS is for short and timely:** a spot that just opened up, a reminder, a one-day offer. It’s read within minutes, so keep it rare.
- **Email is for the longer story:** new stock, the seasonal menu, a how-to with photos.
- **Send fewer, better messages.** One useful message a month beats four ignored ones.

In Colvy, [email and SMS campaigns](/email-sms-marketing) go to an audience you choose: everyone subscribed, a tag, a hand-picked list, people who clicked a previous campaign, or, for shops with orders connected, people who bought something or haven’t ordered in a while. The AI campaign builder can draft the audience, copy and timing from a sentence, and you check everything before it sends. Schedule it for when your customers actually read their phones.

After it goes out, the report shows who opened, clicked and replied, and for shops, the orders and revenue that followed. One button drafts a follow-up to everyone who didn’t click.

![A neat clothing boutique with folded shirts on tables](/blog/local-business-marketing/shop.jpg "For shops, the report can show the orders a campaign led to, not just the clicks.")

Consent matters. In Australia, marketing texts and emails need the person’s consent, must say who they’re from, and must have an easy way to unsubscribe. Colvy skips anyone without marketing consent or who has opted out, and stops texting anyone who replies STOP. Our [SMS marketing consent guide](/blog/sms-marketing-consent-australia) explains the rules in plain English.

## 5. Offers that bring people back (without discounting everything)

A discount for everyone trains customers to wait for the next one. A specific offer for a specific group works better:

- **A thank-you code** for regulars, sent in the chat, rather than a site-wide sale.
- **Back-in-stock texts** for people who asked about something that sold out.
- **A gentle reminder** to people who left something in their cart.

If you run a WooCommerce or Shopify store, Colvy can create a real coupon code and drop it into the chat or an email as a copyable coupon, set up back-in-stock waitlists that text people when stock returns, and remind shoppers about abandoned carts.

## 6. Never lose the lead you’ve already paid for

Every ad, review and poster ends the same way: someone calls, messages or fills in a form. If nobody answers, all of that marketing was wasted.

- **Answer fast.** Put every channel in one inbox, so a message on Instagram doesn’t wait until someone remembers to check Instagram. Our guide to [reducing your first response time](/blog/reduce-first-response-time) has more.
- **Catch missed calls.** [Missed-call text back](/phones/missed-call-text-back) texts callers you couldn’t answer, so they reply instead of ringing the next business on the list.
- **Let AI handle the after-hours questions.** [AI agents](/ai-agents) answer the common questions at 10pm and pass anything tricky to you in the morning.

## A simple monthly marketing calendar

| Week | Do this | In Colvy |
|---|---|---|
| 1 | Ask last month’s happiest customers for a review | Ask for a review from the chat |
| 2 | One email with something genuinely useful | Email campaign to your subscribers |
| 3 | One short text to a specific group | SMS campaign to a tag |
| 4 | Check what worked and plan next month | Campaign Insights and Link Reports |

## Getting started

1. Connect your channels: website chat, Instagram, Facebook, email, your business number and Google reviews.
2. Import your existing customer list, and start tagging as you chat.
3. Make one tracked link and QR code for your counter, and one for your Instagram bio.
4. Plan one email and one text for next month.

Colvy’s Inbox plan includes campaigns, reviews and 3,000 texts a month, at one price for your whole team: A$179 a month, or A$149 a month billed yearly, GST included. [Start free](/signup) and send your first campaign this week.`,
  },
  {
    slug: 'physio-chiro-massage-clinics',
    cover: '/blog/physio-chiro-massage-clinics/cover.jpg',
    title: 'Physio, chiro and massage clinics: fewer missed calls, fuller books',
    excerpt: 'The phone rings mid-treatment, a 9am cancels at 8:15, and new patients want to book at 10pm. How allied health and massage clinics answer every call, fill cancellations and keep treatment plans on track, with Colvy.',
    seoDescription: 'How physio, chiro, osteo and massage clinics use Colvy to answer calls mid-treatment, fill cancellations from a waitlist and keep treatment plans on track.',
    category: 'Industry guides', accent: TEAL, icon: 'calendar',
    date: '2026-11-13T13:00:00+11:00', dateLabel: 'Nov 13, 2026', readTime: '9 min read', author: 'The Colvy Team',
    takeaways: [
      'A clinic’s phone rings while everyone’s hands are busy. Let an AI receptionist or a missed-call text catch the caller.',
      'Set different lengths and buffers for initial and follow-up appointments, per practitioner.',
      'Reminders with “reply C to confirm” and a waitlist for cancellations protect the diary better than a fee nobody wants to charge.',
      'Book a treatment plan on repeat in one go, and send a “time for your next one?” nudge when it ends.',
      'Colvy handles bookings and conversations. Keep clinical notes in your practice software, and keep health details out of texts.',
    ],
    content: `It’s 8:15am at a made-up clinic, Northbank Physio. The 9am cancels by text. The phone rings twice while both physios are with patients, and nobody leaves a message. A new patient tried to book online last night, couldn’t tell which appointment type to pick, and gave up. By lunchtime the 9am is still empty.

Physio, chiro, osteo, myotherapy and massage clinics share a problem: the people who answer the phone are the same people treating patients. This guide shows how a clinic runs its calls, bookings and follow-ups in Colvy so that fewer calls go unanswered and fewer gaps go unfilled.

## What Colvy is (and isn’t) for a clinic

Colvy handles the front of house: phone calls, texts, email and website chat in one shared inbox, online booking, reminders, waitlists, forms and reviews.

It isn’t a clinical records system. Keep treatment notes, assessments and anything clinical in your practice management software. Use Colvy for scheduling and communication, and keep health details out of texts and chat.

## 1. Answer the phone, even mid-treatment

A missed call to a clinic is usually a new patient. They’ll ring the next clinic on the list rather than leave a message.

Colvy gives you a few ways to catch them:

- **An [AI receptionist](/phones/ai-receptionist)** that answers when nobody picks up, out of hours, or always. It handles the common questions (hours, location, parking, what to wear), takes a message, and can text the caller your booking link.
- **A [press-1 menu](/phones/ivr)** (“press 1 to book or change an appointment, press 2 for anything else”) so calls reach the right person.
- **[Missed-call text back](/phones/missed-call-text-back)**, which texts a caller you couldn’t answer, once, with your booking link.

\`\`\`chat
title: Northbank Physio · SMS
you: Sorry we missed your call, we’re with patients right now. You can book online here: [booking link]. Or reply and we’ll get back to you between appointments.
them: Thanks, just booked an initial for Thursday 4pm 👍
\`\`\`

Calls can be recorded, transcribed and summarised in the conversation (on the Inbox and Everything plans), so whoever rings back knows what the caller wanted.

## 2. An online booking page patients understand

New patients give up when they can’t tell which appointment to book. Keep the list short and plain: **Initial physio consult (60 min)**, **Follow-up (30 min)**, **Remedial massage (60 min)**.

![A massage therapist working on a client’s back](/blog/physio-chiro-massage-clinics/treatment.jpg "Different lengths and buffers for each appointment type, per practitioner.")

For each service in Colvy’s [online booking](/product/booking) you set:

- **How long it takes**, and a **buffer** before or after for notes and resetting the room.
- **Which practitioners** offer it, so patients can pick their physio or take the first available.
- **Payment:** none, a deposit, or the full price online, by card through your own Stripe account. A deposit for new patients is common.
- **Where it happens:** at the clinic, by phone or by video.

Then set your cancellation window, say 24 hours, and whether late cancellations are allowed or blocked online.

## 3. Reminders and a waitlist, so cancellations don’t stay empty

Reminders go out automatically: a text and an email **24 hours before**, asking the patient to reply **C** to confirm or **R** to reschedule, and a short text **2 hours before**. The replies land in the same conversation, so your front desk (or whoever’s free) sees them straight away.

When someone does cancel, the [waitlist](/product/waitlists) does the ringing around. Patients join it from your booking page when the days they want are full, choosing the service and the times that suit them. When a slot frees up, Colvy offers it to them, and the first to book gets it.

## 4. Keep treatment plans on track

A treatment plan only works if the patient keeps coming. Two things help:

- **Book the plan in one go.** Open a confirmed booking and repeat it every 1, 2, 3, 4, 6, 8 or 12 weeks, for up to 26 visits. Colvy checks which dates are free first, skips any that aren’t, and sends the patient one message with every date.
- **Nudge them when it ends.** For each service you can set a “time for your next one?” message a number of days later, which doesn’t go to anyone who has already booked again.

## 5. Forms before the first visit

Send new patients your intake or consent form before they arrive, so the first ten minutes aren’t spent on a clipboard. [Colvy forms](/channels/forms) support text, choices, dates, file uploads and a signature field, with questions that only show when they’re relevant.

> [!WARNING] Keep it to what you need
> Ask for the minimum you need to book and treat someone safely, and keep detailed clinical information in your practice software, not in forms you email around or in text messages.

## 6. Arrivals without a receptionist

Many small clinics don’t have someone on the front desk all day. With Colvy’s [“I’m here”](/product/check-in) button, patients tap a button on their booking page when they arrive (from 30 minutes before), and the practitioner gets an alert. Nobody waits at an empty desk wondering whether to knock.

![A clean, bright treatment room](/blog/physio-chiro-massage-clinics/room.jpg "“I’m here” means nobody queues at an empty desk.")

## 7. Reviews: a note for registered practitioners

Reviews help people choose a clinic. Colvy can send a review request after an appointment, if you use them, and you can reply to Google reviews from the inbox.

If you’re an AHPRA-registered practitioner (physio, chiro, osteo and others), check AHPRA’s advertising guidance before you ask for reviews or quote them anywhere. Testimonials about clinical aspects of care can’t be used in advertising regulated health services. Massage therapists who aren’t AHPRA-registered have more freedom, but the same courtesy applies.

## Getting started

1. Connect your clinic number (or [keep your current one](/phones/numbers-porting)), website chat and email.
2. Add your appointment types with lengths, buffers, practitioners and payments.
3. Turn on reminders, the waitlist, and missed-call text back or the AI receptionist.
4. Build your intake form and add the link to your booking confirmation.

Read our wider [guide to regulars, gaps and the front desk](/blog/appointments-regulars-waitlist) for more on standing appointments and waitlists. [Start free](/signup) and have your booking page live this afternoon.`,
  },
  {
    slug: 'cleaning-business-guide',
    cover: '/blog/cleaning-business-guide/cover.jpg',
    title: 'Running a cleaning business: quotes, regular cleans and proof of the job',
    excerpt: 'Quote requests while you’re mid-clean, regular clients on a fortnightly rhythm, end-of-lease jobs that need a checklist and photos, and a team spread across town. How cleaning businesses run all of it from their phone with Colvy.',
    seoDescription: 'How cleaning businesses use Colvy: quote fast with online acceptance and deposits, book regular cleans, and prove the job with checklists, photos and sign-off.',
    category: 'Industry guides', accent: BLUE, icon: 'clipboard',
    date: '2026-11-13T12:00:00+11:00', dateLabel: 'Nov 13, 2026', readTime: '8 min read', author: 'The Colvy Team',
    takeaways: [
      'Answer quote requests fast, from wherever you are. The first clear quote usually wins the job.',
      'Send quotes customers can accept online, with GST worked out and a deposit paid by card straight after.',
      'Book regular cleans on repeat at the customer’s address, with reminders before each visit.',
      'Use a checklist, before-and-after photos and the customer’s signature on bigger jobs like end-of-lease cleans.',
      'Field staff see only their own jobs, and everyone works from the same calendar.',
    ],
    content: `A made-up cleaning business, Spotless Co., has three cleaners, two cars and one owner who quotes jobs from the driveway between cleans. Quote requests come in by Facebook, the website, text and the occasional call that rings out because her hands are in a sink. Regular clients are in a spreadsheet. End-of-lease jobs need a checklist the agent will actually accept.

This guide shows how a cleaning business runs that side of things in Colvy: quotes, regular cleans, one-off jobs and the proof that the job was done.

## 1. Catch every quote request

Quote requests come in from everywhere: Facebook, Instagram, your website, texts and calls. In Colvy they land in [one inbox](/product/inbox) you can answer from your phone, between jobs.

- **Missed calls:** turn on [missed-call text back](/phones/missed-call-text-back), so a caller you couldn’t answer gets a text and replies there.
- **A quote request form:** a [Colvy form](/channels/forms) asks the questions you always need (address, number of bedrooms and bathrooms, the type of clean, photos of the worst bits) and you can turn a response straight into a job.
- **Photos on request:** need to see the oven before you quote? Send the customer a photo request link, and they upload pictures from their phone into the conversation.

## 2. Quotes customers can accept online

With [Jobs & Services](/product/jobs), you build a quote from your own price list: line items, quantities, a discount if you want one, and Australian GST worked out to the cent. Add a deposit for bigger jobs.

The customer gets a link by text or email. They see the quote with your terms, and **Accept** (typing their name to agree) or **Decline**. If you asked for a deposit, they pay it by card straight after accepting.

\`\`\`chat
title: Spotless Co. · SMS
you: Hi Priya, here’s your quote for the end-of-lease clean at 14 Rose St: [quote link]. A 30% deposit secures Friday the 20th.
them: Looks good, accepted and paid!
event: Quote accepted · deposit paid
\`\`\`

![A cordless vacuum cleaning a carpet](/blog/cleaning-business-guide/vacuum.jpg "The first clear quote usually wins the job.")

## 3. Regular cleans on repeat

Regular clients are the backbone of a cleaning business. Set up your regular clean as a service on your [booking page](/product/booking) that happens **at the customer’s address**, with how long it takes.

Then book the rhythm once: open the confirmed booking and repeat it every 1, 2, 3 or 4 weeks (or 6, 8 or 12), for up to 26 visits. Colvy shows which dates are free first, skips any that clash, and sends the client one message with every date. Before each visit, they get a reminder and can reply **C** to confirm or **R** to reschedule.

## 4. Jobs your team can work from

For one-off and bigger jobs, the job in Colvy is the single place everyone works from:

- **Assign the job** to one or more cleaners. Colvy warns you if it clashes with something else they’re booked on, and the job appears on the team calendar.
- **A checklist** for the job: every room on the end-of-lease list, ticked off as they go.
- **Photos** of the job, before and after, attached to the job itself.
- **Time on the job**, with a work timer.
- **The customer’s signature** at the end, on the cleaner’s phone.

Field staff see only the jobs they’re on, not the whole business.

![A cleaner in gloves holding a spray bottle](/blog/cleaning-business-guide/spray.jpg "A checklist, photos and a signature are the proof an agent or landlord needs.")

> [!TIP] Make end-of-lease painless
> Build your end-of-lease checklist once, matching the agent’s condition report room by room, and attach before-and-after photos to the job. If there’s a dispute about the oven, you have the photos.

## 5. Notes that save a wasted trip

Access instructions, pets, the room they don’t want touched: add them as a note on the customer, and everyone on the job sees them. Internal notes stay inside your team and are never sent to the customer.

## 6. Reviews and repeat work

When a job is done, ask for a review while the customer is happy, and reply to every Google review from the inbox. A short text a few months after an end-of-lease clean (“moving again? we’d love to help”) costs almost nothing and brings work back.

## Getting started

1. Connect your business number, Facebook, Instagram and website chat.
2. Add your price list and your quote terms, and set your deposit.
3. Set up your regular clean as a booking service at the customer’s address.
4. Build your end-of-lease checklist and quote request form.
5. Invite your cleaners. They see only their own jobs.

Our guide to [quotes and jobs for trades](/blog/trades-quotes-jobs-guide) goes deeper on quoting. [Start free](/signup) and send your first quote today.`,
  },
  {
    slug: 'mechanics-car-detailing',
    cover: '/blog/mechanics-car-detailing/cover.jpg',
    title: 'Mechanics and car detailers: bookings, quotes and “your car’s ready” texts',
    excerpt: 'Service bookings, repair quotes the customer can approve from their phone, photos of the worn part, a payment link before pickup and a reminder when the next service is due. How workshops and detailers run it with Colvy.',
    seoDescription: 'How mechanics and car detailers use Colvy for online service bookings, repair quotes approved online, photos in the chat, payment links and service reminders.',
    category: 'Industry guides', accent: AMBER, icon: 'briefcase',
    date: '2026-11-13T11:00:00+11:00', dateLabel: 'Nov 13, 2026', readTime: '8 min read', author: 'The Colvy Team',
    takeaways: [
      'Let customers book a service online, with how long each job takes and the times you take bookings.',
      'Send repair quotes customers can accept online, with GST worked out and a deposit if you want one.',
      'Show, don’t tell: a photo of the worn brake pad in the chat makes the quote easy to say yes to.',
      'Text when the car is ready, with a payment link, so pickup takes a minute.',
      'Set a “time for your next service?” reminder months later, so customers come back to you.',
    ],
    content: `At a made-up workshop, Gearbox Garage, the phone is the busiest thing in the building. Customers ring to book a service, to ask whether the car is ready, and to approve a repair, usually while the mechanic who knows the answer is under a car. Detailers have it worse: most of their enquiries come in through Instagram, often with a photo and the question “how much?”.

This guide shows how a workshop or detailer runs bookings, quotes and pickups in Colvy, so the phone does less of the work.

## 1. Online bookings for services and details

On your [booking page](/product/booking), list what people book: **Logbook service**, **Tyre fitting**, **Interior detail**, **Full detail**. For each one, set how long it takes, any buffer between jobs, and whether to take a deposit or the full price online, by card through your own Stripe account.

Customers pick a time that suits your hours. Reminders go out a day before (text and email) and two hours before (text), and they can reply **C** to confirm or **R** to reschedule. For mobile detailers, set the service to happen **at the customer’s address**.

## 2. Photos first, then the quote

A detailer can’t price a job without seeing the car. A mechanic finds a worn part and needs the customer’s okay. In both cases, photos in the conversation do the explaining.

- **Get photos from the customer.** Send a photo request link, and they upload pictures from their phone straight into the conversation.
- **Send photos to the customer.** Snap the worn brake pad or the cracked hose and send it in the chat, along with the quote.

\`\`\`chat
title: Gearbox Garage · SMS
you: Hi Tom, the front brake pads on your Corolla are down to about 2mm (photo attached). Here’s the quote to replace them today: [quote link]
them: Yep, go ahead
event: Quote accepted
\`\`\`

With [Jobs & Services](/product/jobs) the quote is built from your price list (parts and labour), with Australian GST worked out to the cent. The customer reads it on their phone and taps **Accept**, typing their name to agree, and pays a deposit by card straight after if you asked for one.

## 3. Jobs the whole workshop can see

Once a quote is accepted, it becomes a job: who’s on it, a checklist, photos of the work, time on the job and the customer’s signature if you need one. Assign it to a mechanic or detailer and Colvy warns you about clashes, and the job appears on the team calendar. Team members who only need their own work see only the jobs they’re on.

## 4. “Your car’s ready”, with a payment link

When the job’s done, text the customer from the same conversation, with a [payment link](/solutions/payments) so they can pay before they arrive. Pickup takes a minute, not a queue at the counter.

\`\`\`chat
title: Gearbox Garage · SMS
you: Hi Tom, your Corolla is ready! You can pay here before you pick it up: [payment link]. We’re open until 5:30.
event: Payment received
them: Paid, see you at 5
\`\`\`

![A detailer washing a black car outside a workshop](/blog/mechanics-car-detailing/detailing.jpg "For detailers, the before-and-after photos are the marketing.")

## 5. Answer the phone without stopping work

- **[Missed-call text back](/phones/missed-call-text-back)** texts callers you couldn’t answer, with your booking link.
- **An [AI receptionist](/phones/ai-receptionist)** can answer when nobody picks up: hours, location, what a service includes. It takes a message, and can text your booking link.
- **Call recording and summaries** mean whoever rings back knows exactly what the caller asked, on the Inbox and Everything plans.

## 6. Bring them back for the next service

For each service, set a “time for your next one?” message a number of days after the booking: 180 days for a service, 90 for a maintenance wash. It doesn’t go to anyone who has already booked again. Add a review request when the job’s done, and reply to Google reviews from the inbox.

![A mechanic topping up engine oil](/blog/mechanics-car-detailing/service.jpg "A reminder months later brings the next service back to you.")

## Getting started

1. Connect your business number, Instagram, Facebook and website chat.
2. Add your services to your booking page, with times, durations and payments.
3. Add your parts and labour to your price list, and your quote terms.
4. Turn on reminders, missed-call text back and next-service nudges.

[Start free](/signup) and take your first online booking this week.`,
  },
]
