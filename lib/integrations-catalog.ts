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
  fields?: { key: string; label: string; placeholder: string; type: string }[]
  events?: string[]
}

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
    desc: 'Post to a Slack channel when ideas are submitted, voted on, or change status.',
    color: '#4A154B',
    bg: '#f9f0ff',
    logo: '/logos/slack.svg',
    category: 'Notifications',
    fields: [
      { key: 'webhook_url', label: 'Slack Webhook URL', placeholder: 'https://hooks.slack.com/services/...', type: 'text' },
      { key: 'channel', label: 'Channel', placeholder: '#product-feedback', type: 'text' },
    ],
    events: ['New Idea', 'New Vote', 'Status Change', 'New Comment'],
  },
  {
    id: 'jira',
    name: 'Jira',
    desc: 'Automatically create Jira issues from Colvy ideas.',
    color: '#0052CC',
    bg: '#e6f0ff',
    logo: '/logos/jira.svg',
    category: 'Project Management',
    fields: [
      { key: 'domain', label: 'Jira Domain', placeholder: 'yourcompany.atlassian.net', type: 'text' },
      { key: 'project_key', label: 'Project Key', placeholder: 'PROJ', type: 'text' },
      { key: 'api_token', label: 'API Token', placeholder: 'Your Jira API token', type: 'password' },
      { key: 'email', label: 'Jira Email', placeholder: 'you@company.com', type: 'email' },
    ],
    events: ['New Idea', 'Status Change'],
  },
  {
    id: 'linear',
    name: 'Linear',
    desc: 'Send ideas from Colvy straight to Linear as issues.',
    color: '#5E6AD2',
    bg: '#f0f0ff',
    logo: '/logos/linear.svg',
    category: 'Project Management',
    fields: [
      { key: 'api_key', label: 'Linear API Key', placeholder: 'lin_api_...', type: 'password' },
      { key: 'team_id', label: 'Team ID', placeholder: 'Your Linear team ID', type: 'text' },
    ],
    events: ['New Idea', 'Status Change'],
  },
  {
    id: 'trello',
    name: 'Trello',
    desc: 'Add new Colvy ideas as Trello cards automatically.',
    color: '#0079BF',
    bg: '#e8f4ff',
    logo: '/logos/trello.svg',
    category: 'Project Management',
    fields: [
      { key: 'api_key', label: 'Trello API Key', placeholder: 'Your Trello API key', type: 'password' },
      { key: 'token', label: 'Trello Token', placeholder: 'Your Trello token', type: 'password' },
      { key: 'board_id', label: 'Board ID', placeholder: 'Your Trello board ID', type: 'text' },
    ],
    events: ['New Idea'],
  },
  {
    id: 'zapier',
    name: 'Zapier',
    desc: 'Connect Colvy to 5000+ apps with Zapier automations.',
    color: '#FF4A00',
    bg: '#fff4f0',
    logo: '/logos/zapier.svg',
    category: 'Automation',
    fields: [
      { key: 'webhook_url', label: 'Zapier Webhook URL', placeholder: 'https://hooks.zapier.com/hooks/catch/...', type: 'text' },
    ],
    events: ['New Idea', 'New Vote', 'Status Change', 'New Comment', 'New Announcement'],
  },
  {
    id: 'github',
    name: 'GitHub',
    desc: 'Create GitHub issues from Colvy ideas.',
    color: '#24292F',
    bg: '#f6f8fa',
    logo: '/logos/github.svg',
    category: 'Development',
    fields: [
      { key: 'token', label: 'Personal Access Token', placeholder: 'ghp_...', type: 'password' },
      { key: 'repo', label: 'Repository', placeholder: 'owner/repo', type: 'text' },
    ],
    events: ['New Idea'],
  },
  {
    id: 'intercom',
    name: 'Intercom',
    desc: 'Create and manage Colvy ideas inside of Intercom.',
    color: '#286EFA',
    bg: '#e8f0ff',
    logo: '/logos/intercom.svg',
    category: 'Customer Support',
    fields: [
      { key: 'access_token', label: 'Access Token', placeholder: 'Your Intercom access token', type: 'password' },
    ],
    events: ['New Idea', 'Status Change'],
  },
  {
    id: 'zendesk',
    name: 'Zendesk',
    desc: 'Create and manage Colvy ideas inside of Zendesk.',
    color: '#03363D',
    bg: '#e8f5f5',
    logo: '/logos/zendesk.svg',
    category: 'Customer Support',
    fields: [
      { key: 'subdomain', label: 'Zendesk Subdomain', placeholder: 'yourcompany', type: 'text' },
      { key: 'email', label: 'Agent Email', placeholder: 'agent@yourcompany.com', type: 'email' },
      { key: 'api_token', label: 'API Token', placeholder: 'Your Zendesk API token', type: 'password' },
    ],
    events: ['New Idea', 'Status Change'],
  },
  {
    id: 'webhook',
    name: 'Custom Webhook',
    desc: 'Send Colvy events to any URL with a custom HTTP webhook.',
    color: '#374151',
    bg: '#f9fafb',
    logo: '/logos/webhook.svg',
    category: 'Automation',
    fields: [
      { key: 'url', label: 'Webhook URL', placeholder: 'https://yourapp.com/webhook', type: 'text' },
      { key: 'secret', label: 'Secret (optional)', placeholder: 'Signing secret for verification', type: 'password' },
    ],
    events: ['New Idea', 'New Vote', 'Status Change', 'New Comment', 'New Announcement'],
  },
]

export const CATEGORIES = ['All', ...Array.from(new Set(INTEGRATIONS.map(i => i.category)))]

/** Where an integration's settings live. */
export const integrationHref = (i: Integration) => i.isDedicated ? `/admin/integrations/${i.id}` : `/admin/integrations?i=${i.id}`
