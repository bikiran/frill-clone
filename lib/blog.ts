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
