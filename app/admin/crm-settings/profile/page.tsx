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
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
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
