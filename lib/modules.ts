// Per-business modules (companies.modules): Jobs & Services, and later
// Restaurants. A module the business switched on or off explicitly wins;
// otherwise it follows the business type chosen at sign-up, so a plumber sees
// Jobs straight away and a café never sees it unless they turn it on.
// Shared by the admin nav (client) and the jobs API (server).

export type Modules = { jobs?: boolean; restaurant?: boolean }

/** Business types (lib/industries) that get Jobs by default. Removalists sign up as Logistics. */
export const JOB_INDUSTRIES = ['Trades & Home Services', 'Logistics']

export function readModules(raw: any): Modules {
  const r = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {}
  const out: Modules = {}
  if (typeof r.jobs === 'boolean') out.jobs = r.jobs
  if (typeof r.restaurant === 'boolean') out.restaurant = r.restaurant
  return out
}

export function jobsEnabled(company: { modules?: any; industry?: string | null } | null | undefined): boolean {
  if (!company) return false
  const m = readModules(company.modules)
  if (typeof m.jobs === 'boolean') return m.jobs
  return JOB_INDUSTRIES.includes(String(company.industry || ''))
}

/** Business types that get table reservations by default. */
export const RESTAURANT_INDUSTRIES = ['Restaurant & Hospitality']

/** Table reservations (docs/plans/restaurants.md): on for restaurants, switchable by anyone. */
export function restaurantEnabled(company: { modules?: any; industry?: string | null } | null | undefined): boolean {
  if (!company) return false
  const m = readModules(company.modules)
  if (typeof m.restaurant === 'boolean') return m.restaurant
  return RESTAURANT_INDUSTRIES.includes(String(company.industry || ''))
}

/** Admin pages that belong to a module, for the nav and the route guard. */
export const JOB_PAGES = ['/admin/jobs']
export const RESTAURANT_PAGES = ['/admin/reservations']
export function moduleAllowsPage(href: string, status: { jobs: boolean; restaurant?: boolean; known: boolean }): boolean {
  if (!status.known) return true
  const path = String(href || '').split(/[?#]/)[0]
  const under = (pages: string[]) => pages.some(p => path === p || path.startsWith(p + '/'))
  if (!status.jobs && under(JOB_PAGES)) return false
  if (!status.restaurant && under(RESTAURANT_PAGES)) return false
  return true
}
