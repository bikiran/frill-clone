// The integrations Colvy offers. Shared by the Integrations page and the
// sidebar that stays visible on every integration's own page.

export type Integration = {
  id: string
  name: string
  desc: string
  color: string
  bg: string
  logo: string
  category: string
  /** Has its own page at /admin/integrations/<id>. */
  isDedicated?: boolean
  fields?: IntegrationField[]
  /** Colvy events this integration can act on (ids from INTEGRATION_EVENTS). Omitted = all. */
  events?: string[]
  /** Events ticked when it's first set up. */
  defaultEvents?: string[]
  /** What it does with an event, in one line. */
  action?: string
  /** How to get the details it needs. */
  setup?: string[]
}

export type IntegrationField = {
  key: string
  label: string
  placeholder: string
  type: 'text' | 'email' | 'password' | 'url'
  /** Stored but never sent back to the browser (shown as ••••1234). */
  secret?: boolean
  optional?: boolean
  help?: string
}

// ── Colvy events an integration can be told about ────────────────────────────
export const EVENT_GROUPS: { group: string; events: { id: string; label: string; hint?: string }[] }[] = [
  { group: 'Inbox', events: [
    { id: 'conversation.created', label: 'New conversation', hint: 'Chat, SMS, email, Facebook or Instagram' },
    { id: 'message.received', label: 'New customer message', hint: 'Every message a customer sends' },
  ] },
  { group: 'Orders', events: [
    { id: 'order.created', label: 'New order', hint: 'WooCommerce and Prexty' },
    { id: 'order.status_changed', label: 'Order status changed' },
  ] },
  { group: 'Bookings', events: [
    { id: 'booking.created', label: 'New booking' },
    { id: 'booking.rescheduled', label: 'Booking rescheduled' },
    { id: 'booking.cancelled', label: 'Booking cancelled' },
  ] },
  { group: 'Payments', events: [
    { id: 'payment.received', label: 'Payment received', hint: 'Payment links, invoices, bookings and forms' },
  ] },
  { group: 'Support', events: [
    { id: 'ticket.created', label: 'New ticket' },
    { id: 'ticket.status_changed', label: 'Ticket status changed' },
  ] },
  { group: 'Reviews', events: [
    { id: 'review.received', label: 'New Google review' },
  ] },
  { group: 'Calls', events: [
    { id: 'call.missed', label: 'Missed call' },
    { id: 'voicemail.received', label: 'New voicemail' },
  ] },
  { group: 'Forms', events: [
    { id: 'form.submitted', label: 'Form submitted' },
  ] },
  { group: 'Tasks', events: [
    { id: 'task.created', label: 'New task' },
  ] },
  { group: 'Feedback', events: [
    { id: 'idea.created', label: 'New idea' },
    { id: 'idea.voted', label: 'New vote' },
    { id: 'idea.status_changed', label: 'Idea status changed' },
    { id: 'idea.commented', label: 'New comment on an idea' },
    { id: 'announcement.published', label: 'Announcement published' },
  ] },
]
export const INTEGRATION_EVENTS = EVENT_GROUPS.flatMap(g => g.events.map(e => ({ ...e, group: g.group })))
export const eventLabel = (id: string) => INTEGRATION_EVENTS.find(e => e.id === id)?.label || id

// Settings saved by the first version used labels; map them to event ids.
const LEGACY_EVENTS: Record<string, string> = {
  'New Idea': 'idea.created', 'New Vote': 'idea.voted', 'Status Change': 'idea.status_changed',
  'New Comment': 'idea.commented', 'New Announcement': 'announcement.published',
}
export const normaliseEvents = (list: any): string[] => Array.from(new Set((Array.isArray(list) ? list : [])
  .map((e: any) => LEGACY_EVENTS[String(e)] || String(e))
  .filter((e: string) => INTEGRATION_EVENTS.some(x => x.id === e))))

export const INTEGRATIONS: Integration[] = [
  {
    id: 'woocommerce',
    name: 'WooCommerce',
    desc: 'Sync your WooCommerce customers and orders directly into Colvy for better customer insights.',
    color: '#96588A',
    bg: '#f3e8ff',
    logo: '/logos/woocommerce.svg',
    category: 'E-Commerce',
    isDedicated: true, // Special flag for custom page
  },
  {
    id: 'shopify',
    name: 'Shopify',
    desc: 'Connect your Shopify store to sync customers into Colvy. Works with multiple stores.',
    color: '#95BF47',
    bg: '#eefbe0',
    logo: '/logos/shopify.svg',
    category: 'E-Commerce',
    isDedicated: true,
  },
  {
    id: 'prexty',
    name: 'Prexty POS',
    desc: 'Connect your Prexty point-of-sale to pull customer order history into the chat.',
    color: '#4f46e5',
    bg: '#eef2ff',
    logo: '/logos/prexty.svg',
    category: 'E-Commerce',
    isDedicated: true,
  },
  {
    id: 'stripe',
    name: 'Stripe Payments',
    desc: 'Take card payments and send invoices directly inside the chat. Connect your own Stripe account.',
    color: '#635BFF',
    bg: '#f5f3ff',
    logo: '/logos/stripe.svg',
    category: 'Payments',
    isDedicated: true,
  },
  {
    id: 'calls',
    name: 'Calls & SMS',
    desc: 'Call customers from your browser and continue live chats over SMS to their mobile.',
    color: '#00c08b',
    bg: '#e6faf4',
    logo: '/logos/calls.svg',
    category: 'Communication',
    isDedicated: true,
  },
  {
    id: 'slack',
    name: 'Slack',
    desc: 'Post new orders, bookings, payments, messages, reviews and more to a Slack channel.',
    color: '#4A154B', bg: '#f9f0ff', logo: '/logos/slack.svg', category: 'Notifications',
    action: 'Posts a message with the details and an "Open in Colvy" button.',
    fields: [
      { key: 'webhook_url', label: 'Incoming webhook URL', placeholder: 'https://hooks.slack.com/services/…', type: 'url', secret: true },
      { key: 'mention', label: 'Mention', placeholder: '@here', type: 'text', optional: true, help: 'Optional: @here, @channel, or a user ID like <@U012AB3CD>.' },
    ],
    defaultEvents: ['conversation.created', 'order.created', 'booking.created', 'payment.received', 'review.received', 'ticket.created'],
    setup: [
      'Open api.slack.com/apps and create an app (From scratch) in your workspace.',
      'Turn on Incoming Webhooks, click "Add New Webhook to Workspace" and pick the channel.',
      'Copy the webhook URL and paste it here.',
    ],
  },
  {
    id: 'jira',
    name: 'Jira',
    desc: 'Create Jira issues from new ideas, tickets, tasks and other Colvy events.',
    color: '#0052CC', bg: '#e6f0ff', logo: '/logos/jira.svg', category: 'Project Management',
    action: 'Creates an issue in your project with the details and a link back to Colvy.',
    fields: [
      { key: 'domain', label: 'Jira site', placeholder: 'yourcompany.atlassian.net', type: 'text' },
      { key: 'email', label: 'Your Atlassian email', placeholder: 'you@company.com', type: 'email' },
      { key: 'api_token', label: 'API token', placeholder: 'Atlassian API token', type: 'password', secret: true },
      { key: 'project_key', label: 'Project key', placeholder: 'PROJ', type: 'text' },
      { key: 'issue_type', label: 'Issue type', placeholder: 'Task', type: 'text', optional: true, help: 'Defaults to Task.' },
    ],
    defaultEvents: ['idea.created', 'ticket.created'],
    setup: [
      'Create an API token at id.atlassian.com → Security → API tokens.',
      'Your project key is the short code before issue numbers (e.g. PROJ in PROJ-12).',
    ],
  },
  {
    id: 'linear',
    name: 'Linear',
    desc: 'Create Linear issues from new ideas, tickets, tasks and other Colvy events.',
    color: '#5E6AD2', bg: '#f0f0ff', logo: '/logos/linear.svg', category: 'Project Management',
    action: 'Creates an issue in your team with the details and a link back to Colvy.',
    fields: [
      { key: 'api_key', label: 'Personal API key', placeholder: 'lin_api_…', type: 'password', secret: true },
      { key: 'team_key', label: 'Team key', placeholder: 'ENG', type: 'text', help: 'The prefix on your issue numbers, like ENG in ENG-123.' },
    ],
    defaultEvents: ['idea.created', 'ticket.created'],
    setup: ['In Linear, open Settings → Account → Security & access → Personal API keys and create a key.'],
  },
  {
    id: 'trello',
    name: 'Trello',
    desc: 'Add a Trello card for new ideas, tickets, tasks, bookings and more.',
    color: '#0079BF', bg: '#e8f4ff', logo: '/logos/trello.svg', category: 'Project Management',
    action: 'Adds a card to the list you choose, with the details and a link back to Colvy.',
    fields: [
      { key: 'api_key', label: 'API key', placeholder: 'Trello API key', type: 'text' },
      { key: 'token', label: 'Token', placeholder: 'Trello token', type: 'password', secret: true },
      { key: 'board_url', label: 'Board link', placeholder: 'https://trello.com/b/AbCd1234/my-board', type: 'url' },
      { key: 'list_name', label: 'List', placeholder: 'To do', type: 'text', optional: true, help: 'The list cards go into. Defaults to the first list.' },
    ],
    defaultEvents: ['idea.created', 'ticket.created', 'task.created'],
    setup: [
      'Open trello.com/power-ups/admin, create a Power-Up, and generate an API key.',
      'On the same page, click the Token link to authorise it and copy the token.',
      'Copy your board’s address from the browser.',
    ],
  },
  {
    id: 'zapier',
    name: 'Zapier',
    desc: 'Start a Zap from any Colvy event and connect Colvy to 6,000+ apps.',
    color: '#FF4A00', bg: '#fff4f0', logo: '/logos/zapier.svg', category: 'Automation',
    action: 'Sends the event to your Zap with every field ready to map.',
    fields: [
      { key: 'webhook_url', label: 'Catch hook URL', placeholder: 'https://hooks.zapier.com/hooks/catch/…', type: 'url', secret: true },
    ],
    defaultEvents: ['order.created', 'booking.created', 'payment.received', 'form.submitted'],
    setup: [
      'In Zapier, create a Zap with the trigger "Webhooks by Zapier" → "Catch Hook".',
      'Copy the custom webhook URL it gives you and paste it here.',
      'Click "Send test event" below so Zapier can see the fields.',
    ],
  },
  {
    id: 'github',
    name: 'GitHub',
    desc: 'Open GitHub issues from new ideas, tickets and other Colvy events.',
    color: '#24292F', bg: '#f6f8fa', logo: '/logos/github.svg', category: 'Development',
    action: 'Opens an issue in your repository with the details and a link back to Colvy.',
    fields: [
      { key: 'token', label: 'Access token', placeholder: 'github_pat_… or ghp_…', type: 'password', secret: true },
      { key: 'repo', label: 'Repository', placeholder: 'owner/repo', type: 'text' },
      { key: 'labels', label: 'Labels', placeholder: 'colvy, feedback', type: 'text', optional: true, help: 'Optional, comma separated.' },
    ],
    defaultEvents: ['idea.created'],
    setup: ['Create a fine-grained token at github.com/settings/tokens with "Issues: Read and write" on the repository.'],
  },
  {
    id: 'intercom',
    name: 'Intercom',
    desc: 'Keep Intercom up to date: create the customer and add a note for each order, booking, payment or message.',
    color: '#286EFA', bg: '#e8f0ff', logo: '/logos/intercom.svg', category: 'Customer Support',
    action: 'Finds or creates the customer in Intercom and adds a note to them.',
    fields: [
      { key: 'access_token', label: 'Access token', placeholder: 'Intercom access token', type: 'password', secret: true },
    ],
    defaultEvents: ['order.created', 'booking.created', 'payment.received', 'review.received'],
    setup: ['In Intercom, open Settings → Integrations → Developer Hub, create an app, and copy its access token.'],
  },
  {
    id: 'zendesk',
    name: 'Zendesk',
    desc: 'Create Zendesk tickets from new conversations, support tickets, forms, missed calls and reviews.',
    color: '#03363D', bg: '#e8f5f5', logo: '/logos/zendesk.svg', category: 'Customer Support',
    action: 'Creates a ticket with the customer as requester and a link back to Colvy.',
    fields: [
      { key: 'subdomain', label: 'Zendesk subdomain', placeholder: 'yourcompany', type: 'text', help: 'The part before .zendesk.com.' },
      { key: 'email', label: 'Agent email', placeholder: 'agent@yourcompany.com', type: 'email' },
      { key: 'api_token', label: 'API token', placeholder: 'Zendesk API token', type: 'password', secret: true },
    ],
    defaultEvents: ['ticket.created', 'form.submitted'],
    setup: ['In Zendesk Admin Center, open Apps and integrations → APIs → Zendesk API, enable token access and add a token.'],
  },
  {
    id: 'webhook',
    name: 'Custom Webhook',
    desc: 'Send any Colvy event as JSON to your own URL, signed so you can verify it came from Colvy.',
    color: '#374151', bg: '#f9fafb', logo: '/logos/webhook.svg', category: 'Automation',
    action: 'POSTs a JSON body to your URL. With a secret, each request carries an X-Colvy-Signature header.',
    fields: [
      { key: 'url', label: 'Endpoint URL', placeholder: 'https://yourapp.com/webhooks/colvy', type: 'url' },
      { key: 'secret', label: 'Signing secret', placeholder: 'Any long random string', type: 'password', secret: true, optional: true, help: 'Recommended. Used to sign each request (HMAC-SHA256).' },
    ],
    defaultEvents: ['conversation.created', 'order.created', 'booking.created', 'payment.received'],
    setup: [
      'Your endpoint receives a POST with { id, event, created_at, company, data }.',
      'Verify X-Colvy-Signature: t=<timestamp>,v1=<hex>, where v1 = HMAC-SHA256(secret, "<timestamp>.<raw body>").',
      'Reply with any 2xx status. Colvy retries once if your server errors.',
    ],
  },
]

export const CATEGORIES = ['All', ...Array.from(new Set(INTEGRATIONS.map(i => i.category)))]

/** Where an integration's settings live. */
export const integrationHref = (i: Integration) => i.isDedicated ? `/admin/integrations/${i.id}` : `/admin/integrations?i=${i.id}`
