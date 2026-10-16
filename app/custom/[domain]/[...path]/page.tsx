// Custom-domain sub-paths. Help pages render in place so the visitor stays on
// the custom domain (e.g. help.acme.com/help/<id>); other tenant sub-paths
// (roadmap, announcements, …) still redirect to the colvy.com equivalent.
//
// This is a server component: help pages are pre-rendered with their published
// content (lib/help-public), and each branch only ships its own client code —
// the help centre no longer downloads the booking flow and vice versa.

import HelpArticlePage from '../../../help/[id]/ArticleClient'
import HelpTicketPage from '../../../help/ticket/page'
import CustomDomainPage from '../CustomDomainClient'
import BookingFlow from '@/components/booking/BookingFlow'
import ManageBooking from '@/components/booking/ManageBooking'
import CustomRedirect from './CustomRedirect'
import type { Metadata, Viewport } from 'next'
import { getCustomDomainHelp, getPublishedHelpArticle } from '@/lib/help-public'
import { brandForHostName, hostFromDomainParam } from '@/lib/tenant-brand'
import { buildTenantMetadata, buildTenantViewport, customHostIsHelp, type TenantPage } from '@/lib/tenant-meta'

type Params = { params: Promise<{ domain: string; path?: string[] }> }

// Every page on a custom domain is the company's: its name, icon and
// description in the tab and in link previews, never Colvy's (lib/tenant-meta).
export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { domain, path: rawPath } = await params
  const path = rawPath || []
  const host = hostFromDomainParam(domain)
  const brand = await brandForHostName(host.host)
  const subPath = '/' + path.map(encodeURIComponent).join('/')
  let page: TenantPage = 'redirect'
  let title: string | null = null
  let description: string | null = null
  if (path[0] === 'help' && path[1] === 'ticket') page = 'help-ticket'
  else if (path[0] === 'help' && path[1]) {
    page = 'help-article'
    const a = (await getPublishedHelpArticle(path[1]))?.article
    title = a?.title || null
    description = a?.content || null
  } else if (path[0] === 'help') page = customHostIsHelp(host, brand) ? 'help' : 'feedback'
  else if (path[0] === 'book') page = 'book'
  else if (path[0] === 'booking' && path[1]) page = 'booking'
  const md = buildTenantMetadata({ host, brand, page, path: subPath, title, description })
  // A manage-booking link is private to whoever holds it; a redirect has no content of its own.
  if (page === 'booking' || page === 'redirect') md.robots = { index: false, follow: page === 'redirect' }
  return md
}

export async function generateViewport({ params }: Params): Promise<Viewport> {
  const host = hostFromDomainParam((await params).domain)
  return buildTenantViewport(await brandForHostName(host.host))
}

export default async function CustomDomainSubPath({ params }: Params) {
  const { domain, path: rawPath } = await params
  const path = rawPath || []
  const hostname = (domain || '').replace(/__/g, '.')
  const subPath = '/' + path.join('/')

  const isHelpTicket = path[0] === 'help' && path[1] === 'ticket'
  const isHelpArticle = path[0] === 'help' && !!path[1] && path[1] !== 'ticket'
  const isHelpHome = path[0] === 'help' && !path[1]
  const isBook = path[0] === 'book'
  const isBookingManage = path[0] === 'booking' && !!path[1]

  // Booking pages render in place too (book.acme.com/book/<service>).
  if (isBook) return <BookingFlow domain={hostname} initialService={path[1] || null} />
  if (isBookingManage) return <ManageBooking token={path[1]} />
  // Help pages render in place so the visitor never leaves the custom domain.
  if (isHelpTicket) return <HelpTicketPage />
  // The article page reads its id from the URL (help.acme.com/help/<id>).
  if (isHelpArticle) {
    const initial = await getPublishedHelpArticle(path[1])
    return <HelpArticlePage key={path[1]} articleId={path[1]} initial={initial} />
  }
  // The help centre home on the custom domain.
  if (isHelpHome) {
    const initial = await getCustomDomainHelp(hostname)
    return <CustomDomainPage initial={initial} domain={hostname} />
  }

  return <CustomRedirect hostname={hostname} subPath={subPath} />
}
