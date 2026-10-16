// Saved replies ("Quick Response" templates) in the reply composer: searching
// them and filling their merge fields with this customer's details.

export interface ReplyTemplate { id: string; title?: string | null; body?: string | null; shortcut?: string | null; company_id?: string | null }

export interface TemplateVars {
  first_name?: string | null
  last_name?: string | null
  name?: string | null
  email?: string | null
  phone?: string | null
  company?: string | null      // the business name
  agent_name?: string | null   // the staff member replying
}

// Accepted spellings for each field. {first_name} and {{first_name}} both work
// (campaign templates use the double-brace form).
const ALIASES: Record<string, keyof TemplateVars> = {
  first_name: 'first_name', firstname: 'first_name', first: 'first_name',
  last_name: 'last_name', lastname: 'last_name', surname: 'last_name',
  name: 'name', full_name: 'name', customer_name: 'name', customer: 'name',
  email: 'email', customer_email: 'email',
  phone: 'phone', mobile: 'phone', customer_phone: 'phone',
  company: 'company', company_name: 'company', business_name: 'company', business: 'company', store_name: 'company', shop_name: 'company',
  agent_name: 'agent_name', agent: 'agent_name', my_name: 'agent_name', staff_name: 'agent_name',
}

// What to say when we don't know the value, so "Hi {first_name}," still reads.
const FALLBACK: Partial<Record<keyof TemplateVars, string>> = { first_name: 'there', name: 'there' }

/** Split "Debra Clothier" into first / last. */
export function splitName(full: string | null | undefined): { first: string; last: string } {
  const parts = String(full || '').trim().split(/\s+/).filter(Boolean)
  return { first: parts[0] || '', last: parts.slice(1).join(' ') }
}

/**
 * Fill {first_name}-style fields. Unknown fields are left exactly as typed (so
 * a template that genuinely contains braces isn't mangled); known fields with
 * no value use a friendly fallback, or are removed.
 */
export function fillTemplateVars(body: string | null | undefined, vars: TemplateVars): string {
  const v: TemplateVars = { ...vars }
  if (!v.first_name && v.name) v.first_name = splitName(v.name).first
  if (!v.last_name && v.name) v.last_name = splitName(v.name).last
  // A placeholder name ("Visitor", a phone number) isn't a name to greet.
  if (v.first_name && (/^(visitor|customer|unknown|guest)$/i.test(v.first_name) || /^[+\d\s()-]+$/.test(v.first_name))) v.first_name = ''
  // Balanced only: {x} or {{x}} — never "{x}}" or "{{x}".
  return String(body || '').replace(/\{\{\s*([a-zA-Z_]+)\s*\}\}|(?<!\{)\{\s*([a-zA-Z_]+)\s*\}(?!\})/g, (whole, a: string, b: string) => {
    const key = ALIASES[String(a || b).toLowerCase()]
    if (!key) return whole
    const val = String(v[key] ?? '').trim()
    return val || FALLBACK[key] || ''
  })
}

/** Search by title, shortcut or body; title matches first. */
export function filterTemplates<T extends ReplyTemplate>(list: T[], query: string): T[] {
  const q = query.trim().toLowerCase().replace(/^\//, '')
  if (!q) return list
  const scored: { t: T; s: number }[] = []
  for (const t of list) {
    const title = String(t.title || '').toLowerCase()
    const sc = String(t.shortcut || '').toLowerCase().replace(/^\//, '')
    const body = String(t.body || '').toLowerCase()
    const s = title.startsWith(q) || sc.startsWith(q) ? 3 : title.includes(q) || sc.includes(q) ? 2 : body.includes(q) ? 1 : 0
    if (s) scored.push({ t, s })
  }
  return scored.sort((a, b) => b.s - a.s).map(x => x.t)
}

/** Only this company's templates — never another workspace's rows. */
export function ownTemplates<T extends ReplyTemplate>(rows: T[] | null | undefined, companyId: string | null | undefined): T[] {
  if (!companyId) return []
  return (rows || []).filter(r => r.company_id === companyId).filter(r => String(r.body || '').trim())
}
