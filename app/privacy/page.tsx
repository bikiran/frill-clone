import LegalPage from '@/components/LegalPage'
import GoogleUserData from './GoogleUserData'
import AnalyticsOptOut from './AnalyticsOptOut'
import { pageMeta } from '@/lib/seo'

export const metadata = pageMeta({ title: 'Privacy Policy', description: 'How Colvy collects, uses, stores and protects personal information, including data from connected Google, Meta and messaging accounts.', path: 'privacy' })

export default function Privacy() {
  return (
    <LegalPage slug="privacy">
      <GoogleUserData />
      <AnalyticsOptOut />
    </LegalPage>
  )
}
