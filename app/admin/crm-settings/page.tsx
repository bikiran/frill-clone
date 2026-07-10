'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

export default function CrmSettingsIndex() {
  const router = useRouter()
  useEffect(() => { router.replace('/admin/crm-settings/profile') }, [router])
  return null
}
