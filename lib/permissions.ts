import { createClient } from '@supabase/supabase-js'

export type UserRole = 'viewer' | 'editor' | 'admin' | 'owner'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
)

export async function getUserRole(userId: string, companyId: string): Promise<UserRole> {
  try {
    // Check if user is company owner
    const { data: company } = await (supabase as any)
      .from('companies')
      .select('owner_id')
      .eq('id', companyId)
      .single()

    if (company?.owner_id === userId) {
      return 'owner'
    }

    // Check team member role
    const { data: member } = await (supabase as any)
      .from('team_members')
      .select('role')
      .eq('company_id', companyId)
      .eq('user_id', userId)
      .maybeSingle()

    return (member?.role as UserRole) || 'viewer'
  } catch (error) {
    console.error('Failed to get user role:', error)
    return 'viewer'
  }
}

export function canEdit(role: UserRole): boolean {
  return role === 'owner' || role === 'admin' || role === 'editor'
}

export function canManageTeam(role: UserRole): boolean {
  return role === 'owner' || role === 'admin'
}

export function canDeleteContent(role: UserRole): boolean {
  return role === 'owner' || role === 'admin' || role === 'editor'
}

export function canAccessBilling(role: UserRole): boolean {
  return role === 'owner' || role === 'admin'
}

export function canAccessAnalytics(role: UserRole): boolean {
  return role !== 'viewer'
}

// Can this role see a customer's sensitive PII in full — phone, email,
// addresses and order detail? Viewers get masked values; everyone else sees the
// full value. Used to gate the cross-channel customer match panel.
export function canViewSensitive(role: UserRole): boolean {
  return role !== 'viewer'
}

// ── Per-member feature permissions ───────────────────────────────────────────
//
// The role helpers above are coarse (viewer/editor/admin/owner). This section
// adds granular, per-member feature access — grouped into "suites" — configured
// from the Team page and stored in team_members.permissions (see the COLVY_V306
// migration).
//
// Model:
//  • permissions is a JSON map { [featureKey]: boolean }. A key set to false
//    hides + blocks that feature for that member.
//  • Owners and admins ALWAYS have full access — you restrict someone by making
//    them an editor/viewer and unchecking features.
//  • A member with NO map (null/undefined) is unrestricted, so existing members
//    are never suddenly locked out; the owner opts in to restricting each person.
//
// Enforcement (v1) is client-side: the admin sidebar hides disallowed features
// and the layout redirects if someone opens a disallowed URL directly.

export interface FeatureDef {
  key: string
  label: string
  // Pathname prefixes this feature owns. Longest match wins, so a nested route
  // (e.g. /admin/orders/reports) is attributed to its own feature, not the
  // parent (/admin/orders).
  paths: string[]
}

export interface SuiteDef {
  key: string
  label: string
  features: FeatureDef[]
}

export const PERMISSION_SUITES: SuiteDef[] = [
  {
    key: 'feedback',
    label: 'Feedback',
    features: [
      { key: 'ideas', label: 'Ideas', paths: [] }, // Ideas is the /admin home — nav-only toggle, route always allowed
      { key: 'roadmap', label: 'Roadmap', paths: ['/roadmap', '/admin/roadmap'] },
      { key: 'announcements', label: 'Announcements', paths: ['/admin/announcements'] },
      { key: 'polls', label: 'Polls', paths: ['/admin/polls'] },
      { key: 'forms', label: 'Forms', paths: ['/admin/forms'] },
      { key: 'surveys', label: 'Surveys', paths: ['/admin/surveys'] },
    ],
  },
  {
    key: 'manage',
    label: 'Manage',
    features: [
      { key: 'statuses', label: 'Statuses', paths: ['/admin/statuses'] },
      { key: 'topics', label: 'Topics', paths: ['/admin/topics'] },
      { key: 'priorities', label: 'Priorities', paths: ['/admin/priorities'] },
      { key: 'segments', label: 'Segments', paths: ['/admin/segments'] },
      { key: 'analytics', label: 'Analytics', paths: ['/admin/analytics'] },
    ],
  },
  {
    key: 'orders',
    label: 'Orders & Fulfillment',
    features: [
      { key: 'orders', label: 'Orders', paths: ['/admin/orders'] },
      { key: 'reports', label: 'Reports', paths: ['/admin/orders/reports'] },
      { key: 'payments', label: 'Payments', paths: ['/admin/payments'] },
      { key: 'shipping', label: 'Shipping', paths: ['/admin/orders/shipping'] },
    ],
  },
  {
    key: 'inbox',
    label: 'Inbox & CRM',
    features: [
      { key: 'inbox', label: 'Inbox', paths: ['/admin/inbox'] },
      { key: 'contacts', label: 'Contacts', paths: ['/admin/contacts'] },
      { key: 'tasks', label: 'Tasks', paths: ['/admin/tasks'] },
      { key: 'notes', label: 'Notes', paths: ['/admin/notes'] },
      { key: 'gallery', label: 'Gallery', paths: ['/admin/gallery'] },
      { key: 'calendar', label: 'Calendar', paths: ['/admin/calendar'] },
      { key: 'scheduled', label: 'Scheduled', paths: ['/admin/scheduled'] },
      { key: 'calls', label: 'Call Logs', paths: ['/admin/calls'] },
      { key: 'campaigns', label: 'Campaigns', paths: ['/admin/campaigns'] },
      { key: 'links', label: 'Links Generator', paths: ['/admin/links'] },
      { key: 'link_reports', label: 'Link Reports', paths: ['/admin/link-reports'] },
      { key: 'reviews', label: 'Reviews', paths: ['/admin/reviews'] },
      { key: 'social', label: 'Social Engagement', paths: ['/admin/social'] },
    ],
  },
  {
    key: 'insights',
    label: 'Insights',
    features: [
      { key: 'command_centre', label: 'Command Centre', paths: ['/admin/command-centre'] },
      { key: 'customer_insights', label: 'Customer Insights', paths: ['/admin/insights/customers'] },
      { key: 'location_insights', label: 'Location Insights', paths: ['/admin/insights/location'] },
    ],
  },
  {
    key: 'support',
    label: 'Support',
    features: [
      { key: 'tickets', label: 'Tickets', paths: ['/admin/tickets'] },
      { key: 'help', label: 'Help Centre', paths: ['/admin/help'] },
      { key: 'help_categories', label: 'Help Categories', paths: ['/admin/settings/help-categories'] },
      { key: 'help_reporting', label: 'Help Reporting', paths: ['/admin/help/analytics'] },
      { key: 'help_settings', label: 'Help Settings', paths: ['/admin/help/settings'] },
    ],
  },
  {
    key: 'settings',
    label: 'Settings',
    features: [
      { key: 'team', label: 'Team', paths: ['/admin/team'] },
      { key: 'users', label: 'Users', paths: ['/admin/users'] },
      { key: 'locations', label: 'Locations', paths: ['/admin/locations'] },
      { key: 'integrations', label: 'Integrations', paths: ['/admin/integrations'] },
      { key: 'import', label: 'Import Data', paths: ['/admin/import'] },
      { key: 'settings', label: 'Settings', paths: ['/admin/settings'] },
      { key: 'billing', label: 'Billing', paths: ['/admin/billing'] },
    ],
  },
]

export type PermissionMap = Record<string, boolean> | null | undefined

// Every feature key, flattened.
export const ALL_FEATURE_KEYS: string[] = PERMISSION_SUITES.flatMap(s => s.features.map(f => f.key))

// Roles that always have full access regardless of the permission map.
const FULL_ACCESS_ROLES = ['owner', 'admin']

export function hasFullAccess(role: string | null | undefined): boolean {
  return FULL_ACCESS_ROLES.includes(String(role || '').toLowerCase())
}

// Can this (role, permissions) use a given feature key?
export function canUseFeature(role: string | null | undefined, perms: PermissionMap, featureKey: string): boolean {
  if (hasFullAccess(role)) return true
  // No map configured → unrestricted (don't lock existing members out).
  if (!perms || typeof perms !== 'object') return true
  // Absent key defaults to allowed; only an explicit `false` blocks.
  return perms[featureKey] !== false
}

// Find the feature that owns a pathname (longest matching prefix), or null when
// the path isn't gated (e.g. /admin home, /admin/profile).
export function featureForPath(pathname: string): FeatureDef | null {
  let best: FeatureDef | null = null
  let bestLen = -1
  for (const suite of PERMISSION_SUITES) {
    for (const f of suite.features) {
      for (const p of f.paths) {
        if (pathname === p || pathname.startsWith(p + '/')) {
          if (p.length > bestLen) { best = f; bestLen = p.length }
        }
      }
    }
  }
  return best
}

// Route-level check: may this member view this pathname? Ungated paths are always
// allowed (never lock someone out of the dashboard/profile).
export function canAccessPath(role: string | null | undefined, perms: PermissionMap, pathname: string): boolean {
  if (hasFullAccess(role)) return true
  const f = featureForPath(pathname)
  if (!f) return true
  return canUseFeature(role, perms, f.key)
}
