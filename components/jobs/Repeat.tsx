'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { Panel } from '@/components/ui/AdminKit'
import DateTimeField from '@/components/ui/DateTimeField'
import { api, Dialog, fmtWhen } from '@/components/jobs/shared'
import { cleanRule, upcomingDates, ruleLabel, endLabel, REPEAT_PRESETS, type RepeatUnit, type RepeatEnds } from '@/lib/jobs/repeat'
import { fmtJobNumber } from '@/lib/jobs/status'

// "Repeats" on the job page: set a scheduled job to repeat (every week, two
// weeks, four weeks, month or three months, or a custom gap) until never /
// after N visits / a date. Colvy makes each visit as its own job a few weeks
// ahead (lib/jobs/repeat-server.ts). Shows the next visits, and lets you
// change the repeat from this visit on, or stop it.

const ymdIn = (iso: string, tz: string) => { try { return new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(new Date(iso)) } catch { return iso.slice(0, 10) } }
// "Sun 27 Dec" (no commas, so a list of them reads cleanly).
const dayLabel = (ymd: string) => { const [y, m, d] = ymd.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-AU', { timeZone: 'UTC', weekday: 'short', day: 'numeric', month: 'short' }).replace(/,/g, '') }

export const RepeatIcon = ({ size = 14 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M17 2l4 4-4 4" /><path d="M3 11v-1a4 4 0 0 1 4-4h14" /><path d="M7 22l-4-4 4-4" /><path d="M21 13v1a4 4 0 0 1-4 4H3" /></svg>
)

export function RepeatPanel({ companyId, job, tz, prefix, canEdit, toast, onChange }: {
  companyId: string; job: any; tz: string; prefix: string; canEdit: boolean; toast: (m: string) => void; onChange: () => void
}) {
  const [d, setD] = useState<any>(job.repeat_id ? undefined : null)
  const [edit, setEdit] = useState(false)
  const [stop, setStop] = useState(false)
  const [err, setErr] = useState('')
  const load = useCallback(async () => {
    if (!job.repeat_id) { setD(null); return }
    try { setD(await api(`/api/jobs/${job.id}/repeat?companyId=${companyId}`)); setErr('') }
    catch (e: any) { setErr(e.message); setD(null) }
  }, [companyId, job.id, job.repeat_id])
  useEffect(() => { load() }, [load])

  const r = d?.repeat
  const active = !!r?.active
  if (!canEdit && !active) return null
  return (
    <Panel title="Repeats" right={active && canEdit && <button type="button" className="ak-btn sm ghost" onClick={() => setEdit(true)}>Change</button>}>
      <style>{CSS}</style>
      {err && /COLVY_V435/.test(err) ? <p className="ak-hint" style={{ margin: 0 }}>{err}</p>
        : d === undefined ? <div className="rp-sk" />
        : active ? (
          <div className="rp-on">
            <div className="rp-rule"><span className="rp-ic"><RepeatIcon size={16} /></span><div><b>{r.label}</b><span>{r.endLabel || 'No end date'}{r.seq ? ` · this is visit ${r.seq}` : ''}</span></div></div>
            {(d.upcoming || []).filter((v: any) => v.id !== job.id).length > 0 && (
              <div className="rp-list">
                <span className="ak-label" style={{ marginBottom: 4 }}>Coming up</span>
                {(d.upcoming || []).filter((v: any) => v.id !== job.id).slice(0, 4).map((v: any) => (
                  <Link key={v.id} href={`/admin/jobs/${v.id}`} className="rp-visit"><span>{fmtWhen(v.scheduled_start, null, tz)}</span><small>{fmtJobNumber(v.number, prefix)} · visit {v.repeat_seq}</small></Link>
                ))}
                {r.later?.length > 0 && <p className="rp-then">Then {r.later.map((x: any) => dayLabel(x.date)).join(' · ')}{r.ends === 'never' ? '…' : ''}</p>}
              </div>
            )}
            <p className="ak-hint" style={{ margin: 0 }}>Each visit is its own job, made a few weeks ahead with the same customer, address, team, checklist and price.</p>
            {canEdit && <button type="button" className="ak-btn sm danger" style={{ alignSelf: 'flex-start' }} onClick={() => setStop(true)}>Stop repeating</button>}
          </div>
        ) : (
          <div className="rp-off">
            <p className="ak-hint" style={{ margin: 0 }}>{r && !r.active ? (r.endedReason === 'finished' ? 'The repeat has finished.' : 'The repeat was stopped.') : 'For regular work: a fortnightly clean, a monthly service.'}</p>
            <button type="button" className="ak-btn sm" onClick={() => setEdit(true)} disabled={!job.scheduled_start || job.status === 'cancelled'}><RepeatIcon />Repeat this job</button>
            {!job.scheduled_start && <p className="ak-hint" style={{ margin: 0 }}>Give it a date and time first.</p>}
          </div>
        )}
      {edit && <RepeatDialog companyId={companyId} job={job} tz={tz} current={active ? r : null} onClose={() => setEdit(false)}
        onSaved={(res: any) => { setEdit(false); setD(res); toast(`${res.repeat.label}. ${res.created ? `${res.created} visit${res.created === 1 ? '' : 's'} added.` : 'The next visits will be added a few weeks ahead.'}`); onChange() }} />}
      {stop && <StopDialog companyId={companyId} job={job} upcoming={(d?.upcoming || []).filter((v: any) => v.id !== job.id && Date.parse(v.scheduled_start) > Date.now()).length}
        onClose={() => setStop(false)} onStopped={(n: number) => { setStop(false); toast(n ? `Stopped. ${n} upcoming visit${n === 1 ? '' : 's'} called off.` : 'Stopped repeating.'); load(); onChange() }} />}
    </Panel>
  )
}

function RepeatDialog({ companyId, job, tz, current, onClose, onSaved }: { companyId: string; job: any; tz: string; current: any; onClose: () => void; onSaved: (r: any) => void }) {
  const preset0 = current ? (REPEAT_PRESETS.find(p => p.every === current.every && p.unit === current.unit)?.key || 'custom') : 'fortnightly'
  const [preset, setPreset] = useState(preset0)
  const [every, setEvery] = useState(String(current?.every || 6))
  const [unit, setUnit] = useState<RepeatUnit>(current?.unit || 'week')
  const [ends, setEnds] = useState<RepeatEnds>(current?.ends || 'never')
  const [after, setAfter] = useState(String(current?.endsAfter || 10))
  const [on, setOn] = useState(current?.endsOn || '')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const startDate = ymdIn(job.scheduled_start, tz)
  const p = REPEAT_PRESETS.find(x => x.key === preset)
  const rule = cleanRule({ every: p ? p.every : Number(every), unit: p ? p.unit : unit, ends, endsAfter: Number(after), endsOn: on })
  const next = useMemo(() => (rule ? upcomingDates(startDate, rule, 1, 4) : []), [startDate, rule?.every, rule?.unit, rule?.ends, rule?.endsAfter, rule?.endsOn]) // eslint-disable-line react-hooks/exhaustive-deps
  const save = async () => {
    if (!rule) { setErr(ends === 'on' ? 'Pick an end date.' : ends === 'after' ? 'Pick at least 2 visits.' : 'Pick how often it repeats.'); return }
    setBusy(true); setErr('')
    try { onSaved(await api(`/api/jobs/${job.id}/repeat`, { method: 'POST', json: { companyId, ...rule } })) }
    catch (e: any) { setErr(e.message) } finally { setBusy(false) }
  }
  return (
    <Dialog title={current ? 'Change the repeat' : 'Repeat this job'} onClose={onClose} width={520} footer={<>
      <button type="button" className="ak-btn ghost" onClick={onClose}>Cancel</button>
      <button type="button" className="ak-btn go" onClick={save} disabled={busy}>{busy ? 'Saving…' : current ? 'Save' : 'Repeat'}</button>
    </>}>
      <style>{CSS}</style>
      <div>
        <span className="ak-label">How often</span>
        <div className="rp-chips" role="radiogroup" aria-label="How often">
          {[...REPEAT_PRESETS.map(x => [x.key, x.label]), ['custom', 'Custom']].map(([k, l]) => (
            <button key={k} type="button" role="radio" aria-checked={preset === k} className={preset === k ? 'on' : ''} onClick={() => setPreset(k)}>{l}</button>
          ))}
        </div>
        {preset === 'custom' && (
          <div className="rp-custom">
            <span>Every</span>
            <input className="ak-field sm" value={every} onChange={e => setEvery(e.target.value.replace(/\D/g, '').slice(0, 2))} inputMode="numeric" aria-label="Every how many" />
            <select className="ak-select sm" value={unit} onChange={e => setUnit(e.target.value as RepeatUnit)} aria-label="Weeks or months"><option value="week">weeks</option><option value="month">months</option></select>
          </div>
        )}
      </div>
      <div>
        <span className="ak-label">Ends</span>
        <div className="rp-ends">
          <label><input type="radio" name="rp-ends" checked={ends === 'never'} onChange={() => setEnds('never')} /> Never</label>
          <label><input type="radio" name="rp-ends" checked={ends === 'after'} onChange={() => setEnds('after')} /> After <input className="ak-field sm rp-n" value={after} onChange={e => { setAfter(e.target.value.replace(/\D/g, '').slice(0, 3)); setEnds('after') }} inputMode="numeric" aria-label="Number of visits" /> visits</label>
          <label className="rp-on-date"><input type="radio" name="rp-ends" checked={ends === 'on'} onChange={() => setEnds('on')} /> On <span style={{ flex: 1, minWidth: 0 }}><DateTimeField label="Ends on" mode="date" value={on} onChange={v => { setOn(v); setEnds('on') }} min={startDate} placeholder="Pick a date" /></span></label>
        </div>
      </div>
      <div className="rp-preview">
        <b>{rule ? `${ruleLabel(rule)}${endLabel(rule) ? ` ${endLabel(rule)}` : ''}` : 'Pick how often'}</b>
        {rule && <span>This visit {dayLabel(startDate)}, then {next.length ? next.map(x => dayLabel(x.date)).join(' · ') : 'no more'}{rule.ends === 'never' || (next.length === 4 && rule.ends === 'after' && (rule.endsAfter || 0) > 5) ? '…' : ''}</span>}
      </div>
      {current && <p className="ak-hint" style={{ margin: 0 }}>From this visit on. Later visits nobody has started are replaced, and new ones copy this job as it is now.</p>}
      {!current && <p className="ak-hint" style={{ margin: 0 }}>Each visit copies this job: the customer, address, team, checklist and price, at the same time of day.</p>}
      {err && <div className="ak-note bad" role="alert">{err}</div>}
    </Dialog>
  )
}

function StopDialog({ companyId, job, upcoming, onClose, onStopped }: { companyId: string; job: any; upcoming: number; onClose: () => void; onStopped: (n: number) => void }) {
  const [cancel, setCancel] = useState(true)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const go = async () => {
    setBusy(true); setErr('')
    try { const r = await api(`/api/jobs/${job.id}/repeat?companyId=${companyId}${cancel ? '&cancelUpcoming=1' : ''}`, { method: 'DELETE' }); onStopped(r.cancelled || 0) }
    catch (e: any) { setErr(e.message) } finally { setBusy(false) }
  }
  return (
    <Dialog title="Stop repeating?" onClose={onClose} width={460} footer={<>
      <button type="button" className="ak-btn ghost" onClick={onClose}>Keep repeating</button>
      <button type="button" className="ak-btn danger" onClick={go} disabled={busy}>{busy ? 'Stopping…' : 'Stop repeating'}</button>
    </>}>
      <p className="ak-hint" style={{ margin: 0 }}>No more visits will be made. This job and the visits already done stay as they are.</p>
      {upcoming > 0 && <label className="rp-check"><input type="checkbox" checked={cancel} onChange={e => setCancel(e.target.checked)} /><span>Also call off the {upcoming === 1 ? 'upcoming visit' : `${upcoming} upcoming visits`} nobody has started</span></label>}
      {err && <div className="ak-note bad" role="alert">{err}</div>}
    </Dialog>
  )
}

const CSS = `
.rp-sk{height:44px;border-radius:14px;background:var(--f)}
.rp-on,.rp-off{display:flex;flex-direction:column;gap:12px}
.rp-rule{display:flex;align-items:center;gap:12px}
.rp-ic{width:36px;height:36px;border-radius:12px;display:flex;align-items:center;justify-content:center;background:color-mix(in srgb,var(--coral) 12%,var(--f));color:var(--coral);flex-shrink:0}
.rp-rule>div b{display:block;font-size:15px}
.rp-rule>div span{display:block;font-size:12.5px;color:var(--mut)}
.rp-list{display:flex;flex-direction:column;gap:2px}
.rp-visit{display:flex;align-items:baseline;justify-content:space-between;gap:10px;padding:8px 10px;border-radius:12px;text-decoration:none;color:var(--ink);background:var(--f)}
.rp-visit+.rp-visit{margin-top:4px}
.rp-visit:hover{background:var(--f2)}
.rp-visit span{font-size:13.5px;font-weight:600}
.rp-visit small{font-size:12px;color:var(--mut);white-space:nowrap}
.rp-then{margin:6px 0 0;font-size:12.5px;color:var(--mut)}
.rp-chips{display:flex;flex-wrap:wrap;gap:6px}
.rp-chips button{min-height:36px;padding:0 14px;border:none;border-radius:999px;background:var(--f);font:inherit;font-size:13.5px;font-weight:600;color:var(--ink);cursor:pointer}
.rp-chips button.on{background:var(--ink);color:var(--card,#fff)}
.rp-custom{display:flex;align-items:center;gap:8px;margin-top:10px;font-size:14px}
.rp-custom .ak-field{width:64px;text-align:right}
.rp-custom .ak-select{width:auto}
.rp-ends{display:flex;flex-direction:column;gap:10px}
.rp-ends label{display:flex;align-items:center;gap:8px;font-size:14px;cursor:pointer}
.rp-ends input[type=radio]{width:17px;height:17px;accent-color:var(--coral);flex-shrink:0}
.rp-n{width:64px!important;text-align:right}
.rp-preview{padding:12px 14px;border-radius:14px;background:var(--f);display:flex;flex-direction:column;gap:3px}
.rp-preview b{font-size:14px}
.rp-preview span{font-size:13px;color:var(--mut)}
.rp-check{display:flex;align-items:flex-start;gap:10px;font-size:14px;cursor:pointer}
.rp-check input{width:17px;height:17px;margin-top:2px;accent-color:var(--coral)}
`
