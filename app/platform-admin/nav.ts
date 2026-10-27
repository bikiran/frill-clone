// Super Admin menu: every page, grouped by the job you're doing, with a
// one-line description (shown in search and as a tooltip). Page keys are the
// URL hash (#companies, #intel_revenue …) and never change, so links and
// bookmarks keep working when a page moves group or is renamed.

export type NavItem = { key: string; label: string; icon: string; desc: string; keywords?: string }
export type NavGroup = { title: string; icon: string; items: NavItem[] }

export const NAV_HOME: NavItem = { key: 'overview', label: 'Dashboard', icon: 'overview', desc: 'Today at a glance: what needs you, key numbers and platform health', keywords: 'home overview' }

export const NAV_GROUPS: NavGroup[] = [
  {
    title: 'Customers', icon: 'companies', items: [
      { key: 'companies', label: 'Companies', icon: 'companies', desc: 'Every workspace: plan, entitlements, notes, enter as admin', keywords: 'business workspace tenant' },
      { key: 'users', label: 'Users', icon: 'users', desc: 'Every account and the workspaces it belongs to', keywords: 'people accounts members' },
      { key: 'signups', label: 'Sign-ups', icon: 'signups', desc: 'Sign-up attempts, codes sent, and where people get stuck', keywords: 'signup leads abandoned' },
      { key: 'intel_health', label: 'Customer health', icon: 'agent', desc: 'A health score for every business, and who needs a hand', keywords: 'churn risk score' },
      { key: 'demos', label: 'Demo workspaces', icon: 'companies', desc: 'The public showcase and private prospect demos' },
    ],
  },
  {
    title: 'Revenue', icon: 'billing', items: [
      { key: 'intel_revenue', label: 'Revenue', icon: 'billing', desc: 'MRR and how it moves, top customers, what’s at risk, cost to serve', keywords: 'mrr arr churn ltv money' },
      { key: 'subs', label: 'Subscriptions', icon: 'subs', desc: 'Live Stripe subscriptions', keywords: 'stripe plans' },
      { key: 'billing', label: 'Billing & payments', icon: 'billing', desc: 'Colvy’s billing setup, and in-chat payments across all businesses', keywords: 'stripe pay links' },
      { key: 'smscredits', label: 'SMS credits', icon: 'billing', desc: 'Prepaid SMS balances and top-ups per business' },
      { key: 'sms', label: 'SMS pricing', icon: 'billing', desc: 'Carrier cost and the price per text Colvy charges' },
    ],
  },
  {
    title: 'Growth', icon: 'analytics', items: [
      { key: 'intel', label: 'Website overview', icon: 'analytics', desc: 'Visitors, engagement and conversion on colvy.com vs the previous period', keywords: 'executive intelligence posthog' },
      { key: 'intel_live', label: 'Live visitors', icon: 'users', desc: 'Who is on colvy.com and in the app right now', keywords: 'realtime now' },
      { key: 'intel_traffic', label: 'Traffic sources', icon: 'signups', desc: 'Channels, referrers, campaigns, landing pages, devices and places', keywords: 'acquisition utm seo google ads' },
      { key: 'intel_pages', label: 'Pages & clicks', icon: 'overview', desc: 'Pages people view, how long they stay, and the buttons they press', keywords: 'cta' },
      { key: 'intel_journeys', label: 'Visitor journeys', icon: 'roadmap', desc: 'The paths people take, where they arrive and where they leave', keywords: 'paths flow' },
      { key: 'intel_funnels', label: 'Sign-up funnel', icon: 'subs', desc: 'From first visit to a working workspace, and where people drop off', keywords: 'conversion funnels' },
      { key: 'intel_business', label: 'Onboarding & adoption', icon: 'companies', desc: 'New workspaces, how far they get, where they came from, what they use', keywords: 'business analytics milestones activation cohorts' },
      { key: 'analytics', label: 'Product activity', icon: 'analytics', desc: 'Orders, calls and fulfilment across Colvy, plus product funnels', keywords: 'analytics usage' },
    ],
  },
  {
    title: 'Support', icon: 'chat', items: [
      { key: 'chat', label: 'Live chat', icon: 'chat', desc: 'Conversations across every business', keywords: 'inbox messages' },
      { key: 'tickets', label: 'Support tickets', icon: 'tickets', desc: 'Tickets across every business' },
      { key: 'porting', label: 'Number porting', icon: 'tickets', desc: 'Requests to move a phone number to Colvy', keywords: 'port phone' },
      { key: 'moderation', label: 'Moderation', icon: 'moderation', desc: 'Spam-flagged conversations and reported content', keywords: 'spam abuse' },
    ],
  },
  {
    title: 'Website content', icon: 'announce', items: [
      { key: 'blog', label: 'Blog', icon: 'announce', desc: 'Posts on colvy.com/blog' },
      { key: 'help', label: 'Help Center', icon: 'help', desc: 'Help articles across all businesses', keywords: 'docs articles' },
      { key: 'announce', label: 'Announcements', icon: 'announce', desc: 'Announcements and changelog posts', keywords: 'changelog' },
      { key: 'ideas', label: 'Ideas', icon: 'ideas', desc: 'Ideas across every feedback board', keywords: 'feedback votes' },
      { key: 'roadmap', label: 'Roadmaps', icon: 'roadmap', desc: 'Planned, in-progress and shipped items' },
      { key: 'legal', label: 'Legal pages', icon: 'audit', desc: 'Terms, privacy and other legal pages', keywords: 'terms privacy' },
      { key: 'banner', label: 'Product banner', icon: 'announce', desc: 'The banner shown across the app' },
      { key: 'colvyupdates', label: 'Colvy chat updates', icon: 'chat', desc: 'Posts in everyone’s private Colvy chat; replies come to Colvy’s inbox', keywords: 'announce news whats new in-app message' },
      { key: 'webforms', label: 'Web forms', icon: 'system', desc: 'Contact and demo forms submitted on colvy.com', keywords: 'leads contact demo' },
    ],
  },
  {
    title: 'Product & AI', icon: 'agent', items: [
      { key: 'agents', label: 'AI agents', icon: 'agent', desc: 'Agent activity, failures, approvals waiting, and an emergency pause' },
      { key: 'ai', label: 'AI models & usage', icon: 'system', desc: 'Which model does each AI job, prices and spend', keywords: 'openai anthropic tokens cost' },
      { key: 'integrations', label: 'Integrations', icon: 'plug', desc: 'Connected channels, stores, numbers and outside tools', keywords: 'shopify woocommerce meta gmail' },
      { key: 'flags', label: 'Feature flags', icon: 'flags', desc: 'Per-business feature and limit overrides', keywords: 'entitlements limits' },
      { key: 'whatsapp', label: 'WhatsApp', icon: 'chat', desc: 'WhatsApp setup and shared numbers' },
      { key: 'devices', label: 'Mobile devices', icon: 'users', desc: 'Registered iPhone and Android apps, with live status', keywords: 'app push' },
    ],
  },
  {
    title: 'System', icon: 'system', items: [
      { key: 'intel_system', label: 'System health', icon: 'system', desc: 'Jobs, webhooks, errors, status and alerts in one place', keywords: 'alerts monitoring' },
      { key: 'status', label: 'Status & incidents', icon: 'alert', desc: 'The public status page and incident updates', keywords: 'outage uptime' },
      { key: 'jobs', label: 'Background jobs', icon: 'system', desc: 'Every scheduled worker: last run, failures, run now', keywords: 'cron workers' },
      { key: 'webhooks', label: 'Webhooks', icon: 'system', desc: 'Live feed of inbound webhooks (Stripe, Meta, Twilio …)', keywords: 'webhook explorer' },
      { key: 'apilogs', label: 'API logs', icon: 'audit', desc: 'Server warnings and errors', keywords: 'errors logs' },
      { key: 'calls', label: 'Call diagnostics', icon: 'chat', desc: 'Every voice call, with recordings and transcripts', keywords: 'phone twilio telnyx' },
      { key: 'system', label: 'Service checks', icon: 'system', desc: 'Live checks on the database, email, SMS and other services', keywords: 'infra' },
    ],
  },
  {
    title: 'Admin', icon: 'settings', items: [
      { key: 'audit', label: 'Audit log', icon: 'audit', desc: 'Privileged actions across every business' },
      { key: 'imp', label: 'Impersonation log', icon: 'audit', desc: 'Every time an admin entered a customer workspace', keywords: 'enter as' },
      { key: 'settings', label: 'Settings', icon: 'settings', desc: 'Platform configuration' },
    ],
  },
]

export const NAV_ITEMS: NavItem[] = [NAV_HOME, ...NAV_GROUPS.flatMap(g => g.items)]
export const groupOf = (key: string): string | null => NAV_GROUPS.find(g => g.items.some(i => i.key === key))?.title || null
export const navItem = (key: string): NavItem | undefined => NAV_ITEMS.find(i => i.key === key)

/** Search the menu by name, description and keywords; best matches first. */
export function searchNav(q: string): (NavItem & { group: string | null })[] {
  const all = NAV_ITEMS.map(i => ({ ...i, group: groupOf(i.key) }))
  const s = q.trim().toLowerCase()
  if (!s) return all
  const words = s.split(/\s+/)
  return all
    .map(i => {
      const label = i.label.toLowerCase(), rest = `${i.desc} ${i.keywords || ''} ${i.group || ''} ${i.key}`.toLowerCase()
      if (!words.every(w => label.includes(w) || rest.includes(w))) return null
      return { i, score: label.startsWith(s) ? 0 : label.includes(s) ? 1 : words.every(w => label.includes(w)) ? 2 : 3 }
    })
    .filter((x): x is { i: typeof all[number]; score: number } => !!x)
    .sort((a, b) => a.score - b.score)
    .map(x => x.i)
}
