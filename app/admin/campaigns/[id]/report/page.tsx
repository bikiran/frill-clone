'use client'

import { useState, useEffect } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { peekCompanyUser, resolveCompanyUser } from '@/lib/client-cache'
import { SkeletonList } from '@/components/Skeleton'
import EmailReport from './EmailReport'
import SmsReport from './SmsReport'

// A campaign's report. The numbers come from the server (an email campaign's
// from /api/email-campaigns/*, an SMS campaign's from /api/campaigns/report);
// this page finds the business and the campaign and shows the right one.

export default function CampaignReportPage() {
  const router = useRouter()
  const params = useParams()
  const campaignId = params?.id as string
  const [loading, setLoading] = useState(true)
  const [companyId, setCompanyId] = useState<string | null>(null)
  const [campaign, setCampaign] = useState<any>(null)

  useEffect(() => {
    ;(async () => {
      try {
        // The admin already knows the company; fall back to looking it up.
        let cid: string | null = peekCompanyUser()?.companyId || (await resolveCompanyUser().catch(() => null))?.companyId || null
        if (!cid && typeof window !== 'undefined') {
          const host = window.location.hostname
          if (host.endsWith('.colvy.com') && host !== 'colvy.com') {
            const slug = host.replace('.colvy.com', '')
            const { data: co } = await (supabase as any).from('companies').select('id').eq('slug', slug).maybeSingle()
            if (co) cid = co.id
          }
        }
        if (!cid) {
          const { data: { session } } = await supabase.auth.getSession()
          if (session?.user) {
            const { data: own } = await (supabase as any).from('companies').select('id').eq('owner_id', session.user.id).maybeSingle()
            if (own?.id) cid = own.id
            else {
              const { data: mem } = await (supabase as any).from('team_members').select('company_id').eq('user_id', session.user.id).limit(1)
              if (mem?.length) cid = mem[0].company_id
            }
          }
        }
        if (!cid) return
        setCompanyId(cid)
        const { data: c } = await (supabase as any).from('campaigns').select('*').eq('id', campaignId).maybeSingle()
        setCampaign(c)
      } finally { setLoading(false) }
    })()
  }, [campaignId])

  if (loading) return <SkeletonList rows={6} />
  if (!campaign || !companyId) return (
    <div style={{ padding: 40, textAlign: 'center', color: 'var(--slate)' }}>
      Campaign not found. <a href="/admin/campaigns" style={{ color: 'var(--coral)' }}>Back to campaigns</a>
    </div>
  )
  const back = () => router.push('/admin/campaigns')
  return campaign.channel === 'email'
    ? <EmailReport campaign={campaign} companyId={companyId} onBack={back} />
    : <SmsReport campaign={campaign} companyId={companyId} onBack={back} />
}
