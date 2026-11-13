import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getArticle, listArticles } from '@/lib/blog-store'
import BlogChrome from '@/components/BlogChrome'
import BlogArticleView from '@/components/BlogArticleView'
import JsonLd from '@/components/JsonLd'
import { breadcrumbJsonLd } from '@/lib/seo-faqs'

export const revalidate = 300

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://colvy.com'

// The site pages an article links to (not sign-up, pricing or the home page,
// which nearly every article links to).
const COMMON = new Set(['/', '/signup', '/pricing', '/demo', '/blog'])
function pagesLinked(html: string): Set<string> {
  const out = new Set<string>()
  for (const m of html.matchAll(/href="(\/[^"#?]*)/g)) if (!COMMON.has(m[1])) out.add(m[1].replace(/\/$/, ''))
  return out
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params
  const a = await getArticle(slug)
  if (!a) return { title: 'Article not found', robots: { index: false } }
  const title = a.seoTitle || a.title
  const description = a.seoDescription || a.excerpt
  return {
    title,
    description,
    alternates: { canonical: `/blog/${a.slug}` },
    openGraph: {
      type: 'article', title, description, url: `${SITE_URL}/blog/${a.slug}`,
      ...(a.cover ? { images: [{ url: a.cover }] } : {}),
    },
    twitter: {
      card: 'summary_large_image', title, description,
      ...(a.cover ? { images: [a.cover] } : {}),
    },
  }
}

export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const all = await listArticles()
  const a = all.find(x => x.slug === slug)
  if (!a) notFound()
  const rest = all.filter(x => x.slug !== slug)
  // Related reading: articles that link to each other or to the same feature
  // pages come first, then the same category, newest first. Better for readers
  // than "latest in the category", and it keeps the internal links tight.
  const mine = pagesLinked(a.bodyHtml)
  const score = (x: typeof a) => {
    const theirs = pagesLinked(x.bodyHtml)
    let s = 0
    for (const p of mine) if (theirs.has(p)) s += 2
    if (mine.has(`/blog/${x.slug}`)) s += 6
    if (theirs.has(`/blog/${a.slug}`)) s += 4
    if (x.category === a.category) s += 3
    return s
  }
  const related = rest.map(x => ({ x, s: score(x) })).sort((p, q) => q.s - p.s || (p.x.date < q.x.date ? 1 : -1)).slice(0, 3).map(r => r.x)
  const recent = rest.slice(0, 5)
  const url = `${SITE_URL}/blog/${a.slug}`

  const image = a.cover ? (/^https?:/.test(a.cover) ? a.cover : `${SITE_URL}${a.cover}`) : null
  const articleLd = {
    '@context': 'https://schema.org',
    '@type': 'BlogPosting',
    headline: a.title,
    description: a.seoDescription || a.excerpt,
    datePublished: a.date,
    dateModified: a.date,
    inLanguage: 'en-AU',
    articleSection: a.category,
    author: /team/i.test(a.author)
      ? { '@type': 'Organization', '@id': `${SITE_URL}/#organization`, name: 'Colvy', url: SITE_URL }
      : { '@type': 'Person', name: a.author },
    publisher: { '@type': 'Organization', '@id': `${SITE_URL}/#organization`, name: 'Colvy', url: SITE_URL, logo: { '@type': 'ImageObject', url: `${SITE_URL}/logo.png` } },
    isPartOf: { '@type': 'Blog', '@id': `${SITE_URL}/blog#blog`, name: 'The Colvy blog', url: `${SITE_URL}/blog` },
    mainEntityOfPage: { '@type': 'WebPage', '@id': url },
    url,
    ...(image ? { image: [image] } : {}),
  }

  return (
    <>
      <JsonLd data={[articleLd, breadcrumbJsonLd(SITE_URL, [{ name: 'Blog', path: 'blog' }, { name: a.title, path: `blog/${a.slug}` }])]} />
      <BlogChrome>
        <BlogArticleView article={a} related={related} recent={recent} url={url} />
      </BlogChrome>
    </>
  )
}
