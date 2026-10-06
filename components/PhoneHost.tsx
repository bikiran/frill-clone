'use client'

import { useEffect } from 'react'
import { usePathname } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { usePhoneHost, setPhoneHost, getPhoneHost } from '@/lib/phone-host'
import IncomingCallListener from '@/components/IncomingCallListener'
import GlobalCallBar from '@/components/GlobalCallBar'

// The browser phone, mounted once in the ROOT layout so a live call survives
// moving anywhere in the app — other admin pages, the public board, the
// browser Back button. It only appears once the admin layout has said who's
// signed in (lib/phone-host), and a reload brings it back via the same tab's
// sessionStorage, where the Telnyx SDK reattaches the call.
export default function PhoneHost() {
  const host = usePhoneHost()
  const pathname = usePathname()

  // Signed out (or a different person signed in on this tab) → no phone.
  useEffect(() => {
    let alive = true
    supabase.auth.getSession().then(({ data }) => {
      const h = getPhoneHost()
      if (alive && h && h.userId && data.session?.user?.id !== h.userId) setPhoneHost(null)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      const h = getPhoneHost()
      if (event === 'SIGNED_OUT' || (h?.userId && session?.user?.id && session.user.id !== h.userId)) setPhoneHost(null)
    })
    return () => { alive = false; try { sub.subscription.unsubscribe() } catch {} }
  }, [])

  if (!host?.companyId) return null
  // The little "Phone ready" pill belongs to the admin; elsewhere only a call
  // (ringing or live) shows.
  const inAdmin = !!pathname?.startsWith('/admin')
  return (
    <>
      <IncomingCallListener companyId={host.companyId} agentName={host.agentName} showStatusPill={inAdmin} />
      <GlobalCallBar companyId={host.companyId} agentName={host.agentName} />
    </>
  )
}
