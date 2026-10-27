// Every setting in one place, grouped like Sellio's settings: the menu of the
// Settings area (components/settings/SettingsShell), which wraps Business
// Settings (/admin/crm-settings), the board settings (/admin/settings, one
// page with #tabs) and the workspace pages (team, users, locations, billing,
// referrals, import). Integrations keeps its own page with its own list.
//
// An href with a #tab opens that tab of /admin/settings.

export type SettingsItem = { label: string; href: string; icon: string }
export type SettingsGroup = { title: string; items: SettingsItem[] }

export const SETTINGS_NAV: SettingsGroup[] = [
  { title: 'Personal', items: [
    { label: 'Your profile', href: '/admin/crm-settings/profile', icon: 'user' },
    { label: 'Refer & earn', href: '/admin/referrals', icon: 'gift' },
  ] },
  { title: 'Workspace', items: [
    { label: 'Business', href: '/admin/crm-settings/business', icon: 'building' },
    { label: 'Overview', href: '/admin/settings#overview', icon: 'grid' },
    { label: 'Team', href: '/admin/team', icon: 'users' },
    { label: 'Users & customers', href: '/admin/users', icon: 'contact' },
    { label: 'Locations', href: '/admin/locations', icon: 'pin' },
    { label: 'Billing', href: '/admin/billing', icon: 'card' },
    { label: 'Integrations', href: '/admin/integrations', icon: 'plug' },
    { label: 'Sign-in & security', href: '/admin/settings#auth', icon: 'shield' },
    { label: 'Privacy', href: '/admin/settings#privacy', icon: 'lock' },
    { label: 'Languages', href: '/admin/settings#languages', icon: 'globe' },
    { label: 'Activity log', href: '/admin/settings/audit-logs', icon: 'history' },
  ] },
  { title: 'Inbox', items: [
    { label: 'Channels', href: '/admin/crm-settings/channels', icon: 'radio' },
    { label: 'Automatic replies', href: '/admin/crm-settings/auto-replies', icon: 'reply' },
    { label: 'Time savers', href: '/admin/crm-settings/power-ups', icon: 'zap' },
    { label: 'Conversation actions', href: '/admin/crm-settings/conversation-actions', icon: 'pointer' },
    { label: 'Custom fields', href: '/admin/crm-settings/custom-fields', icon: 'list' },
    { label: 'Archived & spam', href: '/admin/crm-settings/archived-spam', icon: 'archive' },
  ] },
  { title: 'Chat widget', items: [
    { label: 'Install', href: '/admin/crm-settings/install', icon: 'code' },
    { label: 'Design', href: '/admin/crm-settings/chat-widget', icon: 'palette' },
    { label: 'Sections', href: '/admin/settings#widget', icon: 'layout' },
    { label: 'Contact form', href: '/admin/crm-settings/contact-form', icon: 'form' },
  ] },
  { title: 'AI', items: [
    { label: 'AI assistant', href: '/admin/crm-settings/ai', icon: 'sparkle' },
    { label: 'AI knowledge', href: '/admin/crm-settings/ai-knowledge', icon: 'book' },
  ] },
  { title: 'Sales', items: [
    { label: 'Payments', href: '/admin/crm-settings/payments', icon: 'card' },
    { label: 'Order automation', href: '/admin/crm-settings/order-automation', icon: 'package' },
    { label: 'SMS campaigns', href: '/admin/crm-settings/campaigns', icon: 'megaphone' },
    { label: 'Policies', href: '/admin/crm-settings/policies', icon: 'file' },
  ] },
  { title: 'Board & website', items: [
    { label: 'Board details', href: '/admin/settings#general', icon: 'browser' },
    { label: 'Theme', href: '/admin/settings#theme', icon: 'brush' },
    { label: 'Emails', href: '/admin/settings#emails', icon: 'mail' },
    { label: 'White labelling', href: '/admin/settings#whitelabel', icon: 'tag' },
    { label: 'Navigation', href: '/admin/settings#nav', icon: 'menu' },
    { label: 'Terminology', href: '/admin/settings#terminology', icon: 'type' },
    { label: 'Categories', href: '/admin/settings#categories', icon: 'folder' },
    { label: 'Help categories', href: '/admin/settings/help-categories', icon: 'help' },
    { label: 'More options', href: '/admin/settings#misc', icon: 'dots' },
  ] },
  { title: 'Data', items: [
    { label: 'Import data', href: '/admin/import', icon: 'upload' },
    { label: 'Imports', href: '/admin/crm-settings/imports', icon: 'database' },
    { label: 'CSV processor', href: '/admin/crm-settings/csv-processor', icon: 'table' },
  ] },
  { title: 'Developers', items: [
    { label: 'API', href: '/admin/settings#api', icon: 'key' },
    { label: 'Webhooks', href: '/admin/settings#webhooks', icon: 'webhook' },
  ] },
]

/** The /admin/settings tab when none is in the address. */
export const SETTINGS_DEFAULT_TAB = 'general'

// 18px line icons (24px grid) for the menu.
export const SETTINGS_ICONS: Record<string, string[]> = {
  user: ['M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8z', 'M4.5 20.5a7.5 7.5 0 0 1 15 0'],
  gift: ['M4 11h16v9.5a.5.5 0 0 1-.5.5h-15a.5.5 0 0 1-.5-.5z', 'M3 7.5h18V11H3z', 'M12 7.5V21', 'M12 7.5S10.5 3 8 3.5 7 7.5 12 7.5zM12 7.5S13.5 3 16 3.5s1 4-4 4z'],
  building: ['M4 21V5a1 1 0 0 1 1-1h9a1 1 0 0 1 1 1v16', 'M15 9h4a1 1 0 0 1 1 1v11', 'M3 21h18', 'M8 8h3M8 12h3M8 16h3'],
  grid: ['M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z'],
  users: ['M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z', 'M2.5 20a6.5 6.5 0 0 1 13 0', 'M16 4.3a3.5 3.5 0 0 1 0 6.6', 'M18.5 14.3A6.5 6.5 0 0 1 21.5 20'],
  contact: ['M5 3.5h14a1.5 1.5 0 0 1 1.5 1.5v14a1.5 1.5 0 0 1-1.5 1.5H5A1.5 1.5 0 0 1 3.5 19V5A1.5 1.5 0 0 1 5 3.5z', 'M12 12a2.75 2.75 0 1 0 0-5.5 2.75 2.75 0 0 0 0 5.5z', 'M7.5 17.5a4.5 4.5 0 0 1 9 0'],
  pin: ['M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11z', 'M12 12.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z'],
  card: ['M3 6.5A1.5 1.5 0 0 1 4.5 5h15A1.5 1.5 0 0 1 21 6.5v11a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 17.5z', 'M3 10h18', 'M7 15h3'],
  plug: ['M9 3v4M15 3v4', 'M6.5 7h11v4a5.5 5.5 0 0 1-11 0z', 'M12 16.5V21'],
  shield: ['M12 3l7.5 3v5.5c0 4.5-3.2 8.2-7.5 9.5-4.3-1.3-7.5-5-7.5-9.5V6z', 'm9 12 2 2 4-4'],
  lock: ['M6 10.5h12a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1v-8a1 1 0 0 1 1-1z', 'M8 10.5V7.5a4 4 0 0 1 8 0v3'],
  globe: ['M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z', 'M3 12h18', 'M12 3c2.5 2.6 3.7 5.6 3.7 9s-1.2 6.4-3.7 9c-2.5-2.6-3.7-5.6-3.7-9S9.5 5.6 12 3z'],
  history: ['M3.5 12a8.5 8.5 0 1 0 2.5-6', 'M3 4.5V9h4.5', 'M12 7.5V12l3 2'],
  radio: ['M12 13.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3z', 'M8.5 8.5a5 5 0 0 0 0 7M15.5 8.5a5 5 0 0 1 0 7', 'M5.6 5.6a9 9 0 0 0 0 12.8M18.4 5.6a9 9 0 0 1 0 12.8'],
  reply: ['M9.5 14.5 4.5 9.5l5-5', 'M4.5 9.5H14a5.5 5.5 0 0 1 5.5 5.5v4'],
  zap: ['M13 2.5 4.5 13.5H12L11 21.5l8.5-11H12z'],
  pointer: ['M5 3.5 18.5 10l-6 1.5L10 17.5z', 'm12.5 11.5 5 5'],
  list: ['M9 6h11M9 12h11M9 18h11', 'M4.5 6h.01M4.5 12h.01M4.5 18h.01'],
  archive: ['M3.5 4.5h17v4h-17z', 'M5 8.5v10a1.5 1.5 0 0 0 1.5 1.5h11a1.5 1.5 0 0 0 1.5-1.5v-10', 'M10 12.5h4'],
  code: ['m9 7.5-5 4.5 5 4.5', 'm15 7.5 5 4.5-5 4.5'],
  palette: ['M12 3a9 9 0 0 0 0 18c1.1 0 1.8-.8 1.8-1.8 0-.5-.2-.9-.5-1.2-.3-.3-.5-.8-.5-1.2 0-1 .8-1.8 1.8-1.8h2.1A4.5 4.5 0 0 0 21 10.5C21 6.4 17 3 12 3z', 'M7.5 11.5h.01M10 7.5h.01M14.5 7.5h.01'],
  layout: ['M4 4.5h16v15H4z', 'M4 9.5h16', 'M10 9.5v10'],
  form: ['M5 3.5h14v17H5z', 'M8.5 8h7M8.5 12h7M8.5 16h4'],
  sparkle: ['M12 3.5l1.7 4.8 4.8 1.7-4.8 1.7L12 16.5l-1.7-4.8L5.5 10l4.8-1.7z', 'M18.5 15.5l.7 1.8 1.8.7-1.8.7-.7 1.8-.7-1.8-1.8-.7 1.8-.7z'],
  book: ['M4.5 5A1.5 1.5 0 0 1 6 3.5h13.5v15H6A1.5 1.5 0 0 0 4.5 20z', 'M4.5 20A1.5 1.5 0 0 0 6 21.5h13.5v-3'],
  package: ['M12 3 20 7.5v9L12 21l-8-4.5v-9z', 'M4 7.5 12 12l8-4.5', 'M12 12v9'],
  megaphone: ['M3.5 10.5v3a1 1 0 0 0 1 1h2.7l5.8 4V5.5l-5.8 4H4.5a1 1 0 0 0-1 1z', 'M16.3 8.8a4.5 4.5 0 0 1 0 6.4'],
  file: ['M6 3.5h8l4.5 4.5v12.5H6z', 'M14 3.5V8h4.5', 'M9 13h6M9 16.5h6'],
  browser: ['M3.5 5h17v14h-17z', 'M3.5 9h17', 'M6.5 7h.01M9 7h.01'],
  brush: ['M15 4.5 19.5 9l-7.5 7.5L7.5 12z', 'M7.5 12 5 14.5c-1 1-1 3.5-1.5 5 1.5-.5 4-.5 5-1.5l2.5-2.5'],
  mail: ['M3.5 5.5h17v13h-17z', 'm4 6.5 8 6 8-6'],
  tag: ['M3.5 3.5h8l9 9-8 8-9-9z', 'M8 8h.01'],
  menu: ['M4 6.5h16M4 12h16M4 17.5h16'],
  type: ['M5 6.5V5h14v1.5', 'M12 5v14', 'M9.5 19h5'],
  folder: ['M3.5 6.5a1.5 1.5 0 0 1 1.5-1.5h4.5l2 2.5h7.5a1.5 1.5 0 0 1 1.5 1.5v9a1.5 1.5 0 0 1-1.5 1.5H5a1.5 1.5 0 0 1-1.5-1.5z'],
  help: ['M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z', 'M9.5 9.2a2.6 2.6 0 0 1 5 .9c0 1.7-2.5 2.4-2.5 2.4', 'M12 16.5h.01'],
  dots: ['M5.5 12h.01M12 12h.01M18.5 12h.01'],
  upload: ['M12 15.5V4', 'm7.5 8.5 4.5-4.5 4.5 4.5', 'M4.5 15v4a1.5 1.5 0 0 0 1.5 1.5h12a1.5 1.5 0 0 0 1.5-1.5v-4'],
  database: ['M12 8c4.1 0 7.5-1.3 7.5-3S16.1 2 12 2 4.5 3.3 4.5 5 7.9 8 12 8z', 'M4.5 5v14c0 1.7 3.4 3 7.5 3s7.5-1.3 7.5-3V5', 'M4.5 12c0 1.7 3.4 3 7.5 3s7.5-1.3 7.5-3'],
  table: ['M3.5 4.5h17v15h-17z', 'M3.5 9.5h17M3.5 14.5h17M9.5 9.5v10'],
  key: ['M14.5 14a5 5 0 1 0-4.7-6.7L3 14v4h4v-2h2v-2h2.2', 'M15.5 8.5h.01'],
  webhook: ['M8.5 17.5a3.5 3.5 0 1 1-3.1-5.2', 'M12 6.5a3.5 3.5 0 1 1 3.4 4.4L12.5 16', 'M15.5 17.5h4a3.5 3.5 0 1 1-1.2 2.5', 'M9 12.3 12 7'],
}
