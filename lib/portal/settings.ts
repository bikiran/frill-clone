// The customer portal's settings (companies.portal_settings, V432): whether
// the business has it on, and which sections its customers see. Shared by the
// server and the admin settings screen.

export const PORTAL_SECTIONS = [
  { key: 'coming_up', label: 'Coming up', hint: 'Bookings, table reservations and deliveries, with Change or Cancel' },
  { key: 'quotes', label: 'Quotes and jobs', hint: 'Quotes to accept and how their jobs are going' },
  { key: 'orders', label: 'Orders and receipts', hint: 'In-store and online orders, paid or not' },
  { key: 'payments', label: 'Payments due', hint: 'Unpaid payment links and deposits, with Pay' },
  { key: 'messages', label: 'Messages', hint: 'Their conversation with you, to carry on' },
  { key: 'preferences', label: 'Preferences', hint: 'Their name and marketing emails and texts' },
] as const

export type PortalSection = typeof PORTAL_SECTIONS[number]['key']
export type PortalSettings = { enabled: boolean; sections: Record<PortalSection, boolean> }

export function resolvePortalSettings(raw: any): PortalSettings {
  const s = raw && typeof raw === 'object' ? raw : {}
  const sec = s.sections && typeof s.sections === 'object' ? s.sections : {}
  const sections = {} as Record<PortalSection, boolean>
  for (const x of PORTAL_SECTIONS) sections[x.key] = typeof sec[x.key] === 'boolean' ? sec[x.key] : true
  return { enabled: s.enabled === true, sections }
}

/** Only what the settings screen may change. */
export function cleanPortalSettings(raw: any, prev?: any): PortalSettings {
  const cur = resolvePortalSettings(prev)
  const s = raw && typeof raw === 'object' ? raw : {}
  const out: PortalSettings = { enabled: typeof s.enabled === 'boolean' ? s.enabled : cur.enabled, sections: { ...cur.sections } }
  if (s.sections && typeof s.sections === 'object') for (const x of PORTAL_SECTIONS) if (typeof s.sections[x.key] === 'boolean') out.sections[x.key] = s.sections[x.key]
  return out
}
