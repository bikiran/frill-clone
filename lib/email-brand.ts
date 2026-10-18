// The business's branding for its campaign email and preference page
// (server only): name, logo, accent colour, address and contact details from
// the company row and its general settings (the same sources as
// lib/tenant-brand.ts, read with the service role so it works for any page).

import type { EmailBrand } from '@/components/EmailDesigner/types'
import { safeImage } from '@/components/EmailDesigner/render'

const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '')

export async function loadEmailBrand(db: any, companyId: string): Promise<{ brand: EmailBrand; company: any } | null> {
  const { data: company } = await db.from('companies').select('*').eq('id', companyId).maybeSingle()
  if (!company) return null
  let s: any = {}
  try {
    const { data } = await db.from('site_settings').select('value').eq('key', 'general').eq('company_id', companyId).order('updated_at', { ascending: false }).limit(1)
    s = data?.[0]?.value || {}
  } catch {}
  const accent = [str(company.accent_color), str(s.accentColor)].find(v => /^#[0-9a-f]{6}$/i.test(v)) || null
  const website = str(company.website)
  const brand: EmailBrand = {
    companyId: String(company.id),
    name: str(company.name) || str(s.companyName) || 'Our store',
    slug: str(company.slug) || null,
    logoUrl: safeImage(company.logo_url) || safeImage(s.logoUrl) || null,
    accent,
    address: str(company.business_address) || null,
    website: website ? (/^https?:\/\//i.test(website) ? website : `https://${website}`) : null,
    phone: str(company.business_mobile) || str(company.phone) || null,
    email: str(company.business_email) || null,
  }
  return { brand, company }
}
