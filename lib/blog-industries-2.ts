import type { BlogPost } from '@/lib/blog'

// Industry guides, round two (see lib/blog-industries.ts for the rules: only
// what Colvy does today, checked against the code; made-up businesses and
// people; Unsplash photos under public/blog/<slug>/).

const CORAL = '#ff6a4d', BLUE = '#2b59ff', PURPLE = '#7c5cff', GREEN = '#00c48c', TEAL = '#0d9488', AMBER = '#d97706', PINK = '#ff4d8d', INDIGO = '#4f46e5'

export const INDUSTRY_POSTS_2: BlogPost[] = [
  {
    slug: 'who-uses-colvy',
    cover: '/blog/who-uses-colvy/cover.jpg',
    title: 'Who uses Colvy? How each kind of local business runs on it',
    excerpt: 'Gyms, clinics, salons, trades, cleaners, workshops, restaurants, shops, florists, tutors, photographers and more. An industry-by-industry guide to what each one uses Colvy for, with a link to the full guide for yours.',
    seoDescription: 'An industry-by-industry guide to Colvy: what gyms, clinics, salons, trades, cleaners, restaurants, shops, tutors and more use it for, with a guide for each.',
    category: 'Industry guides', accent: CORAL, icon: 'users',
    date: '2026-11-14T00:50:00+11:00', dateLabel: 'Nov 14, 2026', readTime: '7 min read', author: 'The Colvy Team',
    takeaways: [
      'Every local business has the same core job: answer people fast, book or sell, and bring them back.',
      'Colvy puts calls, texts, email, website chat, Instagram and Messenger in one inbox, with bookings, quotes, orders and campaigns beside each conversation.',
      'What changes by industry is which tools you lean on: classes and waitlists, quotes and jobs, tables, or store orders.',
      'There’s a step-by-step guide for each industry below.',
    ],
    content: `Colvy started as a shared inbox, and it still is one: calls, texts, email, website chat, Instagram and Facebook Messenger, all in one place your whole team can answer from. Around it sit the tools that turn a conversation into business: online bookings, quotes and jobs, table reservations, store orders, payments, campaigns and reviews.

Which of those you use depends on what you do. This page is a map: find your kind of business, see what it leans on, and follow the link to the full guide.

## Appointments and classes

Businesses that sell time: a session, a class, a treatment.

- **Gyms, PT, yoga and pilates studios.** Classes with a set number of spots, a waitlist for full classes, PT sessions booked on repeat, waivers with a signature, and texts that bring lapsed members back. [Read the gym guide](/blog/gyms-fitness-studios).
- **Physio, chiro, osteo and massage clinics.** An AI receptionist or missed-call text for calls you can’t take mid-treatment, appointment types per practitioner, reminders and a waitlist for cancellations. [Read the clinic guide](/blog/physio-chiro-massage-clinics).
- **Salons, barbers and nail studios.** Regulars booked every few weeks, deposits for long services, and “I’m here” check-in. [Read about no-shows](/blog/salon-barber-no-shows) and [regulars and waitlists](/blog/appointments-regulars-waitlist).
- **Tattoo, lash and brow studios.** Consults, deposits, reference photos and consent forms. [Read the studio guide](/blog/tattoo-beauty-studios).
- **Tutors, music teachers and instructors.** Weekly lessons on repeat, online lessons by video, and group classes with spots. [Read the tutoring guide](/blog/tutors-coaches-instructors).
- **Groomers, dog walkers and trainers.** Grooms every six weeks, walks at the client’s address, and puppy classes. [Read the pet services guide](/blog/pet-groomers-walkers-trainers).

## Quotes and jobs

Businesses that quote first, then turn up and do the work.

- **Tradies.** Quotes accepted online with a deposit, jobs your team works from, and sign-off on site. [Read the trades guide](/blog/trades-quotes-jobs-guide) and [about missed calls](/blog/tradies-missed-calls).
- **Cleaners.** Regular cleans on repeat, end-of-lease checklists, before-and-after photos. [Read the cleaning guide](/blog/cleaning-business-guide).
- **Gardeners, pool and pest businesses.** Regular visits plus one-off quoted work. [Read the home services guide](/blog/home-services-garden-pool-pest).
- **Mechanics and detailers.** Service bookings, repair quotes with photos, and a payment link when the car’s ready. [Read the workshop guide](/blog/mechanics-car-detailing).
- **Photographers and venues.** Enquiries, packages quoted with a deposit, and the run sheet in one place. [Read the events guide](/blog/photographers-event-venues).
- **Accountants, bookkeepers and lawyers.** Client email, documents and calls together, and fixed-fee work quoted and accepted online. [Read the professional services guide](/blog/accountants-bookkeepers-lawyers).

![A small team working together at a desk with a laptop](/blog/who-uses-colvy/cover.jpg "Whatever you sell, the job is the same: answer fast, book or sell, bring people back.")

## Food and hospitality

- **Restaurants and cafés.** Table bookings with a floor plan, deposits for big groups, no-show tools, and the phone answered during service. [Read the reservations guide](/blog/restaurant-reservations-guide) and [the café guide](/blog/cafes-restaurants-regulars).

## Shops and online stores

- **Online stores on WooCommerce or Shopify.** Orders beside every chat, “where’s my order?” answered, abandoned carts and back-in-stock texts. [Read the online store guide](/blog/online-store-wheres-my-order).
- **Florists, cake makers and gift shops.** Custom orders quoted with a deposit, delivery days booked from the chat. [Read the made-to-order guide](/blog/florists-cake-makers).
- **Specialist and multi-location retail.** Receipts and tax invoices, regular services, and one inbox for every store. [Read the specialist retail guide](/blog/specialist-retail-receipts-accounts) and [the multi-location guide](/blog/multi-location-retail-one-inbox).
- **Aquarium and pet stores.** [Read the aquarium and pet store playbook](/blog/aquarium-pet-store-playbook).

## Everyone else

- **Real estate agents.** Every enquiry answered and every inspection booked. [Read the real estate guide](/blog/real-estate-enquiries).
- **Sports clubs and community groups.** Members, volunteers and parents in one place. [Read the clubs guide](/blog/sports-clubs-community-groups).
- **Any local business doing its own marketing.** Reviews, trackable QR codes and campaigns people want. [Read the local marketing playbook](/blog/local-business-marketing).

## What every business gets

Whatever you do, the basics are the same on Colvy:

| You need | In Colvy |
|---|---|
| One place to answer everyone | A shared inbox for calls, SMS, email, website chat, Instagram and Messenger |
| A business number | Australian local, mobile and 1800 numbers, or [just a number that forwards to your mobile](/business-phone-number-australia) |
| Never miss a lead | Missed-call text back, an AI receptionist and AI agents |
| Get paid | Payment links in any conversation, deposits on bookings and quotes |
| Come back for more | Email and SMS campaigns, review requests, regular bookings |

[See pricing](/pricing), or [start free](/signup) and connect your first channel in a few minutes.`,
  },
  {
    slug: 'tutors-coaches-instructors',
    cover: '/blog/tutors-coaches-instructors/cover.jpg',
    title: 'Tutors, music teachers and instructors: lessons that book themselves',
    excerpt: 'Weekly lessons, parents texting about Thursday, online sessions, group classes and a waitlist for next term. How tutors, music teachers, coaches and driving instructors run lessons and messages in Colvy.',
    seoDescription: 'How tutors, music teachers, coaches and driving instructors use Colvy: weekly lessons on repeat, online lessons by video, group classes and parent messages.',
    category: 'Industry guides', accent: INDIGO, icon: 'calendar',
    date: '2026-11-14T00:40:00+11:00', dateLabel: 'Nov 14, 2026', readTime: '7 min read', author: 'The Colvy Team',
    takeaways: [
      'Book a student’s weekly lesson for the whole term in one go, with a reminder before each one.',
      'Run online lessons by video, with your meeting link in every confirmation.',
      'Set group classes up with a number of spots and a waitlist for when they’re full.',
      'Keep parents, students and their questions in one inbox, not your personal phone.',
    ],
    content: `A made-up music school, Allegro Lessons, has two piano teachers, a guitar teacher and about sixty students. Most lessons are the same time every week. Parents text the teachers’ personal mobiles to cancel, swap or ask about fees, and term enrolments live in a spreadsheet.

Tutors, music teachers, swim and sports coaches and driving instructors all share that shape: regular lessons, parents in the loop, and a lot of small messages. Here’s how it runs in Colvy.

## 1. Every lesson on repeat

Set each lesson type up as a service on your [booking page](/product/booking): **30-minute piano**, **60-minute maths tutoring**, **Driving lesson (60 min)**. Choose which teachers take it, how long it runs and any gap between lessons.

When a student starts, book their first lesson and repeat it every week (or every 2, 3 or 4 weeks) for up to 26 lessons: a whole term or two in one step. Colvy checks which dates are free first, skips any that aren’t, and sends the family one message with every date. Each lesson gets a reminder the day before, and they can reply **C** to confirm or **R** to reschedule.

\`\`\`chat
title: Allegro Lessons · SMS
you: Hi Priya, Mia’s piano lessons are booked every Thursday at 4:30pm for Term 1: 5 Feb to 2 Apr. We’ll text a reminder the day before each one.
them: Perfect, thank you!
\`\`\`

![A grand piano’s keys in warm light](/blog/tutors-coaches-instructors/piano.jpg "Weekly lessons, booked for the term in one step.")

## 2. Lessons in person, online or at their place

Each service has a place:

- **At your studio or centre.**
- **By video:** add your meeting link to the service, and it’s in every confirmation.
- **By phone.**
- **At the customer’s address:** for driving lessons that start at home, or a tutor who visits.

Take payment when they book if you want to (none, a deposit or the full price, by card through your own Stripe account), or use a [payment link](/solutions/payments) in the chat for a term’s fees.

## 3. Group classes and a waitlist

Group lessons, holiday workshops and coaching clinics work like gym classes: set the number of spots, and the booking page shows how many are left. When a class is full, families can join the [waitlist](/product/waitlists), and when a spot frees up Colvy offers it to them.

## 4. Parents, students and messages in one place

Parents text, email and message on Facebook. In Colvy all of it comes into [one inbox](/product/inbox) your whole team can see, with the student’s lessons beside the conversation. Teachers don’t have to give out their personal numbers, and the office can pick up a question when a teacher is mid-lesson.

- **Saved replies** answer the usual questions (fees, what to bring, term dates) in a couple of taps: type “/” in the reply box.
- **Internal notes** keep teachers in the loop about a student without the parent seeing them.
- **[AI agents](/ai-agents)** can answer common questions out of hours, from what you’ve taught them.

> [!TIP] Enrolment without the spreadsheet
> Build your enrolment form once with [Colvy forms](/channels/forms) (student’s name, age, level, the parent’s details, and a signature for your terms) and send the link to new families.

## 5. Next term’s enrolments

Tag families as you go (**piano**, **Term 1**, **waitlist**) and send next term’s enrolment by [email or SMS campaign](/email-sms-marketing) to just the right people. The report shows who opened, clicked and replied.

![Students studying together around a table with laptops](/blog/tutors-coaches-instructors/study.jpg "Tag families by subject and term, and next term’s message goes to the right people.")

## Getting started

1. Connect your business number, email, website chat and Facebook.
2. Add your lesson types, teachers, places and payments.
3. Book your current students on repeat for the term.
4. Build your enrolment form, and save a reply with the link.

[Start free](/signup) and have your timetable online this week.`,
  },
  {
    slug: 'pet-groomers-walkers-trainers',
    cover: '/blog/pet-groomers-walkers-trainers/cover.jpg',
    title: 'Dog groomers, walkers and trainers: bookings, regulars and happy owners',
    excerpt: 'Grooms every six weeks, walks at the owner’s place, puppy classes with a set number of spots, and owners who want a photo. How pet services run bookings and messages in Colvy.',
    seoDescription: 'How dog groomers, walkers and trainers use Colvy: grooms booked on repeat, walks at the owner’s address, puppy classes with spots, and photos in the chat.',
    category: 'Industry guides', accent: AMBER, icon: 'calendar',
    date: '2026-11-14T00:30:00+11:00', dateLabel: 'Nov 14, 2026', readTime: '7 min read', author: 'The Colvy Team',
    takeaways: [
      'Book each dog’s regular groom or walk on repeat, with reminders before every visit.',
      'Walks and mobile grooms happen at the owner’s address; set that on the service.',
      'Puppy classes get a number of spots and a waitlist.',
      'Send owners a photo from the chat. It’s the best marketing you’ll ever do.',
    ],
    content: `A made-up mobile groomer, Muddy Paws, runs one van and a diary full of regulars. A made-up trainer, Sit Happens, runs puppy school on Saturday mornings and private sessions during the week. Both spend half their day on the phone: rebooking, confirming, answering “are you still coming?”, and sending photos.

Here’s how pet businesses run that side in Colvy.

## 1. Regulars on repeat

Most dogs come back on a rhythm: a double coat every six to eight weeks, a nail trim every four, a walk every weekday. In Colvy, open a confirmed booking and repeat it every 1, 2, 3, 4, 6, 8 or 12 weeks, for up to 26 visits. Colvy checks the dates first, skips any that clash, and sends the owner one message with every date.

Each visit gets reminders, a day before (text and email) and two hours before (text), and owners can reply **C** to confirm or **R** to reschedule.

## 2. At the salon, or at their place

Set each [booking](/product/booking) service up where it happens:

- **At your salon:** with “I’m here” check-in, so owners can tell you they’ve arrived without you putting down the clippers.
- **At the owner’s address:** for mobile grooms, walks and home training sessions. They enter the address when they book.

Take a deposit or full payment when they book if you want to, by card through your own Stripe account.

![A happy dog on a beach](/blog/pet-groomers-walkers-trainers/happy.jpg "A rhythm that books itself keeps your diary full and the dogs tidy.")

## 3. Puppy school and group classes

Set a class up with a number of spots, say 8 puppies, and your booking page shows how many are left. Once it’s full, owners join the [waitlist](/product/waitlists), and when someone drops out, Colvy offers the spot to the people waiting.

Send your new-owner form before the first class with [Colvy forms](/channels/forms): the dog’s name, breed and age, anything you should know, a file upload for the vaccination certificate if you ask for one, and a signature for your terms.

## 4. A photo in the chat

Nothing makes an owner happier than a photo of their freshly groomed dog. Send it in the same conversation as the booking, from your phone in the Colvy app.

\`\`\`chat
title: Muddy Paws · SMS
you: All done! Biscuit was a superstar today 🐾 (photo attached). He’s ready whenever you are.
them: OMG look at him!! Thank you so much
you: Our pleasure! If you have a moment, a Google review really helps us: [link]
\`\`\`

That’s also the moment to ask for a review, while they’re delighted. Reply to every Google review from the inbox.

## 5. Calls while your hands are full

You can’t answer the phone mid-groom. Turn on [missed-call text back](/phones/missed-call-text-back) so a caller you missed gets a text from your business number with your booking link, and their reply lands in the same conversation.

![A small dog in a yellow hoodie](/blog/pet-groomers-walkers-trainers/dressed.jpg "Missed calls get a text with your booking link, so the next booking isn’t lost.")

## Getting started

1. Connect your business number, Instagram, Facebook and website chat.
2. Add your grooms, walks and classes, with where they happen and how long they take.
3. Book your regulars on repeat.
4. Turn on reminders, the waitlist and missed-call text back.

For more on regulars and waitlists, read [our guide for salons, clinics and groomers](/blog/appointments-regulars-waitlist). [Start free](/signup) today.`,
  },
  {
    slug: 'florists-cake-makers',
    cover: '/blog/florists-cake-makers/cover.jpg',
    title: 'Florists, cake makers and gift shops: custom orders without the back-and-forth',
    excerpt: 'Custom orders start as a conversation: a photo, a budget, a date. How florists, cake makers and gift shops quote with a deposit, book the delivery day from the chat and get ready for Mother’s Day, with Colvy.',
    seoDescription: 'How florists, cake makers and gift shops use Colvy to quote custom orders with a deposit, book delivery days from the chat and plan busy days like Mother’s Day.',
    category: 'Industry guides', accent: PINK, icon: 'cart',
    date: '2026-11-14T00:20:00+11:00', dateLabel: 'Nov 14, 2026', readTime: '8 min read', author: 'The Colvy Team',
    takeaways: [
      'Custom orders arrive on every channel. Keep them in one inbox with the photos and details together.',
      'Quote with a deposit the customer pays straight after accepting, so the date is locked in.',
      'Book the delivery day from the conversation, so it lands on the team calendar.',
      'Plan the big days early: tag customers and send one message before Mother’s Day or Valentine’s Day.',
    ],
    content: `At a made-up florist, Petal & Stem, a wedding enquiry arrives on Instagram with five inspiration photos. A cake order comes in by email for a 40th. Someone rings to ask whether tomorrow’s delivery can go to a different address. And Mother’s Day is three weeks away.

Florists, cake makers, bakeries that take custom orders and gift shops all run on the same thing: custom orders that start as a conversation. Here’s how that works in Colvy.

## 1. Every order conversation in one place

Instagram and Facebook messages, website chat, texts, email and calls all land in [one inbox](/product/inbox). The inspiration photos, the date and the budget stay in one thread, and anyone on the team can pick it up.

If you sell online with WooCommerce or Shopify, the customer’s [orders](/product/orders) sit beside the conversation, so “has my order shipped?” takes one look.

## 2. Quote the custom order, with a deposit

For a wedding, an event or a three-tier cake, send a proper quote with [Jobs & Services](/product/jobs): line items from your price list, a discount if you want one, Australian GST worked out to the cent, and your terms. Ask for a deposit to secure the date.

The customer opens the quote on their phone, taps **Accept** (typing their name to agree), and pays the deposit by card straight away.

\`\`\`chat
title: Sweet Layers Cakes · Instagram
them: Hi! Could you do a three-tier naked cake with fresh berries for 20 March? About 80 guests
you: We’d love to! Here’s your quote: [quote link]. A 30% deposit locks in the date.
event: Quote accepted · deposit paid
them: Done! So excited 🎂
\`\`\`

![A white layered cake topped with fresh berries](/blog/florists-cake-makers/cake.jpg "A quote with a deposit locks the date in, without a week of back-and-forth.")

Need to see something first? Send a photo request link and the customer uploads pictures from their phone into the conversation: the venue, the dress colour, the cake they loved.

## 3. Book the delivery day from the chat

Flowers and cakes are delivered on a day, not tracked across the country. [Schedule the delivery from the conversation](/blog/schedule-deliveries-in-the-chat): the address and phone are filled in, you pick a day and a window, and add notes for the driver. It goes on the team calendar, and a “Delivery scheduled” card appears in the conversation. Reschedule or mark it delivered from the same place.

Take the balance with a [payment link](/solutions/payments) in the chat before the big day.

## 4. Plan the big days early

Mother’s Day, Valentine’s Day, Christmas and Easter can be half your year. Get ahead of them:

- **Tag customers** as you go: **wedding**, **corporate**, **Valentine’s last year**.
- **Send one message** to the right tag a few weeks out, by [email or SMS](/email-sms-marketing). The AI campaign builder can draft it from a sentence, and you check it before it sends.
- **Make one tracked link** for the counter poster and your Instagram bio, so you know which brought orders in.

![Chocolate cake with piped swirls](/blog/florists-cake-makers/chocolate.jpg "One well-timed message before the big day beats a month of posts.")

## 5. Notify the customer, or don’t

When you complete, cancel or refund an order, Colvy normally lets the customer know. For a surprise, untick **Notify customer**, and nothing is sent to them. Handy when the person who ordered isn’t the person who’d see the text.

## Getting started

1. Connect Instagram, Facebook, email, website chat, your number and your store.
2. Add your price list and quote terms, with your deposit.
3. Tag your past customers by occasion.
4. Plan one message for the next big day.

Our [local marketing playbook](/blog/local-business-marketing) has more ideas. [Start free](/signup) today.`,
  },
  {
    slug: 'tattoo-beauty-studios',
    cover: '/blog/tattoo-beauty-studios/cover.jpg',
    title: 'Tattoo, lash and brow studios: consults, deposits and fewer no-shows',
    excerpt: 'Most enquiries arrive on Instagram with a reference photo. How tattoo, lash, brow and beauty studios turn DMs into booked consults, take deposits, collect consent forms and cut no-shows, with Colvy.',
    seoDescription: 'How tattoo, lash and brow studios use Colvy: turn Instagram DMs into booked consults, take deposits, collect consent forms with a signature and cut no-shows.',
    category: 'Industry guides', accent: PURPLE, icon: 'pen',
    date: '2026-11-14T00:10:00+11:00', dateLabel: 'Nov 14, 2026', readTime: '7 min read', author: 'The Colvy Team',
    takeaways: [
      'Answer Instagram DMs from a shared inbox, so enquiries don’t sit unread while you work.',
      'Book consults and sessions online, with a deposit for anything long or custom.',
      'Collect reference photos in the conversation, and consent forms with a signature before the day.',
      'Reminders with “reply C to confirm” and a waitlist for cancellations keep the chair full.',
    ],
    content: `At a made-up studio, Inkwell Tattoo, nearly every new client starts in Instagram DMs: a photo of an idea, “how much?” and “when can you fit me in?”. The artists answer between sessions, if they remember. Deposits are chased by text. Consent forms are on paper at the desk. And a no-show on a full-day session costs the whole day.

Lash, brow, nail and beauty studios have the same problems on a smaller scale. Here’s how they run in Colvy.

## 1. Answer the DMs

Instagram and Facebook messages land in [one inbox](/channels/meta) with your texts, email and website chat, so the whole studio can see what’s waiting and who’s answering. Reference photos stay in the thread with the client’s history.

[AI agents](/ai-agents) can answer the common questions straight away (prices, how consults work, aftercare basics) from what you’ve taught them, and pass anything about a design to an artist.

\`\`\`chat
title: Inkwell Tattoo · Instagram
them: Hi! Could I get something like this on my forearm? (photo) How much and when are you free?
you: Love this! Forearm pieces like this usually take one session. Book a free 15-minute consult and we’ll quote it properly: [booking link]
them: Booked for Tuesday 👍
\`\`\`

## 2. Consults, sessions and deposits

On your [booking page](/product/booking), set up what clients book: **Free consult (15 min)**, **Half-day session**, **Lash full set**, **Brow lamination**. For each, choose the artist, how long it runs, a buffer to clean down, and payment: none, a **deposit**, or the full price, by card through your own Stripe account.

Set your cancellation window, and whether late cancellations are allowed or blocked online. A deposit plus reminders is the most reliable way to protect a long session.

## 3. Forms and photos before the day

- **Consent forms** with [Colvy forms](/channels/forms): the questions you need, a date of birth, and a **signature** field. Send the link with the booking, so it’s done before they sit down. Check your state’s rules on what you must ask and keep.
- **Reference photos:** send a photo request link, and the client uploads pictures straight into the conversation.
- **What to expect:** put prep and aftercare basics in the note on your booking confirmation, and keep a saved reply for the full aftercare text (type “/” in the reply box).

![Hands having nails painted at a salon](/blog/salon-barber-no-shows/nails.jpg "Consent forms and prep notes done before the client sits down.")

## 4. Fewer no-shows, fuller books

Reminders go out a day before (text and email) and two hours before (text), and clients reply **C** to confirm or **R** to reschedule. When someone does cancel, the [waitlist](/product/waitlists) offers the freed-up time to clients waiting for a spot, and the first to book gets it.

For regulars (lash infills every two to three weeks, say) book them on repeat in one step, for up to 26 visits.

## 5. Healed photos and reviews

A few weeks after a tattoo, a short message asking for a healed photo brings clients back into the conversation, and it’s the right moment to ask for a review. Reply to every Google review from the inbox. For lash and brow clients, a “time for your next one?” message a set number of days after a booking does the rebooking for you.

## Getting started

1. Connect Instagram, Facebook, your number and website chat.
2. Add consults and sessions with artists, buffers and deposits.
3. Build your consent form, and add the link to your confirmation note.
4. Turn on reminders and the waitlist.

Read our [guide to no-shows for salons and barbers](/blog/salon-barber-no-shows) for more. [Start free](/signup) today.`,
  },
  {
    slug: 'accountants-bookkeepers-lawyers',
    cover: '/blog/accountants-bookkeepers-lawyers/cover.jpg',
    title: 'Accountants, bookkeepers and lawyers: client messages, documents and calls in one place',
    excerpt: 'Client emails in three inboxes, documents arriving by text, calls nobody wrote down, and fixed-fee work agreed in a long email chain. How professional services firms keep it together in Colvy.',
    seoDescription: 'How accountants, bookkeepers and law firms use Colvy: one shared inbox for client email, texts and calls, files kept with the conversation, and online quotes.',
    category: 'Industry guides', accent: BLUE, icon: 'briefcase',
    date: '2026-11-14T00:00:00+11:00', dateLabel: 'Nov 14, 2026', readTime: '8 min read', author: 'The Colvy Team',
    takeaways: [
      'Put the shared mailbox, texts and calls in one inbox, with each client’s history together.',
      'Files clients send stay with the conversation, as proper file cards, not lost in a phone.',
      'Calls can be recorded, transcribed and summarised, so nothing a client said is lost.',
      'Quote fixed-fee work online, with your terms and a deposit, and book meetings by video or phone.',
    ],
    content: `A made-up bookkeeping practice, Ledger & Co, has four staff and one shared “hello@” mailbox. Clients email, text a partner’s mobile, ring the office and send receipts as photos. At tax time it all doubles. Nobody is sure who replied to whom, and the receipt photo from March is somewhere in someone’s phone.

Accountants, bookkeepers, lawyers, conveyancers and financial advisers all deal with the same thing: a lot of client communication that needs to be kept together, answered by the right person, and never lost.

## 1. One inbox for the whole practice

Connect your shared mailbox (Gmail or any other) and your business number to Colvy, and client emails, texts, calls and website chat all land in [one inbox](/product/inbox). Assign each conversation to the person handling it, and everyone can see what’s waiting and who has it.

Each client’s conversations sit on one contact with their history, so whoever picks it up has the context.

## 2. Documents that stay with the client

When a client emails a PDF or texts a photo of a receipt, it appears in the conversation as a proper file card, with the file name and type, and it stays there. Need something specific? Send a photo or document request link and the client uploads from their phone.

\`\`\`chat
title: Ledger & Co · SMS
them: Hi! Here’s the receipt for the new work laptop (photo)
you: Thanks Dan, got it. It’s with the rest of your messages to us, so it’s ready when we do your return.
\`\`\`

> [!WARNING] Keep the sensitive stuff off SMS
> Don’t ask clients to text tax file numbers, passwords or full bank details. Use a secure upload or your practice software for those.

## 3. Calls written up for you

Calls can be recorded, transcribed and summarised in the conversation, with draft follow-up tasks (on the Inbox and Everything plans). If a client rings to say “my wife is now a director”, it’s in the file, not a sticky note. Tell callers when calls are recorded: you can add it to your menu greeting. Our [guide to call recording and summaries](/blog/call-recording-summaries-analytics) covers the details.

![A person signing a document with a pen](/blog/accountants-bookkeepers-lawyers/signing.jpg "Agree fixed-fee work online, with your terms and a deposit.")

## 4. Quotes for fixed-fee work

For fixed-fee jobs (a tax return, a company set-up, a conveyance) send a quote with [Jobs & Services](/product/jobs): line items from your price list, Australian GST worked out to the cent, and your terms. The client accepts online by typing their name, and pays a deposit by card straight after if you ask for one.

## 5. Meetings by video, phone or in person

Put your meeting types on your [booking page](/product/booking): **Free 15-minute call**, **Tax return review (video, 45 min)**, **Initial consultation (in person)**. Add your video link to the service, and it’s in every confirmation. Reminders go out before each one.

## 6. Tasks and internal notes

Turn a conversation into a [task](/product/tasks) with a due date and an owner. Leave an internal note for a colleague and @mention them, and they get notified, without the client seeing anything.

![Colleagues talking at a table with laptops](/blog/accountants-bookkeepers-lawyers/meeting.jpg "Internal notes and @mentions keep the team in the loop, never the client.")

## 7. Tax time and reminders

Tag clients by service (**BAS quarterly**, **individual returns**, **SMSF**) and send one [email campaign](/email-sms-marketing) when it’s time to send documents in, to just the people it applies to. Colvy skips anyone who has unsubscribed.

## Getting started

1. Connect your shared mailbox, business number and website chat.
2. Invite your team and assign conversations.
3. Add your meeting types and your fixed-fee price list.
4. Tag clients by service.

Read about [files in every conversation](/blog/files-in-every-conversation) for more on documents. [Start free](/signup) today.`,
  },
  {
    slug: 'photographers-event-venues',
    cover: '/blog/photographers-event-venues/cover.jpg',
    title: 'Photographers and event venues: from enquiry to booked date',
    excerpt: 'Enquiries on Instagram, email and the website form, packages quoted with a deposit, a run sheet that lives in someone’s inbox, and the balance chased the week before. How photographers and venues run it in Colvy.',
    seoDescription: 'How photographers, videographers and event venues use Colvy: every enquiry in one inbox, packages quoted with a deposit, tours booked online and balances paid.',
    category: 'Industry guides', accent: TEAL, icon: 'camera',
    date: '2026-11-13T23:50:00+11:00', dateLabel: 'Nov 13, 2026', readTime: '8 min read', author: 'The Colvy Team',
    takeaways: [
      'The first business to reply clearly usually wins the booking. Answer every enquiry from one inbox.',
      'Quote packages online with your terms and a deposit, so the date is locked in when they accept.',
      'Let couples and clients book a call or a venue tour online.',
      'Collect the run sheet with a form, and take the balance with a payment link before the day.',
    ],
    content: `A made-up wedding photographer, Golden Hour Studio, gets enquiries on Instagram, by email and through a website form, usually from couples who’ve messaged five other photographers the same night. A made-up venue, The Glasshouse, runs tours on Saturdays, quotes every event by hand, and chases balances the week before.

Photographers, videographers, DJs, celebrants and event venues sell dates. Here’s how to win more of them, and run them smoothly, in Colvy.

## 1. Every enquiry, answered fast

Instagram, Facebook, email, website chat and texts land in [one inbox](/product/inbox). Anyone on the team can see new enquiries and reply, and [AI agents](/ai-agents) can answer the common questions (packages, travel, what’s included) from what you’ve taught them, out of hours.

\`\`\`chat
title: Golden Hour Studio · Instagram
them: Hi! Are you free on Saturday 14 March? And what are your packages?
ai: Hi, and congratulations! Our wedding packages start with 6 hours of coverage. Want to book a quick call to check your date and talk it through? [booking link]
them: Yes! Booked for Thursday
\`\`\`

## 2. Calls and tours booked online

Put **Free 20-minute call (video)** or **Venue tour (30 min)** on your [booking page](/product/booking). Add your video link to the call, and it’s in every confirmation. Reminders go out the day before. For Saturday tours, set the times you run them and let people pick.

![A camera lens on a dark table](/blog/photographers-event-venues/camera.jpg "Let couples book a call while they’re still excited.")

## 3. Quote the package, with a deposit

Send a proper quote with [Jobs & Services](/product/jobs): your packages and extras from your price list, Australian GST worked out to the cent, and your terms. The client accepts online by typing their name, and pays the deposit by card straight after, which secures the date.

## 4. The run sheet and the details

Build a questionnaire with [Colvy forms](/channels/forms): the timeline, the addresses, the must-have shots, the supplier contacts, dietary requirements for a venue. Send it a month out, and the answers come back into Colvy.

On the day, the job holds the details everyone needs: who’s working, a checklist, photos and notes. Team members see the jobs they’re on.

![A long table set for a celebration](/blog/photographers-event-venues/tables.jpg "One place for the timeline, the suppliers and who’s working.")

## 5. The balance, then the review

Take the balance with a [payment link](/solutions/payments) in the conversation a week or two before. After the event, ask for a review while they’re still glowing, and reply to every Google review from the inbox.

## Getting started

1. Connect Instagram, Facebook, email, website chat and your number.
2. Add your call or tour to your booking page.
3. Add your packages and terms to your price list, with your deposit.
4. Build your run sheet questionnaire.

[Start free](/signup) and answer your next enquiry first.`,
  },
  {
    slug: 'home-services-garden-pool-pest',
    cover: '/blog/home-services-garden-pool-pest/cover.jpg',
    title: 'Gardeners, pool and pest businesses: regular visits, quotes and happy customers',
    excerpt: 'Fortnightly mows, monthly pool services, a yearly pest treatment and one-off jobs that need a quote. How home service businesses run regular visits, quotes and jobs from their phone in Colvy.',
    seoDescription: 'How gardeners, lawn mowing, pool and pest control businesses use Colvy: regular visits on repeat, quotes accepted online, jobs with photos, missed-call texts.',
    category: 'Industry guides', accent: GREEN, icon: 'calendar',
    date: '2026-11-13T23:40:00+11:00', dateLabel: 'Nov 13, 2026', readTime: '7 min read', author: 'The Colvy Team',
    takeaways: [
      'Book regular visits on repeat at the customer’s address, with a reminder before each one.',
      'Quote one-off work online, with GST and a deposit, and turn it into a job when accepted.',
      'Use a checklist and photos on the job, so customers know what was done.',
      'Send seasonal reminders to the right customers, like a spring pest treatment.',
    ],
    content: `A made-up lawn and garden business, Greenline, mows about forty lawns a fortnight and quotes hedges, clean-ups and garden beds in between. A made-up pool business services pools monthly and gets a flood of calls when the weather warms up. A made-up pest controller does yearly treatments for most of its customers.

Home service businesses share a rhythm: regular visits, plus one-off jobs that need a quote. Here’s how that runs in Colvy.

## 1. Regular visits on repeat

Set your regular service up on your [booking page](/product/booking) to happen **at the customer’s address**: **Lawn mow (fortnightly)**, **Pool service**, **General pest treatment**. Then open the first confirmed booking and repeat it every 1, 2, 3, 4, 6, 8 or 12 weeks, for up to 26 visits. Colvy checks the dates first, skips any that clash, and sends the customer one message with every date.

Each visit gets a reminder, and customers can reply **C** to confirm or **R** to reschedule. If rain pushes a visit back, move the booking and Colvy texts the customer the new time.

![A freshly mown lawn](/blog/home-services-garden-pool-pest/lawn.jpg "Book the fortnightly mow once, and the reminders do the rest.")

## 2. Quotes for one-off work

For the hedge, the clean-up or the termite treatment, send a quote with [Jobs & Services](/product/jobs): items from your price list, Australian GST worked out to the cent, your terms, and a deposit if you want one. The customer accepts online and pays the deposit straight after, and the quote becomes a job.

Need to see it first? Send a photo request link, and the customer uploads photos of the garden or the pool from their phone.

## 3. Jobs with a checklist and photos

The job holds what the team needs: who’s on it (with a warning if it clashes with something else), a checklist, before-and-after photos, time on the job and the customer’s signature if you need one. Team members see only the jobs they’re on.

\`\`\`chat
title: Greenline Gardens · SMS
you: Hi Sue, all done at 8 Wattle Ave: hedges trimmed and green waste taken away (photos attached). Here’s the payment link: [link]
them: Looks amazing, paid. Thanks!
\`\`\`

## 4. Calls when you’re outside

The phone rings when you’re on the mower. [Missed-call text back](/phones/missed-call-text-back) texts callers you couldn’t answer, from your business number, with your booking link. Or [forward calls to your mobile](/phones/call-forwarding) only after hours.

## 5. Seasonal reminders

Tag customers by service (**pest yearly**, **pool**, **hedges**) and send one [text or email](/email-sms-marketing) before the season: “Spring is when ants and spiders move in. Want us to book your yearly treatment?” Colvy skips anyone who has opted out, and replies land in the inbox.

![A garden trowel and fresh soil](/blog/home-services-garden-pool-pest/garden.jpg "One seasonal message to the right customers fills next month.")

## Getting started

1. Connect your number, Facebook and website chat.
2. Add your regular services at the customer’s address, and book your regulars on repeat.
3. Add your price list and quote terms.
4. Turn on missed-call text back.

Read our [cleaning business guide](/blog/cleaning-business-guide) and [trades guide](/blog/trades-quotes-jobs-guide) for more on quotes and jobs. [Start free](/signup) today.`,
  },
]
