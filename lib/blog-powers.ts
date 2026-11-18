import type { BlogPost } from '@/lib/blog'

// More Colvy Powers articles (November 2026). Every rule, number and label is
// checked against lib/powers/config.ts, lib/powers/challenges.ts,
// lib/powers/achievements.ts and Settings → Colvy Powers. Made-up example
// people only; no invented numbers, studies, quotes or customers.

const CORAL = '#ff6a4d', PURPLE = '#7c5cff', GREEN = '#00c48c', AMBER = '#d97706'

export const POWERS_POSTS: BlogPost[] = [
  {
    slug: 'gamification-customer-service-teams',
    cover: '/blog/gamification-customer-service-teams/cover.jpg',
    title: 'Gamification for customer service teams: what works and what backfires',
    excerpt: 'Points and leaderboards can make a busy inbox more fun, or turn your team into ticket-closing machines that annoy customers. Here’s what tends to backfire, what works instead, and how we built Colvy Powers around it.',
    seoDescription: 'Gamification can lift a support team or wreck it. What backfires (speed races, public rankings, points for busywork) and what to do instead.',
    category: 'Playbooks', accent: PURPLE, icon: 'trophy',
    date: '2026-11-18T17:00:00+11:00', dateLabel: 'Nov 18, 2026', readTime: '8 min read', author: 'The Colvy Team',
    takeaways: [
      'Reward finished work a customer would notice, not activity like clicks, one-word replies or time with a tab open.',
      'Put a ceiling on it. A daily limit stops anyone farming points and keeps it a game, not a second job.',
      'Make rankings optional. Team totals, or no leaderboard at all, suit plenty of teams better than a podium.',
      'Keep the prizes playful and the stakes low: no cash, no perks at work, and nothing that ever gets between you and a customer.',
    ],
    content: `The idea is simple and old: make repetitive work feel a little more like a game, and people enjoy it more. Points for answering customers. A level to climb. A bit of friendly competition.

Done well, it gives a busy team something to smile about and a reason to notice each other's good work. Done badly, you get people racing to close conversations before they're finished, customers getting three short replies where one good one would do, and the quiet person handling the hardest calls sitting at the bottom of a public ranking every week.

Here's what tends to go wrong, what to do instead, and how those rules shaped [Colvy Powers](/product/powers).

## Why gamification backfires

### It rewards activity instead of outcomes

If every message earns a point, you'll get more messages. Shorter ones, split into three, with less in each. If closing a conversation earns a point, conversations get closed before the customer's problem is actually fixed. People aren't being sneaky. They're doing exactly what the scoreboard asks.

### Speed becomes the only score

A race for the fastest reply sounds harmless. In practice it pushes people to grab the easy conversations and leave the tricky refund for someone else. The customer with the hardest problem waits longest.

### Public rankings sting

Whoever's at the bottom of the leaderboard is often the person on the phones with the angriest customers, or the one who works three days a week. Ranking them in front of everyone tells them their work doesn't count.

### The stakes get too high

Tie points to cash, time off or shifts, and a game turns into a pay dispute. Every rule becomes something to argue about, and every loophole gets found.

### It gets in the way

Pop-ups, sounds and badges sitting on top of the inbox slow down the very work they're meant to reward.

### It's easy to farm

If an "ok 👍" earns the same as a proper answer, the team will notice within a day. After that, the points mean nothing.

## What works instead

| Backfires | Works instead |
|---|---|
| Points for every message or click | Points for finished work a customer would notice |
| No ceiling | A daily limit per person |
| One person wins | Team goals that pay everyone who helped |
| A ranking everyone has to be in | A leaderboard you can show, reduce to team totals, or switch off |
| Cash, perks or time off | Playful rewards with no real-world value |
| Effects on top of the work | Small moments in the corner that can be dismissed |

### 1. Reward the work, not the busyness

Count things that mean a customer was actually helped. In Colvy Powers, resolving a conversation pays more than replying to one, and a resolve only counts after a real reply from you. Reopening and closing again doesn't pay twice.

The busywork doesn't count at all: one-word replies, internal notes and AI replies don't earn anything. A call has to be picked up and last at least 20 seconds, and voicemails don't count. A task you made for yourself and ticked off within ten minutes doesn't count either. If the work is undone, like a task that's reopened or an order that's cancelled, the reward is taken back.

### 2. Put a ceiling on it

A daily limit keeps it a game. Without one, the person who treats it like a second job runs away with it and everyone else stops caring. Colvy Powers caps each person at 150 coins and 300 XP a day by default, and busy rules have their own limits too, like up to 50 replies a day.

### 3. Make the team the unit

The best moments are shared ones. In Colvy Powers, a whole-team challenge pays everyone who helped when the team hits the target, so nobody has to beat a colleague to win. And when someone says thanks to a teammate, the teammate earns the reward, not the person saying it.

### 4. Let people choose how public it is

Some teams love a podium. Many don't. A good system lets you choose.

![The leaderboard options in Colvy Powers settings](/blog/how-to-set-up-colvy-powers/leaderboard-options.jpg "Everyone ranked, team totals only, or no leaderboard at all.")

Colvy Powers has three settings: everyone ranked, team totals only (one number for the whole team, no names), or off. Whichever you pick, the leaderboard shows names, levels and counts only, never customers or messages.

### 5. Keep the prizes playful

The moment points are worth real money, people stop playing and start negotiating. Colvy Coins can't be bought, cashed out or moved to another workspace. They buy things like confetti on the team's screen, a small crown next to your name, or a spotlight on a teammate's great work. Levels and badges unlock looks only, never access or permissions.

### 6. Never block the work

Customers come first, always. In Colvy Powers, playful moments sit in the corner of the screen and can be dismissed. Anyone can put up a Focus Shield for 30 quiet minutes without nudges or confetti, and customer messages and real alerts still come straight through.

![The Colvy Powers switch with its four promises](/blog/how-to-set-up-colvy-powers/switch-on.jpg "The four promises sit right on the switch that turns it on.")

### 7. Start everyone level

Switching on rewards shouldn't hand out a windfall for last month's work. Colvy Powers is off until an owner or admin turns it on, and work done before then never pays, so everyone starts from zero on the same day.

## A quick test before you start

For each thing your system rewards, ask: *if someone did the best possible thing for a customer here, would they earn more, or less?*

If a careful 20-minute fix earns less than ten quick "thanks!" replies, change the rule. If closing early beats solving properly, change the rule. If one person can win by working through lunch every day, add a limit.

![A busy shared desk with laptops and headsets](/blog/gamification-customer-service-teams/support-desks.jpg "Good gamification fits around the work. It never sits on top of it.")

## Where to go from here

If you'd like to try it, our guide to [setting up Colvy Powers](/blog/how-to-set-up-colvy-powers) walks through every setting, and these [team challenge ideas](/blog/team-challenge-ideas) point the team at things customers will feel.

[Start free](/signup) and switch on Colvy Powers when your team's ready.`,
  },
  {
    slug: 'how-to-set-up-colvy-powers',
    cover: '/blog/how-to-set-up-colvy-powers/cover.jpg',
    title: 'How to set up Colvy Powers for your team, step by step',
    excerpt: 'Colvy Powers is off until you switch it on, and every part of it can be tuned. Here’s how to set it up in Settings: what earns what, daily limits, the Power Shop, the leaderboard, who takes part and your first challenge.',
    seoDescription: 'Set up Colvy Powers in Settings: switch it on, choose what earns what, set daily limits, tune the Power Shop and leaderboard, and add a first challenge.',
    category: 'How-to', accent: AMBER, icon: 'coin',
    date: '2026-11-18T16:00:00+11:00', dateLabel: 'Nov 18, 2026', readTime: '8 min read', author: 'The Colvy Team',
    takeaways: [
      'Owners and admins set it up in Settings → Colvy Powers. Nothing changes for the team until you switch it on.',
      'Start with the defaults. They’re built to be fair, and you can change any value later.',
      'Choose how public it is: everyone ranked, team totals only, or no leaderboard at all.',
      'Add one challenge in your first week, and tell the team what it’s for before they spot the coin chip.',
    ],
    content: `Colvy Powers turns the work your team already does in Colvy into coins, XP and levels, with a shop of playful power-ups to spend the coins on. If you haven't met it yet, start with [what Colvy Powers is](/blog/colvy-powers-team-rewards).

This guide is for the person setting it up. It takes you through every part of **Settings → Colvy Powers**, in the order we'd do it.

## Before you start

- **Owners and admins** can change the settings. Everyone else just sees the fun parts.
- It's **included on every plan**.
- It's **off by default**. Nothing changes in the app until you switch it on, and work done before that doesn't earn anything, so everyone starts from zero on the same day.

## Step 1: Switch it on

Go to **Settings → Colvy Powers** and flip the switch. From then on your team sees a small coin chip in the top bar, with their level, coins and today's progress, and a Colvy Powers page with the Power Shop, challenges, leaderboard and badges.

![The Colvy Powers switch in Settings](/blog/how-to-set-up-colvy-powers/switch-on.jpg "One switch turns it on. The four promises are printed right under it.")

The promises under the switch are worth reading out to your team: no real money, nothing grants access or permissions, customer messages and real alerts are never held back, and anything aimed at someone can be dismissed.

## Step 2: Decide what earns what

The **What earns what** list shows every way to earn, with coins, XP and a per-day limit for each, and a switch to turn it off.

![The What earns what settings](/blog/how-to-set-up-colvy-powers/what-earns-what.jpg "Coins, XP and a daily limit for each kind of work.")

The defaults:

| Work | Coins | XP | Per day |
|---|---|---|---|
| Resolve a conversation | 10 | 10 | no limit |
| Reply to a customer | 2 | 2 | 50 |
| Answer a customer's call | 5 | 5 | 40 |
| Complete an assigned task | 15 | 15 | no limit |
| Complete a job | 25 | 25 | no limit |
| Fulfil an order | 5 | 5 | 50 |
| Positive customer feedback | 30 | 30 | no limit |
| A teammate says thanks | 10 | 5 | no limit |
| Active on Colvy today | 5 | 5 | 1 |
| Time in Colvy (each hour of active use) | 5 | 10 | 8 |
| Finish a challenge | 50 | 50 | no limit |

"No limit" here still sits inside the daily limits in step 3. Rules for things you don't use yet, like calls, jobs or Google reviews, are hidden and don't pay until you start using them.

> [!TIP] Keep resolving worth more than replying
> If you change the numbers, keep a finished conversation worth clearly more than a single reply. Otherwise you're rewarding more messages, not happier customers.

## Step 3: Set the daily limits

Daily limits are per person, per day, in your business's time zone. They keep it fair and stop anyone farming.

![The Daily limits settings](/blog/how-to-set-up-colvy-powers/daily-limits.jpg "Five limits, per person, per day.")

- **Coins from rewards**: 150 by default.
- **XP from rewards**: 300 by default.
- **Thanks each person can give**: 3 a day.
- **Coins each person can gift**: 200 a day.
- **Powers aimed at one person, per hour**: 4, so nobody gets swamped with nudges and pins.

A challenge's own reward is paid on top of the daily limits, so finishing one always pays in full.

## Step 4: Tune the Power Shop

Under **Powers** you'll find all twelve power-ups. For each one you can switch it off, change the price, and set how often it can be used: minutes between uses, and uses per day (0 means no limit).

A few sensible starting points:

- **Prefer a quieter app?** Switch off Nudge and Confetti Bomb, and keep the rest.
- **Coins piling up?** Raise prices a little. Nobody can afford anything after a week? Lower them.
- **Priority Pin** only floats a conversation to the top of a teammate's inbox for 30 minutes, and they can unpin it. It can't send a conversation to someone who couldn't already open that inbox.

## Step 5: Choose the leaderboard

![The leaderboard options](/blog/how-to-set-up-colvy-powers/leaderboard-options.jpg "Choose how public it is.")

- **Everyone ranked**: a podium and a list, by week or month.
- **Team totals only**: one number for the whole team, no names.
- **Off**: no leaderboard at all.

If you're not sure, start with team totals only. You can switch to a ranking later if the team asks for one. Whichever you choose, it only ever shows names, levels and counts, never customers or messages.

## Step 6: Choose who takes part

By default, everyone on the team takes part. Under **Who takes part** you can narrow it by role (owners, admins, team members) and, if you have more than one location, by location. Leave both empty for everyone. The owner always takes part.

## Step 7: Add your first challenge

Challenges give the team something to aim for together. Each one has a title, who it's for, what counts, a target and a reward.

![Adding a challenge in Settings](/blog/how-to-set-up-colvy-powers/challenges-settings.jpg "A title, who it’s for, what counts, a target and a reward.")

- **Who it's for**: each person daily, each person weekly, or the whole team weekly. Weeks run Monday to Sunday.
- **What counts**: conversations resolved, customer replies, calls answered, tasks completed, jobs completed, orders fulfilled, thanks received or happy reviews.
- **Reward**: coins and XP. The form starts at 50 of each.

A whole-team challenge pays everyone who helped when the team hits the target. You can pause or remove a challenge at any time. For inspiration, see our [team challenge ideas](/blog/team-challenge-ideas).

## Step 8: Team wallets, if you need them

**Team wallets** let an owner or admin give or take back coins, with a reason. The change and the reason are kept, and show in the Activity log and in **Coin changes**. You can't give yourself coins, and XP can never be handed out: it's only earned.

## Tell the team before they notice

The coin chip will appear for everyone the moment you switch on, so say something first. A short note does it:

> [!EXAMPLE] A note for the team
> We've switched on Colvy Powers. You'll earn coins and XP for real work: resolving conversations, answering calls, finishing tasks. Spend the coins on silly power-ups in the Power Shop. There's no money in it and it never gets in the way of customers. This week's team challenge: 60 tasks between us.

[Start free](/signup), or read more about [Colvy Powers](/product/powers).`,
  },
  {
    slug: 'team-challenge-ideas',
    cover: '/blog/team-challenge-ideas/cover.jpg',
    title: '12 team challenge ideas that actually help your customers',
    excerpt: 'A good challenge points the whole team at something customers will feel: more conversations properly resolved, every call picked up, more happy reviews. Here are twelve to run in Colvy Powers, with example targets and rewards.',
    seoDescription: 'Twelve team challenge ideas for customer-facing teams, with example targets and rewards, plus how to pick targets that are fair and actually help customers.',
    category: 'Playbooks', accent: GREEN, icon: 'flame',
    date: '2026-11-18T15:00:00+11:00', dateLabel: 'Nov 18, 2026', readTime: '7 min read', author: 'The Colvy Team',
    takeaways: [
      'Pick challenges customers would thank you for, not ones that just make a number go up.',
      'Whole-team challenges pay everyone who helped, so nobody has to beat a colleague for the team to win.',
      'Set targets a good, normal day or week reaches. A challenge nobody finishes teaches people to ignore challenges.',
      'Run one or two at a time, and change them every few weeks so they stay fresh.',
    ],
    content: `A challenge is the simplest way to point a whole team at the same thing for a day or a week. Pick the right thing and customers feel it: fewer people waiting, calls picked up, problems actually solved. Pick the wrong thing and you get a burst of busywork.

Here are twelve challenges worth running in [Colvy Powers](/product/powers), and how to set targets that are fair.

## How challenges work in Colvy Powers

An owner or admin adds challenges in **Settings → Colvy Powers**. Each one has:

- **Who it's for**: each person daily, each person weekly, or the whole team weekly.
- **What counts**: conversations resolved, customer replies, calls answered, tasks completed, jobs completed, orders fulfilled, thanks received or happy reviews.
- **A target and a reward** in coins and XP.

Daily challenges reset each day in your business's time zone. Weekly ones run Monday to Sunday. A whole-team challenge pays everyone who helped when the team reaches the target.

Progress counts the same checked rewards as everything else in Colvy Powers, so challenges can't be gamed either. One-word replies, notes and AI replies don't count toward a reply challenge, and a call has to last at least 20 seconds.

![Challenges in Colvy Powers](/blog/team-challenge-ideas/challenges.jpg "Each challenge shows progress and time left. Team challenges show your share too.")

## Each person, daily

Short, achievable goals that give a normal day a little shape.

**1. Close 8 conversations today.** Conversations resolved, target 8. A resolve only counts after a real reply, so this rewards actually finishing things.

**2. Answer 20 customers today.** Customer replies, target 20. Each customer message is answered once, by whoever replies properly first, so this can't be padded by splitting one answer into three.

**3. Pick up the phone.** Calls answered, target 10. Useful on days you know will be busy, like after a newsletter goes out.

**4. Out the door.** Orders fulfilled, target 15. For shops: orders you mark shipped, collected or completed in Colvy.

## Each person, weekly

A bit more room, so one slow day doesn't sink it.

**5. Clear your list.** Tasks completed, target 15. Tasks count when they're assigned to you, but one you made yourself and ticked within ten minutes doesn't, so this rewards follow-ups actually getting done.

**6. Signed off.** Jobs completed, target 5. For trades and service teams: everyone assigned to the job counts it.

**7. Someone's hero.** Thanks received, target 3. Keep the reward small on this one. Each person can thank up to three teammates a day, and on a tiny team you don't want it to become a swap.

**8. Named in a review.** Happy reviews, target 1. A 4 or 5 star Google review that names you. Pair it with a gentle habit of [asking happy customers for a review](/blog/how-to-get-more-google-reviews).

## Whole team, weekly

These are the ones we'd start with. Everyone pulls together, and everyone who helped gets the reward.

**9. Team: 60 tasks this week.** Tasks completed, target 60. Great for clearing the backlog of call-backs and follow-ups.

**10. The big clear-out.** Conversations resolved, target 100. Pick a week after a sale or a busy weekend.

**11. Every call counts.** Calls answered, target 80. Best during your busiest season.

**12. Five-star week.** Happy reviews, target 3. A nice one to celebrate when it lands.

![Confetti falling against a blue background](/blog/team-challenge-ideas/confetti.jpg "When the team hits it, someone will probably buy a Confetti Bomb.")

## Example targets and rewards

The numbers above are examples for a small team. Set yours from a normal week, not a record one.

| Challenge | Who | Example target | Example reward |
|---|---|---|---|
| Close 8 conversations today | Each person, daily | 8 | 40 coins, 40 XP |
| Clear your list | Each person, weekly | 15 tasks | 80 coins, 80 XP |
| Team: 60 tasks this week | Whole team, weekly | 60 tasks | 60 coins, 80 XP each |
| Five-star week | Whole team, weekly | 3 reviews | 100 coins, 100 XP each |

## How to pick a fair target

- **Look at last week first.** The leaderboard shows counts by week or month, for resolved conversations, replies, calls, tasks, jobs, orders and thanks.
- **Aim for a good, normal day.** If nobody finishes a challenge, people stop looking at challenges.
- **Remember the daily limits.** Once someone has used up both their daily coins and XP, more work that day stops counting toward challenges too. Keep daily targets to a good day's work, or raise the limits.
- **Reward weekly and team challenges more** than daily ones. The form starts at 50 coins and 50 XP, which suits a daily challenge.

## Challenges to avoid

- **Anything about speed alone.** It pushes people to grab easy conversations and leave hard ones.
- **Ones only one person can win.** Use a whole-team challenge instead.
- **Targets that pull people away from customers**, like a thanks challenge so big that people start trading thank-yous.

Run one or two at a time, and swap them every few weeks. For the full set-up, see [how to set up Colvy Powers](/blog/how-to-set-up-colvy-powers).

[Start free](/signup) and set your team's first challenge.`,
  },
  {
    slug: 'employee-recognition-ideas-small-teams',
    cover: '/blog/employee-recognition-ideas-small-teams/cover.jpg',
    title: 'Employee recognition ideas for small teams (that cost nothing)',
    excerpt: 'In a small team, a specific thank-you lands harder than any gift card. Here are ten recognition ideas that cost nothing, from naming customer wins to peer thanks, and how Colvy Powers builds a few of them into the working day.',
    seoDescription: 'Ten free employee recognition ideas for small teams: specific thanks, peer recognition, naming customer wins and celebrating milestones.',
    category: 'Growth', accent: CORAL, icon: 'gift',
    date: '2026-11-18T14:00:00+11:00', dateLabel: 'Nov 18, 2026', readTime: '7 min read', author: 'The Colvy Team',
    takeaways: [
      'Specific beats generic: say what they did, and what it meant for the customer.',
      'Soon beats formal. A thank-you on the day counts for more than a speech at the end of the quarter.',
      'Thanks from teammates matter as much as thanks from the boss, and they spread the habit.',
      'Ask people how they like to be thanked. Not everyone wants confetti on every screen.',
    ],
    content: `Small businesses rarely have a budget for bonuses, trophies and team trips. The good news is that most of what makes people feel valued at work costs nothing at all. People want to know that someone noticed.

Here are ten ways to make sure they know, and how [Colvy Powers](/product/powers) builds a few of them into the working day.

## What makes recognition land

- **It's specific.** "Thanks for sorting out Mrs Lee's double charge before she even asked" beats "great job this week".
- **It's soon.** The same day, ideally. The longer you wait, the less it means.
- **It comes from peers too.** A thank-you from the person you covered for lands differently from one from the boss.
- **It's tied to customers.** It reminds everyone why the work matters.
- **It fits the person.** Some people love a public shout-out. Others would rather hear it quietly.

## 10 ideas that cost nothing

### 1. Read out reviews that name someone

When a customer names a staff member in a review, share it with the whole team. In Colvy Powers, a 4 or 5 star Google review that names a teammate earns them 30 coins and the **Customer favourite** badge, automatically.

### 2. Say thanks on the day, in writing

A written thank-you can be reread. In Colvy Powers anyone can **say thanks** to a teammate with a short note, like "covered my calls while I was at the dentist". The teammate earns the reward, not the person saying thanks, and each person can thank up to three teammates a day so it stays meaningful.

### 3. Put great work in the spotlight

Some work deserves more than a private message. **Spotlight** puts a teammate's great work on everyone's screen for a day, in a small card in the corner.

![A Spotlight card celebrating a teammate](/blog/employee-recognition-ideas-small-teams/spotlight.jpg "Spotlight: one teammate’s great work, on everyone’s screen for a day.")

### 4. Celebrate team wins, not just individual ones

A team that only celebrates individuals ends up competing. Set a whole-team goal for the week and celebrate when you hit it. Colvy Powers' team challenges pay everyone who helped, and a **Confetti Bomb** puts a burst of confetti and your message on the whole team's screen.

### 5. Share the save stories

Once a week, ask: "who saved a customer this week?" The refund that turned into a five-star review, the delivery rescued at 4:55pm. It takes five minutes at a catch-up and costs nothing.

### 6. Mark milestones

First conversation resolved. Fifty. Two hundred and fifty. Colvy Powers awards badges for milestones like these automatically, along with levels from Rookie to Colvy Master, so progress gets noticed even when nobody's counting.

![Badges in Colvy Powers](/blog/employee-recognition-ideas-small-teams/badges.jpg "Badges are just for show. They never unlock anything at work.")

### 7. Let people pick their own reward

People like different things. In Colvy Powers, coins are spent however the person likes in the Power Shop: a crown next to their name, a custom status, a Mystery Box for a new profile look, or a quiet half-hour with Focus Shield.

### 8. Pass it on

When someone helps you out, pass a bit of your good fortune on. Colvy Powers' **Coin Gift** sends some of your coins to a teammate. Coins only, never XP, so levels always reflect each person's own work.

### 9. Cover for someone

The most valuable thing you can give a busy colleague is time. Take their phones for an hour so they can finish the thing they keep getting pulled away from. No app needed for this one.

### 10. Ask how they like to be thanked

Ask, once, in a one-to-one. Then remember the answer. If someone hates being singled out, thank them privately, and choose a leaderboard setting that suits the team: everyone ranked, team totals only, or off.

![A team raising a glass under string lights](/blog/employee-recognition-ideas-small-teams/celebrate.jpg "Big celebrations are great. Small, frequent ones matter more.")

## Recognition isn't a replacement for fair pay

One honest note: none of this replaces fair pay, reasonable workloads and a manager who listens. Recognition works on top of those things, not instead of them. Colvy Coins have no real-world value on purpose. They're a way to say "we noticed", not a way to pay people.

If you'd like to build these habits into the working day, see [how Colvy Powers works](/blog/colvy-powers-team-rewards) or [how to set it up](/blog/how-to-set-up-colvy-powers).

[Start free](/signup) and say thanks to someone today.`,
  },
]
