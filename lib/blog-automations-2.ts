import type { BlogPost } from '@/lib/blog'

// More automation builder articles (November 2026). Every behaviour described
// is checked against lib/automations/graph.ts (checks, keyword matching,
// limits), lib/automations/engine.ts (actions, waits, one reply per message,
// what counts as answered) and components/automations/Builder.tsx (options).
// Made-up example businesses and people; no invented numbers or quotes.

const CORAL = '#ff6a4d', BLUE = '#2b59ff', PURPLE = '#7c5cff', TEAL = '#0d9488'

export const AUTOMATION_POSTS_2: BlogPost[] = [
  {
    slug: 'route-customer-messages-automatically',
    cover: '/blog/route-customer-messages-automatically/cover.jpg',
    title: 'How to route customer messages to the right person automatically',
    excerpt: 'When every message lands in one shared inbox, the question is always “who’s got this?”. Here’s how to send each conversation to the right person the moment it arrives, by topic, channel or customer, with Colvy’s automation builder.',
    seoDescription: 'Route customer messages to the right person automatically, by topic, channel or customer type, with a notification for whoever gets it. A step-by-step guide.',
    category: 'Playbooks', accent: BLUE, icon: 'split',
    date: '2026-11-18T20:00:00+11:00', dateLabel: 'Nov 18, 2026', readTime: '8 min read', author: 'The Colvy Team',
    takeaways: [
      'Route on the first message of a conversation, so nobody gets reassigned halfway through a chat.',
      'Chain your checks into a ladder: is it a refund? If not, is it wholesale? If not, which channel did it come in on?',
      'Assigning a conversation also tells the person it’s theirs, so routing and the heads-up happen in one step.',
      'Always end the ladder somewhere: a person, the whole team, or Colvy AI. Nothing should fall off the end.',
    ],
    content: `A shared inbox is brilliant until it isn't. Everyone can see every message, which means one of two things tends to happen: two people answer the same customer, or nobody does because everyone assumed someone else had it.

The fix is routing: deciding who owns a conversation the moment it arrives. You probably already do this in your head. Refunds go to Sam. Wholesale goes to Alex. Instagram is Jordan's. Here's how to draw those rules once in Colvy, so they happen on every message, on every channel, even when you're not there.

## What routing looks like in Colvy

A routing flow in the [automation builder](/product/automation) has three parts:

1. **When** a customer sends a message,
2. one or more **checks** decide where it goes,
3. **Assign to** gives the conversation to a teammate.

The Assign step doesn't just change a name on the conversation. It sends the person a notification so they know it's theirs.

![The Assign to step in the Colvy automation builder](/blog/route-customer-messages-automatically/assign-step.jpg "Pick the step, pick the person. They’re told when a conversation is assigned to them.")

## Start with one setting: first message only

Click the trigger and tick **Only the first message of a conversation**. Routing is a decision you make once. Without this, a customer's follow-up message could send the conversation back through the flow and move it away from the person already helping.

As a second safety net, every flow waits before running again for the same conversation: 12 hours by default. You can change that to every message, 1 hour, 24 hours, 3 days or 7 days.

## Six ways to route

### 1. By topic

Use a **Message mentions…** check with the words that signal a topic. Refunds, returns and "money back" go to whoever approves refunds. "Wholesale", "bulk" and "trade" go to your account manager.

The check looks for whole words, ignoring capitals and accents, and plurals count: "refund" matches "Refunds?" but not "prefund". You can list up to 20 words or short phrases in one check.

### 2. By channel

Use **Came in on…** to route by where the message arrived: website chat, SMS, email, Messenger, Instagram or WhatsApp. Social messages to whoever runs your socials, email to the office, texts and chats to the front desk.

### 3. By customer

Use **Customer has tag** to spot the customers who need a particular person: VIP, Wholesale, Trade. Tag someone once in their customer profile and every conversation they start goes straight to the right place.

### 4. New customers

Use **New customer** (their first conversation with you) to send first-timers to the person who makes the best first impression. Add a **Tag the customer** step with "New customer" so anyone who picks it up later can see they're new.

### 5. Out of hours

Use **Open or closed** to treat after-hours messages differently. Assign them to whoever opens up, and add a **Create a task** step so the conversation is first on their list in the morning. Task due dates can be today, tomorrow, in 2 days or in a week.

### 6. Urgent

For words like "urgent", "emergency" or "leak", add a **Notify the team** step as well as assigning. You can notify the people you pick, or everyone on the team if you pick nobody.

## Build a routing ladder

Every check has two exits, Yes and No. Join one check's No to the next check and you have a ladder: the message steps down until something matches.

| Step | Check | If yes | If no |
|---|---|---|---|
| 1 | Mentions "refund", "return", "money back" | Assign to Sam | Go to step 2 |
| 2 | Customer has tag "Wholesale" | Assign to Alex | Go to step 3 |
| 3 | Came in on Instagram or Messenger | Assign to Jordan | Go to step 4 |
| 4 | Open or closed: open | Notify the team | Assign to the opener, and create a task |

> [!TIP] Most specific check first
> Put the narrowest check at the top. A wholesale customer asking for a refund should reach whoever handles refunds, so the refund check comes before the wholesale one.

![A team talking around a meeting table with laptops](/blog/route-customer-messages-automatically/team-meeting.jpg "Agree who owns what first. Drawing it takes minutes after that.")

## What routing doesn't do

Two honest limits, so you can plan around them:

- **Each Assign step picks one named person.** There's no "take turns" or "whoever's least busy" option. If you want to share the load, route by topic or channel instead.
- **People change.** If someone leaves the team, an Assign step pointing at them can't run. The run notes that the person isn't on the team any more, in plain words under **Runs**, so you can pick someone else.

## Test it before you switch it on

Press **Try it**, type a made-up message, pick the channel, tick whether it's a new customer and add any tags. The path the message would take lights up on the canvas, and nothing is sent. Try a few: a refund on Instagram, a wholesale order by email, a question at 10pm.

For more flows to borrow, see [seven customer service flows worth drawing](/blog/customer-service-automation-small-business), or start with [how to build your first automation](/blog/automations-builder-guide). Automations are included on the Inbox and Everything plans.

[Start free](/signup) and route your first message.`,
  },
  {
    slug: 'automation-vs-ai-customer-service',
    cover: '/blog/automation-vs-ai-customer-service/cover.jpg',
    title: 'Rules or AI? How to use automations and AI together in customer service',
    excerpt: 'Rules are predictable. AI is flexible. The best customer service set-ups use both: rules decide who handles what, and AI answers the everyday questions. Here’s how to split the work, with five patterns you can draw in Colvy.',
    seoDescription: 'When to use rules and when to use AI in customer service, and five ways to combine them: refunds to people, VIPs, complaints, after hours and AI as backup.',
    category: 'Product', accent: PURPLE, icon: 'ai',
    date: '2026-11-18T19:30:00+11:00', dateLabel: 'Nov 18, 2026', readTime: '8 min read', author: 'The Colvy Team',
    takeaways: [
      'Use rules for decisions that must be the same every time: who handles refunds, VIPs and complaints.',
      'Use AI for the long tail of everyday questions: opening hours, stock, prices, how-tos.',
      'In Colvy, a customer gets one automated answer per message. A flow’s reply wins, unless the flow hands over to Colvy AI on purpose.',
      'Team first, AI as backup: acknowledge, wait a few minutes, and only hand to Colvy AI if nobody on the team has answered.',
    ],
    content: `There's a lot of noise about AI replacing customer service. In practice, the businesses that get the most out of it use AI for what it's good at and rules for what rules are good at.

Here's how we think about the split, and five patterns you can draw in Colvy's [automation builder](/product/automation) to put both to work.

## What rules are good at

A rule does exactly what you told it, every time. "If the message mentions a refund, give it to Sam." No judgement, no surprises.

That makes rules right for decisions that should never vary: who handles money, who looks after your biggest customers, where complaints go. They're instant, and they're explainable. In Colvy, every run is listed under **Runs** with each step in plain words, so you can always see why something happened.

What rules can't do is understand. A keyword rule only knows the words you gave it.

## What AI is good at

AI understands a question however it's worded. "R u open sunday", "what time do you shut on the weekend" and "Sunday hours?" are the same question to Colvy AI, and it can answer from what it knows about your business.

That makes AI right for the long tail of everyday questions. What it shouldn't do on its own is make sensitive calls: approving a refund, calming a furious customer, deciding what a VIP gets.

| Use a rule when… | Use AI when… |
|---|---|
| The answer must be the same every time | The question can be asked a hundred ways |
| Money, complaints or VIPs are involved | It's a routine question about hours, stock or prices |
| You need to know exactly why something happened | Speed matters more than a human touch |
| A specific person must handle it | Anyone, or anything, could answer it well |

## How they work together in Colvy

Three steps in the builder decide how a flow and Colvy AI share a conversation:

- **Send a reply.** The flow answers. Colvy AI stays quiet on that message, so the customer never gets two answers.
- **Hand to Colvy AI.** Colvy AI answers the customer (when it's switched on for that channel), even if the flow already sent a quick reply. After a Wait, it answers the customer's latest message.
- **Pause Colvy AI here.** Colvy AI stops answering that conversation, and your team takes it.

And one rule sits over all of it: **one automated reply per customer message**, however many flows match. If two flows would both reply, the one you made first replies, and the other skips its reply but carries on with its other steps.

## Five patterns

### 1. Refunds to a person, the rest to AI

**When** a customer sends a message → **Mentions** "refund", "money back", "return"? Yes: **Pause Colvy AI here**, **Assign to** the person who handles refunds, **Create a task** to check it today. No: **Hand to Colvy AI**.

This one's a ready-made template in Colvy.

![The refunds flow in the Colvy automation builder](/blog/automations-builder-guide/builder.jpg "Refunds pause Colvy AI and go to a person. Everything else goes to Colvy AI.")

### 2. VIPs always get a person

**Customer has tag** "VIP"? Yes: **Pause Colvy AI here**, then **Assign to** their account manager. Your best customers never get a bot, and the account manager is told straight away.

### 3. Complaints go to the owner

**Mentions** "complaint", "disappointed", "unhappy", "unacceptable"? Yes: **Pause Colvy AI here**, **Assign to** the owner, and **Add a note** for context. Keyword lists can't catch every unhappy customer, so keep an eye on your inbox too. But they catch the ones who say so plainly.

### 4. Welcome first, then AI

Trigger on the first message of a conversation. **New customer**? Yes: **Send a reply** with a warm welcome using their first name and your business name, then **Hand to Colvy AI** so their actual question gets answered too.

### 5. Team first, AI as a backup

**Send a reply**: "Thanks for your message, someone will be with you in a few minutes." Then **Wait** 10 minutes. Then **Still waiting for a reply**? Yes: **Hand to Colvy AI**, and it answers the customer's latest message. No: the team got there, so the flow simply ends.

The quick acknowledgement doesn't count as an answer, so the check after the Wait only looks at real replies from your team or Colvy AI.

![Two people working through a problem at a computer](/blog/automation-vs-ai-customer-service/laptop.jpg "Rules decide who handles what. AI handles the everyday.")

## A few honest notes

- Colvy AI has to be switched on for a channel before **Hand to Colvy AI** can answer there.
- If Colvy AI has been paused on a conversation, a later hand-off won't wake it up. Your team has that conversation.
- Automations never run for spam or blocked senders, and never text someone who's opted out of texts.

Use **Try it** to see which way a message would go before you switch a flow on, and read [how to build an automation](/blog/automations-builder-guide) for the basics. Automations are on the Inbox and Everything plans.

[Start free](/signup) and give rules and AI their own jobs.`,
  },
  {
    slug: 'customer-follow-up-automation',
    cover: '/blog/customer-follow-up-automation/cover.jpg',
    title: 'Follow-up automations: how to make sure no customer is left waiting',
    excerpt: 'Most lost customers aren’t lost to a bad answer. They’re lost to no answer. Here’s how to use waits and checks in Colvy’s automation builder to nudge the team, escalate quietly and follow up missed calls, so nobody slips through.',
    seoDescription: 'Use waits and checks to follow up automatically: nudge the team when a customer is waiting, escalate after an hour, and make sure missed calls get called back.',
    category: 'Playbooks', accent: TEAL, icon: 'clock',
    date: '2026-11-18T19:00:00+11:00', dateLabel: 'Nov 18, 2026', readTime: '7 min read', author: 'The Colvy Team',
    takeaways: [
      'A Wait step pauses a flow for anything from a minute to seven days, then carries on.',
      'Always put a “Still waiting for a reply” check after a wait, so the flow only acts if nobody has answered.',
      'Escalate in steps: a nudge to the team first, then the owner, then a task.',
      'Automatic acknowledgements don’t count as answers, so they can’t hide a customer who’s still waiting.',
    ],
    content: `Ask anyone why they stopped using a business and you'll rarely hear "they gave me the wrong answer". Far more often it's "I never heard back".

It's rarely anyone's fault. A message arrives during the lunch rush. Someone opens it, means to come back to it, and doesn't. A call is missed while you're with a customer and the voicemail sits there until Thursday.

Follow-up automations catch those moments. Here's how to build them in Colvy's [automation builder](/product/automation).

## The two building blocks

**Wait** pauses a flow for anything from one minute to seven days, then carries on with the next step. Waits are checked every minute, and you can use up to five on any one path through a flow.

**Still waiting for a reply** is a check that says Yes when nobody, a person or Colvy AI, has answered since the customer last wrote. For a missed call, it says Yes when nobody has called them back or picked up a later call. Internal notes and automatic acknowledgements don't count as answers, so a quick "thanks, we'll be with you soon" can't hide a customer who's still waiting.

Put them together and you get the core of every follow-up: **wait, then check, then act only if needed**.

## Four follow-ups worth building

### 1. Nobody replied in 15 minutes

**When** a customer sends a message → **Wait** 15 minutes → **Still waiting for a reply**? Yes: **Notify the team**.

This is one of Colvy's templates, so you can start from it and change the time to suit your business.

![The automation templates in Colvy](/blog/customer-follow-up-automation/templates.jpg "Start from a template, including “Nobody replied in 15 minutes” and “Missed call follow-up”.")

### 2. An escalation ladder

Some messages need more than one nudge. Chain waits and checks:

1. **Wait** 15 minutes → **Still waiting**? Yes: **Notify the team**.
2. **Wait** 45 minutes more → **Still waiting**? Yes: **Notify** the owner or manager by name.
3. **Wait** 3 hours more → **Still waiting**? Yes: **Create a task** due today and **Assign to** someone.

Each check asks fresh, so the moment anyone replies, the ladder stops at the next check.

### 3. Missed call follow-up

**When** a call is missed → **Create a task** "Call back the missed caller", due today → **Notify the team**. That's the template. To add a safety net, put a **Wait** of 30 minutes after it, then **Still waiting**? Yes: **Notify** the owner.

If you already send a [missed-call text](/blog/missed-call-text-back), that still goes as usual. The automation runs as well.

### 4. Acknowledge now, answer soon

For channels where people expect a quick response, like website chat:

**Send a reply**: "Thanks {first_name}, someone will be with you in a few minutes." → **Wait** 10 minutes → **Still waiting for a reply**? Yes: **Hand to Colvy AI** to answer their latest message, or **Notify the team** if you'd rather keep it human.

![A hand holding a small alarm clock](/blog/customer-follow-up-automation/alarm-clock.jpg "The flow keeps time, so your team doesn’t have to.")

## What happens while a flow is waiting

- **The flow is remembered as it was.** If you edit the automation while a run is waiting, that run finishes the way it started, so an edit can't send it somewhere odd.
- **It stops if it should.** A waiting run stops if you switch the automation off or delete it, if the conversation is deleted, or if it's marked as spam or blocked.
- **No double nudges.** By default a flow won't start again for the same conversation for 12 hours, so a customer who sends three messages in a row doesn't set off three escalations.

> [!TIP] Always check after a wait
> A Wait on its own just delays the next step. Without a **Still waiting for a reply** check after it, a flow would nudge the team even when the customer was answered minutes ago.

## Keep the timings honest

Pick times that match what you can actually do. If your team can reliably answer chat within 10 minutes, nudge at 15. If email usually takes a few hours, don't escalate after 30 minutes. Our guide to [reducing first response time](/blog/reduce-first-response-time) has more on setting realistic targets.

Test every flow with **Try it**: tick "Nobody has replied yet" and watch the path light up. Then switch it on and read **Runs** for the first week. Automations are included on the Inbox and Everything plans.

[Start free](/signup) and make sure nobody's left waiting.`,
  },
  {
    slug: 'keyword-automation-ideas',
    cover: '/blog/keyword-automation-ideas/cover.jpg',
    title: '10 keywords worth automating in your customer inbox',
    excerpt: 'A handful of words tell you almost everything about what a customer needs: refund, cancel, urgent, wholesale, invoice. Here are ten keyword groups worth watching for, what to do with each, and the words to avoid.',
    seoDescription: 'Ten keyword groups worth automating in a customer inbox, from refunds and cancellations to urgent jobs and invoices, plus the keywords that cause trouble.',
    category: 'Playbooks', accent: CORAL, icon: 'search',
    date: '2026-11-18T18:30:00+11:00', dateLabel: 'Nov 18, 2026', readTime: '7 min read', author: 'The Colvy Team',
    takeaways: [
      'A keyword check matches whole words, ignoring capitals and accents, and counts plurals: “refund” matches “Refunds?” but not “prefund”.',
      'Group words by what you’ll do next, not by topic: one check per action.',
      'Avoid words that turn up in everyday chat, like “job”, “order” or “help”, or every message will match.',
      'Test each list with a few real-looking messages before you switch the flow on.',
    ],
    content: `Customers tell you what they need in the first sentence. "I'd like a refund." "Can I cancel?" "It's urgent." "Do you do wholesale?"

A keyword check in Colvy's [automation builder](/product/automation) spots those words and sends the conversation where it needs to go. Here are ten worth watching for, and what to do with each.

## How keyword matching works

The **Message mentions…** check says Yes when the customer's message contains any of the words you list. A few details make it more useful than it sounds:

- **Whole words only.** "Refund" matches "refund" and "Refunds?", but not "prefund".
- **Capitals and accents don't matter.** "URGENT", "Urgent" and "urgent" all match.
- **Plurals count.** "Invoice" also matches "invoices".
- **Short phrases work.** "Money back" matches "can I get my money back".
- Up to **20 words or phrases** in one check.

![A keyword check in the Colvy builder on a phone](/blog/keyword-automation-ideas/phone-builder.jpg "A keyword check: three words, any of them.")

## 10 keyword groups

### 1. Refund, return, money back

**Do:** pause Colvy AI, assign to whoever approves refunds, and create a task to check it today. This is Colvy's ready-made refunds template.

### 2. Cancel, cancellation

**Do:** assign to whoever handles bookings or subscriptions. Add a note so they know to try to save it before they process it.

### 3. Urgent, emergency, ASAP

**Do:** notify the team as well as assigning. For trades, add words like "leak", "flooding" or "no power".

### 4. Complaint, disappointed, unhappy

**Do:** pause Colvy AI and assign to the owner or manager. Nobody wants a bot replying to a complaint.

### 5. Wholesale, bulk, trade

**Do:** tag the customer "Wholesale lead" and assign to whoever handles accounts. The tag means they'll be easy to find later.

### 6. Quote, estimate

**Do:** for service businesses, create a task "Send a quote", due today, and assign it. Quotes that wait a day often go to whoever replied first.

### 7. Warranty, faulty, broken, damaged

**Do:** create a task "Check the warranty claim" and add an internal note reminding the team to ask for photos. The task links back to the conversation, and it includes the first part of what the customer wrote.

### 8. Invoice, receipt, tax invoice

**Do:** assign to whoever does the books, so the person answering the phones doesn't have to dig.

### 9. Tracking, delivery, parcel

**Do:** for online stores, hand to Colvy AI so it can answer straight away, or assign to dispatch if you'd rather a person checks.

### 10. Booking, appointment, reschedule

**Do:** if you take bookings, assign to the front desk, or hand to Colvy AI to send the booking link.

![Receipts and paperwork on a desk with a calculator](/blog/keyword-automation-ideas/paperwork.jpg "Invoices and receipts are a classic: route them to whoever does the books.")

## Words to avoid

Some words turn up in so many ordinary messages that a check using them says Yes to almost everything:

- **"Job"**: matches "great job, thanks!" as well as "do you have any jobs going?"
- **"Order"**: for a shop, nearly every message mentions an order.
- **"Help"**, **"question"**, **"hi"**: in almost every first message.
- **"Problem"**: "no problem!" matches too.

Keyword checks also don't understand context. "This isn't a complaint, but…" still matches "complaint". That's usually fine, because a person will look at it, but it's another reason to pause Colvy AI rather than send an automatic reply on a sensitive word.

## Group by action, not topic

One check per thing you'll *do*. If refunds and returns both go to Sam with a task, put them in one check. If cancellations go to someone else, give them their own check, and chain the checks together: if it isn't a refund, is it a cancellation? If not, is it urgent?

> [!TIP] Test with real-looking messages
> Before you switch a flow on, press **Try it** and type three or four messages your customers actually send. Include one that shouldn't match, like "no problem, great job!". If it lights up the wrong path, trim the list.

For routing ideas, see [how to route customer messages automatically](/blog/route-customer-messages-automatically). Automations are included on the Inbox and Everything plans.

[Start free](/signup) and put your first keyword to work.`,
  },
]
