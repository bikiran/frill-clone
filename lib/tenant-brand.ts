// Server-side company lookups for the metadata of public company pages
// (see lib/tenant-meta.ts for what the metadata looks like).
//
// Speed first:
//   • Two small cached steps: host → company id (a tiny lookup, cached by
//     host), then company id → brand (company row + settings read in
//     parallel, cached per company). Warm requests touch no database.
//   • Every lookup is capped at LOOKUP_TIMEOUT_MS. A slow database never holds
//     up the page; the metadata falls back to neutral (never Colvy's) copy.
//   • React's cache() dedupes the lookup within one request.
//   • Entries live for HELP_REVALIDATE_SECONDS. Brand entries carry a
//     per-company tag (tenantTags.company), so one company's edit refreshes
//     only that company; /api/help/revalidate expires it.
//
// Only the anon key is used, and only public company fields are returned.
// Results: a brand, null (looked up — no such company) or undefined (the
// lookup failed or timed out). Failures are never cached.

import { cache } from 'react'
import { headers } from 'next/headers'
import { unstable_cache } from 'next/cache'
import { createClient } from '@supabase/supabase-js'
import type { Metadata } from 'next'
import { HELP_REVALIDATE_SECONDS } from './help-public'
import {
  buildTenantMetadata, classifyHost, normaliseHost, toTenantBrand,
  type TenantBrand, type TenantHost, type TenantPage,
} from './tenant-meta'

export const LOOKUP_TIMEOUT_MS = 1500

export const tenantTags = {
  hosts: 'tenant:hosts',
  records: 'tenant:records',
  company: (companyId: string) => `tenant:company:${companyId}`,
}

let anon: any = null
function db(): any {
  const u = process.env.NEXT_PUBLIC_SUPABASE_URL
  const k = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!u || !k) return null
  if (!anon) anon = createClient(u, k, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } })
  return anon
}

const COMPANY_COLUMNS = 'id, name, slug, description, logo_url, accent_color, help_cover_url, help_domain, help_domain_verified, board_domain'
// Only these settings fields are kept (the row also holds scripts, nav, etc.).
const SETTINGS_FIELDS = ['companyName', 'logoUrl', 'faviconUrl', 'ogImageUrl', 'accentColor', 'helpSubtitle', 'termValues'] as const

type Col = 'id' | 'slug' | 'help_domain' | 'board_domain'

async function companyIdWhere(col: Col, val: string): Promise<string | null> {
  const { data, error } = await db().from('companies').select('id').eq(col, val).limit(1)
  if (error) throw new Error(error.message || 'company lookup failed')
  return data?.[0]?.id ? String(data[0].id) : null
}

async function companyRow(id: string): Promise<any | null> {
  const d = db()
  let r = await d.from('companies').select(COMPANY_COLUMNS).eq('id', id).limit(1)
  // An optional column (description, help_domain_verified…) missing on this
  // database: read the whole row instead; toTenantBrand keeps public fields only.
  if (r.error) r = await d.from('companies').select('*').eq('id', id).limit(1)
  if (r.error) throw new Error(r.error.message || 'company lookup failed')
  return r.data?.[0] || null
}

async function settingsFor(companyId: string): Promise<Record<string, unknown>> {
  const { data, error } = await db().from('site_settings').select('value')
    .eq('key', 'general').eq('company_id', companyId)
    .order('updated_at', { ascending: false }).limit(1)
  if (error) return {} // branding still works from the company row
  const v = data?.[0]?.value || {}
  const out: Record<string, unknown> = {}
  for (const k of SETTINGS_FIELDS) if (v[k] !== undefined) out[k] = v[k]
  return out
}

// Step 1: host → company id. A subdomain is its slug. A custom domain is
// help_domain, then board_domain, then the second-level label as a slug — the
// same order the custom-domain renderer (lib/help-public) uses.
const cachedHostCompanyId = (key: string) => unstable_cache(
  async (): Promise<string | null> => {
    const host = classifyHost(key)
    if (host.kind === 'subdomain') return companyIdWhere('slug', host.slug)
    if (host.kind !== 'custom') return null
    const parts = host.host.split('.')
    const slug = parts.length >= 2 ? parts[parts.length - 2] : ''
    const [byHelp, byBoard, bySlug] = await Promise.all([
      companyIdWhere('help_domain', host.host),
      companyIdWhere('board_domain', host.host),
      slug ? companyIdWhere('slug', slug) : Promise.resolve(null),
    ])
    return byHelp || byBoard || bySlug
  },
  ['tenant-host', key],
  { revalidate: HELP_REVALIDATE_SECONDS, tags: [tenantTags.hosts] },
)()

const cachedSlugCompanyId = (slug: string) => unstable_cache(
  () => companyIdWhere('slug', slug),
  ['tenant-slug', slug],
  { revalidate: HELP_REVALIDATE_SECONDS, tags: [tenantTags.hosts] },
)()

// Step 2: company id → brand (company row and settings in parallel).
const cachedBrand = (id: string) => unstable_cache(
  async (): Promise<TenantBrand | null> => {
    const [row, settings] = await Promise.all([companyRow(id), settingsFor(id)])
    return row ? toTenantBrand(row, settings) : null
  },
  ['tenant-brand', id],
  { revalidate: HELP_REVALIDATE_SECONDS, tags: [tenantTags.company(id)] },
)()

/** Run a lookup with a time cap. undefined on error, timeout or no database. */
async function bounded<T>(fn: () => Promise<T>): Promise<T | undefined> {
  if (!db()) return undefined
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      fn(),
      new Promise<undefined>(resolve => { timer = setTimeout(() => resolve(undefined), LOOKUP_TIMEOUT_MS) }),
    ])
  } catch {
    return undefined
  } finally {
    if (timer) clearTimeout(timer)
  }
}

const brandFromId = async (id: string | null): Promise<TenantBrand | null> => (id ? cachedBrand(id) : null)

/**
 * The company behind a subdomain or custom domain, by host name (a string, so
 * React's per-request cache can dedupe it). null on Colvy's own hosts or when
 * no company has this host; undefined if the lookup failed or timed out.
 */
export const brandForHostName = cache(async (hostName: string): Promise<TenantBrand | null | undefined> => {
  const host = classifyHost(hostName)
  if (host.kind === 'colvy' || !host.host) return null
  return bounded(async () => brandFromId(await cachedHostCompanyId(host.host)))
})

export const brandBySlug = cache(async (slug: string): Promise<TenantBrand | null | undefined> => {
  const s = String(slug || '').toLowerCase().trim()
  if (!/^[a-z0-9-]{1,63}$/.test(s)) return null
  return bounded(async () => brandFromId(await cachedSlugCompanyId(s)))
})

export const brandById = cache(async (id: string): Promise<TenantBrand | null | undefined> => {
  const s = String(id || '').trim()
  if (!/^[A-Za-z0-9-]{1,64}$/.test(s)) return null
  return bounded(() => cachedBrand(s))
})

/** The host this request was made to, classified. */
export async function requestHost(): Promise<TenantHost> {
  const h = await headers()
  return classifyHost(h.get('host') || h.get('x-forwarded-host') || '')
}

/** Host + company for this request (cached; one lookup per request at most). */
export async function requestTenant(): Promise<{ host: TenantHost; brand: TenantBrand | null | undefined }> {
  const host = await requestHost()
  return { host, brand: host.kind === 'colvy' ? null : await brandForHostName(host.host) }
}

/** A custom domain from the /custom/[domain] route param (help__acme__com). */
export function hostFromDomainParam(domain: string): TenantHost {
  const host = normaliseHost(String(domain || '').replace(/__/g, '.'))
  return host ? { kind: 'custom', host } : { kind: 'colvy', host: '' }
}

/**
 * Metadata for a company page served on this request's host. Returns null on
 * Colvy's own hosts (colvy.com, localhost, previews), so the caller keeps its
 * existing Colvy metadata there.
 */
export async function tenantPageMetadata(
  page: TenantPage, path: string,
  extra?: { title?: string | null; description?: string | null; noIndex?: boolean },
): Promise<Metadata | null> {
  const { host, brand } = await requestTenant()
  if (host.kind === 'colvy') return null
  return buildTenantMetadata({ host, brand, page, path, ...extra })
}

// ── Records shared by link (forms, polls, surveys) ──────────────────────────

export type RecordTable = 'forms' | 'polls' | 'surveys' | 'contact_forms'

// `open` says whether the record is live: a closed or unpublished one shows
// only a neutral title — its own title and description stay private.
const RECORD_COLUMNS: Record<RecordTable, { cols: string; title: string; open: (row: any) => boolean }> = {
  forms: { cols: 'id, title, description, company_id, is_published', title: 'title', open: r => r.is_published !== false },
  polls: { cols: 'id, question, company_id, is_active', title: 'question', open: r => r.is_active !== false },
  surveys: { cols: 'id, title, description, company_id, is_active', title: 'title', open: r => !!r.is_active },
  contact_forms: { cols: 'id, name, description, company_id, is_active', title: 'name', open: r => r.is_active !== false },
}

export type PublicRecord = { title: string | null; description: string | null; companyId: string | null }

const cachedRecord = (table: RecordTable, id: string) => unstable_cache(
  async (): Promise<PublicRecord | null> => {
    const d = db()
    const spec = RECORD_COLUMNS[table]
    let r = await d.from(table).select(spec.cols).eq('id', id).limit(1)
    if (r.error) r = await d.from(table).select('*').eq('id', id).limit(1)
    if (r.error) throw new Error(r.error.message || 'record lookup failed')
    const row = r.data?.[0]
    if (!row) return null
    const companyId = row.company_id ? String(row.company_id) : null
    if (!spec.open(row)) return { title: null, description: null, companyId }
    const t = row[spec.title]
    return {
      title: typeof t === 'string' ? t.slice(0, 200) : null,
      description: typeof row.description === 'string' ? row.description.slice(0, 600) : null,
      companyId,
    }
  },
  ['tenant-record', table, id],
  { revalidate: HELP_REVALIDATE_SECONDS, tags: [tenantTags.records] },
)()

/** A public record by id (anon key, so RLS applies). null if missing; undefined on error/timeout. */
export const publicRecord = cache(async (table: RecordTable, id: string): Promise<PublicRecord | null | undefined> => {
  const s = String(id || '').trim()
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(s)) return null
  return bounded(() => cachedRecord(table, s))
})

/**
 * Metadata for a record page (form, poll, survey). The record's company brands
 * it on any host — these links are shared on colvy.com too — and the request
 * host's company is the fallback. null when neither is known on a Colvy host.
 */
export async function recordPageMetadata(page: TenantPage, table: RecordTable, id: string, path: string): Promise<Metadata | null> {
  const [{ host, brand: hostBrand }, rec] = await Promise.all([requestTenant(), publicRecord(table, id)])
  const brand = (rec?.companyId ? await brandById(rec.companyId) : undefined) || hostBrand
  if (host.kind === 'colvy' && !brand) return null
  // A missing, closed or unpublished record has nothing worth indexing.
  return buildTenantMetadata({ host, brand, page, path, title: rec?.title, description: rec?.description, noIndex: !rec?.title })
}
