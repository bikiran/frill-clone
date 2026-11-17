'use client'

// The automation builder, full screen. Settings → Automations lists them.
import { useParams } from 'next/navigation'
import Builder from '@/components/automations/Builder'
import { useCompanyUser } from '@/app/admin/crm-settings/_shared'

export default function AutomationPage() {
  const { id } = useParams() as { id: string }
  const { companyId, loading } = useCompanyUser()
  if (loading || !companyId) return null
  return <Builder id={id} companyId={companyId} />
}
