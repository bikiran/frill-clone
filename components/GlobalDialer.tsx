'use client'

import { useEffect, useState } from 'react'
import Dialer from './Dialer'

// App-wide dialer host. Mounted once in the admin layout so a "Call" button on
// ANY page (contacts list, customer profile, order drawer…) can place a call
// through Colvy's own softphone instead of handing off to the device's phone app
// via a `tel:` link. Pages open it by dispatching:
//
//   window.dispatchEvent(new CustomEvent('colvy:dial', {
//     detail: { number: '+61…', name: 'Jane', contactId: '…' }
//   }))
//
// The target is passed straight through to <Dialer initialTarget>, which jumps
// to the call bar for that number.
export default function GlobalDialer({ companyId, agentName }: { companyId: string | null; agentName?: string }) {
  const [target, setTarget] = useState<{ number: string; name?: string; contactId?: string; autoStart?: boolean } | null>(null)

  useEffect(() => {
    const open = (e: Event) => {
      const detail = (e as CustomEvent).detail || {}
      const number = detail.number || detail.phone
      if (!number) return
      setTarget({ number, name: detail.name, contactId: detail.contactId, autoStart: !!detail.autoStart })
    }
    window.addEventListener('colvy:dial', open as EventListener)
    return () => window.removeEventListener('colvy:dial', open as EventListener)
  }, [])

  if (!target) return null
  return (
    <Dialer
      companyId={companyId}
      agentName={agentName}
      initialTarget={target}
      autoStart={target.autoStart}
      onClose={() => setTarget(null)}
    />
  )
}
