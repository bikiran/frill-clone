import LegalPage from '@/components/LegalPage'

export const metadata = { title: 'Privacy Policy', alternates: { canonical: '/privacy' } }

export default function Privacy() {
  return <LegalPage slug="privacy" />
}
