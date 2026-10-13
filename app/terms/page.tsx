import LegalPage from '@/components/LegalPage'

export const metadata = { title: 'Terms of Service', alternates: { canonical: '/terms' } }

export default function Terms() {
  return <LegalPage slug="terms" />
}
