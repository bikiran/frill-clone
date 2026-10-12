import HelpArticlePage from './ArticleClient'
import { getPublishedHelpArticle } from '@/lib/help-public'

// Published articles are rendered on the server from a short-lived shared cache
// (see lib/help-public), so the article is in the first paint. Drafts, demo ids
// and locked help centres come back undefined and load in the browser as before.
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const initial = await getPublishedHelpArticle(id)
  // Keyed by id so moving to another article (e.g. a Related link) starts fresh.
  return <HelpArticlePage key={id} articleId={id} initial={initial} />
}
