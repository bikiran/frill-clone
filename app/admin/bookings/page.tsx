'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { resolveCompanyUser } from '@/lib/client-cache'
import PageHeader from '@/components/PageHeader'
import { SkeletonList } from '@/components/Skeleton'
import { api, btn, btnGhost } from '@/components/booking/admin/shared'
import BookingsList from '@/components/booking/admin/BookingsList'
import ServicesTab from '@/components/booking/admin/ServicesTab'
import AvailabilityTab from '@/components/booking/admin/AvailabilityTab'
import BookingSettingsTab from '@/components/booking/admin/BookingSettingsTab'

// Online booking & appointments: the bookings themselves, the services people
// can book, when they can book, and the policy. The public page lives at
// /book/<slug> (or <slug>.colvy.com/book).

type Tab = 'bookings' | 'services' | 'availability' | 'settings'

export default function BookingsPage() {
  const router = useRouter()
  const [companyId, setCompanyId] = useState('')
  const [tab, setTab] = useState<Tab>('bookings')
  const [loading, setLoading] = useState(true)
  const [setupMsg, setSetupMsg] = useState('')
  const [toast, setToast] = useState('')
  const [meta, setMeta] = useState<any>(null)            // staff, locations, stripeReady, bookingUrl
  const [settings, setSettings] = useState<any>(null)
  const savedSettings = useRef<string>('')
  const [savingSettings, setSavingSettings] = useState(false)
  const [services, setServices] = useState<any[]>([])
  const [bookings, setBookings] = useState<any[]>([])
  const [scope, setScope] = useState('upcoming')

  const flash = (m: string) => { setToast(m); setTimeout(() => setToast(''), 4500) }

  const loadMeta = useCallback(async (cid: string) => {
    try {
      const d = await api(`/api/bookings/settings?companyId=${cid}`)
      setMeta(d); setSettings(d.settings); savedSettings.current = JSON.stringify(d.settings)
    } catch (e: any) { setSetupMsg(e.message) }
  }, [])
  const loadServices = useCallback(async (cid: string) => {
    try { const d = await api(`/api/bookings/services?companyId=${cid}`); setServices(d.services || []); if (d.setupNeeded) setSetupMsg(d.hint) } catch {}
  }, [])
  const loadBookings = useCallback(async (cid: string, sc: string) => {
    try { const d = await api(`/api/bookings?companyId=${cid}&scope=${sc}`); setBookings(d.bookings || []); if (d.setupNeeded) setSetupMsg(d.hint) } catch {}
  }, [])

  useEffect(() => {
    ;(async () => {
      const { companyId: cidRaw, user } = await resolveCompanyUser()
      if (!user) { router.push('/signin'); return }
      let cid = cidRaw
      if (!cid) {
        const { data: tm } = await (supabase as any).from('team_members').select('company_id').eq('user_id', user.id).limit(1)
        cid = tm?.[0]?.company_id || null
      }
      if (!cid) { setLoading(false); return }
      setCompanyId(cid)
      const t = new URLSearchParams(window.location.search).get('tab') as Tab | null
      if (t && ['bookings', 'services', 'availability', 'settings'].includes(t)) setTab(t)
      await Promise.all([loadMeta(cid), loadServices(cid), loadBookings(cid, 'upcoming')])
      setLoading(false)
    })()
  }, [router, loadMeta, loadServices, loadBookings])

  useEffect(() => { if (companyId) loadBookings(companyId, scope) }, [scope]) // eslint-disable-line react-hooks/exhaustive-deps

  const switchTab = (t: Tab) => {
    setTab(t)
    try { const u = new URL(window.location.href); u.searchParams.set('tab', t); window.history.replaceState(null, '', u.toString()) } catch {}
  }

  const dirty = settings && JSON.stringify(settings) !== savedSettings.current
  const saveSettings = async () => {
    setSavingSettings(true)
    try {
      const d = await api('/api/bookings/settings', { method: 'PATCH', json: { companyId, settings } })
      setSettings(d.settings); savedSettings.current = JSON.stringify(d.settings); flash('Saved')
    } catch (e: any) { flash(e.message) } finally { setSavingSettings(false) }
  }

  const copyLink = () => { if (meta?.bookingUrl) navigator.clipboard?.writeText(meta.bookingUrl).then(() => flash('Booking link copied')).catch(() => {}) }

  const upcomingCount = scope === 'upcoming' ? bookings.filter(b => b.status === 'confirmed').length : null

  return (
    <div style={{ padding: '0 24px 60px', maxWidth: 1100, margin: '0 auto' }}>
      <PageHeader
        title="Bookings"
        subtitle="Let customers book appointments online — and pay a deposit if you want one."
        bleed={24}
        action={meta?.bookingUrl ? (
          <>
            <button onClick={copyLink} style={btnGhost}>🔗 Copy booking link</button>
            <a href={meta.bookingUrl} target="_blank" rel="noreferrer" style={{ ...btn, textDecoration: 'none' }}>Open page ↗</a>
          </>
        ) : undefined}
      />

      {setupMsg && (
        <div style={{ margin: '14px 0', padding: '12px 14px', borderRadius: 12, background: '#fffbeb', border: '1px solid #fde68a', color: '#92400e', fontSize: 13.5 }}>⚠ {setupMsg}</div>
      )}

      {!loading && settings && !services.length && !setupMsg && (
        <div style={{ margin: '14px 0', padding: '14px 16px', borderRadius: 14, background: 'var(--peach, #fff4f1)', border: '1px solid #fde0d9', fontSize: 13.5, color: 'var(--ink, #111)', lineHeight: 1.6 }}>
          <b>Get set up in 3 steps:</b> ① add a service · ② check your hours under Availability (and switch on who takes bookings) · ③ copy your booking link into your website, Instagram bio or a text to a customer.
        </div>
      )}

      <div style={{ display: 'flex', gap: 4, borderBottom: '1px solid var(--border, #ececec)', margin: '16px 0 18px', overflowX: 'auto' }}>
        {([['bookings', `Bookings${upcomingCount ? ` (${upcomingCount})` : ''}`], ['services', `Services${services.length ? ` (${services.length})` : ''}`], ['availability', 'Availability'], ['settings', 'Settings']] as [Tab, string][]).map(([k, l]) => (
          <button key={k} onClick={() => switchTab(k)} style={{ border: 'none', background: 'none', padding: '10px 14px', fontSize: 14, fontWeight: 700, cursor: 'pointer', color: tab === k ? 'var(--ink, #111)' : 'var(--slate, #6b7280)', borderBottom: `2px solid ${tab === k ? 'var(--coral, #ff7a6b)' : 'transparent'}`, marginBottom: -1, whiteSpace: 'nowrap', fontFamily: 'inherit' }}>{l}</button>
        ))}
      </div>

      {loading ? <SkeletonList /> : !companyId ? <div style={{ color: '#6b7280' }}>No workspace found.</div> : (
        <>
          {tab === 'bookings' && <BookingsList companyId={companyId} bookings={bookings} timezone={settings?.timezone || 'Australia/Melbourne'} scope={scope} setScope={setScope} reload={() => loadBookings(companyId, scope)} flash={flash} />}
          {tab === 'services' && meta && <ServicesTab companyId={companyId} services={services} reload={() => loadServices(companyId)} staff={meta.staff || []} locations={meta.locations || []} stripeReady={!!meta.stripeReady} bookingUrl={meta.bookingUrl} flash={flash} />}
          {tab === 'availability' && settings && <AvailabilityTab settings={settings} setSettings={setSettings} staff={meta?.staff || []} />}
          {tab === 'settings' && settings && <BookingSettingsTab settings={settings} setSettings={setSettings} />}
        </>
      )}

      {dirty && (tab === 'availability' || tab === 'settings') && (
        <div style={{ position: 'sticky', bottom: 16, marginTop: 18, display: 'flex', justifyContent: 'flex-end', gap: 8, padding: '10px 12px', background: '#fff', border: '1px solid var(--border, #ececec)', borderRadius: 12, boxShadow: '0 10px 30px -12px rgba(0,0,0,.2)' }}>
          <span style={{ marginRight: 'auto', alignSelf: 'center', fontSize: 13, color: 'var(--slate, #6b7280)' }}>Unsaved changes</span>
          <button onClick={() => { setSettings(JSON.parse(savedSettings.current)) }} style={btnGhost}>Discard</button>
          <button onClick={saveSettings} disabled={savingSettings} style={btn}>{savingSettings ? 'Saving…' : 'Save changes'}</button>
        </div>
      )}

      {toast && <div style={{ position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)', background: '#111', color: '#fff', padding: '10px 16px', borderRadius: 10, fontSize: 13.5, zIndex: 1100, boxShadow: '0 10px 30px rgba(0,0,0,.25)' }}>{toast}</div>}
    </div>
  )
}
