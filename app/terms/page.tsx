import LegalPage from '@/components/LegalPage'
import { pageMeta } from '@/lib/seo'

export const metadata = pageMeta({ title: 'Terms of Service', description: 'The terms that apply when you use Colvy’s shared inbox, business phone, SMS, CRM and related services.', path: 'terms' })

export default function Terms() {
  return <LegalPage slug="terms" />
}
