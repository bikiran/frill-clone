import type { BlogPost } from '@/lib/blog'

// Articles for the automation builder and Colvy Powers (November 2026).
// Checked against lib/automations/graph.ts, lib/automations/engine.ts and
// lib/powers/config.ts. Same rules as the rest of the blog: made-up example
// businesses and people, no invented numbers, quotes or customers.

const BLUE = '#2b59ff', PURPLE = '#7c5cff', TEAL = '#0d9488', AMBER = '#d97706'

export const AUTOMATION_POSTS: BlogPost[] = [
  {
    slug: 'automations-builder-guide',
    cover: '/blog/automations-builder-guide/cover.jpg',
    title: 'How to build an automation in Colvy: a drag-and-drop guide',
    excerpt: 'Colvy’s new automation builder lets you draw what happens when a customer writes in or a call is missed: checks, replies, assignments, tasks and waits, on every channel. Here’s how to build your first one, test it and switch it on.',
    seoDescription: 'Draw what happens when a customer writes in or a call is missed: checks, replies, tasks and waits on every channel. Test it with Try it, then switch it on.',
    category: 'Product', accent: TEAL, icon: 'flow',
    date: '2026-11-18T13:00:00+11:00', dateLabel: 'Nov 18, 2026', readTime: '8 min read', author: 'The Colvy Team',
    takeaways: [
      'An automation is a trigger, a few yes-or-no checks and the actions you want, drawn on a canvas. No code.',
      'Start from a template: after-hours reply, refunds to a person, nobody replied in 15 minutes, welcome new customers or missed-call follow-up.',
      'Try it walks a made-up message through your flow and lights up the path. Nothing is sent.',
      'Limits are built in: one automated reply per message, a wait before the same flow runs again for a conversation, and a daily cap per flow.',
    ],
    content: `Every business runs on rules nobody wrote down. Refunds go to Sam. If someone messages after close, tell them when you're back. If a first-time customer writes in, make them feel welcome. If nobody has answered in a quarter of an hour, somebody needs a nudge.

Those rules work until the person who knows them is busy, off sick or asleep. Colvy's automation builder lets you take them out of your head and draw them once. From then on they run on every message, on every channel, whoever's on shift.

![The Colvy automation builder with a refunds flow on the canvas](/blog/automations-builder-guide/builder.jpg "Refunds go to a person. Everything else goes to Colvy AI.")

## What an automation is made of

You build a flow from three kinds of step, joined by lines:

- **The trigger** is what starts it: *a customer sends a message*, or *a call is missed*. A message trigger can be narrowed to certain channels, or to only the first message of a conversation.
- **Checks** are yes-or-no questions. Each one has two exits, Yes and No, and you decide where each goes.
- **Actions** are what Colvy does: send a reply, assign the conversation, tag the customer, create a task, add a note, notify the team, hand to Colvy AI, pause Colvy AI, or close the conversation.

There's one more: **Wait**, which pauses the flow for anything from a minute to seven days before the next step.

These are the checks you can use:

| Check | Says yes when… |
|---|---|
| Message mentions… | the message contains any of the words you list |
| Came in on… | it arrived on a channel you picked |
| Open or closed | you're open (or closed) right now, by your opening hours |
| Customer has tag | the customer has that tag, like VIP or Wholesale |
| New customer | it's their first conversation with you |
| Still waiting for a reply | nobody on the team has replied since they wrote |

Flows work on website chat, SMS, email, Messenger, Instagram and WhatsApp, and a reply always goes back on the channel the customer used.

## Build your first one in five steps

### 1. Start from a template

Go to **Settings → Automations** and press **New automation**. You can start from scratch, but a template is quicker:

- **After-hours reply**: when you're closed, let customers know when you'll be back.
- **Refunds to a person, the rest to Colvy AI**: messages about refunds go straight to someone on the team. Everything else, Colvy AI answers.
- **Nobody replied in 15 minutes**: if a customer is still waiting, nudge the team.
- **Welcome new customers**: tag first-timers and say a warm hello.
- **Missed call follow-up**: after a missed call, make sure someone calls back.

### 2. Drag, drop and join

The steps sit down the left. Drag one onto the canvas, then pull a line from the dot on one step to the next. Checks have a Yes dot and a No dot, so one flow can go two ways. On a phone, tap a step to add it after the one you've selected.

Click any step to set it up: the words to look for, who to assign to, the reply to send. Replies can use **{first_name}**, **{name}** and **{business_name}**, so "Hi {first_name}" reads as "Hi Priya".

### 3. Fix what it flags

If something isn't finished, the top bar tells you how many things need fixing and the step gets a red dot. Pick someone to assign to, type the tag, write the reply. You can't switch a flow on while anything is left unfinished, so a half-built flow never reaches a customer.

### 4. Try it

Press **Try it**, type a made-up message, pick a channel, and tick whether you're open, whether it's their first conversation and whether anyone has replied. Then run the test. The path lights up on the canvas and each step is listed on the right, so you see exactly what would happen. Nothing is sent and nothing changes.

![Try it running a made-up refund message through the flow](/blog/automations-builder-guide/try-it.jpg "Try it lights up the path a message would take. Nothing is sent.")

### 5. Switch it on and read the runs

Flip the switch in the top corner and the flow is live. Every time it runs you'll find it under **Runs**: who it ran for, which way each check went, what it did, and a link straight to the conversation.

![The Runs panel showing each step of a run](/blog/automations-builder-guide/runs.jpg "Runs show every step, in plain words, with a link to the conversation.")

## How it works with Colvy AI

If you use Colvy AI to answer customers, you choose where automations stop and the AI starts.

- When a flow **sends a reply**, Colvy AI stays quiet on that message, so the customer never gets two answers.
- **Hand to Colvy AI** passes it over on purpose: the AI answers even if the flow already sent a quick reply. After a Wait, it answers the customer's latest message.
- **Pause Colvy AI here** stops the AI answering that conversation, so your team takes it. That's how the refunds template works: refunds pause the AI and go to a person, everything else is handed to the AI.

## Safe by default

Automations talk to your customers, so the builder is careful for you:

- **One automated reply per message.** Two flows can't both answer the same text.
- **A breather between runs.** By default a flow won't run again for the same conversation for 12 hours. You can change that per flow, from every message to longer.
- **A daily cap.** Each flow runs at most 500 times a day, so a mistake can't run away with your SMS credit.
- **No replies to spam, blocked senders or people who've opted out of texts.**
- **Waits are bounded**: from one minute to seven days, and at most five on any path.

> [!TIP] Draw what you already do
> Don't try to automate everything on day one. Pick the one thing you said out loud this week, like "can someone look at the refunds?", and draw that. Add the next one once the first has run for a while.

![Two people talking through a plan at a laptop](/blog/automations-builder-guide/talking-it-through.jpg "The best first automation is the rule you already repeat every day.")

## Which plans include it?

The automation builder is part of the **Inbox** and **Everything** plans. See [pricing](/pricing) for the details, or read more on the [automation builder page](/product/automation).

Ready for more? Learn how to [route messages to the right person](/blog/route-customer-messages-automatically), [use rules and AI together](/blog/automation-vs-ai-customer-service), [follow up automatically](/blog/customer-follow-up-automation) and [pick keywords that work](/blog/keyword-automation-ideas).

[Start free](/signup) and draw your first automation.`,
  },
  {
    slug: 'colvy-powers-team-rewards',
    cover: '/blog/colvy-powers-team-rewards/cover.jpg',
    title: 'Colvy Powers: team rewards for real work, not busywork',
    excerpt: 'Colvy Powers turns the work your team already does, like resolving conversations, answering calls and finishing tasks, into coins, XP and levels. Spend the coins on playful power-ups like Priority Pin and Confetti Bomb. Here’s how it works, and how it stays fair.',
    seoDescription: 'Colvy Powers rewards real work with coins, XP and levels, plus playful power-ups. How your team earns, what the coins buy, and the rules that keep it fair.',
    category: 'Product', accent: AMBER, icon: 'trophy',
    date: '2026-11-18T12:00:00+11:00', dateLabel: 'Nov 18, 2026', readTime: '7 min read', author: 'The Colvy Team',
    takeaways: [
      'Your team earns coins and XP for real work: resolving conversations, replying, answering calls, finishing tasks and jobs, fulfilling orders.',
      'XP builds levels from Rookie to Colvy Master. Coins buy power-ups like Priority Pin, Nudge, Confetti Bomb and Focus Shield.',
      'It’s built to be hard to game: one-word replies, notes and AI replies don’t count, and every reward has a daily limit.',
      'It’s off until an owner or admin switches it on, and every part of it can be tuned or turned off.',
    ],
    content: `Customer service is a team sport with no scoreboard. Somebody answers forty messages before lunch, somebody else quietly sorts the courier mix-up that would have cost you a customer, and at the end of the day nobody really knows. The good work disappears into the inbox.

Colvy Powers gives it somewhere to land. It's a light layer of rewards on top of the work your team already does in Colvy. Serious about work, playful about teamwork.

![The Colvy Powers overview with level, coins, streak and how you earn](/blog/colvy-powers-team-rewards/overview.jpg "Your level, coins, streak and today's progress, with how you earn right beside them.")

## How your team earns

Rewards come from real work done in Colvy. Each piece of work pays once.

| Work | Coins | XP |
|---|---|---|
| Resolve a conversation | 10 | 10 |
| Reply to a customer (up to 50 a day) | 2 | 2 |
| Answer a customer's call (20 seconds or more) | 5 | 5 |
| Complete an assigned task | 15 | 15 |
| Complete a job | 25 | 25 |
| Fulfil an order (up to 50 a day) | 5 | 5 |
| A 4 or 5 star Google review that names you | 30 | 30 |
| A teammate says thanks | 10 | 5 |
| Finish a challenge | 50 | 50 |

There are small rewards for showing up, too: once a day for being active in Colvy, and a little for each hour of active use (typing, clicking, scrolling) up to eight hours. Rules about things your business doesn't use, like jobs or calls, simply don't appear.

## Coins and XP do different jobs

**XP** is earned and never spent. It decides your level, from 1 to 50, with titles along the way: Rookie, Rising Star, Specialist, Champion, Legend and, at level 50, Colvy Master. Levels unlock looks only, never permissions.

**Coins** are for spending in the **Power Shop**. Neither coins nor XP can be bought, cashed out or moved to another workspace.

## What the coins buy

![The Power Shop with power-ups and their prices](/blog/colvy-powers-team-rewards/power-shop.jpg "Every power-up is playful. None of them gets between you and a customer.")

- **Priority Pin** (100): pin a conversation to the top of a teammate's inbox for 30 minutes. They can unpin it.
- **Nudge** (50): a friendly tap on the shoulder, with a short note.
- **Confetti Bomb** (50): a burst of confetti on the whole team's screen, with your message.
- **Focus Shield** (75): 30 minutes without playful pings from teammates. Customer messages and real alerts still come through.
- **Spotlight** (150): put a teammate's great work on everyone's screen for a day.
- **Double XP** (200): your rewards give twice the XP for an hour. Coins stay the same.
- **Team Boost** (500): everyone earns 50% more XP for an hour.
- **VIP Crown** (250), **Custom Status** (100) and **Mystery Box** (100): looks for your name and profile.
- **Streak Saver** (150): keeps your streak alive through one missed day.
- **Coin Gift**: send some of your coins to a teammate. Coins only, never XP.

## Levels, streaks, badges and challenges

Keep earning day after day and you build a **streak**. Hit milestones and you collect **badges**, like Inbox hero, Quick to answer and Customer favourite. Owners and admins can set **challenges**, daily, weekly or for the whole team, such as "Close 6 conversations today", each with its own reward.

![The Colvy Powers leaderboard podium](/blog/colvy-powers-team-rewards/leaderboard.jpg "The leaderboard can show everyone, team totals only, or nothing at all.")

The **leaderboard** shows this week or this month, by XP or by resolved conversations, replies, tasks, orders or thanks. If a ranking isn't right for your team, show team totals only, or switch it off.

## Say thanks

Anyone can thank a teammate for something they did: "Covered my calls while I was at the dentist." The teammate earns the reward, not the person saying thanks, and each person can thank up to three teammates a day.

## Built to be hard to game

A reward system that rewards the wrong thing is worse than none. So Colvy Powers only counts work that matters:

- One-word replies, internal notes and AI replies don't count as replies.
- A call only counts if you picked it up and talked for at least 20 seconds. Voicemails don't count.
- A task you made for yourself and ticked within ten minutes doesn't count.
- Reopening and closing a conversation doesn't pay twice. An order undone takes its reward back.
- Every person has a daily limit, 150 coins and 300 XP by default.
- Work done before Colvy Powers was switched on never pays.

## Never in the way

Every playful thing sits around the work, never in front of it. Nothing covers a customer's message, nothing slows down a reply, and Focus Shield gives anyone a quiet half hour when they need it.

![Two colleagues high-fiving at a desk](/blog/colvy-powers-team-rewards/high-five.jpg "Good work deserves a moment, not just a closed ticket.")

## Yours to set

Colvy Powers is off until an owner or admin switches it on in **Settings → Colvy Powers**. From there you choose:

- what each piece of work is worth, and the daily limits;
- which power-ups are in the shop, their prices and limits;
- who takes part, by role or location;
- who sees the leaderboard;
- the challenges your team is working on.

It's included on every plan. Read more on the [Colvy Powers page](/product/powers), or see why we think [Colvy is a culture, not just software](/blog/colvy-is-a-culture).

When you're ready, [set it up step by step](/blog/how-to-set-up-colvy-powers), pick a few [team challenge ideas](/blog/team-challenge-ideas), and read what we learned about [gamification that works](/blog/gamification-customer-service-teams).

[Start free](/signup) and switch on Colvy Powers for your team.`,
  },
  {
    slug: 'customer-service-automation-small-business',
    cover: '/blog/customer-service-automation-small-business/cover.jpg',
    title: 'Customer service automation for small business: 7 flows worth drawing',
    excerpt: 'Automation shouldn’t mean a robot fobbing customers off. For a small business it means the boring parts happen on time, every time, so people can do the parts that need a person. Here are seven practical flows, and how to build each one in Colvy.',
    seoDescription: 'Seven practical customer service automations for small businesses: refunds to a person, nobody replied, after hours, missed calls, VIPs, new customers and more.',
    category: 'Playbooks', accent: BLUE, icon: 'split',
    date: '2026-11-18T11:00:00+11:00', dateLabel: 'Nov 18, 2026', readTime: '9 min read', author: 'The Colvy Team',
    takeaways: [
      'Good automation routes, reminds and acknowledges. It doesn’t stand between a customer and a person.',
      'Start with the jobs that get forgotten: replies nobody sent, missed calls nobody returned, refunds nobody picked up.',
      'Use checks to send the sensitive things, like refunds and complaints, to a person, and let AI handle the routine questions.',
      'Test every flow with a made-up message first, then read the runs for the first week.',
    ],
    content: `When people hear "customer service automation" they picture a phone menu that never offers the option you need. That's automation done to customers.

For a small business the useful kind is the opposite. It's the boring, reliable stuff that makes sure a message never sits unanswered, a missed call always gets a call back, and the refund request reaches the person who can actually approve it. People still do the talking. The automation makes sure they're talking to the right customer at the right time.

Here are seven flows that earn their keep. Each one takes a few minutes to draw in Colvy's [drag-and-drop builder](/product/automation).

![A customer paying at a shop counter with their phone](/blog/customer-service-automation-small-business/counter.jpg "When you're serving someone in person, the inbox shouldn't depend on you remembering it.")

## 1. Refunds to a person, the rest to AI

**The problem:** an AI can answer "what time do you close?" all day, but nobody wants a bot handling their refund.

**The flow:** when a customer sends a message, check whether it mentions "refund", "money back" or "return". If yes, pause Colvy AI on that conversation, assign it to the person who handles refunds and create a task to check it today. If no, hand it to Colvy AI.

This is one of Colvy's templates, so it's ready to go once you pick who handles refunds. Swap the words for your own: "warranty", "broken", "complaint" work just as well.

## 2. Nobody replied in 15 minutes

**The problem:** a message lands while everyone's busy, and everyone assumes someone else has it.

**The flow:** when a customer sends a message, wait 15 minutes. Then check "Still waiting for a reply". If nobody on the team has replied, notify the team. If someone has, the flow simply ends.

This is also a template. It pairs well with our guide to [reducing first response time](/blog/reduce-first-response-time).

## 3. After-hours reply

**The problem:** a customer messages at 9pm and hears nothing until tomorrow, so they message your competitor too.

**The flow:** when a customer sends a message, check "Open or closed". If you're closed, reply with when you'll be back. The check reads your opening hours from Business settings, so the flow follows your hours as they change.

We've written a whole article of [after-hours auto-reply examples](/blog/after-hours-auto-reply-examples) you can copy.

## 4. Missed call follow-up

**The problem:** the phone rang while you were with a customer, and by the end of the day the missed call is buried.

**The flow:** when a call is missed, create a task to call them back today and notify the team. If you already send a [missed-call text](/blog/missed-call-text-back), that still goes as usual. The automation runs as well, so the call-back doesn't rely on anyone's memory.

## 5. Welcome new customers

**The problem:** a first-time customer doesn't know whether a real business is on the other end.

**The flow:** trigger on the first message of a conversation, check "New customer", tag them "New customer", and send a warm hello using their first name and your business name:

\`\`\`chat
title: Willow & Wool · Website chat
them: Hi, do you have any of the chunky merino left in forest green?
you: Welcome, Priya! Thanks for reaching out to Willow & Wool. Someone will be with you shortly.
\`\`\`

The tag means anyone who picks the conversation up can see at a glance that this person is new and might need a bit more help.

## 6. VIPs and wholesale straight to the right person

**The problem:** your biggest accounts end up in the same queue as everyone else.

**The flow:** when a customer sends a message, check "Customer has tag" for VIP (or Wholesale, or Trade). If yes, assign it to the account manager and notify them. If no, carry on as normal. Because it's a tag check, adding someone to the VIP list is as simple as tagging them in their profile.

![A front desk with a customer being looked after on a tablet](/blog/customer-service-automation-small-business/front-desk.jpg "Routing is the quiet part of good service: the right person, first time.")

## 7. Route by channel

**The problem:** your Instagram messages are mostly product questions, your emails are mostly orders, and different people handle each.

**The flow:** when a customer sends a message, check "Came in on…" Instagram. If yes, assign to whoever runs your social. Chain a second check for email, assign to whoever handles orders, and so on. Replies still go back on the channel the customer used.

## Rules that keep automation friendly

A few habits that stop automation turning into the robot everyone hates:

- **Acknowledge, don't pretend.** An automated reply should say what happens next ("someone will be with you shortly"), not try to answer what it can't.
- **One automated reply per message.** Colvy enforces this for you, and Colvy AI stays quiet when a flow has already replied.
- **Don't repeat yourself.** By default a flow won't run again for the same conversation for 12 hours. Set it to every message only when that really makes sense.
- **Sensitive things go to people.** Refunds, complaints and anything with an angry tone deserve a human. Use a check to send them there.
- **Respect opt-outs.** Colvy never runs automations for spam, blocked senders or people who've opted out of texts.

> [!TRY] Try one now
> - Go to **Settings → Automations** and pick the **Nobody replied in 15 minutes** template.
> - Press **Try it**, tick "Nobody has replied yet", and run the test.
> - Watch the path light up, then switch it on.

The full walkthrough is in [How to build an automation in Colvy](/blog/automations-builder-guide). Automations are included on the Inbox and Everything plans.

[Start free](/signup) and draw your first flow.`,
  },
  {
    slug: 'after-hours-auto-reply-examples',
    cover: '/blog/after-hours-auto-reply-examples/cover.jpg',
    title: 'After-hours auto-reply examples (and how to send them automatically)',
    excerpt: 'A good after-hours reply tells customers you got their message, when you’ll be back, and what to do if it can’t wait. Here are examples for shops, trades, salons, clinics and restaurants, for SMS, chat and email, plus how to send them only when you’re actually closed.',
    seoDescription: 'After-hours auto-reply examples for shops, trades, salons, clinics and restaurants, for SMS, chat and email, and how to send them only when you’re closed.',
    category: 'Playbooks', accent: PURPLE, icon: 'clock',
    date: '2026-11-18T10:00:00+11:00', dateLabel: 'Nov 18, 2026', readTime: '7 min read', author: 'The Colvy Team',
    takeaways: [
      'A good after-hours reply does three things: confirms the message arrived, says when you’ll reply, and offers a way forward if it can’t wait.',
      'Keep SMS replies short. Chat can be a little warmer, and email can carry more detail.',
      'Never promise a time you can’t keep. “First thing when we open” beats a time you’ll miss.',
      'Send it only when you’re actually closed: tie the reply to your opening hours, not a fixed schedule.',
    ],
    content: `A customer messages you at 8:45pm. Nothing comes back. Maybe you'll see it in the morning, maybe it'll get buried under the overnight emails. Either way, from their side the business has gone quiet, so they try someone else.

An after-hours auto-reply fixes that in one line. It doesn't have to solve their problem tonight. It just has to tell them they've been heard.

![A quiet clothing shop after closing](/blog/after-hours-auto-reply-examples/closed-shop.jpg "The shop is closed. The inbox isn't.")

## What a good after-hours reply does

Three things, in this order:

1. **Confirms the message arrived.** "Thanks for your message" is enough.
2. **Says when you'll reply.** Be honest: "first thing when we open" or "by 10am tomorrow" if you can keep it.
3. **Offers a way forward if it can't wait.** A booking link, an emergency number, your returns page.

And it uses their name if you have it. It's a small thing that makes an automated message feel less automated.

## Examples you can copy

These use **{first_name}** and **{business_name}**, which Colvy fills in for you. Change the details to suit.

### Shops and online stores

> Hi {first_name}, thanks for your message! We're closed right now and will reply first thing when we open. If it's about an order, you can check its status anytime from the link in your order email.

### Trades and home services

> Hi {first_name}, thanks for getting in touch with {business_name}. We're off the tools for the day and will get back to you first thing tomorrow. If it's an emergency, like a burst pipe or no power, call us and follow the after-hours option.

### Salons, barbers and beauty

> Hi {first_name}! We're closed for the evening. You can book or move your appointment anytime online, and we'll reply to anything else when we open.

### Clinics and practices

> Thanks for your message, {first_name}. Our clinic is closed and messages aren't monitored after hours. We'll reply when we open. If this is a medical emergency, please call 000.

### Cafes and restaurants

> Hi {first_name}, thanks for your message! We're closed right now. You can book a table online anytime, and we'll answer anything else when we're back tomorrow.

## Fit the reply to the channel

- **SMS**: keep it short. One or two sentences. Long texts are sent in several parts, and a short one reads better on a lock screen anyway.
- **Website chat, Messenger, Instagram and WhatsApp**: a little warmer is fine. An emoji won't hurt if it suits your brand.
- **Email**: you can carry more, like your opening hours and links to your FAQs, because people expect email to be longer.

## Mistakes to avoid

- **Promising a time you'll miss.** "We'll reply within the hour" at 10pm sets you up to fail. "First thing when we open" is honest.
- **Sending it during opening hours.** A "we're closed" reply at 2pm on a Tuesday because the schedule was wrong is worse than nothing.
- **Sending it again and again.** Someone sending three messages in a row shouldn't get three identical replies.
- **Answering things that need a person.** An after-hours reply is an acknowledgement, not an answer to a complaint.

## How to send it automatically in Colvy

In Colvy, the after-hours reply is a ready-made automation. Go to **Settings → Automations**, press **New automation** and pick **After-hours reply**. It has three steps:

1. **When** a customer sends a message,
2. **Check** "Open or closed": closed,
3. **Send a reply** with your message.

![The Automations list with the after-hours reply live](/blog/after-hours-auto-reply-examples/automations-list.jpg "The after-hours reply, switched on next to two other flows.")

The check reads your opening hours from Business settings, so when your hours change, so does the reply. If you have more than one location, you count as open while any of them is open. Set your hours first, then press **Try it** to test the flow with "You're open right now" ticked and unticked before you switch it on.

The mistakes above are handled for you. The reply goes back on whichever channel the customer used, SMS, chat, email, Messenger, Instagram or WhatsApp, and by default it won't send again to the same conversation for 12 hours. A message only ever gets one automated reply. Spam, blocked senders and people who've opted out of texts never get one at all.

> [!TIP] Let Colvy AI help after hours
> If you use Colvy AI, add a **Hand to Colvy AI** step after the reply. The customer gets your after-hours note straight away, and the AI answers the routine questions, like opening hours or whether something's in stock, while you're closed. Anything it can't handle waits for your team in the morning.

Want more ideas? See [seven customer service flows worth drawing](/blog/customer-service-automation-small-business), or the full [automation builder guide](/blog/automations-builder-guide). Automations are included on the Inbox and Everything plans.

[Start free](/signup) and switch on your after-hours reply.`,
  },
]
