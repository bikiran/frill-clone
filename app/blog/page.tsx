import type { Metadata } from 'next'
import { listArticles } from '@/lib/blog-store'
import BlogChrome from '@/components/BlogChrome'
import BlogIndexView from '@/components/BlogIndexView'
import { pageMeta } from '@/lib/seo'

export const revalidate = 300

export const metadata: Metadata = pageMeta({
  title: 'Blog: Customer Communication Playbooks for Small Business',
  description: 'Practical, honest playbooks on customer communication for growing businesses — support, sales, feedback and more, from the Colvy team.',
  path: 'blog',
})

export default async function Page() {
  const articles = await listArticles()
  return (
    <BlogChrome>
      <BlogIndexView articles={articles} />
    </BlogChrome>
  )
}
