// Every feature page, grouped by the job it does. Shared by /product's "Every
// feature" section and the "Explore every feature" block on each feature page
// (components/marketing/Sellio). isNew marks the ones that have just shipped.

const CORAL = '#ff6a4d', BLUE = '#2b59ff', GREEN = '#00c48c', PURPLE = '#7c5cff', CYAN = '#0891b2', YELLOW = '#e0a800', PINK = '#ff4d8d'
const INDIGO = '#4f46e5', TEAL = '#0d9488', AMBER = '#d97706'

export type FeatureLink = { icon: string; color: string; title: string; desc: string; href: string; isNew?: boolean }
export type FeatureGroup = { title: string; desc: string; items: FeatureLink[] }

export const FEATURE_GROUPS: FeatureGroup[] = [
  { title: 'Talk to customers', desc: 'Every channel in one place, with the customer’s story beside it.', items: [
    { icon: 'inbox', color: TEAL, title: 'Shared inbox', desc: 'SMS, calls, Instagram, Messenger, email and chat', href: '/product/inbox' },
    { icon: 'user', color: BLUE, title: 'Contacts & CRM', desc: 'A profile that fills itself in', href: '/product/crm' },
    { icon: 'phone', color: GREEN, title: 'Business phone', desc: 'Australian numbers, calls in the app', href: '/phones' },
    { icon: 'ai', color: PURPLE, title: 'AI agents', desc: 'Answer, book and follow up, with limits', href: '/ai-agents' },
    { icon: 'pen', color: PINK, title: 'Notes', desc: 'Private team notes on any thread', href: '/product/notes' },
    { icon: 'folder', color: PURPLE, title: 'Media gallery', desc: 'Photos and videos, ready to send', href: '/product/gallery' },
    { icon: 'mic', color: TEAL, title: 'Voice typing', desc: 'Speak a reply, send it polished', href: '/product/voice-typing' },
    { icon: 'target', color: TEAL, title: 'Automation', desc: 'Routing, follow-ups and triggers', href: '/product/automation' },
  ] },
  { title: 'Bookings, tables & jobs', desc: 'Appointments, restaurant tables and trade jobs, beside the conversation.', items: [
    { icon: 'calendar', color: CORAL, title: 'Online booking', desc: 'Deposits, reminders, regular bookings, waitlist', href: '/product/booking' },
    { icon: 'utensils', color: PINK, title: 'Table reservations', desc: 'Booking page, floor plan, covers, deposits', href: '/product/reservations', isNew: true },
    { icon: 'hand', color: GREEN, title: '“I’m here” check-in', desc: 'Guests tell you they’ve arrived', href: '/product/check-in', isNew: true },
    { icon: 'briefcase', color: BLUE, title: 'Jobs & quotes', desc: 'Quotes accepted online, jobs with sign-off', href: '/product/jobs', isNew: true },
    { icon: 'calendar', color: BLUE, title: 'Calendar', desc: 'Bookings and events in one view', href: '/product/calendar' },
    { icon: 'kanban', color: PURPLE, title: 'Tasks', desc: 'Turn any chat into a to-do', href: '/product/tasks' },
  ] },
  { title: 'Sell and get paid', desc: 'Orders, payments and recovered sales, right in the chat.', items: [
    { icon: 'tag', color: CORAL, title: 'Orders', desc: 'WooCommerce and Shopify in the inbox', href: '/product/orders' },
    { icon: 'bolt', color: GREEN, title: 'Payments', desc: 'Pay-by-link with Stripe', href: '/product/payments' },
    { icon: 'receipt', color: INDIGO, title: 'Receipts & tax invoices', desc: 'Sent by link or in their account, GST shown', href: '/product/receipts', isNew: true },
    { icon: 'cart', color: AMBER, title: 'Abandoned carts', desc: 'Win back the checkouts you lose', href: '/product/abandoned-carts' },
    { icon: 'bell', color: PURPLE, title: 'Back-in-stock waitlists', desc: 'Text everyone when it’s back', href: '/product/waitlists' },
  ] },
  { title: 'Keep them coming back', desc: 'Campaigns, self-service and the numbers behind them.', items: [
    { icon: 'key', color: CYAN, title: 'Customer accounts', desc: 'Bookings, quotes, orders, deposits, book again', href: '/product/customer-accounts', isNew: true },
    { icon: 'megaphone', color: CORAL, title: 'Email & SMS campaigns', desc: 'Built with AI, reported in revenue', href: '/product/broadcasts' },
    { icon: 'link', color: CYAN, title: 'Link reports', desc: 'Who clicked, and what they bought', href: '/product/links' },
    { icon: 'chart', color: INDIGO, title: 'Insights', desc: 'Volume, response times and revenue', href: '/product/insights' },
  ] },
  { title: 'Feedback and help', desc: 'Hear what customers want, and answer before they ask.', items: [
    { icon: 'idea', color: CORAL, title: 'Ideas board', desc: 'Collect and vote on requests', href: '/product/ideas' },
    { icon: 'map', color: BLUE, title: 'Public roadmap', desc: 'Show what’s planned and shipped', href: '/product/roadmap' },
    { icon: 'megaphone', color: GREEN, title: 'Announcements', desc: 'A changelog that notifies voters', href: '/product/announcements' },
    { icon: 'book', color: YELLOW, title: 'Help centre', desc: 'A self-serve knowledge base', href: '/product/knowledgebase' },
  ] },
]
