'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { resolveCompanyUser } from '@/lib/client-cache'
import { SkeletonList } from '@/components/Skeleton'
import { api } from '@/components/booking/admin/shared'
import { LinkIcon, CodeIcon, ExternalIcon, WarnIcon, CheckIcon } from '@/components/booking/icons'
import BookingsList from '@/components/booking/admin/BookingsList'
import ServicesTab from '@/components/booking/admin/ServicesTab'
import AvailabilityTab from '@/components/booking/admin/AvailabilityTab'
import BookingSettingsTab from '@/components/booking/admin/BookingSettingsTab'
import TodayTab from '@/components/booking/admin/TodayTab'
import WaitlistTab from '@/components/booking/admin/WaitlistTab'
import EmbedDialog from '@/components/booking/admin/EmbedDialog'

// Online booking & appointments: the bookings themselves, the services people
// can book, when they can book, and the policy. The public page lives at
// /book/<slug> (or <slug>.colvy.com/book).

type Tab = 'today' | 'bookings' | 'waitlist' | 'services' | 'availability' | 'settings'

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
      if (t && ['today', 'bookings', 'waitlist', 'services', 'availability', 'settings'].includes(t)) setTab(t)
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
  // The waitlist as saved (not unsaved edits on the Settings tab).
  const savedWaitlistOn = (() => { try { return !!JSON.parse(savedSettings.current || '{}')?.waitlist?.enabled } catch { return false } })()
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
      <style>{BK_CSS}</style>
      <div className="bk-head">
        <div style={{ minWidth: 0 }}>
          <h1>Bookings</h1>
          <p>Let customers book appointments online, and pay a deposit if you want one.</p>
        </div>
        {meta?.bookingUrl && (
          <div className="bk-head-acts">
            <a href={meta.bookingUrl} target="_blank" rel="noreferrer" className="bk-ic" title="Open booking page" aria-label="Open booking page"><ExternalIcon size={16} /></a>
            <button type="button" onClick={() => setShowEmbed(true)} className="bk-ic" title="Add to your website" aria-label="Add booking to your website"><CodeIcon size={16} /></button>
            <button type="button" onClick={copyLink} className="cv-btn cv-btn-primary bk-copy" title="Copy booking link"><LinkIcon size={15} /><span className="bkh-l">Copy booking link</span></button>
          </div>
        )}
      </div>

      {setupMsg && (
        <div className="bk-warn"><WarnIcon size={16} style={{ marginTop: 1, flexShrink: 0 }} /><span>{setupMsg}</span></div>
      )}

      {!loading && settings && !setupMsg && (!services.length || !meta?.saved) && (
        <div className="bk-setup">
          <div className="bk-setup-h">Get set up in 3 steps</div>
          <div className="bk-setup-sub">Then share your link and bookings start coming in.</div>
          <div className="bk-steps">
            {([
              [services.length > 0, 'Add a service', 'What people can book, how long it takes and the price.', () => switchTab('services')],
              [!!meta?.saved, 'Set your hours', 'Opening hours and who takes bookings, under Availability.', () => switchTab('availability')],
              [false, 'Share your link', 'Website, Instagram bio, or text it to a customer.', copyLink],
            ] as [boolean, string, string, () => void][]).map(([done, t, d, go], i) => (
              <button key={t} type="button" className={`bk-step${done ? ' done' : ''}`} onClick={go}>
                <span className={`bk-num${done ? ' done' : ''}`}>{done ? <CheckIcon size={13} strokeWidth={3} /> : i + 1}</span>
                <span style={{ minWidth: 0 }}>
                  <span className="bk-step-t">{t}</span>
                  <span className="bk-step-d">{d}</span>
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="bk-tabs" role="tablist" aria-label="Bookings">
        {([
          ['today', 'Today', null],
          ['bookings', 'Bookings', upcomingCount],
          ['waitlist', 'Waitlist', null],
          ['services', 'Services', services.length || null],
          ['availability', 'Availability', null],
          ['settings', 'Settings', null],
        ] as [Tab, string, number | null][]).map(([k, l, n]) => (
          <button key={k} type="button" role="tab" aria-selected={tab === k} onClick={() => switchTab(k)} className={`bk-tab${tab === k ? ' on' : ''}`}>{l}{n ? <span className="bk-count">{n}</span> : null}</button>
        ))}
      </div>

      {loading ? <SkeletonList /> : !companyId ? <div style={{ color: '#6b7280' }}>No workspace found.</div> : (
        <>
          {tab === 'today' && <TodayTab companyId={companyId} onOpenBookings={() => switchTab('bookings')} />}
          {tab === 'bookings' && <BookingsList companyId={companyId} bookings={bookings} timezone={settings?.timezone || 'Australia/Melbourne'} scope={scope} setScope={setScope} reload={() => loadBookings(companyId, scope)} flash={flash} />}
          {tab === 'waitlist' && <WaitlistTab companyId={companyId} services={services} timezone={settings?.timezone || 'Australia/Melbourne'} enabled={savedWaitlistOn} onGoSettings={() => switchTab('settings')} flash={flash} />}
          {tab === 'services' && meta && <ServicesTab companyId={companyId} services={services} settings={settings} onGoAvailability={() => switchTab('availability')} reload={() => loadServices(companyId)} staff={meta.staff || []} locations={meta.locations || []} stripeReady={!!meta.stripeReady} bookingUrl={meta.bookingUrl} flash={flash} />}
          {tab === 'availability' && settings && <AvailabilityTab settings={settings} setSettings={setSettings} staff={meta?.staff || []} locations={meta?.locations || []} />}
          {tab === 'settings' && settings && <BookingSettingsTab settings={settings} setSettings={setSettings} />}
        </>
      )}

      {dirty && (tab === 'availability' || tab === 'settings') && (
        <div className="bk-savebar" role="status">
          <span className="bk-dirty">Unsaved changes</span>
          <button onClick={() => { setSettings(JSON.parse(savedSettings.current)) }} className="cv-btn">Discard</button>
          <button onClick={saveSettings} disabled={savingSettings} className="cv-btn cv-btn-primary">{savingSettings ? 'Saving…' : 'Save changes'}</button>
        </div>
      )}

      {showEmbed && meta?.bookingUrl && <EmbedDialog bookingUrl={meta.bookingUrl} services={services.filter(x => x.active)} onClose={() => setShowEmbed(false)} flash={flash} />}

      {toast && <div className="bk-toast" role="status">{toast}</div>}
    </div>
  )
}

// The Bookings look, shared by every tab (they all render inside .bk-page):
// a big bold header, pill tabs, soft grey fields and pill buttons.
const BK_CSS = `
.bk-page{padding:24px 28px 60px;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:var(--ink,#111)}
.bk-head{display:flex;align-items:flex-end;justify-content:space-between;gap:16px;margin-bottom:20px}
.bk-head h1{margin:0;font-size:30px;font-weight:800;letter-spacing:-.025em;line-height:1.1;color:var(--ink,#111)}
.bk-head p{margin:6px 0 0;font-size:14px;color:#71717a}
.bk-head-acts{display:flex;align-items:center;gap:8px;flex-shrink:0}
.bk-ic{width:38px;height:38px;flex-shrink:0;padding:0;border:none;border-radius:999px;background:#f4f4f5;color:#3f3f46;display:inline-flex;align-items:center;justify-content:center;cursor:pointer;text-decoration:none;transition:background-color .15s,color .15s}
.bk-ic:hover{background-color:#ececef;color:#18181b}
.bk-page button::before{display:none}
.bk-warn{display:flex;gap:9px;align-items:flex-start;margin:0 0 14px;padding:12px 14px;border-radius:16px;background:#fffbeb;color:#92400e;font-size:13.5px;line-height:1.45}
.bk-setup{margin:0 0 16px;padding:18px;border-radius:20px;background:#fff;box-shadow:0 0 0 1px rgba(0,0,0,.06),0 1px 2px rgba(16,24,40,.04)}
.bk-setup-h{font-weight:800;font-size:17px;letter-spacing:-.01em;color:var(--ink,#111)}
.bk-setup-sub{margin:3px 0 14px;font-size:13.5px;color:#71717a}
.bk-steps{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}
.bk-step{display:flex;gap:12px;align-items:flex-start;text-align:left;padding:14px;border-radius:16px;border:none;background:#f4f4f5;cursor:pointer;font:inherit;color:inherit;transition:background-color .15s}
.bk-step:hover{background-color:#ececef}
.bk-step.done{background:#f0fdf4}
.bk-num{width:26px;height:26px;border-radius:50%;flex-shrink:0;display:flex;align-items:center;justify-content:center;font-size:12.5px;font-weight:800;background:#fff;color:var(--ink,#111);box-shadow:0 0 0 1px rgba(0,0,0,.06)}
.bk-num.done{background:#22c55e;color:#fff;box-shadow:none}
.bk-step-t{display:block;font-weight:700;font-size:14px;color:var(--ink,#111)}
.bk-step.done .bk-step-t{text-decoration:line-through;text-decoration-color:#a1a1aa;color:#71717a}
.bk-step-d{display:block;font-size:12.5px;color:#71717a;margin-top:2px;line-height:1.45}
.bk-tabs{display:flex;gap:6px;margin:0 0 18px;overflow-x:auto;overflow-y:hidden;scrollbar-width:none;padding:1px 0 2px}
.bk-tabs::-webkit-scrollbar{display:none}
.bk-tab{flex-shrink:0;height:34px;padding:0 14px;border-radius:999px;border:none;background:#f4f4f5;color:#52525b;font:inherit;font-size:14px;font-weight:600;cursor:pointer;white-space:nowrap;display:inline-flex;align-items:center;gap:7px;transition:background-color .15s,color .15s}
.bk-tab:hover{background-color:#ececef;color:#18181b}
.bk-tab.on{background-color:#18181b;color:#fff}
.bk-tab:focus-visible,.bk-ic:focus-visible,.bk-step:focus-visible{outline:none;box-shadow:0 0 0 3px color-mix(in srgb,var(--coral,#ff7a6b) 28%,transparent)}
.bk-count{min-width:18px;height:18px;padding:0 6px;box-sizing:border-box;border-radius:999px;display:inline-flex;align-items:center;justify-content:center;font-size:11.5px;font-weight:700;background:#fff;color:#52525b;font-variant-numeric:tabular-nums}
.bk-tab.on .bk-count{background:rgba(255,255,255,.18);color:#fff}
.bk-savebar{position:sticky;bottom:16px;z-index:20;margin-top:18px;display:flex;align-items:center;gap:8px;padding:8px 8px 8px 18px;background:#fff;border-radius:999px;box-shadow:0 12px 36px rgba(0,0,0,.14),0 0 0 1px rgba(0,0,0,.05)}
.bk-dirty{margin-right:auto;font-size:13.5px;font-weight:600;color:#52525b;display:inline-flex;align-items:center;gap:8px}
.bk-dirty::before{content:'';width:7px;height:7px;border-radius:50%;background:#f59e0b}
.bk-toast{position:fixed;bottom:24px;left:50%;transform:translateX(-50%);background:#18181b;color:#fff;padding:11px 18px;border-radius:999px;font-size:13.5px;font-weight:500;z-index:1100;box-shadow:0 12px 30px rgba(0,0,0,.25);max-width:calc(100vw - 32px)}
.bk-page .cv-btn.bk-sm{height:32px;padding:0 12px;font-size:13px}
.bk-arrow{width:24px;height:24px;padding:0;border:none;border-radius:999px;background:#f4f4f5;color:#52525b;display:inline-flex;align-items:center;justify-content:center;cursor:pointer;transition:background-color .15s}
.bk-arrow:hover:not(:disabled){background-color:#ececef;color:#18181b}
.bk-arrow:disabled{opacity:.35;cursor:default}
.bk-sect-t{font-weight:800;font-size:17px;letter-spacing:-.01em;color:var(--ink,#111)}
.bk-chip-x{display:inline-flex;align-items:center;gap:6px;height:30px;padding:0 6px 0 12px;border-radius:999px;background:#f4f4f5;color:#3f3f46;font-size:13px;font-weight:600}
.bk-chip-x button{width:20px;height:20px;padding:0;border:none;border-radius:999px;background:#e4e4e7;color:#52525b;display:inline-flex;align-items:center;justify-content:center;cursor:pointer;font-size:13px;line-height:1}
.bk-chip-x button:hover{background:#d4d4d8;color:#18181b}
.bk-pick{height:34px;padding:0 13px;border-radius:999px;border:none;background:#f4f4f5;color:#52525b;font:inherit;font-size:13.5px;font-weight:600;cursor:pointer;transition:background-color .15s,color .15s}
.bk-pick:hover{background-color:#ececef;color:#18181b}
.bk-pick.on{background-color:#18181b;color:#fff}
.bk-staff{padding:12px 14px;border-radius:16px;background:#fafafa}
.bk-staff.on{background:#fff;box-shadow:0 0 0 1px rgba(0,0,0,.07)}
.bk-page .cv-btn.bk-sm.cv-btn-icon{width:32px;padding:0}
.bk-page .cv-btn.bk-danger,.bkm-panel .cv-btn.bk-danger{background:#dc2626;border-color:transparent;color:#fff}
.bk-page .cv-btn.bk-danger:hover{background:#dc2626;filter:brightness(.95)}
.bk-page .cv-btn.bk-del{color:#dc2626}
/* Soft grey fields: white with a ring when focused; selects get a chevron. */
.bk-page :is(input:not([type=checkbox]):not([type=radio]):not([type=color]),select,textarea):focus{background-color:#fff!important;border-color:#d4d4d8!important;box-shadow:0 0 0 3px color-mix(in srgb,var(--coral,#ff7a6b) 16%,transparent)}
.bk-page select:not([multiple]){appearance:none;-webkit-appearance:none;padding-right:34px!important;background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='%2371717a' stroke-width='2.4' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E");background-repeat:no-repeat;background-position:right 12px center;background-size:14px;cursor:pointer}
.bk-page select.bk-tight{padding-left:12px!important;padding-right:26px!important;background-position:right 9px center}
.bk-page input::placeholder,.bk-page textarea::placeholder{color:#a1a1aa}
.bk-page input[type=checkbox]{accent-color:#18181b}
@media(max-width:760px){.bk-steps{grid-template-columns:1fr}}
@media(max-width:700px){
  .bk-page{padding:16px 14px 60px}
  .bk-head{align-items:center}
  .bk-head h1{font-size:26px}
  .bk-head p{display:none}
  .bkh-l{display:none}
  .bk-copy{width:38px;padding:0}
}
`
