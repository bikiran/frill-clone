'use client'

import { card, input, label, hint, Toggle } from './shared'

// Booking page text, what we ask customers, cancellation policy, notifications.

export default function BookingSettingsTab({ settings, setSettings }: { settings: any; setSettings: (s: any) => void }) {
  const set = (patch: any) => setSettings({ ...settings, ...patch })
  const wl = { enabled: false, mode: 'first', batch: 3, hold_mins: 15, notice_mins: 120, max_per_day: 3, ...(settings.waitlist || {}) }
  const setWl = (patch: any) => set({ waitlist: { ...wl, ...patch } })
  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <style>{`.bks-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}@media(max-width:600px){.bks-grid{grid-template-columns:1fr}}`}</style>
      <section style={card}>
        <div style={title}>Booking page</div>
        <div style={{ display: 'grid', gap: 12, marginTop: 12 }}>
          <Row label="Online booking on" sub="Turn off to take the page down (existing bookings are kept)."><Toggle on={settings.enabled} onChange={v => set({ enabled: v })} label="Online booking on" /></Row>
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
        <div style={title}>Waitlist</div>
        <div style={{ display: 'grid', gap: 12, marginTop: 12 }}>
          <Row label="Let customers join a waitlist" sub="When a day is full, the booking page offers “Join the waitlist”. If a time frees up (a cancellation, a move, an unpaid hold that lapses, or you open more hours), people waiting for it get a text with a link to book it. Deposits and payment apply as usual."><Toggle on={wl.enabled} onChange={v => setWl({ enabled: v })} /></Row>
          {wl.enabled && (
            <>
              <div className="bks-grid">
                <div>
                  <span style={label}>Who gets a freed time</span>
                  <select value={wl.mode} onChange={e => setWl({ mode: e.target.value })} style={input}>
                    <option value="first">First to claim: text a few people at once</option>
                    <option value="order">In order: one person at a time, held for them</option>
                  </select>
                </div>
                {wl.mode === 'first' ? (
                  <div>
                    <span style={label}>People texted per freed time</span>
                    <select value={wl.batch} onChange={e => setWl({ batch: Number(e.target.value) })} style={input}>
                      {[1, 2, 3, 4, 5, 8, 10].map(n => <option key={n} value={n}>{n}</option>)}
                    </select>
                  </div>
                ) : (
                  <div>
                    <span style={label}>Hold it for each person for</span>
                    <select value={wl.hold_mins} onChange={e => setWl({ hold_mins: Number(e.target.value) })} style={input}>
                      {[5, 10, 15, 20, 30, 45, 60, 120].map(n => <option key={n} value={n}>{n < 60 ? `${n} minutes` : `${n / 60} hour${n > 60 ? 's' : ''}`}</option>)}
                    </select>
                  </div>
                )}
                <div>
                  <span style={label}>Only offer times starting at least</span>
                  <select value={wl.notice_mins} onChange={e => setWl({ notice_mins: Number(e.target.value) })} style={input}>
                    {[[30, '30 minutes away'], [60, '1 hour away'], [120, '2 hours away'], [180, '3 hours away'], [240, '4 hours away'], [720, '12 hours away'], [1440, '1 day away']].map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                  </select>
                </div>
                <div>
                  <span style={label}>Most offers per person per day</span>
                  <select value={wl.max_per_day} onChange={e => setWl({ max_per_day: Number(e.target.value) })} style={input}>
                    {[1, 2, 3, 4, 5].map(n => <option key={n} value={n}>{n}</option>)}
                  </select>
                </div>
              </div>
              <div style={hint}>{wl.mode === 'first'
                ? `Up to ${wl.batch} ${wl.batch === 1 ? 'person' : 'people'}, longest waiting first, get the link at once; whoever books first gets it and the rest stay on the list.`
                : `The longest-waiting person gets it held for ${wl.hold_mins} minutes; if they don’t book, the next person is offered it.`} Texts go out between 9am and 8pm (a time freed overnight is offered in the morning if it’s still far enough away), skip anyone who replied STOP (they’re emailed instead if they left an email), and count towards your SMS usage. People drop off the list after their last chosen day.</div>
            </>
          )}
        </div>
      </section>

      <section style={card}>
        <div style={title}>Reminders & follow-ups</div>
        <div style={{ display: 'grid', gap: 10, marginTop: 12 }}>
          <Row label="Reminder the day before" sub="24 hours ahead by SMS and email (sent between 8am and 8pm). Customers reply C to confirm or R to reschedule."><Toggle on={settings.reminder_24h} onChange={v => set({ reminder_24h: v })} /></Row>
          <Row label="Reminder 2 hours before" sub="A short SMS on the day — skipped if the day-before reminder only just went out."><Toggle on={settings.reminder_2h} onChange={v => set({ reminder_2h: v })} /></Row>
          <Row label="Ask for a review afterwards" sub="When a visit is done, a review request is queued — uses your Reviews settings (delay, channels, who gets asked)."><Toggle on={settings.followup_review} onChange={v => set({ followup_review: v })} /></Row>
        </div>
        <div style={{ ...hint, marginTop: 10 }}>“Time for your next one?” nudges are set per service (Services → edit → Rebook reminder).</div>
      </section>

      <section style={card}>
        <div style={title}>Chat widget</div>
        <div style={{ display: 'grid', gap: 10, marginTop: 12 }}>
          <Row label="Show a Book tab in your chat widget" sub="Visitors on your website can see your services and book from the widget."><Toggle on={settings.show_in_widget} onChange={v => set({ show_in_widget: v })} /></Row>
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
    <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '12px 14px', borderRadius: 14, background: '#fafafa' }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink, #111)' }}>{l}</div>
        {sub && <div style={hint}>{sub}</div>}
      </div>
      {children}
    </div>
  )
}

const title: React.CSSProperties = { fontWeight: 800, fontSize: 17, letterSpacing: '-.01em', color: 'var(--ink, #111)' }
