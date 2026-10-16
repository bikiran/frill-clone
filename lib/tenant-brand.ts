// Server-side company lookups for the metadata of public company pages
// (see lib/tenant-meta.ts for what the metadata looks like).
//
// One cached lookup per page: the company row plus its site_settings
// 'general' row are read together inside a single unstable_cache entry that
// lives for HELP_REVALIDATE_SECONDS and is expired by /api/help/revalidate
// (helpTags.companies). React's cache() also dedupes the lookup within one
// request, so generateMetadata and generateViewport share it.
//
// Only the anon key is used, and only public company fields are returned.
// Failures are never cached: they throw inside the cache scope and come back
// as null, and the page then gets neutral (still not Colvy) metadata.

import { cache } from 'react'
import { headers } from 'next/headers'
import { unstable_cache } from 'next/cache'
import { createClient } from '@supabase/supabase-js'
import type { Metadata, Viewport } from 'next'
import { HELP_REVALIDATE_SECONDS, helpTags } from './help-public'
import {
  buildTenantMetadata, buildTenantViewport, classifyHost, normaliseHost, toTenantBrand,
  type TenantBrand, type TenantHost, type TenantPage,
} from './tenant-meta'

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

async function companiesWhere(col: Col, val: string): Promise<any | null> {
  const d = db()
  let r = await d.from('companies').select(COMPANY_COLUMNS).eq(col, val).limit(1)
  // An optional column (description, help_domain_verified…) missing on this
  // database: read the whole row instead; toTenantBrand keeps public fields only.
  if (r.error) r = await d.from('companies').select('*').eq(col, val).limit(1)
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

async function withSettings(company: any): Promise<TenantBrand | null> {
  if (!company) return null
  return toTenantBrand(company, await settingsFor(company.id))
}

// Custom domain → company: help_domain, then board_domain, then the
// second-level label as a slug — the same order the custom-domain renderer
// (lib/help-public) uses, so the metadata matches the page.
async function companyForCustomHost(host: string): Promise<any | null> {
  const parts = host.split('.')
  const slug = parts.length >= 2 ? parts[parts.length - 2] : ''
  const [byHelp, byBoard, bySlug] = await Promise.all([
    companiesWhere('help_domain', host),
    companiesWhere('board_domain', host),
    slug ? companiesWhere('slug', slug) : Promise.resolve(null),
  ])
  return byHelp || byBoard || bySlug
}

const cachedBrand = (kind: 'host' | 'slug' | 'id', key: string) => unstable_cache(
  async (): Promise<TenantBrand | null> => {
    if (kind === 'id') return withSettings(await companiesWhere('id', key))
    if (kind === 'slug') return withSettings(await companiesWhere('slug', key))
    return withSettings(await companyForCustomHost(key))
  },
  ['tenant-brand', kind, key],
  { revalidate: HELP_REVALIDATE_SECONDS, tags: [helpTags.companies] },
)()

async function safe<T>(fn: () => Promise<T>): Promise<T | null> {
  if (!db()) return null
  try { return await fn() } catch { return null }
}

/**
 * The company behind a subdomain or custom domain (by host name, so React's
 * per-request cache can dedupe it); null on Colvy's own hosts.
 */
export const brandForHostName = cache(async (hostName: string): Promise<TenantBrand | null> => {
  const host = classifyHost(hostName)
  if (host.kind === 'subdomain') return safe(() => cachedBrand('slug', host.slug))
  if (host.kind === 'custom' && host.host) return safe(() => cachedBrand('host', host.host))
  return null
})

export const brandBySlug = cache(async (slug: string): Promise<TenantBrand | null> => {
  const s = String(slug || '').toLowerCase().trim()
  return /^[a-z0-9-]{1,63}$/.test(s) ? safe(() => cachedBrand('slug', s)) : null
})

export const brandById = cache(async (id: string): Promise<TenantBrand | null> => {
  const s = String(id || '').trim()
  return /^[A-Za-z0-9-]{1,64}$/.test(s) ? safe(() => cachedBrand('id', s)) : null
})

/** The host this request was made to, classified. */
export async function requestHost(): Promise<TenantHost> {
  const h = await headers()
  return classifyHost(h.get('host') || h.get('x-forwarded-host') || '')
}

/** Host + company for this request (cached; one lookup per request at most). */
export async function requestTenant(): Promise<{ host: TenantHost; brand: TenantBrand | null }> {
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
export async function tenantPageMetadata(page: TenantPage, path: string, extra?: { title?: string | null; description?: string | null }): Promise<Metadata | null> {
  const { host, brand } = await requestTenant()
  if (host.kind === 'colvy') return null
  return buildTenantMetadata({ host, brand, page, path, ...extra })
}

/** theme-color for a company page on this request's host. */
export async function tenantPageViewport(): Promise<Viewport> {
  const { host, brand } = await requestTenant()
  return host.kind === 'colvy' ? {} : buildTenantViewport(brand)
}

// ── Records shared by link (forms, polls, surveys) ──────────────────────────

export type RecordTable = 'forms' | 'polls' | 'surveys' | 'contact_forms'

const RECORD_COLUMNS: Record<RecordTable, { cols: string; title: string }> = {
  forms: { cols: 'id, title, description, company_id, is_published', title: 'title' },
  polls: { cols: 'id, question, description, company_id', title: 'question' },
  surveys: { cols: 'id, title, description, company_id', title: 'title' },
  contact_forms: { cols: 'id, name, description, company_id', title: 'name' },
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
    // An unpublished form shows "not found" on the page; say nothing about it.
    if (!row || (table === 'forms' && row.is_published === false)) return null
    const t = row[spec.title]
    return {
      title: typeof t === 'string' ? t.slice(0, 200) : null,
      description: typeof row.description === 'string' ? row.description.slice(0, 600) : null,
      companyId: row.company_id ? String(row.company_id) : null,
    }
  },
  ['tenant-record', table, id],
  { revalidate: HELP_REVALIDATE_SECONDS, tags: [helpTags.companies] },
)()

/** A public record by id (anon key, so RLS applies). null if missing or on error. */
export const publicRecord = cache(async (table: RecordTable, id: string): Promise<PublicRecord | null> => {
  const s = String(id || '').trim()
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(s)) return null
  return safe(() => cachedRecord(table, s))
})

/**
 * Metadata for a record page (form, poll, survey). The record's company brands
 * it on any host — these links are shared on colvy.com too — and the request
 * host's company is the fallback. null when neither is known on a Colvy host.
 */
export async function recordPageMetadata(page: TenantPage, table: RecordTable, id: string, path: string): Promise<Metadata | null> {
  const [{ host, brand: hostBrand }, rec] = await Promise.all([requestTenant(), publicRecord(table, id)])
  const brand = (rec?.companyId ? await brandById(rec.companyId) : null) || hostBrand
  if (host.kind === 'colvy' && !brand) return null
  return buildTenantMetadata({ host, brand, page, path, title: rec?.title, description: rec?.description })
}
