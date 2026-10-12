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
import { getCustomDomainHelp, getPublishedHelpArticle } from '@/lib/help-public'

export default async function CustomDomainSubPath({ params }: { params: Promise<{ domain: string; path?: string[] }> }) {
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
