import ColvyJsonLd from '@/components/ColvyJsonLd'

// Colvy's own structured data on this marketing page (components/ColvyJsonLd.tsx).
export default function AiAssistantLayout({ children }: { children: React.ReactNode }) {
  return <><ColvyJsonLd />{children}</>
}
