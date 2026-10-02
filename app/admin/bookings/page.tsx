'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { resolveCompanyUser } from '@/lib/client-cache'
import PageHeader from '@/components/PageHeader'
import { SkeletonList } from '@/components/Skeleton'
import { api, btn, btnGhost } from '@/components/booking/admin/shared'
import { LinkIcon, CodeIcon, ExternalIcon, WarnIcon, CheckIcon, CalendarIcon, ClockIcon, TagIcon, GearIcon, SparkleIcon } from '@/components/booking/icons'
import BookingsList from '@/components/booking/admin/BookingsList'
import ServicesTab from '@/components/booking/admin/ServicesTab'
import AvailabilityTab from '@/components/booking/admin/AvailabilityTab'
import BookingSettingsTab from '@/components/booking/admin/BookingSettingsTab'
import TodayTab from '@/components/booking/admin/TodayTab'
import EmbedDialog from '@/components/booking/admin/EmbedDialog'

// Online booking & appointments: the bookings themselves, the services people
// can book, when they can book, and the policy. The public page lives at
// /book/<slug> (or <slug>.colvy.com/book).

type Tab = 'today' | 'bookings' | 'services' | 'availability' | 'settings'

export default function BookingsPage() {
  const router = useRouter()
  const [companyId, setCompanyId] = useState('')
  const [tab, setTab] = useState<Tab>('today')
  const [showEmbed, setShowEmbed] = useState(false)
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
  const [upcomingCount, setUpcomingCount] = useState<number | null>(null)

  const flash = (m: string) => { setToast(m); setTimeout(() => setToast(''), 4500) }

  // Opening Bookings clears the side-menu "new bookings" badge.
  useEffect(() => {
    try { localStorage.setItem('colvy-bookings-seen-at', new Date().toISOString()); window.dispatchEvent(new Event('bookings-seen')) } catch {}
  }, [])

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
    try { const d = await api(`/api/bookings?companyId=${cid}&scope=${sc}`); setBookings(d.bookings || []); if (sc === 'upcoming') setUpcomingCount((d.bookings || []).filter((b: any) => b.status === 'confirmed').length); if (d.setupNeeded) setSetupMsg(d.hint) } catch {}
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
      if (t && ['today', 'bookings', 'services', 'availability', 'settings'].includes(t)) setTab(t)
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

  return (
    <div className="bk-page">
      <PageHeader
        title="Bookings"
        icon={<CalendarIcon size={21} />}
        subtitle="Let customers book appointments online — and pay a deposit if you want one."
        bleed={24}
        bleedTop={0}
        action={meta?.bookingUrl ? (
          <>
            <button onClick={copyLink} style={btnGhost} title="Copy booking link"><LinkIcon size={15} /><span className="bkh-l">Copy booking link</span></button>
            <button onClick={() => setShowEmbed(true)} style={btnGhost} title="Add to your website"><CodeIcon size={15} /><span className="bkh-l">Embed</span></button>
            <a href={meta.bookingUrl} target="_blank" rel="noreferrer" style={{ ...btn, textDecoration: 'none' }} title="Open booking page"><span className="bkh-l">Open booking page</span><ExternalIcon size={15} /></a>
          </>
        ) : undefined}
      />
      <style>{`
        .bk-page{padding:0 24px 60px}
        @media(max-width:700px){.bkh-l{display:none}.bk-page{padding:0 14px 60px}.bk-page>div:first-child{margin-left:-14px!important;margin-right:-14px!important}}
        .bk-tabs{display:flex;gap:2px;border-bottom:1px solid var(--border,#ececec);margin:16px 0 18px;overflow-x:auto;overflow-y:hidden;scrollbar-width:none}
        .bk-tabs::-webkit-scrollbar{display:none}
        .bk-tab{display:inline-flex;align-items:center;gap:7px;border:none;background:none;padding:11px 14px;font-size:14px;font-weight:700;cursor:pointer;white-space:nowrap;font-family:inherit;color:var(--slate,#6b7280);box-shadow:inset 0 -2px 0 transparent;transition:color .2s,box-shadow .25s cubic-bezier(.22,1,.36,1);outline:none}
        .bk-tab:hover{color:var(--ink,#111)}
        .bk-tab,.bk-tab:hover,.bk-tab:active,.bk-tab:focus{background:transparent!important}
        .bk-tab.on{color:var(--ink,#111);box-shadow:inset 0 -2px 0 var(--coral,#ff7a6b)}
        .bk-tab:focus-visible{box-shadow:inset 0 0 0 2px var(--coral,#ff7a6b);border-radius:8px}
        .bk-tab svg{opacity:.75;transition:opacity .2s}
        .bk-tab.on svg{opacity:1;color:var(--coral,#ff7a6b)}
        .bk-count{min-width:20px;height:20px;padding:0 6px;border-radius:999px;display:inline-flex;align-items:center;justify-content:center;font-size:11.5px;font-weight:800;background:#f1f1f3;color:var(--slate,#6b7280);font-variant-numeric:tabular-nums;transition:background .2s,color .2s}
        .bk-tab.on .bk-count{background:var(--peach,#fff1ee);color:var(--coral,#e5604f)}
        .bk-steps{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}
        @media(max-width:760px){.bk-steps{grid-template-columns:1fr}}
        .bk-step{display:flex;gap:11px;align-items:flex-start;text-align:left;padding:12px 13px;border-radius:12px;border:1px solid var(--border,#ececec);background:#fff;cursor:pointer;font:inherit;color:inherit;transition:transform .2s cubic-bezier(.22,1,.36,1),box-shadow .2s,border-color .2s}
        .bk-step:hover{transform:translate3d(0,-1px,0);box-shadow:0 8px 20px -14px rgba(0,0,0,.35);border-color:#e2e2e2}
        .bk-num{width:24px;height:24px;border-radius:50%;flex-shrink:0;display:flex;align-items:center;justify-content:center;font-size:12.5px;font-weight:800;background:var(--peach,#fff1ee);color:var(--coral,#e5604f)}
        .bk-num.done{background:#dcfce7;color:#15803d}
      `}</style>

      {setupMsg && (
        <div style={{ margin: '14px 0', padding: '12px 14px', borderRadius: 12, background: '#fffbeb', border: '1px solid #fde68a', color: '#92400e', fontSize: 13.5, display: 'flex', gap: 8, alignItems: 'flex-start' }}><WarnIcon size={16} style={{ marginTop: 1 }} /><span>{setupMsg}</span></div>
      )}

      {!loading && settings && !setupMsg && (!services.length || !meta?.saved) && (
        <div style={{ margin: '4px 0 14px', padding: 14, borderRadius: 16, background: 'var(--peach, #fff6f3)', border: '1px solid #fde4dc' }}>
          <div style={{ fontWeight: 800, fontSize: 14, marginBottom: 10, color: 'var(--ink, #111)' }}>Get set up in 3 steps</div>
          <div className="bk-steps">
            {([
              [services.length > 0, 'Add a service', 'What people can book, how long it takes and the price.', () => switchTab('services')],
              [!!meta?.saved, 'Set your hours', 'Opening hours and who takes bookings, under Availability.', () => switchTab('availability')],
              [false, 'Share your link', 'Website, Instagram bio, or text it to a customer.', copyLink],
            ] as [boolean, string, string, () => void][]).map(([done, t, d, go], i) => (
              <button key={t} className="bk-step" onClick={go}>
                <span className={`bk-num${done ? ' done' : ''}`}>{done ? <CheckIcon size={13} strokeWidth={3} /> : i + 1}</span>
                <span style={{ minWidth: 0 }}>
                  <span style={{ display: 'block', fontWeight: 700, fontSize: 13.5, color: 'var(--ink, #111)', textDecoration: done ? 'line-through' : undefined, textDecorationColor: '#9ca3af' }}>{t}</span>
                  <span style={{ display: 'block', fontSize: 12.5, color: 'var(--slate, #6b7280)', marginTop: 2, lineHeight: 1.45 }}>{d}</span>
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="bk-tabs" role="tablist">
        {([
          ['today', 'Today', <SparkleIcon key="i" size={15} />, null],
          ['bookings', 'Bookings', <CalendarIcon key="i" size={15} />, upcomingCount],
          ['services', 'Services', <TagIcon key="i" size={15} />, services.length || null],
          ['availability', 'Availability', <ClockIcon key="i" size={15} />, null],
          ['settings', 'Settings', <GearIcon key="i" size={15} />, null],
        ] as [Tab, string, React.ReactNode, number | null][]).map(([k, l, ic, n]) => (
          <button key={k} role="tab" aria-selected={tab === k} onClick={() => switchTab(k)} className={`bk-tab${tab === k ? ' on' : ''}`}>{ic}{l}{n ? <span className="bk-count">{n}</span> : null}</button>
        ))}
      </div>

      {loading ? <SkeletonList /> : !companyId ? <div style={{ color: '#6b7280' }}>No workspace found.</div> : (
        <>
          {tab === 'today' && <TodayTab companyId={companyId} onOpenBookings={() => switchTab('bookings')} />}
          {tab === 'bookings' && <BookingsList companyId={companyId} bookings={bookings} timezone={settings?.timezone || 'Australia/Melbourne'} scope={scope} setScope={setScope} reload={() => loadBookings(companyId, scope)} flash={flash} />}
          {tab === 'services' && meta && <ServicesTab companyId={companyId} services={services} settings={settings} onGoAvailability={() => switchTab('availability')} reload={() => loadServices(companyId)} staff={meta.staff || []} locations={meta.locations || []} stripeReady={!!meta.stripeReady} bookingUrl={meta.bookingUrl} flash={flash} />}
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

      {showEmbed && meta?.bookingUrl && <EmbedDialog bookingUrl={meta.bookingUrl} services={services.filter(x => x.active)} onClose={() => setShowEmbed(false)} flash={flash} />}

      {toast && <div style={{ position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)', background: '#111', color: '#fff', padding: '10px 16px', borderRadius: 10, fontSize: 13.5, zIndex: 1100, boxShadow: '0 10px 30px rgba(0,0,0,.25)' }}>{toast}</div>}
    </div>
  )
}
