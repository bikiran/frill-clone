// The business's branding for its campaign email and preference page
// (server only): name, logo, accent colour, address and contact details from
// the company row and its general settings (the same sources as
// lib/tenant-brand.ts, read with the service role so it works for any page).

import type { EmailBrand, SocialLink } from '@/components/EmailDesigner/types'
import { safeImage } from '@/components/EmailDesigner/render'
import { MAX_SOCIAL_LINKS, isNetwork, socialUrl } from '@/components/EmailDesigner/social'

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

/**
 * Social links to offer in the designer, best first: the ones in the
 * business's most recent email with a Social links block (what they chose
 * before), then the connected Facebook page and Instagram account, then the
 * website. One per network; nothing here is sent anywhere.
 */
export async function socialSuggestions(db: any, companyId: string, brand: EmailBrand): Promise<SocialLink[]> {
  const out: SocialLink[] = []
  const add = (network: SocialLink['network'], raw: unknown) => {
    const url = socialUrl(network, raw)
    if (url && out.length < MAX_SOCIAL_LINKS && !out.some(l => l.network === network || l.url === url)) out.push({ network, url })
  }
  const [designs, channels] = await Promise.all([
    db.from('email_designs').select('design').eq('company_id', companyId).order('updated_at', { ascending: false }).limit(20).then((r: any) => r.data || [], () => []),
    db.from('meta_channels').select('platform, page_id, ig_username, is_active').eq('company_id', companyId).then((r: any) => r.data || [], () => []),
  ])
  for (const d of designs) {
    const block = (Array.isArray(d?.design?.blocks) ? d.design.blocks : []).find((b: any) => b?.type === 'social' && Array.isArray(b.links) && b.links.some((l: any) => str(l?.url)))
    if (!block) continue
    for (const l of block.links) if (isNetwork(l?.network)) add(l.network, l.url)
    break
  }
  for (const c of channels) {
    if (c?.is_active === false) continue
    if (c?.platform === 'facebook' && /^\d{5,20}$/.test(str(c.page_id))) add('facebook', `https://www.facebook.com/${str(c.page_id)}`)
    if (c?.platform === 'instagram' && str(c.ig_username)) add('instagram', str(c.ig_username))
  }
  if (brand.website) add('website', brand.website)
  return out
}
