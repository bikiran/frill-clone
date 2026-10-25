import type { Metadata } from 'next'
import { listArticles } from '@/lib/blog-store'
import BlogChrome from '@/components/BlogChrome'
import BlogIndexView from '@/components/BlogIndexView'
import { pageMeta } from '@/lib/seo'
import JsonLd from '@/components/JsonLd'
import { breadcrumbJsonLd } from '@/lib/seo-faqs'

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://colvy.com'

export const revalidate = 300

export const metadata: Metadata = pageMeta({
  title: 'Blog: Customer Communication Playbooks for Growing Teams',
  description: 'Practical, honest playbooks on customer communication for growing businesses — support, sales, feedback and more, from the Colvy team.',
  path: 'blog',
})

export default async function Page() {
  const articles = await listArticles()
  return (
    <BlogChrome>
      <JsonLd data={breadcrumbJsonLd(SITE_URL, [{ name: 'Blog', path: 'blog' }])} />
      <BlogIndexView articles={articles} />
    </BlogChrome>
  )
}
