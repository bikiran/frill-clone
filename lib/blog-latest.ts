import type { BlogPost } from '@/lib/blog'

// The newest articles (November 2026), kept here so lib/blog.ts doesn't keep
// growing. Same rules as the rest of the blog: Colvy's own writing about what
// the product actually does, with made-up example businesses and no invented
// numbers, quotes or customers.

const CORAL = '#ff6a4d', BLUE = '#2b59ff', PURPLE = '#7c5cff', GREEN = '#00c48c', TEAL = '#0d9488'

export const LATEST_POSTS: BlogPost[] = [
  {
    slug: 'restaurant-reservations-guide',
    cover: '/blog/restaurant-reservations-guide/cover.jpg',
    title: 'Full tables, fewer no-shows: a practical table bookings guide for restaurants and cafés',
    excerpt: 'How to set covers and pacing so the kitchen keeps up, how long to hold a table, when a deposit is worth asking for, what to do about no-shows and how to run a Friday night from one sheet. With checklists you can use this week.',
    category: 'Industry guides', accent: CORAL, icon: 'utensils',
    date: '2026-11-06T21:00:00+11:00', dateLabel: 'Nov 6, 2026', readTime: '9 min read', author: 'The Colvy Team',
    takeaways: [
      'Set covers and pacing from what your kitchen and floor can handle, not from the number of chairs.',
      'Hold tables for a time that suits the party size, and let the floor plan pick the table.',
      'Ask for deposits where a no-show really costs you: bigger groups and your busiest nights.',
      'Make changing or cancelling easy, so you hear about it in time to rebook the table.',
      'Let guests tell you they’ve arrived, so the host stand isn’t a queue on a busy night.',
    ],
    content: `It’s 7:40 on a Friday. The table of eight booked for 7:30 still hasn’t shown. A couple has walked in and is hovering at the door, the phone is ringing with someone asking about 8 o’clock, and the kitchen has just received five tables’ orders at once because everyone arrived at the same time.

Every restaurant has had that night. Most of it isn’t bad luck. It comes down to a handful of decisions: how many guests you take at once, how quickly they arrive, how long a table is held, who pays a deposit and how easy it is to cancel.

This guide goes through each one, with numbers to start from and checklists you can use this week. Where Colvy’s [table reservations](/product/reservations) help, we’ll show how.

## 1. Start with the kitchen, not the chairs

The number of chairs in your dining room is the wrong place to start. Two limits matter more:

- **Covers at once.** The most guests you can have seated at the same time. It’s usually lower than your chair count, because a four-top seating two is still a full table.
- **Pacing.** The most guests who can arrive in any 15 or 30 minutes. This is what protects the kitchen from the 7:30 wave.

To find your numbers:

1. Think back to your last few busy nights. When did the pass start to back up? Count how many guests sat down in the half hour before, and set your pacing a little under it.
2. Set covers at once to what your floor team can look after well, not to the room’s capacity.
3. Look again after two weeks of service, and adjust.

In Colvy you set both: the most guests seated at once and, if you want it, the most arriving in each interval. Online bookings can’t go over either limit. Your team can, after a warning, when a regular rings or a walk-in turns up.

> [!TIP] Keep a little back for walk-ins
> If walk-ins are a big part of your trade, set covers a few seats below your real capacity and keep one or two tables off the online booking page. Then there’s always something to offer at the door.

## 2. Hold each table for the right length of time

A quick dinner for two and a birthday for ten don’t need the same table time. Set durations by party size, and include the time it takes to clear and reset.

| Party size | A starting point for dinner |
|---|---|
| 1 to 2 | 1 hour 30 minutes |
| 3 to 4 | 1 hour 45 minutes |
| 5 to 8 | 2 hours |
| 9 or more | 2 hours 30 minutes |

Adjust for how you serve: a café brunch turns faster, a banquet slower. If a table regularly runs over, lengthen its time rather than rushing guests out.

Book **seating times, not opening hours**. If the kitchen closes at 9:30pm, your last booking might be 8:45pm. A minimum notice of an hour or so stops bookings landing for tables that are about to be seated.

![A restaurant bar and dining room set for evening service](/blog/restaurant-reservations-guide/bar.jpg "Book seating times, not opening hours: the last table sits down well before the kitchen closes.")

## 3. Let the floor plan do the puzzle

Tell your booking system the party range for each table, which tables push together, which you keep back for walk-ins or regulars, and which are out of action, and it can work out who sits where.

In Colvy you draw your rooms and tables. Each booking gets the smallest free table that fits, then the smallest free combination, unless your team picks a different one. Pushed-together tables can’t also be booked on their own, so nothing is double-booked. The live floor plan shows which tables are free, booked, seated, late or out of action, and you can seat a walk-in at a free table in a tap.

> [!EXAMPLE] A made-up 40-seat bistro
> Six two-tops, five four-tops and a long table for ten. Two of the two-tops push together to make a four, and two of the four-tops make an eight. The long table and the window two-tops are kept off the online booking page, for groups who ring and for walk-ins.

![Friends sharing dinner at a long restaurant table](/blog/restaurant-reservations-guide/group.jpg "Bigger groups are where a no-show hurts most, and where a deposit makes the most sense.")

## 4. Deposits: use them where a no-show really costs you

A deposit isn’t a punishment. It’s a small commitment that makes people more likely to turn up, or to tell you they can’t. Use it sparingly: for **bigger groups**, on **your busiest nights and dates** (Fridays, Saturdays, Mother’s Day, New Year’s Eve) and for **repeat no-shows**. Skip it for a couple booking a quiet Tuesday.

Write the policy plainly and show it before anyone pays:

> [!NOTE] A deposit policy you can adapt
> For groups of 8 or more on Friday and Saturday nights, we take a deposit of $20 a guest when you book. It comes off your bill on the night. If you cancel online more than 24 hours before, we refund it in full. After that, or if you don’t come, we keep it.

In Colvy, deposits are paid by card through your own Stripe account. Ask per guest or per booking, from a party size you choose and only on the days you choose. While a guest pays, their table is held for 30 minutes. If they cancel online before your cut-off, the deposit is refunded automatically. After that, or for a no-show, it’s kept.

> [!TIP] Put surcharges on the booking page too
> If you add a surcharge on public holidays or Sundays, mention it in the introduction on your booking page as well as on the menu. The ACCC expects surcharges to be clear before people order, and nobody likes a surprise on the bill.

## 5. Make changing or cancelling easy

It sounds backwards, but the best way to cut no-shows is to make it easy for people to tell you they can’t come. Every booking should come with:

- **A confirmation straight away,** with the date, time, party size and a link to change or cancel.
- **Calendar buttons,** so the booking sits in their phone’s calendar.
- **A reminder** before the night.
- **A clear cut-off,** such as changes online until 24 hours before, then a phone call.

Colvy’s confirmation email shows the date on a tile with the details, buttons to change or cancel, and Google Calendar and Apple and Outlook buttons. A reminder follows, and guests change or cancel from their booking page until your cut-off. With [customer accounts](/product/customer-accounts) on, guests can also pay a deposit for a table being held, and book again in one tap: it opens your table page for the same party size, with their details filled in.

> A guest who cancels at 3pm has given you hours to rebook the table. Make that the easy option.

## 6. No-shows: count them, then act

You can’t fix what you don’t count. Mark no-shows the same way every time, then decide on a simple rule:

- **First no-show:** a friendly text. Things happen.
- **Second:** ask for a deposit next time they book online.
- **Third:** ask them to call to book, so you can talk it through.

\`\`\`chat
title: The Corner Bistro · SMS
you: Hi Josh, we missed you last night at 7:30. Hope everything’s OK! If you’d like to rebook, our booking page is always open.
them: So sorry, my daughter was sick and I completely forgot to cancel. Will book again soon!
\`\`\`

Colvy can do the counting. It can mark a booked table as a no-show a set number of minutes after its time if nobody seated it (undo it if they turn up late), ask guests with past no-shows for a deposit, and stop repeat no-shows from booking online, so they call instead. Each guest’s visits and no-shows sit beside their conversation in the inbox, with notes such as allergies, birthdays and VIP.

## 7. Arrivals without a crowd at the door

On a busy night the host stand is a bottleneck, and in a café a booked table can go to the queue because nobody saw the booker come in.

Colvy’s **“I’m here”** button helps. From 30 minutes before the booking, the guest’s booking page (the link in their confirmation) shows a big “I’m here” button. When they tap it, your team gets a bell alert and a push on their phones, a note goes into the guest’s conversation, the day sheet shows “Here” with the time, and their table glows on the floor plan.

Add a line to your confirmation note: “When you arrive, tap I’m here on your booking page and we’ll come and find you.”

[See how “I’m here” works](/product/check-in)

![A busy café with tables, plants and a counter](/blog/restaurant-reservations-guide/cafe.jpg "In a café, knowing who’s arrived stops a booked table from going to the queue.")

## 8. Missed calls during service

Nobody can answer the phone at 7:30 on a Saturday. With a Colvy business number, callers you miss get a text with your table booking link, so they can book while they’re keen instead of ringing the place down the road.

---

## A Friday night run sheet

**Before service**

- Check the day sheet: covers for each sitting, big tables and deposits paid.
- Read the notes: allergies, VIPs, birthdays and other occasions.
- Give a table to any booking that doesn’t have one yet.
- Mark any tables that are out of action.

**During service**

- Watch for “Here” and “Late” on the sheet, and seat walk-ins at free tables from the floor plan.

**After service**

- Check the night’s no-shows, and send a friendly text to anyone who missed their booking.
- Note where pacing went wrong, and adjust it for next week.

## Settings to start from

| Setting | A sensible start |
|---|---|
| Seating times | The first and last booking time for each service |
| Pacing | Just under what the kitchen handled on your last busy night |
| Covers at once | What your floor team can look after, not your chair count |
| Table times | By party size, from 1 hour 30 minutes for two |
| Deposits | Groups of 8 or more, Fridays and Saturdays, per guest |
| Changes online | Until 24 hours before |
| No-shows | Marked after 20 minutes, a deposit after 2, a phone call after 3 |

> [!TRY] Set it up in Colvy
> - Table reservations are on for restaurant and hospitality businesses, and any business can switch them on.
> - Set your seating times, covers, pacing and table times by party size.
> - Draw your floor plan, mark tables that push together and choose which ones can be booked online.
> - Add deposit and no-show rules, then share your booking page on Instagram, Google and your website.

[See table reservations](/product/reservations), [see Colvy for restaurants](/for/restaurants) or [start free](/signup).`,
  },
  {
    slug: 'trades-quotes-jobs-guide',
    cover: '/blog/trades-quotes-jobs-guide/cover.jpg',
    title: 'Quote, book, sign off: a tradie’s guide to running jobs without the paperwork pile',
    excerpt: 'Quotes customers say yes to, GST done properly, a schedule without double-bookings and jobs that finish with photos and a signature. A practical guide for electricians, plumbers, cleaners, removalists and other trades.',
    category: 'Industry guides', accent: BLUE, icon: 'briefcase',
    date: '2026-11-06T20:00:00+11:00', dateLabel: 'Nov 6, 2026', readTime: '9 min read', author: 'The Colvy Team',
    takeaways: [
      'A quote the customer can accept on their phone gets answered faster than a PDF in their inbox.',
      'Quote homeowners including GST, with the GST on its own line, and only charge GST if you’re registered.',
      'Check who’s free before you book them in, not on the morning of the job.',
      'Before and after photos, a checklist and a signature settle most disputes before they start.',
      'Keep the quote, the job and the conversation together, so nobody has to ask “where are we up to?”',
    ],
    content: `Sunday night, and you’re catching up on the week. Two quotes are half-written in the notes app on your phone. Next week’s jobs are in a paper diary, except the one your apprentice booked in the group chat. The photos from Thursday’s job are somewhere in your camera roll, between the kids’ soccer and a picture of a switchboard. And a customer has texted to ask whether you got their email accepting the quote. You’re not sure you did.

None of this is hard work. It’s just scattered, and scattered is where jobs get lost, double-booked or argued about.

This guide is about getting the paper side of a trade business into one place: quotes people say yes to, GST done properly, a schedule without clashes, and jobs that finish with proof. It’s written for electricians, plumbers, builders, cleaners, removalists, handymen and anyone else who quotes, books and does the work. Where Colvy’s [jobs and quotes](/product/jobs) help, we’ll show how.

## 1. A quote that’s easy to say yes to

A good quote answers the customer’s questions before they ask them. Use this checklist:

- **A clear title.** “Replace 250L electric hot water system”, not “Job 214”.
- **Lines a homeowner understands.** Labour (hours and rate), materials, call-out or travel, and disposal.
- **The total including GST,** with the GST shown on its own line.
- **What’s included and what isn’t.** “Doesn’t include patching or painting.”
- **How long it’s valid for.** Material prices move, and 30 days is common.
- **Your terms.** Payment, the deposit and what happens if they cancel.
- **One easy way to accept.** Not “print it, sign it, scan it and email it back”.

That last one matters most. A PDF attached to an email gets “looks good, I’ll let you know”, and then nothing. A link they can open on their phone and accept in ten seconds gets an answer.

\`\`\`chat
title: Harbourline Plumbing · SMS
you: Hi Liam, here’s the quote for the hot water replacement. You can accept it online, and the deposit locks in Thursday morning.
card: Quote Q-1042 · Hot water replacement | $1,900.00 incl. GST · $190.00 deposit | View and accept
event: Liam accepted the quote and paid the deposit
\`\`\`

In Colvy you build the quote from your price list (labour, materials, travel and fees) or from a saved template, add a discount if you like, and send it by text, email or link. The customer sees every line and the GST, and accepts by typing their name, or declines with a reason, which is worth knowing too. If you ask for a deposit and take card payments through Stripe, they pay it as they accept. If they ring to say yes instead, mark it accepted yourself.

Need to change something? Revise the quote and send the new version. Once one is accepted, the others for that job are withdrawn, so nobody accepts an old price by mistake.

![House plans on a desk with a pencil and ruler](/blog/trades-quotes-jobs-guide/plans.jpg "A good quote answers the customer’s questions before they ask them.")

## 2. GST on quotes, without the calculator

A quick refresher for Australian trades:

- **Registering.** You must register for GST once your turnover reaches $75,000 a year. Below that, it’s your choice.
- **Only charge it if you’re registered.** If you’re not, don’t add GST and don’t show it.
- **Quote homeowners the total.** People compare the number at the bottom, so quote including GST and show how much of it is GST.
- **The maths.** In a price that includes GST, the GST is one-eleventh. A $1,900 quote includes $172.73 of GST.
- **Business customers** often prefer prices shown without GST, because they claim it back.

Colvy works out the GST on every quote: 10% by default, with prices either including or excluding GST, and a setting for when you’re not registered. Lines that don’t attract GST are kept separate, and a discount is shared fairly between taxable and GST-free lines.

> [!NOTE] Tax invoices after the job
> A GST-registered customer, like a landlord or a business, may ask for a tax invoice. If they ask, you need to give them one within 28 days, unless the sale was $82.50 or less including GST. A tax invoice says it’s a tax invoice and shows your business name and ABN, the date, what you supplied with the quantity and price, and the GST. Keep issuing those from your accounting software as usual.

## 3. Book the job without double-booking anyone

Once the quote is accepted, the job needs a time and a person. This is where the group chat lets you down: two people book the same apprentice for Thursday morning, and nobody notices until Thursday morning.

Before you assign someone, check:

- their other jobs that day,
- any appointments customers have booked online with them,
- personal time in their calendar,
- travel between jobs.

Colvy does the first three for you. When you add someone to a job, it checks their other jobs, bookings and calendar events at that time, and if there’s a clash it asks you to confirm before going ahead. Once they’re on the job, that time is blocked on their booking calendar, so customers can’t book them online for it. Everyone added or taken off gets a notification.

Then see the week however suits you:

- **A board,** with columns from New and Quoting through to Scheduled, In progress and Completed. Drag a job across, or let it move on its own: sending a quote moves it to Awaiting approval, and an accepted quote moves it to Scheduled.
- **A calendar,** for the month at a glance.
- **A list,** with search and status filters.

> [!TIP] Put the travel in the job
> If a job takes three hours and the drive takes forty minutes, book three hours and forty minutes. A clash check can only protect time it knows about.

![Spanners and pliers hanging in a tool rack](/blog/trades-quotes-jobs-guide/tools.jpg "The right tool for every job, and one place for the paperwork.")

## 4. On site: four habits that prevent arguments

Most disputes after a job come down to “that was already like that” or “I thought you were doing this as well”. Four habits settle them before they start:

1. **Before photos.** Existing cracks, stains, scratches and old wiring, before you touch anything.
2. **A checklist.** The same steps every time, ticked off as you go, so nothing’s forgotten.
3. **After photos.** The finished job, cleaned up.
4. **A signature.** The customer signs to say it’s done.

In Colvy all four live on the job. Add a saved checklist in one go, and each tick records who did it and when. Photos are saved as before, after or other, with a copy in your media gallery. The customer signs on your phone or tablet, and you can require a signature before a job can be completed. A work timer runs while you’re on site: starting it puts the job in progress, and finishing it stops the clock and completes the job.

> [!EXAMPLE] A saved checklist for a hot water replacement
> - Isolate the power and water
> - Drain and remove the old unit
> - Install the new unit, with a tempering valve where required
> - Refill, check for leaks and test the outlet temperature
> - Show the customer how it works
> - Take the old unit away and clean up

Each person sees their own day in **My jobs**, with directions to each address. And if you’d rather apprentices and subcontractors didn’t see prices, a setting limits anyone who isn’t an owner or admin to the jobs they’re on, without prices, quotes or the price list.

![A person signing a document with a pen](/blog/trades-quotes-jobs-guide/signing.jpg "A signature at the end of the job answers most questions before they’re asked.")

## 5. Start jobs from wherever they come in

Work arrives as a missed call, a text with three photos, a website form or an online booking. Retyping it into a job sheet is where details go missing.

In Colvy, turn the conversation, the booking or the form response straight into a job. The customer’s details come with it, the job links back to where it started, and the quote goes out into the same conversation, so the whole history is in one place when they ring with a question.

## 6. After the job

- **Get paid.** Send a payment link in the conversation. Once it’s paid, the customer can find the receipt in their account with you.
- **Ask for the review** while they’re happy with the work.
- **Keep them in the loop.** With [customer accounts](/product/customer-accounts) on, customers sign in with a code and see the quotes waiting for them and how their jobs are going, without ringing you to ask. If they accepted a quote without paying the deposit, they can pay it by card from there.

> [!WARNING] Home building contracts and deposits
> Most states require a written contract for residential building work above a certain value, and many cap the deposit you can ask for, often at 10% or less. The rules differ by state and by trade, so check with your state’s fair trading or building regulator before you set a default deposit.

---

## Before and after

| Step | The paperwork-pile way | With jobs and quotes in Colvy |
|---|---|---|
| Quote | A PDF attached to an email | A link they open and accept on their phone |
| GST | Worked out on a calculator | Included or added for you, on its own line |
| Booking the job | A diary and a group chat | A board and calendar, with clash checks |
| On site | Photos lost in the camera roll | Checklist, photos, timer and signature on the job |
| “Where are we up to?” | A phone call | Their account shows the quote and the job |

> [!TRY] Set it up in an afternoon
> - Jobs are on for trades, home services and logistics businesses, and any business can switch them on.
> - Set your GST, quote and job numbering, default terms and how long quotes are valid.
> - Add your price list and save a template for your most common job.
> - Create your first job from a conversation, send the quote, and watch for the accept.

[See jobs and quotes](/product/jobs), [see Colvy for service businesses](/for/service-businesses) or [start free](/signup).`,
  },
  {
    slug: 'specialist-retail-receipts-accounts',
    cover: '/blog/specialist-retail-receipts-accounts/cover.jpg',
    title: '“Can you send me the receipt again?” Receipts, tax invoices and customer accounts for specialist shops',
    excerpt: 'Aquarium, pet and other specialist shops sell expensive gear with warranties, to regulars who come back every few weeks and to businesses that need tax invoices. Here’s how to get receipts, regular services and repeat questions off the counter.',
    category: 'Industry guides', accent: TEAL, icon: 'receipt',
    date: '2026-11-06T19:00:00+11:00', dateLabel: 'Nov 6, 2026', readTime: '8 min read', author: 'The Colvy Team',
    takeaways: [
      'Proof of purchase matters most for big-ticket gear: filters, pumps, lights, heaters and the tanks themselves.',
      'A tax invoice needs a few specific things. A receipt without your ABN isn’t one.',
      'Let customers find their own receipts, and you’ll stop hunting for them at the counter.',
      'Run regular services, like tank maintenance, as regular bookings with their own reminders.',
      'Give customers one place for their bookings, quotes, orders, messages and preferences.',
    ],
    content: `It’s Saturday at a made-up aquarium shop, Coral Cove Aquatics. A customer is at the counter with a canister filter that stopped pumping last week. She bought it in March and needs the receipt for the warranty, but she paid at the counter and the paper receipt is long gone. Meanwhile an email has come in from a primary school asking for a tax invoice for the classroom tank they bought last term, and a regular has texted to check that his fortnightly tank service is still on for Thursday.

Specialist shops, whether aquarium, pet, hobby, bike or outdoor, have more of these moments than most. You sell expensive gear with warranties, to customers who come back every few weeks, and to businesses and schools that need proper paperwork. Here’s how to stop digging through old sales for receipts, and give customers one place to find what they need.

## 1. Why receipts matter more in a specialist shop

- **Big-ticket gear with warranties.** Canister filters, pumps, LED lights, heaters, chillers and the tanks themselves. A warranty claim usually starts with “do you have proof of purchase?”
- **Consumer guarantees.** Under the Australian Consumer Law, customers have rights whatever the warranty says, and a receipt isn’t the only proof of purchase they can use. A card statement can do. But a proper receipt makes it quick for everyone.
- **Business customers.** Schools, offices with feature tanks, cafés, vet clinics and groomers buying supplies need tax invoices to claim their GST credits.
- **Regulars.** The person who buys the same food, conditioner and test kits every month wants to know exactly what they bought last time.

## 2. What makes a receipt a tax invoice

In Australia, a receipt and a tax invoice aren’t the same thing. For a sale under $1,000 including GST, a tax invoice needs to show:

1. that it’s intended to be a tax invoice,
2. your business name,
3. your ABN,
4. the date it was issued,
5. a brief description of what was sold, with the quantity and price,
6. the GST amount, or, if the GST is exactly one-eleventh of the total, a statement like “Total price includes GST”,
7. how much of each sale is taxable, if some of it isn’t.

For sales of $1,000 or more, it also needs the buyer’s name or ABN. A GST-registered customer can ask you for a tax invoice, and unless the sale was $82.50 or less including GST, you need to give them one within 28 days.

> [!TIP] Check it with your accountant
> These are the basics of the ATO’s rules. If you sell a mix of taxable and GST-free items, or often make sales of $1,000 or more, check that your receipts cover your situation.

## 3. Let customers find their own receipts

The simplest way to stop hunting for receipts is to let customers find them. Colvy’s [customer accounts](/product/customer-accounts) give your customers a “Your account” page at your address, like yourname.colvy.com/account. They sign in with a 6-digit code sent to their email or mobile, so there’s no password to forget.

Under **Orders and receipts** they’ll see:

- **in-store sales** through Prexty POS on your WooCommerce store, with the outlet they bought at,
- **online orders** from WooCommerce or Shopify,
- **payment links** they’ve paid.

Each one opens a receipt they can print or save as a PDF. When your business has an ABN in Colvy and the sale includes GST, the store-order receipt is titled “Tax invoice” and shows your ABN and business details, each item with its quantity and price, the total including GST, and the GST on its own line. Payment links show as a receipt, with a link to the card receipt from Stripe. A WooCommerce order also links back to the order in your shop, for returns and changes.

\`\`\`chat
title: Coral Cove Aquatics · SMS
them: Hi, my canister filter has stopped pumping. I bought it back in March. Do you still have my receipt?
you: Sorry to hear that, Ella! It’s in your account with us: tap “Your account” on our website, sign in with the code we text you and open the March order. Bring the filter in and we’ll sort out the warranty.
them: Found it, thanks! I’ll bring it in this arvo.
\`\`\`

And when someone asks for a copy, you don’t need to dig. From the Orders page, or the order card beside their conversation, send the receipt by email or text. They get a private link to the same receipt or tax invoice, ready to view, print or save as a PDF.

> [!TIP] Get a mobile or email at the counter
> Receipts are matched to a customer by their email or mobile number. Make a habit of adding one to every in-store sale, and the sale turns up in their account later.

![A customer paying at a shop counter with a tablet point of sale](/blog/specialist-retail-receipts-accounts/counter.jpg "Add the customer’s mobile or email at the counter, and the receipt is waiting in their account.")

## 4. Regular services on repeat

Plenty of specialist shops sell services as well as stock: tank maintenance, pond cleans, dog washes, nail trims, bike services. The customers who book them want the same time every few weeks, and a reminder before each one.

Set them up as a regular booking. In Colvy, repeat any booking every 1, 2, 3, 4, 6, 8 or 12 weeks, for up to 26 visits. You see which dates are free before you confirm, and any that aren’t are skipped. The customer gets one message with every date:

\`\`\`chat
title: Coral Cove Aquatics · SMS
you: Hi Sam, your regular Tank maintenance at Coral Cove Aquatics is booked every 2 weeks: Thu 3 Dec, Thu 17 Dec, Thu 31 Dec and Thu 14 Jan, at 10:00am. We’ll text a reminder before each visit.
them: Perfect, thanks!
\`\`\`

The email version lists each visit with its own link to change it and attaches a calendar file. Each visit has its own reminders, so moving one doesn’t disturb the rest. In their account, every upcoming visit sits under **Coming up**, with a link to change or cancel it, and **Book again** takes them straight to the booking page for a service they’ve had before, with their details filled in.

![A colourful reef aquarium with corals and fish](/blog/specialist-retail-receipts-accounts/reef.jpg "Fortnightly tank maintenance is a regular booking, not a note in the diary.")

## 5. Quotes for the big jobs

Custom tank builds, installs and fish room fit-outs are quoted jobs. Turn on Colvy’s [jobs and quotes](/product/jobs) and you can send a quote with GST that the customer accepts online. They’ll also find it in their account under **Quotes and jobs**, along with how the job is going, and can pay the deposit on an accepted quote from there.

## 6. Messages and marketing preferences

Two more sections round out the account:

- **Messages.** Their conversation with you. They can reply from their account, and it lands in your shared inbox like any other message.
- **Preferences.** Their name, and whether they want your marketing by email and by text. They’ll still get messages about their bookings, orders and payments.

The second one matters. Under Australia’s Spam Act, marketing messages need consent, need to say who they’re from and need an easy way to unsubscribe. Letting customers change their preferences themselves keeps your list clean and your regulars happy.

![A dog carrying a soft toy](/blog/specialist-retail-receipts-accounts/dog-toy.jpg "Regulars buy the same things every month. Let them see what they bought last time.")

## 7. Setting it up

| Step | What to do |
|---|---|
| Your ABN | Add it to your business details in Colvy, so receipts with GST become tax invoices |
| Your store | Connect WooCommerce (with Prexty POS at the counter) or Shopify |
| Accounts | Turn on customer accounts and choose the sections you use |
| Your website | Add a “Your account” link to your menu and email signature |
| The counter | Ask for a mobile or email with every sale |

And a line for the team:

> [!EXAMPLE] What to say at the counter
> “Can I pop your mobile on the sale? Your receipt will always be in your account on our website, so you’ve got it for the warranty.”

## Questions the counter gets, and where the answer is now

| The question | Where they’ll find it |
|---|---|
| “Can you send my receipt again?” | Orders and receipts, or a link you send from the order |
| “I need a tax invoice for the school” | The same receipt, titled Tax invoice, with your ABN and the GST |
| “Is my tank service still on Thursday?” | Coming up, with a link to change it |
| “Did you get my message?” | Messages, with your reply |
| “Can you stop the promo texts?” | Preferences, where they switch it off themselves |

> [!TRY] Try it on your own orders
> - Add your ABN, connect your store and turn on customer accounts.
> - Sign in to your own account with your mobile, and open a recent order.
> - Print it, and check it has everything your customers need.

For back-in-stock texts, shipment-day campaigns and after-hours care questions, see our [messaging playbook for aquarium and pet stores](/blog/aquarium-pet-store-playbook).

[See customer accounts](/product/customer-accounts), [see receipts and tax invoices](/product/receipts) or [start free](/signup).`,
  },
  {
    slug: 'appointments-regulars-waitlist',
    cover: '/blog/appointments-regulars-waitlist/cover.jpg',
    title: 'Regulars, gaps and the front desk: a booking guide for salons, clinics and groomers',
    excerpt: 'Standing appointments that book themselves, a waitlist that fills cancellations while you work, arrivals without a receptionist, and confirmations that answer the usual questions. A practical guide with settings to copy.',
    category: 'Industry guides', accent: PURPLE, icon: 'repeat',
    date: '2026-11-06T18:00:00+11:00', dateLabel: 'Nov 6, 2026', readTime: '8 min read', author: 'The Colvy Team',
    takeaways: [
      'Book your regulars’ next visits in one go, so the rhythm doesn’t depend on someone remembering.',
      'A cancellation only costs you if nobody hears about the free time.',
      'Offer freed-up times “first to book” for short services, and “one at a time” for long or high-value ones.',
      'Let clients tell you they’ve arrived, and keep your hands on the client in the chair.',
      'Calendar buttons and a clear change link in every confirmation do as much as reminders.',
    ],
    content: `It’s Tuesday at a made-up dog groomer, Sudsy Paws. The 10am cancels by text at 8:15. The groomer is elbow-deep in a double-coated husky when the phone rings, and rings again. A client is sitting in the car park with a nervous cavoodle, unsure whether to come in or wait. And Bella, who has come every six weeks for three years, isn’t booked in for her next groom because nobody remembered to do it at the counter.

Salons, barbers, clinics, physios, massage therapists and groomers all run on the same things: a diary full of regulars, a few gaps you’d love to fill, and a front desk that’s often nobody at all. This guide covers four things that make the biggest difference: booking regulars on repeat, filling cancellations automatically, arrivals without a receptionist, and confirmations that do the work. If no-shows are your main headache, start with [our guide to cutting no-shows](/blog/salon-barber-no-shows), then come back.

## 1. Book your regulars on repeat

Your best clients come back on a rhythm. The risk is that the rhythm depends on someone remembering to book the next visit before they leave.

| Service | A common rhythm |
|---|---|
| Short cut or fade | Every 2 to 4 weeks |
| Colour regrowth | Every 6 to 8 weeks |
| Gel nail infills | Every 2 to 3 weeks |
| Dog groom, double coat | Every 6 to 8 weeks |
| Dog nail trim | Every 4 weeks |
| A course of physio or massage | Weekly or fortnightly |

These are common rhythms, not rules. Ask each client what suits them.

In Colvy, open a confirmed booking and repeat it every 1, 2, 3, 4, 6, 8 or 12 weeks, for up to 26 visits. Before anything is booked you see which dates are free, and any that aren’t are skipped. The client gets one message with every date:

\`\`\`chat
title: Sudsy Paws · SMS
you: Hi Mia, your regular Full groom at Sudsy Paws is booked every 6 weeks: Tue 10 Nov, Tue 22 Dec, Tue 2 Feb and Tue 16 Mar, at 9:30am. We’ll text a reminder before each visit.
them: Perfect, Bella says thanks!
\`\`\`

The email version lists each visit with its own link to change it and attaches a calendar file. Each visit gets its own reminders, so changing one doesn’t touch the rest. When the run is nearly over, extend it from the last visit.

> [!TIP] Book the next one before they leave
> The easiest time to set up a regular booking is at the end of a visit, while the client is at the counter and happy with the result. Ask “Same time in six weeks?” and repeat the booking there and then.

![A hairdresser blow-drying a client’s hair](/blog/appointments-regulars-waitlist/blow-dry.jpg "Your best clients come back on a rhythm. Don’t leave the next visit to memory.")

## 2. Fill cancellations while you work

A cancellation only costs you if nobody hears about the free time. Most businesses keep a list of “call me if anything comes up” somewhere, but nobody has time to ring down it with wet hands.

A booking waitlist does the ringing for you. In Colvy, when a day is full, clients can join the waitlist from your booking page: they choose the service, the days or a date range, and mornings, afternoons or any time. When a time frees up, from a cancellation, a moved booking, an unpaid hold that lapses or you opening more hours, Colvy offers it by text, or by email if a text can’t go.

There are two ways to offer it:

- **First to book.** A few people get the offer at once (three by default), and whoever books first gets it. Fast, and best for short, popular services.
- **One at a time.** The time is held for one person for a set number of minutes (15 by default), then offered to the next. Fairer, and best for long or high-value appointments.

\`\`\`chat
title: Studio Nine · SMS
you: Hi Priya, a spot opened for Cut and colour on Thu 12 Nov at 2:30pm at Studio Nine. It’s held for you for 15 min. Reply STOP to opt out.
card: Thu 12 Nov, 2:30pm | Cut and colour · held for 15 minutes | Book this time
event: Priya booked it
\`\`\`

Offers only go out between 9am and 8pm, only for times far enough ahead to be useful (you set the notice), and nobody gets more than a few a day. Any deposit you ask for still applies when someone books from an offer.

| Your situation | Choose |
|---|---|
| Short cuts and a long list of keen clients | First to book |
| A two-hour colour or a full groom | One at a time, held for 15 to 30 minutes |
| Clinic appointments, where fairness matters | One at a time |

![A dog being washed and groomed](/blog/appointments-regulars-waitlist/groomer.jpg "With your hands full, let the waitlist offer the free time for you.")

## 3. Arrivals without a receptionist

Most small salons, clinics and groomers don’t have someone on the front desk all day. So arrivals go one of three ways: the client walks in and stands there awkwardly, waits in the car not knowing whether to come in, or rings the phone you can’t answer.

Colvy’s [“I’m here”](/product/check-in) button gives them a better option. From 30 minutes before an in-person appointment, their booking page, the link in their confirmation, shows a big “I’m here” button. When they tap it, you get a bell alert and a push on your phone that opens their conversation, a note goes into that conversation, and the booking shows “Here” in your bookings list. Earlier in the day, the page tells them when the button will appear. Phone and video appointments don’t show it.

Ways to use it:

- **Groomers:** “Wait in the car with your dog and tap I’m here. We’ll come out to you.”
- **Clinics:** “Take a seat and tap I’m here, and we’ll call you through.”
- **Salons:** the stylist finishing a blow-dry knows the next client has arrived, without stopping.

Put the line in the note on your booking confirmation, so clients know what to do before they arrive.

![A doctor talking with a patient in a consulting room](/blog/appointments-regulars-waitlist/clinic.jpg "In a clinic, “I’m here” means nobody queues at an empty desk.")

> [!WARNING] A note for health practices
> Health information is sensitive information under Australian privacy law. Keep service names neutral in booking messages, like “Follow-up appointment” rather than the condition, and only ask for what you need in your intake questions.

## 4. Confirmations that do the work

Reminders help, but the confirmation does more of the work than people think. A good one:

- **says clearly that it’s booked,** with the date and time where they’ll see it at a glance,
- **has calendar buttons,** so the appointment lands in their phone’s calendar,
- **answers the usual questions:** parking, what to bring and how early to arrive,
- **has a clear way to change or cancel,** within your policy.

Colvy’s booking emails have a status at the top, the date on a tile, the details, a button to view or change the booking, Google Calendar and Apple and Outlook buttons, and your note in its own card. A calendar file is attached, and there’s a proper dark version for mail apps that use dark mode. Reminders follow by text and email the day before, and by text two hours before.

> [!EXAMPLE] A confirmation note for a made-up dog groomer
> Parking is behind the shop, off the lane. Please bring your dog on a lead, and tell us about any matting, sore spots or nerves before we start. When you arrive, tap “I’m here” on this page and we’ll come out to you. Need to change? Use the button above, up to 24 hours before.

## 5. One place for clients to manage it all

With [customer accounts](/product/customer-accounts) on, clients sign in at your address with a 6-digit code, no password, and see what’s coming up with a link to change or cancel each visit. **Book again** lists what they’ve booked before, with one tap to the booking page and their details filled in, and a booking held for a deposit can be paid from there. They can read and reply to their messages with you, and choose whether they get your marketing by email or text. Switch off the sections you don’t use. A clinic might show only bookings and messages.

---

## Settings to start from

| Setting | Salon | Clinic | Groomer |
|---|---|---|---|
| Regular bookings | Every 4 to 8 weeks for colour | Weekly or fortnightly for a course | Every 4 to 8 weeks |
| Waitlist offers | First to book | One at a time, held 30 minutes | One at a time, held 20 minutes |
| Notice before an offer | 2 hours | 4 hours | 3 hours |
| Confirmation note | Parking and your change policy | Parking, what to bring, “I’m here” | Parking, leads, “I’m here” |
| Account sections | Coming up, payments due, messages | Coming up, messages | Coming up, orders, messages |

> [!TRY] Set it up this week
> - Turn on the waitlist in Bookings → Settings, and choose first to book or one at a time.
> - Next time a regular is at the counter, open their booking and repeat it.
> - Add an “I’m here” line to your confirmation note.
> - Turn on customer accounts, and put the link on your website.

[See online booking](/product/booking), [see “I’m here” check-in](/product/check-in) or [start free](/signup).`,
  },
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
