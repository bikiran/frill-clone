// What the marketing site says about Colvy's AI agents. One source for the
// /ai-agents page, the landing page's "AI team" section, the compare pages and
// the nav, so the claims stay the same everywhere.
//
// Every line here is grounded in what the agents actually do (lib/agent/roles.ts,
// pilot.ts, needs-you.ts, results.ts, business-memory.ts, learn.ts, explain.ts):
// no invented numbers, no promises the engine doesn't keep.

export type AgentKey = 'support' | 'reception' | 'sales' | 'operations' | 'reputation'

export type MarketingAgent = {
  key: AgentKey
  name: string            // "Support Agent"
  role: string            // one line, what it's for
  where: string           // where it works
  color: string
  icon: string            // FeatureIcon name
  does: string[]          // what it handles
  never: string           // the guardrail people ask about
  example: {
    channel: string       // "SMS", "Google review"…
    them: string          // what came in
    checks: string[]      // what the agent looked up, in order
    reply: string         // what it wrote
    status: string        // what happened to the reply
  }
}

export const AGENTS: MarketingAgent[] = [
  {
    key: 'support', name: 'Support Agent', color: '#2b59ff', icon: 'chat',
    role: 'Answers order, stock and opening-hours questions, and hands the rest to your team.',
    where: 'SMS, website chat, email, Instagram and Messenger',
    does: [
      '“Where’s my order?” from your live store and tracking',
      'Stock at each of your stores, from WooCommerce or Shopify',
      'Opening hours, holidays included, from Google Business Profile',
      'Back-in-stock requests: adds them to the waiting list',
      'Upset customer or something wrong: hands over with a note',
    ],
    never: 'Never guesses an order, price or date. If it can’t check it, it asks your team.',
    example: {
      channel: 'SMS',
      them: 'Hi, any update on my order? Placed it Monday',
      checks: ['Found order #4821 for this customer', 'Tracking: in transit, out for delivery tomorrow'],
      reply: 'Hi Mia, your order #4821 is on its way and due tomorrow. You can track it here: auspost.com.au/track/…',
      status: 'Sent on its own · backed by a live lookup',
    },
  },
  {
    key: 'reception', name: 'Reception Agent', color: '#00c48c', icon: 'calendar',
    role: 'Books, finds and moves appointments by text or chat.',
    where: 'SMS and website chat',
    does: [
      'Offers two to four real free times',
      'Sends a booking link to pick a time and pay the deposit',
      'Tells customers when their booking is',
      'Moves or cancels a booking, with your team’s OK',
      'Prices and deposits only from your service list',
    ],
    never: 'Never promises a refund. Your cancellation policy decides.',
    example: {
      channel: 'Website chat',
      them: 'Can I get a cut and colour this Saturday?',
      checks: ['Service: Cut & colour, 2 h, $40 deposit', 'Saturday free: 9:30, 11:00, 2:15'],
      reply: 'We’ve got Saturday at 9:30, 11:00 or 2:15. Pick one and pay the $40 deposit here: book.colvy.com/…',
      status: 'Waiting for approval · you can let these go on their own',
    },
  },
  {
    key: 'sales', name: 'Sales Agent', color: '#ff6a4d', icon: 'tag',
    role: 'Follows up carts, quotes and enquiries that went quiet. One helpful message, never pushy.',
    where: 'SMS and email',
    does: [
      'Abandoned carts: what they left, and a link back to checkout',
      'Unpaid quotes and payment requests: one friendly nudge',
      'Product enquiries: answers the question they asked',
      'Only says “a few left” when stock really is low',
      'Unusual carts go to a person instead',
    ],
    never: 'Never invents urgency, and never offers a discount unless your rules allow it.',
    example: {
      channel: 'SMS',
      them: 'Cart left at checkout: Fluval 307 canister filter',
      checks: ['Cart still open, customer can be texted', 'Stock: 2 left', 'Knowledge: free shipping over $99'],
      reply: 'Hi Josh, your Fluval 307 is still in your cart, and we’ve only got 2 left. Shipping’s free on this one: shop.example.com/cart/…',
      status: 'Drafted for you · send, edit or discard',
    },
  },
  {
    key: 'operations', name: 'Operations Agent', color: '#7c5cff', icon: 'kanban',
    role: 'Catches late, stuck and out-of-stock orders before the customer has to chase.',
    where: 'Behind the scenes, for your team',
    does: [
      'Checks the carrier for orders that should have moved',
      'Checks whether a missing item is back in stock',
      'Creates one task with a clear next step and the facts',
      'Writes the customer an honest update when they’d be left wondering',
      'Adds to the task you already have instead of duplicating it',
    ],
    never: 'Never promises refunds, compensation or dates it hasn’t confirmed.',
    example: {
      channel: 'Order alert',
      them: 'Order #3310 hasn’t moved in 6 days',
      checks: ['Carrier: last scan 6 days ago, Sydney depot', 'No open task for this order'],
      reply: 'Task for the team (high): Chase AusPost on #3310, stuck at the Sydney depot since Tuesday. Customer has been told it’s being looked into.',
      status: 'Task created on its own · within your daily limit',
    },
  },
  {
    key: 'reputation', name: 'Reputation Agent', color: '#d97706', icon: 'star',
    role: 'Replies to every Google review and Facebook or Instagram comment, in your voice.',
    where: 'Google reviews, Facebook and Instagram comments',
    does: [
      'Thanks people by name and mentions what they said',
      'Answers questions in comments from your own knowledge',
      '1–3 stars: apologises, invites contact, and tells your team',
      'Skips spam and abuse, and flags it to a person',
      'Never replaces a reply you already wrote',
    ],
    never: 'Never puts order details, prices or refunds in a public reply.',
    example: {
      channel: 'Google review ★★★★★',
      them: 'Great advice on my new tank, the staff really know their stuff!',
      checks: ['5 stars, no reply yet', 'Your voice: warm, sign off “The Reef & Fin team”'],
      reply: 'Thanks so much, Priya! We’re glad the advice helped, and we’d love to see the tank once it’s settled in. The Reef & Fin team',
      status: 'Posted on its own · 4–5★ thank-yous allowed',
    },
  },
]

// How much the agents do on their own: the three settings a business moves
// through (lib/agent/pilot.ts, policy.ts).
export const CONTROL_STEPS = [
  { tag: 'Day one', title: 'Suggest', body: 'Every reply arrives as a draft in the inbox. Your team sends, edits or discards it.' },
  { tag: 'When you trust it', title: 'Live, within limits', body: 'Pick the topics it may answer alone, how many a day, and verified customers only. A reply only goes out on its own when it’s backed by a live lookup.' },
  { tag: 'Any time', title: 'Pause all agents', body: 'One switch stops every agent. Queued work is cancelled and nothing new starts until you turn them back on.' },
]

// The parts around the agents that make them safe to leave running.
export const AGENT_PILLARS = [
  { icon: 'help', title: '“Why?” on everything', body: 'Every reply, hand-off and task links to what the customer asked, what the agent checked and found, and which permission allowed it.' },
  { icon: 'bell', title: 'Needs you', body: 'Drafts to approve, hand-overs nobody picked up and goals being missed right now, in one list, with a phone alert for anything urgent.' },
  { icon: 'book', title: 'Business Memory', body: 'Your tone, policies and rules in one place. When your team edits a draft, Colvy suggests the lesson, and it only sticks if you keep it.' },
  { icon: 'chart', title: 'Results', body: 'What the agents handled, what they brought to the team, minutes saved and carts won back, plus a weekly summary email.' },
  { icon: 'target', title: 'Goals', body: 'Set the outcomes you care about, like “every message answered within 15 minutes”, and see what’s slipping right now.' },
  { icon: 'link', title: 'Outside tools', body: 'Connect your other systems. Look-ups run on their own, changes wait for a person, and everything lands in the same trail.' },
]

// The plans that include the agents (app/pricing/Client.tsx TIERS ids).
export const AGENT_PLANS = ['omnichannel', 'everything'] as const
export const AGENT_PLANS_LABEL = 'Inbox and Everything plans'
