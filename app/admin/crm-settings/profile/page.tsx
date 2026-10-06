'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { useCompanyUser, S, ToggleRow } from '../_shared'

const TIMEZONES = ['Australia/Melbourne', 'Australia/Sydney', 'Australia/Brisbane', 'Australia/Adelaide', 'Australia/Perth', 'Australia/Darwin', 'Australia/Hobart', 'Pacific/Auckland']

export default function ProfileSettings() {
  const { companyId, user, loading } = useCompanyUser()
  const [s, setS] = useState<any>({
    contact_number: '', timezone: 'Australia/Melbourne',
    working_hours_start: '09:00', working_hours_end: '17:00',
    dialer_enabled: true, show_message_detail: true,
    browser_notifications: false, message_notifications: true,
    enquiry_notifications: true, email_notifications: true, mobile_notifications: false,
    notification_numbers: [], notification_emails: [],
  })
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  // Inbox time format is company-wide (companies.inbox_settings.hour12), so the
  // whole team sees the same clock. Saved straight away when picked.
  const [hour12, setHour12] = useState(true)
  const [inboxSettings, setInboxSettings] = useState<any>({})
  const [formatSaved, setFormatSaved] = useState(false)

  useEffect(() => {
    if (!companyId) return
    ;(async () => {
      const { data } = await (supabase as any).from('companies').select('inbox_settings').eq('id', companyId).maybeSingle()
      const st = data?.inbox_settings || {}
      setInboxSettings(st)
      if (typeof st.hour12 === 'boolean') setHour12(st.hour12)
    })()
  }, [companyId])

  const changeHour12 = async (v: boolean) => {
    if (!companyId || v === hour12) return
    setHour12(v)
    const next = { ...inboxSettings, hour12: v }
    setInboxSettings(next)
    const { error } = await (supabase as any).from('companies').update({ inbox_settings: next }).eq('id', companyId)
    if (!error) { setFormatSaved(true); setTimeout(() => setFormatSaved(false), 2000) }
  }

  useEffect(() => {
    if (!companyId || !user) return
    ;(async () => {
      const { data } = await (supabase as any).from('user_settings').select('*').eq('user_id', user.id).eq('company_id', companyId).maybeSingle()
      if (data) setS({ ...s, ...data })
    })()
  }, [companyId, user])

  const save = async () => {
    if (!companyId || !user) return
    setSaving(true); setSaved(false)
    const payload = { ...s, user_id: user.id, company_id: companyId, updated_at: new Date().toISOString() }
    delete payload.id; delete payload.created_at
    const { data: existing } = await (supabase as any).from('user_settings').select('id').eq('user_id', user.id).eq('company_id', companyId).maybeSingle()
    if (existing) await (supabase as any).from('user_settings').update(payload).eq('id', existing.id)
    else await (supabase as any).from('user_settings').insert(payload)
    setSaving(false); setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  const set = (k: string, v: any) => setS((p: any) => ({ ...p, [k]: v }))
  const name = user?.user_metadata?.display_name || user?.email?.split('@')[0] || 'You'
  const initials = name.split(' ').map((w: string) => w[0]).join('').slice(0, 2).toUpperCase()

  if (loading) return <div style={{ color: 'var(--slate)' }}>Loading…</div>

  return (
    <div style={{ maxWidth: 720 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
        <div style={{ width: 48, height: 48, borderRadius: '50%', background: 'var(--coral)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, fontWeight: 800 }}>{initials}</div>
        <div>
          <h1 style={{ ...S.h1, margin: 0, fontSize: 20 }}>{name}</h1>
          <span style={{ fontSize: 12, color: '#059669', fontWeight: 600 }}>● Online</span>
        </div>
      </div>

      {/* General Information */}
      <div style={S.card}>
        <h2 style={S.h2}>General Information</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16 }}>
          <div>
            <label style={S.label}>Contact Number</label>
            <input value={s.contact_number || ''} onChange={e => set('contact_number', e.target.value)} placeholder="+61…" style={S.input} />
          </div>
          <div>
            <label style={S.label}>Time Zone</label>
            <select value={s.timezone} onChange={e => set('timezone', e.target.value)} style={S.input}>
              {TIMEZONES.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div>
            <label style={S.label}>Email</label>
            <input value={user?.email || ''} disabled style={{ ...S.input, background: 'var(--canvas)', color: 'var(--slate)' }} />
          </div>
          <div>
            <label style={S.label}>Working Hours</label>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input type="time" value={s.working_hours_start} onChange={e => set('working_hours_start', e.target.value)} style={S.input} />
              <span style={{ color: 'var(--slate)', fontSize: 13 }}>to</span>
              <input type="time" value={s.working_hours_end} onChange={e => set('working_hours_end', e.target.value)} style={S.input} />
            </div>
          </div>
        </div>
      </div>

      {/* Customisation */}
      <div style={S.card}>
        <h2 style={S.h2}>Customisation</h2>
        <ToggleRow title="Show Message Detail" desc="Show a preview of individual message details, e.g. date & time." checked={s.show_message_detail} onChange={v => set('show_message_detail', v)} />
        <ToggleRow title="Enable Dialer" desc="Enable or disable the phone call feature for your account. This change only affects you." checked={s.dialer_enabled} onChange={v => set('dialer_enabled', v)} />
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, padding: '12px 0', flexWrap: 'wrap' }}>
          <div style={{ minWidth: 0, flex: '1 1 260px' }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--ink)' }}>Inbox time format</div>
            <div style={{ fontSize: 12.5, color: 'var(--slate)', marginTop: 2 }}>
              How message times show in the inbox. Applies to everyone on the team.
              {formatSaved && <span style={{ color: '#059669', fontWeight: 600 }}> Saved.</span>}
            </div>
          </div>
          <div role="radiogroup" aria-label="Inbox time format" style={{ display: 'flex', gap: 6, background: 'var(--canvas,#f5f6f8)', borderRadius: 9, padding: 3 }}>
            {[{ v: true, label: '12-hour', hint: '1:30 PM' }, { v: false, label: '24-hour', hint: '13:30' }].map(o => (
              <button key={o.label} type="button" role="radio" aria-checked={hour12 === o.v} onClick={() => changeHour12(o.v)}
                style={{ border: 'none', borderRadius: 7, padding: '7px 14px', cursor: 'pointer', background: hour12 === o.v ? '#fff' : 'transparent', boxShadow: hour12 === o.v ? '0 1px 3px rgba(0,0,0,0.12)' : 'none', color: hour12 === o.v ? 'var(--coral)' : 'var(--slate)', fontWeight: 700, fontSize: 12.5, lineHeight: 1.25, transition: 'background .15s, color .15s' }}>
                {o.label}<br /><span style={{ fontSize: 10.5, fontWeight: 500, color: 'var(--slate)' }}>{o.hint}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Notifications */}
      <div style={S.card}>
        <h2 style={S.h2}>Notifications</h2>
        <ToggleRow title="Browser Notifications" desc="Colvy will send a browser notification whenever you get new activity." checked={s.browser_notifications} onChange={v => set('browser_notifications', v)} />
        <ToggleRow title="Message Notifications" desc="Get notified whenever you receive a new message." checked={s.message_notifications} onChange={v => set('message_notifications', v)} />
        <ToggleRow title="Enquiry Notifications" desc="Get notified whenever you receive a new enquiry." checked={s.enquiry_notifications} onChange={v => set('enquiry_notifications', v)} />
        <ToggleRow title="Email Notifications" desc="Reply-in-time emails keep leads happy — we'll email you if they've been waiting 5 minutes." checked={s.email_notifications} onChange={v => set('email_notifications', v)} />
        <ToggleRow title="Mobile Notifications" desc="Get a text message when you receive a new enquiry." checked={s.mobile_notifications} onChange={v => set('mobile_notifications', v)} />
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <button onClick={save} disabled={saving} style={S.btn}>{saving ? 'Saving…' : 'Save changes'}</button>
        {saved && <span style={{ fontSize: 13, color: '#059669', fontWeight: 600 }}>✓ Saved</span>}
      </div>
    </div>
  )
}
