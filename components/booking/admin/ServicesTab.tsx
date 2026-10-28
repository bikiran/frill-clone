'use client'

import { useState } from 'react'
import { api, money, dur, card, input, label, hint, Toggle, Modal } from './shared'
import { PlusIcon, WarnIcon, LinkIcon } from '@/components/booking/icons'
import EmptyScroll from '@/components/EmptyScroll'
import { availabilityIssue } from '@/lib/booking-time'
import { confirmDialog } from '@/components/ConfirmDialog'

// Bookable services: list + editor.

const REBOOK = [0, 14, 28, 42, 90, 180, 365]
const COLORS = ['#ff7a6b', '#f59e0b', '#10b981', '#3b82f6', '#8b5cf6', '#ec4899', '#14b8a6', '#64748b']
const BLANK = {
  name: '', description: '', kind: 'appointment', duration_mins: 30, buffer_before: 0, buffer_after: 0, slot_interval: null,
  capacity: 1, price_cents: 0, payment_mode: 'none', deposit_cents: 0, currency: 'aud', location_mode: 'outlet',
  location_ids: [], video_url: '', staff_ids: [], min_notice_mins: 120, max_days_ahead: 60, questions: [], color: COLORS[0], active: true,
}

export default function ServicesTab({ companyId, services, reload, staff, locations, stripeReady, bookingUrl, flash, settings, onGoAvailability }: {
  companyId: string; services: any[]; reload: () => void
  staff: { id: string; name: string }[]; locations: { id: string; label: string; address: string; is_primary: boolean }[]
  stripeReady: boolean; bookingUrl: string | null; flash: (m: string) => void
  settings?: any; onGoAvailability?: () => void
}) {
  const names = Object.fromEntries(staff.map(x => [x.id, x.name]))
  const issueOf = (svc: any) => settings ? availabilityIssue(svc, settings, names) : null
  const [editing, setEditing] = useState<any | null>(null)

  const move = async (i: number, dir: -1 | 1) => {
    const order = services.map(s => s.id)
    const j = i + dir
    if (j < 0 || j >= order.length) return
    ;[order[i], order[j]] = [order[j], order[i]]
    await api('/api/bookings/services', { method: 'POST', json: { companyId, order } }).catch(() => {})
    reload()
  }
  const copy = (url: string) => { navigator.clipboard?.writeText(url).then(() => flash('Link copied')).catch(() => {}) }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 12, gap: 10 }}>
        <div style={{ flex: 1, fontSize: 13, color: 'var(--slate, #6b7280)' }}>{services.length ? 'What customers can book, in the order shown. Each service has its own link.' : ''}</div>
        <button onClick={() => setEditing({ ...BLANK })} className="cv-btn cv-btn-primary"><PlusIcon size={15} strokeWidth={2.4} /> New service</button>
      </div>
      {!services.length && (
        <div style={{ ...card, padding: '20px 12px' }}>
          <EmptyScroll kinds={['calendar']} title="Add your first service"
            line="e.g. “Aquarium setup consultation, 45 min, $50 deposit” or “Tank cleaning visit, 1 hr, at the customer’s address”."
            action={<button onClick={() => setEditing({ ...BLANK })} className="cv-btn cv-btn-primary"><PlusIcon size={15} strokeWidth={2.4} /> New service</button>} />
        </div>
      )}
      <div style={{ display: 'grid', gap: 10 }}>
        {services.map((s, i) => {
          const url = bookingUrl ? `${bookingUrl}/${s.slug}` : null
          const needsStripe = s.payment_mode !== 'none' && !stripeReady
          return (
            <div key={s.id} style={{ ...card, padding: '14px 16px', display: 'flex', gap: 12, alignItems: 'center', opacity: s.active ? 1 : 0.6, flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <button type="button" className="bk-arrow" onClick={() => move(i, -1)} disabled={i === 0} aria-label={`Move ${s.name} up`}><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="m6 15 6-6 6 6" /></svg></button>
                <button type="button" className="bk-arrow" onClick={() => move(i, 1)} disabled={i === services.length - 1} aria-label={`Move ${s.name} down`}><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6" /></svg></button>
              </div>
              <span style={{ width: 12, height: 12, borderRadius: '50%', flexShrink: 0, background: s.color || 'var(--coral, #ff7a6b)', boxShadow: `0 0 0 4px color-mix(in srgb, ${s.color || '#ff7a6b'} 18%, #fff)` }} />
              <div style={{ flex: 1, minWidth: 200 }}>
                <div style={{ fontWeight: 700, fontSize: 15.5, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>{s.name} {!s.active && <span style={{ height: 22, display: 'inline-flex', alignItems: 'center', fontSize: 12, fontWeight: 600, color: '#52525b', background: '#f4f4f5', borderRadius: 999, padding: '0 8px' }}>Hidden</span>}</div>
                <div style={{ fontSize: 13, color: '#71717a', marginTop: 4, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <span>{dur(s.duration_mins)}</span>
                  <span>· {s.price_cents ? money(s.price_cents, s.currency) : 'Free'}</span>
                  {s.payment_mode === 'deposit' && <span>· {money(s.deposit_cents, s.currency)} deposit online</span>}
                  {s.payment_mode === 'full' && <span>· paid online</span>}
                  {s.capacity > 1 && <span>· group of {s.capacity}</span>}
                  <span>· {s.staff_ids?.length ? s.staff_ids.map((id: string) => staff.find(x => x.id === id)?.name).filter(Boolean).join(', ') : 'Anyone'}</span>
                </div>
                {needsStripe && <div style={{ fontSize: 12, color: '#b45309', marginTop: 5, display: 'flex', gap: 5, alignItems: 'center' }}><WarnIcon size={13} /> Hidden from the booking page until Stripe is connected (Integrations → Stripe).</div>}
                {s.active && issueOf(s) && (
                  <div style={{ fontSize: 12, color: '#b45309', marginTop: 6, display: 'flex', gap: 6, alignItems: 'flex-start', lineHeight: 1.45 }}>
                    <WarnIcon size={13} style={{ marginTop: 1 }} />
                    <span><b>No bookable times.</b> {issueOf(s)}{' '}
                      {onGoAvailability && /Availability|hours/.test(issueOf(s) || '') && <button onClick={onGoAvailability} style={{ border: 'none', background: 'none', padding: 0, color: '#b45309', fontWeight: 700, textDecoration: 'underline', cursor: 'pointer', font: 'inherit' }}>Open Availability</button>}
                    </span>
                  </div>
                )}
              </div>
              {url && s.active && <button onClick={() => copy(url)} className="cv-btn bk-sm"><LinkIcon size={14} /> Copy link</button>}
              <button onClick={() => setEditing({ ...s })} className="cv-btn bk-sm">Edit</button>
            </div>
          )
        })}
      </div>
      {editing && <ServiceEditor companyId={companyId} initial={editing} staff={staff} locations={locations} stripeReady={stripeReady} issueOf={issueOf}
        onClose={() => setEditing(null)} onSaved={(m) => { setEditing(null); flash(m); reload() }} />}
    </div>
  )
}

function ServiceEditor({ companyId, initial, staff, locations, stripeReady, onClose, onSaved, issueOf }: {
  companyId: string; initial: any; staff: { id: string; name: string }[]; locations: { id: string; label: string; is_primary: boolean }[]
  stripeReady: boolean; onClose: () => void; onSaved: (msg: string) => void; issueOf?: (svc: any) => string | null
}) {
  const [s, setS] = useState<any>({ ...initial, price: initial.price_cents ? String(initial.price_cents / 100) : '', deposit: initial.deposit_cents ? String(initial.deposit_cents / 100) : '' })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const set = (patch: any) => setS((x: any) => ({ ...x, ...patch }))
  const toggleIn = (key: 'staff_ids' | 'location_ids', id: string) => set({ [key]: (s[key] || []).includes(id) ? s[key].filter((x: string) => x !== id) : [...(s[key] || []), id] })

  const save = async () => {
    setSaving(true); setError('')
    try {
      const payload = { ...s, price_cents: Math.round(parseFloat(s.price || '0') * 100) || 0, deposit_cents: Math.round(parseFloat(s.deposit || '0') * 100) || 0 }
      delete payload.price; delete payload.deposit
      await api('/api/bookings/services', { method: 'POST', json: { companyId, service: payload } })
      onSaved(initial.id ? 'Service saved' : 'Service added')
    } catch (e: any) { setError(e.message) } finally { setSaving(false) }
  }
  const remove = async () => {
    if (!await confirmDialog(`Delete “${initial.name}”? If it has bookings it’s hidden instead.`)) return
    try { const d = await api(`/api/bookings/services?companyId=${companyId}&id=${initial.id}`, { method: 'DELETE' }); onSaved(d.archived ? 'Service hidden (it has bookings)' : 'Service deleted') }
    catch (e: any) { setError(e.message) }
  }

  const q = s.questions || []
  const setQ = (i: number, patch: any) => set({ questions: q.map((x: any, j: number) => j === i ? { ...x, ...patch } : x) })

  return (
    <Modal title={initial.id ? 'Edit service' : 'New service'} onClose={onClose} width={640}
      footer={<>
        {initial.id && <button onClick={remove} className="cv-btn bk-del" style={{ marginRight: 'auto' }}>Delete</button>}
        <button onClick={onClose} className="cv-btn">Cancel</button>
        <button onClick={save} disabled={saving} className="cv-btn cv-btn-primary">{saving ? 'Saving…' : 'Save'}</button>
      </>}>
      <div style={{ display: 'grid', gap: 16 }}>
        <div style={grid2}>
          <div style={{ gridColumn: '1 / -1' }}>
            <span style={label}>Name</span>
            <input value={s.name} onChange={e => set({ name: e.target.value })} placeholder="e.g. Aquarium consultation" style={input} autoFocus />
          </div>
          <div style={{ gridColumn: '1 / -1' }}>
            <span style={label}>Description</span>
            <textarea value={s.description || ''} onChange={e => set({ description: e.target.value })} rows={2} placeholder="What’s included, what to bring…" style={input} />
          </div>
          <div>
            <span style={label}>Type</span>
            <select value={s.kind} onChange={e => set({ kind: e.target.value })} style={input}>
              <option value="appointment">Appointment (one-on-one)</option>
              <option value="booking">Booking / class (can be a group)</option>
            </select>
          </div>
          <div>
            <span style={label}>Colour</span>
            <div style={{ display: 'flex', gap: 6, paddingTop: 3 }}>
              {COLORS.map(c => <button key={c} type="button" aria-label={`Colour ${c}`} aria-pressed={s.color === c} onClick={() => set({ color: c })} style={{ width: 28, height: 28, padding: 0, borderRadius: '50%', background: c, border: '3px solid #fff', boxShadow: s.color === c ? `0 0 0 2px ${c}` : '0 0 0 1px #e4e4e7', cursor: 'pointer' }} />)}
            </div>
          </div>
        </div>

        <Group title="Time">
          <div style={grid3}>
            <div>
              <span style={label}>Duration</span>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <select aria-label="Hours" className="bk-tight" value={Math.floor((s.duration_mins || 0) / 60)} onChange={e => set({ duration_mins: Math.max(5, Number(e.target.value) * 60 + ((s.duration_mins || 0) % 60)) })} style={{ ...input, flex: 1 }}>
                  {Array.from({ length: 25 }, (_, h) => <option key={h} value={h}>{h} hr</option>)}
                </select>
                <select aria-label="Minutes" className="bk-tight" value={(s.duration_mins || 0) % 60 - ((s.duration_mins || 0) % 5)} onChange={e => set({ duration_mins: Math.max(5, Math.floor((s.duration_mins || 0) / 60) * 60 + Number(e.target.value)) })} style={{ ...input, flex: 1 }}>
                  {Array.from({ length: 12 }, (_, i) => i * 5).map(m => <option key={m} value={m}>{m} min</option>)}
                </select>
              </div>
            </div>
            <NumField label="Buffer before" value={s.buffer_before} onChange={v => set({ buffer_before: v })} />
            <NumField label="Buffer after" value={s.buffer_after} onChange={v => set({ buffer_after: v })} />
            <div>
              <span style={label}>Start times every</span>
              <select value={s.slot_interval || ''} onChange={e => set({ slot_interval: e.target.value ? Number(e.target.value) : null })} style={input}>
                <option value="">15 min</option>
                {[5, 10, 20, 30, 45, 60, 90, 120].map(n => <option key={n} value={n}>{dur(n)}</option>)}
              </select>
            </div>
            <div>
              <span style={label}>Minimum notice</span>
              <select value={s.min_notice_mins} onChange={e => set({ min_notice_mins: Number(e.target.value) })} style={input}>
                {[[0, 'None'], [30, '30 min'], [60, '1 hour'], [120, '2 hours'], [240, '4 hours'], [720, '12 hours'], [1440, '1 day'], [2880, '2 days'], [10080, '1 week']].map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </div>
            <NumField label="Book up to (days ahead)" value={s.max_days_ahead} onChange={v => set({ max_days_ahead: v })} min={1} />
          </div>
          <div style={hint}>Buffers keep time free around each booking (travel, clean-up) without showing it to the customer.</div>
          {issueOf?.(s) && (
            <div style={{ marginTop: 8, padding: '8px 10px', borderRadius: 9, background: '#fffbeb', border: '1px solid #fde68a', color: '#92400e', fontSize: 12.5, display: 'flex', gap: 7, alignItems: 'flex-start', lineHeight: 1.45 }}>
              <WarnIcon size={14} style={{ marginTop: 1 }} /><span><b>Customers won’t see any times:</b> {issueOf(s)}</span>
            </div>
          )}
          {s.kind === 'booking' && (
            <div style={{ marginTop: 10, maxWidth: 200 }}>
              <NumField label="Spots per time (group size)" value={s.capacity} onChange={v => set({ capacity: v })} min={1} />
            </div>
          )}
        </Group>

        <Group title="Price & payment">
          <div style={grid3}>
            <div>
              <span style={label}>Price ($)</span>
              <input value={s.price} onChange={e => set({ price: e.target.value.replace(/[^\d.]/g, '') })} placeholder="0 = free" inputMode="decimal" style={input} />
            </div>
            <div>
              <span style={label}>Take online</span>
              <select value={s.payment_mode} onChange={e => set({ payment_mode: e.target.value })} style={input}>
                <option value="none">Nothing — pay on the day</option>
                <option value="deposit">A deposit</option>
                <option value="full">Full payment</option>
              </select>
            </div>
            {s.payment_mode === 'deposit' && (
              <div>
                <span style={label}>Deposit ($)</span>
                <input value={s.deposit} onChange={e => set({ deposit: e.target.value.replace(/[^\d.]/g, '') })} inputMode="decimal" style={input} />
              </div>
            )}
          </div>
          {s.payment_mode !== 'none' && !stripeReady && <div style={{ ...hint, color: '#b45309', display: 'flex', gap: 5 }}><WarnIcon size={13} style={{ marginTop: 1 }} /> Connect Stripe (Integrations → Stripe) to take payments. Until then this service is hidden from the booking page.</div>}
          {s.payment_mode !== 'none' && stripeReady && <div style={hint}>Paid by card on Stripe Checkout when booking; the time is held for 30 minutes while they pay.</div>}
        </Group>

        <Group title="Where">
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
            {[['outlet', 'In store'], ['customer', 'At customer’s address'], ['phone', 'Phone call'], ['video', 'Video call']].map(([v, l]) => (
              <button key={v} type="button" onClick={() => set({ location_mode: v })} style={pill(s.location_mode === v)}>{l}</button>
            ))}
          </div>
          {s.location_mode === 'outlet' && locations.length > 0 && (
            <>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {locations.map(l => <button key={l.id} type="button" onClick={() => toggleIn('location_ids', l.id)} style={pill((s.location_ids || []).includes(l.id))}>{l.label}</button>)}
              </div>
              <div style={hint}>{(s.location_ids || []).length > 1 ? 'Customers pick one of these.' : (s.location_ids || []).length ? 'Booked at this location.' : 'None picked → your primary location.'}</div>
            </>
          )}
          {s.location_mode === 'video' && (
            <input value={s.video_url || ''} onChange={e => set({ video_url: e.target.value })} placeholder="Meeting link (Zoom, Google Meet…) — shown after booking" style={input} />
          )}
          {s.location_mode === 'customer' && <div style={hint}>The customer enters their address when booking.</div>}
        </Group>

        <Group title="Who">
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <button type="button" onClick={() => set({ staff_ids: [] })} style={pill(!(s.staff_ids || []).length)}>Anyone who takes bookings</button>
            {staff.map(m => <button key={m.id} type="button" onClick={() => toggleIn('staff_ids', m.id)} style={pill((s.staff_ids || []).includes(m.id))}>{m.name}</button>)}
          </div>
          <div style={hint}>Only people switched on under Availability → “Who takes bookings” get bookings.</div>
        </Group>

        <Group title="Questions for the customer">
          <div style={{ display: 'grid', gap: 8 }}>
            {q.map((x: any, i: number) => (
              <div key={i} style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                <input value={x.label} onChange={e => setQ(i, { label: e.target.value })} placeholder="e.g. Tank size (litres)" style={{ ...input, flex: 1, minWidth: 180 }} />
                <select value={x.type} onChange={e => setQ(i, { type: e.target.value })} style={{ ...input, width: 120 }}>
                  <option value="text">Short text</option><option value="textarea">Long text</option><option value="select">Dropdown</option><option value="checkbox">Tick box</option>
                </select>
                <label style={{ fontSize: 12.5, display: 'flex', gap: 4, alignItems: 'center' }}><input type="checkbox" checked={!!x.required} onChange={e => setQ(i, { required: e.target.checked })} /> Required</label>
                <button type="button" onClick={() => set({ questions: q.filter((_: any, j: number) => j !== i) })} className="cv-btn cv-btn-icon bk-sm" aria-label="Remove question"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12" /></svg></button>
                {x.type === 'select' && <input value={(x.options || []).join(', ')} onChange={e => setQ(i, { options: e.target.value.split(',').map((o: string) => o.trim()) })} placeholder="Options, comma separated" style={{ ...input, flexBasis: '100%' }} />}
              </div>
            ))}
            <button type="button" onClick={() => set({ questions: [...q, { id: `q${Date.now().toString(36)}`, label: '', type: 'text', options: [], required: false }] })} className="cv-btn bk-sm" style={{ justifySelf: 'start' }}><PlusIcon size={14} /> Add question</button>
          </div>
          <div style={hint}>Name, mobile and email are always asked.</div>
        </Group>

        <Group title="After the visit">
          <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' }}>
            <div style={{ minWidth: 220 }}>
              <span style={label}>Rebook reminder</span>
              <select value={REBOOK.includes(s.rebook_days || 0) ? String(s.rebook_days || 0) : 'custom'} onChange={e => set({ rebook_days: e.target.value === 'custom' ? (s.rebook_days || 21) : (Number(e.target.value) || null) })} style={input}>
                <option value="0">Off</option>
                <option value="14">After 2 weeks</option>
                <option value="28">After 4 weeks</option>
                <option value="42">After 6 weeks</option>
                <option value="90">After 3 months</option>
                <option value="180">After 6 months</option>
                <option value="365">After a year</option>
                <option value="custom">Custom…</option>
              </select>
            </div>
            {s.rebook_days && !REBOOK.includes(s.rebook_days) && (
              <div style={{ width: 130 }}><NumField label="Days" value={s.rebook_days} onChange={v => set({ rebook_days: v || null })} min={1} /></div>
            )}
          </div>
          <div style={hint}>Texts “Time for your next {s.name || 'visit'}?” with a booking link — only if they haven’t booked again and haven’t opted out. Good for regular services like tank cleans.</div>
        </Group>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '12px 14px', borderRadius: 14, background: '#fafafa' }}>
          <span><span style={{ display: 'block', fontSize: 14, fontWeight: 600 }}>Show on the booking page</span><span style={{ display: 'block', fontSize: 12.5, color: '#8e8e93', marginTop: 2 }}>Turn it off to hide it without deleting it.</span></span>
          <Toggle on={s.active !== false} onChange={v => set({ active: v })} label="Show on the booking page" />
        </div>
        {error && <div style={{ padding: '10px 14px', borderRadius: 12, background: '#fef2f2', color: '#b91c1c', fontSize: 13.5 }}>{error}</div>}
      </div>
    </Modal>
  )
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return <div style={{ borderTop: '1px solid #f0f0f2', paddingTop: 16 }}><div style={{ fontWeight: 800, fontSize: 16, letterSpacing: '-.01em', color: 'var(--ink, #111)', marginBottom: 12 }}>{title}</div>{children}</div>
}
function NumField({ label: l, value, onChange, min = 0 }: { label: string; value: number; onChange: (v: number) => void; min?: number }) {
  return <div><span style={label}>{l}</span><input type="number" min={min} value={value ?? 0} onChange={e => onChange(Math.max(min, Number(e.target.value) || 0))} style={input} /></div>
}
const pill = (on: boolean): React.CSSProperties => ({ height: 34, padding: '0 13px', borderRadius: 999, border: 'none', background: on ? '#18181b' : '#f4f4f5', color: on ? '#fff' : '#52525b', fontWeight: 600, fontSize: 13.5, cursor: 'pointer', fontFamily: 'inherit', transition: 'background-color .15s, color .15s' })
const grid2: React.CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }
const grid3: React.CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10 }
