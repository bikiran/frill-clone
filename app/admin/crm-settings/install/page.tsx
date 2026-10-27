'use client'

import { useCompanyUser, S } from '../_shared'
import WidgetInstallGuide from '@/components/widget/WidgetInstallGuide'

// Put the chat widget on your website, and see that it worked
// (components/widget/WidgetInstallGuide).
export default function InstallWidgetPage() {
  const { companyId, loading } = useCompanyUser()
  if (loading) return <div style={{ color: 'var(--slate)' }}>Loading…</div>
  return (
    <div style={{ maxWidth: 820 }}>
      <h1 style={S.h1}>Install your chat widget</h1>
      <p style={S.sub}>Add Colvy to your website so visitors can chat with you and your AI agent.</p>
      <WidgetInstallGuide companyId={companyId} />
    </div>
  )
}
