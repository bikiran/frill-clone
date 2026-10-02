'use client'

import { card, input, label, hint, Toggle } from './shared'

// Booking page text, what we ask customers, cancellation policy, notifications.

export default function BookingSettingsTab({ settings, setSettings }: { settings: any; setSettings: (s: any) => void }) {
  const set = (patch: any) => setSettings({ ...settings, ...patch })
  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <section style={card}>
        <div style={title}>Booking page</div>
        <div style={{ display: 'grid', gap: 12, marginTop: 12 }}>
          <Row label="Online booking on" sub="Turn off to take the page down (existing bookings are kept)."><Toggle on={settings.enabled} onChange={v => set({ enabled: v })} /></Row>
          <div>
            <span style={label}>Heading</span>
            <input value={settings.page_title} onChange={e => set({ page_title: e.target.value })} placeholder="Book with us" style={input} />
          </div>
          <div>
            <span style={label}>Intro</span>
            <textarea value={settings.intro} onChange={e => set({ intro: e.target.value })} rows={3} placeholder="A line or two about what to expect, parking, etc." style={input} />
          </div>
          <div>
            <span style={label}>Note on the confirmation</span>
            <textarea value={settings.confirmation_note} onChange={e => set({ confirmation_note: e.target.value })} rows={2} placeholder="e.g. Please bring a water sample from your tank." style={input} />
            <div style={hint}>Shown on the confirmation page and in the confirmation email.</div>
          </div>
        </div>
      </section>

      <section style={card}>
        <div style={title}>Customer details</div>
        <div style={{ display: 'grid', gap: 10, marginTop: 12 }}>
          <Row label="Mobile number required"><Toggle on={settings.require_phone} onChange={v => set({ require_phone: v })} /></Row>
          <Row label="Email required"><Toggle on={settings.require_email} onChange={v => set({ require_email: v })} /></Row>
        </div>
      </section>

      <section style={card}>
        <div style={title}>Cancellations & changes</div>
        <div style={{ display: 'grid', gap: 12, marginTop: 12 }}>
          <div style={{ maxWidth: 320 }}>
            <span style={label}>Free changes until</span>
            <select value={settings.cancel_hours} onChange={e => set({ cancel_hours: Number(e.target.value) })} style={input}>
              {[[0, 'The booking starts'], [2, '2 hours before'], [4, '4 hours before'], [12, '12 hours before'], [24, '24 hours before'], [48, '48 hours before'], [72, '3 days before'], [168, '1 week before']].map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </div>
          <Row label="Customers can reschedule themselves" sub="Using the link in their confirmation, before the cut-off."><Toggle on={settings.allow_reschedule} onChange={v => set({ allow_reschedule: v })} /></Row>
          <Row label="Refund when cancelled in time" sub="Deposits / payments are refunded automatically when the customer cancels before the cut-off."><Toggle on={settings.refund_on_cancel} onChange={v => set({ refund_on_cancel: v })} /></Row>
          <Row label="Allow late cancellations online" sub={settings.late_cancel === 'block' ? 'After the cut-off, customers have to contact you.' : 'After the cut-off customers can still cancel, but nothing is refunded (the deposit is kept).'}>
            <Toggle on={settings.late_cancel !== 'block'} onChange={v => set({ late_cancel: v ? 'allow' : 'block' })} />
          </Row>
        </div>
      </section>

      <section style={card}>
        <div style={title}>Customer notifications</div>
        <div style={{ display: 'grid', gap: 10, marginTop: 12 }}>
          <Row label="SMS" sub="Confirmation, changes and cancellations, from your business number. Skipped for people who replied STOP."><Toggle on={settings.notify_sms} onChange={v => set({ notify_sms: v })} /></Row>
          <Row label="Email" sub="Includes a calendar invite and a manage-booking button."><Toggle on={settings.notify_email} onChange={v => set({ notify_email: v })} /></Row>
        </div>
        <div style={{ ...hint, marginTop: 10 }}>Your team gets an in-app notification for every new booking, change and cancellation, and the booking appears on the Calendar and in the customer’s conversation.</div>
      </section>
    </div>
  )
}

function Row({ label: l, sub, children }: { label: string; sub?: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--ink, #111)' }}>{l}</div>
        {sub && <div style={hint}>{sub}</div>}
      </div>
      {children}
    </div>
  )
}

const title: React.CSSProperties = { fontWeight: 800, fontSize: 15, color: 'var(--ink, #111)' }
