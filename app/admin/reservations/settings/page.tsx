'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { AdminPage, Panel, Toggle } from '@/components/ui/AdminKit'
import { confirmDialog } from '@/components/ConfirmDialog'
import WeekHoursEditor from '@/components/booking/admin/WeekHoursEditor'
import { api, useResCompany, useToast, Toast, SetupNote, Icon, JB_CSS, RS_CSS, SEATING } from '@/components/restaurant/shared'

// Reservation settings: the switch, the booking page (link and embed code),
// seating hours and closed days, how many guests the room takes at once and
// per arrival slot, dining time by party size, the online booking rules, and
// the page's words. Owners and admins change these.

const INTERVALS = [10, 15, 20, 30, 45, 60]
const NOTICE = [[0, 'No notice'], [30, '30 minutes'], [60, '1 hour'], [120, '2 hours'], [240, '4 hours'], [1440, 'A day'], [2880, 'Two days']] as const
const AHEAD = [[14, '2 weeks'], [30, 'A month'], [60, '2 months'], [90, '3 months'], [180, '6 months'], [365, 'A year']] as const

const AUTO_NO_SHOW = [[0, 'Off'], [15, '15 minutes'], [20, '20 minutes'], [30, '30 minutes'], [45, '45 minutes'], [60, 'An hour']] as const
const DAYS: [string, string][] = [['mon', 'Mon'], ['tue', 'Tue'], ['wed', 'Wed'], ['thu', 'Thu'], ['fri', 'Fri'], ['sat', 'Sat'], ['sun', 'Sun']]
const dollars = (cents: number) => (cents / 100).toFixed(cents % 100 ? 2 : 0)

const num = (v: any, d = 0) => { const n = Math.round(Number(String(v).replace(/[^0-9.]/g, ''))); return Number.isFinite(n) ? n : d }

export default function ReservationSettingsPage() {
  const { companyId, ready } = useResCompany()
  const [d, setD] = useState<any>(null)
  const [s, setS] = useState<any>(null)
  const [saved, setSaved] = useState('')
  const [setup, setSetup] = useState('')
  const [err, setErr] = useState('')
  const [saving, setSaving] = useState(false)
  const [embed, setEmbed] = useState(false)
  const [closedDay, setClosedDay] = useState({ date: '', label: '' })
  const [toast, setToast] = useToast()

  const load = useCallback(async () => {
    if (!companyId) return
    try {
      const r = await api(`/api/restaurant/settings?companyId=${companyId}`)
      setD(r); setS(r.settings); setSaved(JSON.stringify(r.settings)); setErr('')
    } catch (e: any) { if (/COLVY_V429/.test(e.message)) setSetup(e.message); else setErr(e.message) }
  }, [companyId])
  useEffect(() => { if (ready) load() }, [ready, load])

  const canManage = !!d?.canManage
  const dirty = s && JSON.stringify(s) !== saved
  const set = (patch: any) => setS((x: any) => ({ ...x, ...patch }))

  const save = async () => {
    setSaving(true)
    try {
      const r = await api('/api/restaurant/settings', { method: 'PATCH', json: { companyId, settings: s } })
      setS(r.settings); setSaved(JSON.stringify(r.settings)); setToast('Saved')
    } catch (e: any) { setToast(e.message) } finally { setSaving(false) }
  }
  const setModule = async (on: boolean) => {
    if (!on && !(await confirmDialog({ title: 'Turn off table reservations?', message: 'Your booking page stops taking tables and Reservations leaves the menu. Bookings already made stay, and guests can still change or cancel them.', confirmLabel: 'Turn off', tone: 'danger' }))) return
    try {
      const r = await api('/api/restaurant/settings', { method: 'PATCH', json: { companyId, module: on } })
      setD((x: any) => ({ ...x, enabled: r.enabled, modules: r.modules }))
      try { window.dispatchEvent(new CustomEvent('colvy:modules-changed', { detail: { modules: r.modules } })) } catch {}
      setToast(on ? 'Table reservations are on' : 'Table reservations are off')
    } catch (e: any) { setToast(e.message) }
  }
  const copy = (text: string, msg: string) => navigator.clipboard?.writeText(text).then(() => setToast(msg)).catch(() => {})

  const durations: { upTo: number; mins: number }[] = s?.durations || []
  const setDur = (i: number, patch: any) => set({ durations: durations.map((x, k) => (k === i ? { ...x, ...patch } : x)) })
  const embedCode = d?.pageUrl ? `<iframe id="colvy-reserve" src="${d.pageUrl}?embed=1" title="Book a table" style="width:100%;min-height:680px;border:0;display:block" loading="lazy"></iframe>
<script>
  window.addEventListener('message', function (e) {
    var f = document.getElementById('colvy-reserve');
    if (f && e.data && e.data.type === 'colvy-booking-height' && e.source === f.contentWindow) f.style.height = e.data.height + 'px';
  });
</script>` : ''

  return (
    <AdminPage title="Reservation Settings" back={{ href: '/admin/reservations', label: 'Reservations' }} width="md"
      sub="Your booking page, seating hours, covers and the rules for booking online."
      actions={canManage && dirty ? <button type="button" className="ak-btn go" onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save changes'}</button> : null}>
      <style>{JB_CSS + RS_CSS + PAGE_CSS}</style>
      {setup && <SetupNote text={setup} />}
      {err && <div className="ak-note bad">{err}</div>}
      {d && !canManage && <div className="ak-note info"><span>Only owners and admins can change these settings.</span></div>}

      {d && s && <>
        <Panel className="rss-mod" title="Table reservations" sub={d.modules?.restaurant === undefined && d.enabled ? `On by default for ${d.industry || 'your type of business'}.` : 'Takes bookings on your page and shows Reservations in the menu.'}
          right={<Toggle on={!!d.enabled} onChange={setModule} label="Table reservations" disabled={!canManage} />} />

        <Panel title="Your booking page" sub="Share it anywhere: Instagram, Google, your website, a QR code on the table.">
          <div className="rss-link">
            <code>{d.pageUrl}</code>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              <button type="button" className="ak-btn sm" onClick={() => copy(d.pageUrl, 'Link copied')}>{Icon.link}Copy link</button>
              <a className="ak-btn sm" href={d.pageUrl} target="_blank" rel="noopener noreferrer">{Icon.ext}Open</a>
              <button type="button" className="ak-btn sm" onClick={() => setEmbed(v => !v)} aria-expanded={embed}>{embed ? 'Hide' : 'Add to your website'}</button>
            </div>
          </div>
          {embed && (
            <div className="rss-embed">
              <pre>{embedCode}</pre>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
                <span className="ak-hint" style={{ margin: 0 }}>Paste it where the booking form should appear (WordPress: a “Custom HTML” block). It grows to fit.</span>
                <button type="button" className="ak-btn sm go" onClick={() => copy(embedCode, 'Code copied — paste it into your website')}>Copy code</button>
              </div>
            </div>
          )}
        </Panel>

        <Panel title="Seating hours" sub="The first and last time a table can be booked, for each service. “Dinner 5:30–9:00pm” means the last booking is at 9.">
          <fieldset disabled={!canManage} className="rss-fs"><WeekHoursEditor value={s.hours} onChange={v => set({ hours: v })} /></fieldset>
          <div className="js-row" style={{ marginTop: 6 }}>
            <div><b>Times every</b><span>How far apart the booking times are.</span></div>
            <select className="ak-select rss-sel" value={s.interval_mins} onChange={e => set({ interval_mins: Number(e.target.value) })} disabled={!canManage} aria-label="Times every">
              {INTERVALS.map(n => <option key={n} value={n}>{n} minutes</option>)}
            </select>
          </div>
        </Panel>

        <Panel title="Closed days" sub="Public holidays, private events, a week off. Guests can’t book online on these days.">
          {s.closed.length > 0 && (
            <ul className="rss-closed">
              {[...s.closed].sort((a: any, b: any) => a.date.localeCompare(b.date)).map((c: any) => (
                <li key={c.date}>
                  <span><b>{new Date(`${c.date}T12:00:00Z`).toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })}</b>{c.label && <> · {c.label}</>}</span>
                  {canManage && <button type="button" className="ak-icon-btn" aria-label={`Remove ${c.date}`} onClick={() => set({ closed: s.closed.filter((x: any) => x.date !== c.date) })}>{Icon.x}</button>}
                </li>
              ))}
            </ul>
          )}
          {canManage && (
            <div className="rss-add">
              <input type="date" className="ak-field" value={closedDay.date} onChange={e => setClosedDay({ ...closedDay, date: e.target.value })} aria-label="Closed day" />
              <input className="ak-field" value={closedDay.label} onChange={e => setClosedDay({ ...closedDay, label: e.target.value })} placeholder="Why (optional), e.g. Christmas Day" maxLength={80} aria-label="Reason" />
              <button type="button" className="ak-btn" disabled={!closedDay.date} onClick={() => { if (!s.closed.some((x: any) => x.date === closedDay.date)) set({ closed: [...s.closed, closedDay] }); setClosedDay({ date: '', label: '' }) }}>{Icon.plus}Add</button>
            </div>
          )}
        </Panel>

        <Panel title="Covers" sub="How many guests you can look after. Online booking stops offering a time once it’s full; your team can still book over the top.">
          <div className="js-row">
            <div><b>Guests seated at once</b><span>The most diners in at any one time. 0 for no limit.</span></div>
            <input className="ak-field rss-n" value={s.max_covers} onChange={e => set({ max_covers: num(e.target.value) })} inputMode="numeric" disabled={!canManage} aria-label="Guests seated at once" />
          </div>
          <div className="js-row">
            <div><b>Guests arriving together</b><span>The most new guests in one {s.interval_mins}-minute slot, so the kitchen isn’t slammed. 0 for no limit.</span></div>
            <input className="ak-field rss-n" value={s.pace_covers} onChange={e => set({ pace_covers: num(e.target.value) })} inputMode="numeric" disabled={!canManage} aria-label="Guests arriving together" />
          </div>
        </Panel>

        <Panel title="Tables" sub="Seat guests at real tables: Colvy gives each booking the smallest free table that fits (or tables pushed together), and online booking only offers times with a table.">
          <div className="js-row">
            <div><b>Seat by table</b><span>{d.tables === null ? 'Needs one database update first (see the floor plan).' : d.tables ? `${d.tables} ${d.tables === 1 ? 'table' : 'tables'} on your floor plan. Covers still apply too.` : 'Add your tables on the floor plan first.'}</span></div>
            <Toggle on={!!s.use_tables} onChange={v => set({ use_tables: v })} label="Seat by table" disabled={!canManage} />
          </div>
          <div className="js-row">
            <div><b>Floor plan</b><span>Your tables, where they sit, which can be pushed together, and the room live.</span></div>
            <Link className="ak-btn sm" href="/admin/reservations/floor?edit=1">{d.tables ? 'Edit floor plan' : 'Set up tables'}</Link>
          </div>
        </Panel>

        <Panel title="Dining time" sub="How long a table is kept, by party size. Bigger groups usually stay longer.">
          <div className="rss-durs">
            {durations.map((x, i) => (
              <div key={i} className="rss-dur">
                <span>Up to</span>
                <input className="ak-field rss-n" value={x.upTo} onChange={e => setDur(i, { upTo: num(e.target.value, 1) })} inputMode="numeric" disabled={!canManage} aria-label="Party size up to" />
                <span>guests</span>
                <input className="ak-field rss-n" value={x.mins} onChange={e => setDur(i, { mins: num(e.target.value, 90) })} inputMode="numeric" disabled={!canManage} aria-label="Minutes" />
                <span>min</span>
                {canManage && <button type="button" className="ak-icon-btn" aria-label="Remove" onClick={() => set({ durations: durations.filter((_, k) => k !== i) })}>{Icon.x}</button>}
              </div>
            ))}
            <div className="rss-dur">
              <span>{durations.length ? 'Bigger groups' : 'Every table'}</span>
              <input className="ak-field rss-n" value={s.duration_mins} onChange={e => set({ duration_mins: num(e.target.value, 90) })} inputMode="numeric" disabled={!canManage} aria-label="Minutes for bigger groups" />
              <span>min</span>
            </div>
            {canManage && durations.length < 12 && <button type="button" className="ak-btn sm" style={{ alignSelf: 'flex-start' }} onClick={() => set({ durations: [...durations, { upTo: (durations[durations.length - 1]?.upTo || 0) + 2, mins: s.duration_mins }] })}>{Icon.plus}Add a size</button>}
          </div>
        </Panel>

        <Panel title="Booking online" sub="What guests can do on your page.">
          <div className="js-row">
            <div><b>Party sizes online</b><span>Larger groups see your note below instead.</span></div>
            <div className="rss-range">
              <input className="ak-field rss-n" value={s.party_min} onChange={e => set({ party_min: num(e.target.value, 1) })} inputMode="numeric" disabled={!canManage} aria-label="Smallest party" />
              <span>to</span>
              <input className="ak-field rss-n" value={s.party_max} onChange={e => set({ party_max: num(e.target.value, 8) })} inputMode="numeric" disabled={!canManage} aria-label="Largest party" />
            </div>
          </div>
          <div className="js-row">
            <div><b>Book at least</b><span>How soon before the time a guest can book online.</span></div>
            <select className="ak-select rss-sel" value={s.min_notice_mins} onChange={e => set({ min_notice_mins: Number(e.target.value) })} disabled={!canManage} aria-label="Book at least">
              {NOTICE.map(([v, l]) => <option key={v} value={v}>{l}{v ? ' ahead' : ''}</option>)}
              {!NOTICE.some(([v]) => v === s.min_notice_mins) && <option value={s.min_notice_mins}>{s.min_notice_mins} minutes ahead</option>}
            </select>
          </div>
          <div className="js-row">
            <div><b>Book up to</b><span>How far ahead guests can book.</span></div>
            <select className="ak-select rss-sel" value={s.max_days_ahead} onChange={e => set({ max_days_ahead: Number(e.target.value) })} disabled={!canManage} aria-label="Book up to">
              {AHEAD.map(([v, l]) => <option key={v} value={v}>{l} ahead</option>)}
              {!AHEAD.some(([v]) => v === s.max_days_ahead) && <option value={s.max_days_ahead}>{s.max_days_ahead} days ahead</option>}
            </select>
          </div>
          <div className="js-row">
            <div><b>Guests can change or cancel online</b><span>From the link in their confirmation.</span></div>
            <Toggle on={s.allow_changes} onChange={v => set({ allow_changes: v })} label="Guests can change or cancel online" disabled={!canManage} />
          </div>
          {s.allow_changes && (
            <div className="js-row">
              <div><b>Up to</b><span>Hours before the booking. After that, guests call you.</span></div>
              <div className="rss-range"><input className="ak-field rss-n" value={s.cancel_hours} onChange={e => set({ cancel_hours: num(e.target.value) })} inputMode="numeric" disabled={!canManage} aria-label="Hours before" /><span>hours before</span></div>
            </div>
          )}
          <div className="js-row">
            <div><b>Mobile number required</b><span>For the confirmation and reminder texts.</span></div>
            <Toggle on={s.require_phone} onChange={v => set({ require_phone: v })} label="Mobile number required" disabled={!canManage} />
          </div>
          <div className="js-row">
            <div><b>Email required</b></div>
            <Toggle on={s.require_email} onChange={v => set({ require_email: v })} label="Email required" disabled={!canManage} />
          </div>
          <div className="js-row">
            <div><b>Seating choices</b><span>Let guests ask for a spot. It’s a request, not a promise.</span></div>
            <div className="rs-chips">
              {Object.keys(SEATING).map(o => {
                const on = s.seating.includes(o)
                return <button key={o} type="button" className={`rs-chip${on ? ' on' : ''}`} disabled={!canManage} aria-pressed={on} onClick={() => set({ seating: on ? s.seating.filter((x: string) => x !== o) : [...s.seating, o] })}>{SEATING[o]}</button>
              })}
            </div>
          </div>
        </Panel>

        <Panel title="Deposits" sub="Ask for a deposit when guests book online, paid by card on your Stripe account. The table is held for 30 minutes while they pay.">
          {!d.stripeReady && <div className="ak-note warn" style={{ marginBottom: 10 }}><span>Connect Stripe (Settings, Payments) to take deposits. Until then bookings go through without one.</span></div>}
          <div className="js-row">
            <div><b>Deposit</b><span>{s.deposit.mode === 'off' ? 'No deposit for online bookings.' : s.deposit.mode === 'per_person' ? 'An amount for each guest.' : 'One amount for the booking.'}</span></div>
            <select className="ak-select rss-sel" value={s.deposit.mode} onChange={e => set({ deposit: { ...s.deposit, mode: e.target.value } })} disabled={!canManage} aria-label="Deposit">
              <option value="off">Off</option><option value="per_person">Per guest</option><option value="per_booking">Per booking</option>
            </select>
          </div>
          {(s.deposit.mode !== 'off' || s.no_show.deposit_after > 0) && (
            <div className="js-row">
              <div><b>Amount</b><span>{s.deposit.mode === 'per_booking' ? 'For the whole table.' : 'For each guest.'}</span></div>
              <div className="rss-range"><span>$</span><input className="ak-field rss-n" value={dollars(s.deposit.cents)} onChange={e => set({ deposit: { ...s.deposit, cents: Math.round(Number(e.target.value.replace(/[^0-9.]/g, '')) * 100) || 0 } })} inputMode="decimal" disabled={!canManage} aria-label="Deposit amount" /></div>
            </div>
          )}
          {s.deposit.mode !== 'off' && <>
            <div className="js-row">
              <div><b>For parties of</b><span>Smaller tables book without one.</span></div>
              <div className="rss-range"><input className="ak-field rss-n" value={s.deposit.min_party} onChange={e => set({ deposit: { ...s.deposit, min_party: num(e.target.value, 1) } })} inputMode="numeric" disabled={!canManage} aria-label="Smallest party with a deposit" /><span>or more</span></div>
            </div>
            <div className="js-row">
              <div><b>On</b><span>{s.deposit.days.length ? 'Only on these days.' : 'Every day.'}</span></div>
              <div className="rs-chips">
                {DAYS.map(([k, l]) => {
                  const on = s.deposit.days.includes(k)
                  return <button key={k} type="button" className={`rs-chip${on ? ' on' : ''}`} disabled={!canManage} aria-pressed={on} onClick={() => set({ deposit: { ...s.deposit, days: on ? s.deposit.days.filter((x: string) => x !== k) : [...s.deposit.days, k] } })}>{l}</button>
                })}
              </div>
            </div>
          </>}
          <p className="ak-hint" style={{ margin: '6px 0 0' }}>{s.allow_changes ? `Guests who cancel at least ${s.cancel_hours} hours ahead get the deposit back automatically; after that it’s kept.` : 'Guests can’t cancel online, so you decide on refunds when they call.'} A no-show keeps it. You can refund any deposit when you cancel a booking.</p>
        </Panel>

        <Panel title="No-shows" sub="For tables nobody turns up for.">
          <div className="js-row">
            <div><b>Mark as a no-show after</b><span>If a table isn’t seated this long after its time, Colvy marks it and frees the table. You can undo it on the day.</span></div>
            <select className="ak-select rss-sel" value={s.no_show.auto_mins} onChange={e => set({ no_show: { ...s.no_show, auto_mins: Number(e.target.value) } })} disabled={!canManage} aria-label="Mark as a no-show after">
              {AUTO_NO_SHOW.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              {!AUTO_NO_SHOW.some(([v]) => v === s.no_show.auto_mins) && <option value={s.no_show.auto_mins}>{s.no_show.auto_mins} minutes</option>}
            </select>
          </div>
          <div className="js-row">
            <div><b>Ask for a deposit after</b><span>Guests with this many no-shows pay a deposit to book online{s.deposit.mode === 'off' ? ` (${s.deposit.cents ? `$${dollars(s.deposit.cents)} a guest` : 'set the amount above'})` : ''}, even when deposits are otherwise off.</span></div>
            <select className="ak-select rss-sel" value={s.no_show.deposit_after} onChange={e => set({ no_show: { ...s.no_show, deposit_after: Number(e.target.value) } })} disabled={!canManage} aria-label="Ask for a deposit after">
              <option value={0}>Never</option>{[1, 2, 3, 4, 5].map(n => <option key={n} value={n}>{n} no-show{n === 1 ? '' : 's'}</option>)}
            </select>
          </div>
          <div className="js-row">
            <div><b>Stop online booking after</b><span>Guests with this many no-shows are asked to call you instead. Matched by mobile or email.</span></div>
            <select className="ak-select rss-sel" value={s.no_show.block_after} onChange={e => set({ no_show: { ...s.no_show, block_after: Number(e.target.value) } })} disabled={!canManage} aria-label="Stop online booking after">
              <option value={0}>Never</option>{[2, 3, 4, 5].map(n => <option key={n} value={n}>{n} no-shows</option>)}
            </select>
          </div>
        </Panel>

        <Panel title="Your page’s words">
          <div className="rss-text">
            <div><label className="ak-label" htmlFor="rss-title">Heading</label><input id="rss-title" className="ak-field" value={s.page_title} onChange={e => set({ page_title: e.target.value })} maxLength={120} placeholder={`Book a table at ${d.name || 'your restaurant'}`} disabled={!canManage} /></div>
            <div><label className="ak-label" htmlFor="rss-intro">Welcome note</label><textarea id="rss-intro" className="ak-field" value={s.intro} onChange={e => set({ intro: e.target.value })} maxLength={1000} placeholder="Walk-ins welcome at the bar. We hold tables for 15 minutes." disabled={!canManage} /></div>
            <div><label className="ak-label" htmlFor="rss-large">Note for larger groups</label><input id="rss-large" className="ak-field" value={s.large_party_note} onChange={e => set({ large_party_note: e.target.value })} maxLength={300} placeholder={`For groups over ${s.party_max}, please call us.`} disabled={!canManage} /></div>
            <div><label className="ak-label" htmlFor="rss-conf">In the confirmation</label><textarea id="rss-conf" className="ak-field" value={s.confirmation_note} onChange={e => set({ confirmation_note: e.target.value })} maxLength={1000} placeholder="Parking is behind the building. Let us know about any allergies." disabled={!canManage} /></div>
          </div>
        </Panel>

        {canManage && dirty && (
          <div className="rss-bar"><span>You have unsaved changes.</span><button type="button" className="ak-btn ghost" onClick={() => setS(JSON.parse(saved))}>Discard</button><button type="button" className="ak-btn go" onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save changes'}</button></div>
        )}
      </>}
      <Toast text={toast} />
    </AdminPage>
  )
}

const PAGE_CSS = `
.rss-mod .ak-panel-h{margin-bottom:0}
.js-row{display:flex;align-items:center;justify-content:space-between;gap:16px;padding:12px 0}
.js-row+.js-row{box-shadow:0 -1px 0 var(--line)}
.js-row>div:first-child{display:flex;flex-direction:column;gap:2px;min-width:0}
.js-row b{font-size:14.5px;font-weight:650}
.js-row>div:first-child span{font-size:13px;color:var(--mut)}
@media(max-width:560px){.js-row{flex-wrap:wrap}}
.rss-fs{border:none;margin:0;padding:0;min-width:0}
.rss-sel,.js-row .rss-sel{width:auto;min-width:160px;flex:0 0 auto}
.rss-n{width:76px!important;text-align:center;font-variant-numeric:tabular-nums}
.rss-range{display:flex;align-items:center;gap:8px;font-size:14px;color:var(--mut)}
.rss-link{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;padding:12px 14px;border-radius:16px;background:var(--f)}
.rss-link code{font-size:13.5px;font-weight:600;color:var(--ink);overflow-wrap:anywhere}
.rss-embed{display:flex;flex-direction:column;gap:10px;margin-top:12px}
.rss-embed pre{margin:0;padding:16px;border-radius:16px;background:#18181b;color:#e2e8f0;font-size:12px;line-height:1.55;overflow-x:auto;white-space:pre}
.rss-closed{list-style:none;margin:0 0 12px;padding:0;display:flex;flex-direction:column}
.rss-closed li{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:8px 0;font-size:14px}
.rss-closed li+li{box-shadow:0 -1px 0 var(--line)}
.rss-add{display:grid;grid-template-columns:170px minmax(0,1fr) auto;gap:8px}
@media(max-width:560px){.rss-add{grid-template-columns:minmax(0,1fr)}}
.rss-durs{display:flex;flex-direction:column;gap:8px}
.rss-dur{display:flex;align-items:center;gap:8px;flex-wrap:wrap;font-size:14px;color:var(--mut)}
.rss-dur>span:first-child{min-width:96px;color:var(--ink);font-weight:600}
.rss-text{display:flex;flex-direction:column;gap:14px}
.rss-text textarea.ak-field{min-height:80px}
.rss-bar{position:sticky;bottom:16px;z-index:5;display:flex;align-items:center;justify-content:flex-end;gap:8px;padding:10px 12px 10px 18px;border-radius:999px;background:var(--card,#fff);box-shadow:0 0 0 1px rgba(0,0,0,.06),0 12px 32px rgba(0,0,0,.14)}
.rss-bar span{margin-right:auto;font-size:14px;font-weight:600}
`
