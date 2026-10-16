import type { Metadata } from 'next'
import HelpArticlePage from './ArticleClient'
import { getPublishedHelpArticle } from '@/lib/help-public'
import { brandById, requestTenant } from '@/lib/tenant-brand'
import { buildTenantMetadata, metaExcerpt } from '@/lib/tenant-meta'

// "<Article> · <Company> Help" with the article's excerpt as the description.
// The article comes from the same cache the page renders from, so this adds no
// extra database trip. Drafts and locked help centres resolve to nothing, so
// their titles never leak into the tab or search results.
export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params
  const [{ host, brand: hostBrand }, data] = await Promise.all([requestTenant(), getPublishedHelpArticle(id)])
  const a = data?.article
  const path = `/help/${encodeURIComponent(id || '')}`
  if (host.kind === 'colvy') {
    // colvy.com/help/<id>: a company's article is branded as that company's;
    // Colvy's own articles get "<title> · Colvy" from the root template.
    const brand = a?.company_id ? await brandById(a.company_id) : null
    if (brand) return buildTenantMetadata({ host, brand, page: 'help-article', path, title: a?.title, description: a?.content })
    // An unknown, draft or locked article is kept out of search results.
    return a ? { title: a.title, description: metaExcerpt(a.content) || undefined, alternates: { canonical: path } } : { robots: { index: false, follow: true } }
  }
  return buildTenantMetadata({ host, brand: hostBrand, page: 'help-article', path, title: a?.title, description: a?.content })
}

// Published articles are rendered on the server from a short-lived shared cache
// (see lib/help-public), so the article is in the first paint. Drafts, demo ids
// and locked help centres come back undefined and load in the browser as before.
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const initial = await getPublishedHelpArticle(id)
  // Keyed by id so moving to another article (e.g. a Related link) starts fresh.
  return <HelpArticlePage key={id} articleId={id} initial={initial} />
}
