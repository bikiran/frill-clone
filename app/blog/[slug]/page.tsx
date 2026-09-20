import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getArticle, relatedArticles } from '@/lib/blog-store'
import BlogChrome from '@/components/BlogChrome'
import BlogArticleView from '@/components/BlogArticleView'
import JsonLd from '@/components/JsonLd'

export const revalidate = 300

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://colvy.com'

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
  const a = await getArticle(slug)
  if (!a) notFound()
  const related = await relatedArticles(slug, 3)

  const articleLd = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: a.title,
    description: a.excerpt,
    datePublished: a.date,
    dateModified: a.date,
    author: { '@type': /team/i.test(a.author) ? 'Organization' : 'Person', name: a.author },
    publisher: { '@type': 'Organization', name: 'Colvy', logo: { '@type': 'ImageObject', url: `${SITE_URL}/logo.png` } },
    mainEntityOfPage: `${SITE_URL}/blog/${a.slug}`,
    ...(a.cover ? { image: [a.cover] } : {}),
  }

  return (
    <>
      <JsonLd data={articleLd} />
      <BlogChrome>
        <BlogArticleView article={a} related={related} />
      </BlogChrome>
    </>
  )
}
