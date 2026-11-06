'use client'

// Lay out the restaurant (Reservation Settings → Floor plan → Edit layout):
// rooms ("areas"), tables dragged into place and sized, how many each seats,
// whether it can be booked online, and tables that push together for bigger
// groups ("combinations"). Saved in one go (POST /api/restaurant/floor).

import { useEffect, useMemo, useRef, useState } from 'react'
import FloorCanvas, { type FTable } from '@/components/restaurant/FloorCanvas'
import { floorProblem } from '@/lib/restaurant/tables'
import { Toggle } from '@/components/ui/AdminKit'
import { apiRaw, Icon, PartyStepper, tableName } from '@/components/restaurant/shared'

export type Area = { id: string; name: string }
export type FCombo = { id: string; name: string; table_ids: string[]; min_party: number; max_party: number; online: boolean }
export type Plan = { areas: Area[]; tables: FTable[]; combos: FCombo[] }

let seq = 0
const tmp = (p: string) => `new-${p}-${Date.now().toString(36)}-${++seq}`

/** A first floor to start from: four tables for two, four for four, two for six. */
function starter(area: string | null): FTable[] {
  const t = (label: string, x: number, y: number, w: number, h: number, min: number, max: number, shape: 'rect' | 'round' = 'rect'): FTable =>
    ({ id: tmp('t'), area_id: area, label, x, y, w, h, min_party: min, max_party: max, shape, combinable: true, online: true, unavailable_until: null })
  return [
    t('1', 1, 1, 2, 2, 1, 2), t('2', 4, 1, 2, 2, 1, 2), t('3', 7, 1, 2, 2, 1, 2), t('4', 10, 1, 2, 2, 1, 2),
    t('5', 1, 5, 3, 2, 2, 4), t('6', 5.5, 5, 3, 2, 2, 4), t('7', 10, 5, 3, 2, 2, 4), t('8', 14.5, 5, 3, 2, 2, 4),
    t('9', 1, 9, 3, 3, 4, 6, 'round'), t('10', 5.5, 9, 3, 3, 4, 6, 'round'),
  ]
}

const nextLabel = (tables: FTable[]) => {
  const nums = tables.map(t => parseInt(t.label, 10)).filter(n => Number.isFinite(n))
  return String((nums.length ? Math.max(...nums) : 0) + 1)
}

/** Somewhere empty for a new table: the first spot along the rows that doesn't overlap. */
function freeSpot(tables: FTable[], w: number, h: number) {
  for (let y = 1; y < 40; y += 1) for (let x = 1; x < 30; x += 1) {
    if (!tables.some(t => x < t.x + t.w + 0.5 && x + w + 0.5 > t.x && y < t.y + t.h + 0.5 && y + h + 0.5 > t.y)) return { x, y }
  }
  return { x: 1, y: 1 }
}

export default function FloorEditor({ companyId, initial, onSaved, toast }: { companyId: string; initial: Plan; onSaved: (p: Plan) => void; toast: (m: string) => void }) {
  const [plan, setPlan] = useState<Plan>(initial)
  const [saved, setSaved] = useState(() => JSON.stringify(initial))
  const [area, setArea] = useState<string | null>(initial.areas[0]?.id || null)
  const [sel, setSel] = useState<string[]>([])
  const [hoverCombo, setHoverCombo] = useState<string | null>(null)
  const [multi, setMulti] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  // Only a different saved plan replaces the one being edited (not a re-render of the page).
  const initialKey = JSON.stringify(initial)
  useEffect(() => {
    const next: Plan = JSON.parse(initialKey)
    setPlan(next); setSaved(initialKey); setArea(a => (a && next.areas.some(x => x.id === a) ? a : next.areas[0]?.id || null))
  }, [initialKey])
  const dirty = JSON.stringify(plan) !== saved

  // Leaving with unsaved changes asks first.
  const dirtyRef = useRef(dirty)
  dirtyRef.current = dirty
  useEffect(() => {
    const h = (e: BeforeUnloadEvent) => { if (dirtyRef.current) { e.preventDefault(); e.returnValue = '' } }
    window.addEventListener('beforeunload', h)
    return () => window.removeEventListener('beforeunload', h)
  }, [])

  const inArea = (t: FTable) => (plan.areas.length ? (t.area_id || plan.areas[0].id) === area : true)
  const shown = plan.tables.filter(inArea)
  const byId = useMemo(() => new Map(plan.tables.map(t => [t.id, t])), [plan.tables])
  const one = sel.length === 1 ? byId.get(sel[0]) : null
  const many = sel.map(id => byId.get(id)).filter(Boolean) as FTable[]

  const setT = (id: string, patch: Partial<FTable>) => setPlan(p => ({ ...p, tables: p.tables.map(t => (t.id === id ? { ...t, ...patch } : t)) }))
  const add = (kind: '2' | '4' | 'round' | 'long') => {
    const size = kind === '2' ? { w: 2, h: 2, min: 1, max: 2, shape: 'rect' as const } : kind === '4' ? { w: 3, h: 2, min: 2, max: 4, shape: 'rect' as const }
      : kind === 'round' ? { w: 3, h: 3, min: 4, max: 6, shape: 'round' as const } : { w: 6, h: 2, min: 6, max: 10, shape: 'rect' as const }
    const spot = freeSpot(shown, size.w, size.h)
    const t: FTable = { id: tmp('t'), area_id: plan.areas.length ? area : null, label: nextLabel(plan.tables), ...spot, w: size.w, h: size.h, min_party: size.min, max_party: size.max, shape: size.shape, combinable: true, online: true, unavailable_until: null }
    setPlan(p => ({ ...p, tables: [...p.tables, t] }))
    setSel([t.id])
  }
  const remove = (ids: string[]) => {
    setPlan(p => ({ ...p, tables: p.tables.filter(t => !ids.includes(t.id)), combos: p.combos.filter(c => !c.table_ids.some(id => ids.includes(id))) }))
    setSel([])
  }
  const duplicate = (t: FTable) => {
    const spot = freeSpot(shown, t.w, t.h)
    const c = { ...t, id: tmp('t'), label: nextLabel(plan.tables), ...spot }
    setPlan(p => ({ ...p, tables: [...p.tables, c] }))
    setSel([c.id])
  }
  const addArea = () => {
    const name = `Area ${plan.areas.length + 1}`
    if (!plan.areas.length) {
      // The first area: what's there already becomes "Inside", and the new one is added beside it.
      const inside = { id: tmp('area'), name: 'Inside' }, next = { id: tmp('area'), name: 'Outside' }
      setPlan(p => ({ ...p, areas: [inside, next], tables: p.tables.map(t => ({ ...t, area_id: inside.id })) }))
      setArea(next.id)
    } else {
      const a = { id: tmp('area'), name }
      setPlan(p => ({ ...p, areas: [...p.areas, a] }))
      setArea(a.id)
    }
    setSel([])
  }
  const removeArea = (id: string) => {
    const rest = plan.areas.filter(a => a.id !== id)
    const gone = plan.tables.filter(t => (t.area_id || plan.areas[0]?.id) === id).map(t => t.id)
    setPlan(p => ({ ...p, areas: rest, tables: p.tables.filter(t => !gone.includes(t.id)).map(t => ({ ...t, area_id: rest.length ? t.area_id : null })), combos: p.combos.filter(c => !c.table_ids.some(x => gone.includes(x))) }))
    setArea(rest[0]?.id || null)
  }
  const makeCombo = () => {
    if (many.length < 2) return
    const biggest = Math.max(...many.map(t => t.max_party))
    const sum = many.reduce((n, t) => n + t.max_party, 0)
    const c: FCombo = { id: tmp('c'), name: many.map(t => tableName(t.label)).join(' + '), table_ids: many.map(t => t.id), min_party: Math.min(sum, biggest + 1), max_party: sum, online: true }
    setPlan(p => ({ ...p, combos: [...p.combos, c] }))
    setSel([])
    toast(`${c.name} can now seat ${c.min_party}–${c.max_party}`)
  }
  const setC = (id: string, patch: Partial<FCombo>) => setPlan(p => ({ ...p, combos: p.combos.map(c => (c.id === id ? { ...c, ...patch } : c)) }))

  const problem = floorProblem({ tables: plan.tables.map(t => ({ id: t.id, label: t.label, min_party: t.min_party, max_party: t.max_party })), combos: plan.combos })
  const save = async () => {
    if (problem) { setErr(problem); return }
    setBusy(true); setErr('')
    try {
      const r = await apiRaw('/api/restaurant/floor', { method: 'POST', json: { companyId, areas: plan.areas, tables: plan.tables, combos: plan.combos } })
      if (!r.ok) { setErr(r.data?.error || 'Could not save the floor plan.'); return }
      const next: Plan = { areas: r.data.areas || [], tables: r.data.tables || [], combos: r.data.combos || [] }
      setPlan(next); setSaved(JSON.stringify(next)); setSel([])
      setArea(a => (next.areas.find(x => x.name === plan.areas.find(y => y.id === a)?.name)?.id || next.areas[0]?.id || null))
      onSaved(next)
      toast(r.data.lostTables ? `Saved. ${r.data.lostTables} upcoming ${r.data.lostTables === 1 ? 'booking needs' : 'bookings need'} a new table.` : 'Floor plan saved')
    } finally { setBusy(false) }
  }

  // Shift-click, or "Push together with…" on a phone, picks several.
  const tap = (t: FTable, e: { shift: boolean }) => setSel(s => (e.shift || (multi && s.length) ? (s.includes(t.id) ? s.filter(x => x !== t.id) : [...s, t.id]) : s.length === 1 && s[0] === t.id ? [] : [t.id]))
  useEffect(() => { if (!sel.length) setMulti(false) }, [sel.length])
  const combosHere = plan.combos.filter(c => c.table_ids.some(id => { const t = byId.get(id); return t && inArea(t) }))
  const empty = !plan.tables.length

  return (
    <div className="fe">
      <style>{FE_CSS}</style>
      <div className="fe-bar">
        <div className="ak-seg" role="tablist" aria-label="Areas">
          {plan.areas.length ? plan.areas.map(a => (
            <button key={a.id} type="button" role="tab" aria-selected={area === a.id} className={area === a.id ? 'on' : ''} onClick={() => { setArea(a.id); setSel([]) }}>{a.name || 'Area'}</button>
          )) : <button type="button" role="tab" aria-selected className="on">Floor</button>}
        </div>
        <button type="button" className="ak-btn sm ghost" onClick={addArea}>{Icon.plus}Area</button>
        <span className="fe-sp" />
        <div className="fe-add" role="group" aria-label="Add a table">
          <button type="button" className="ak-btn sm" onClick={() => add('2')}>{Icon.plus}Table for 2</button>
          <button type="button" className="ak-btn sm" onClick={() => add('4')}>{Icon.plus}For 4</button>
          <button type="button" className="ak-btn sm" onClick={() => add('round')}>{Icon.plus}Round 6</button>
          <button type="button" className="ak-btn sm" onClick={() => add('long')}>{Icon.plus}Long 10</button>
        </div>
      </div>

      <div className="fe-grid">
        <div className="fe-canvas">
          {empty ? (
            <div className="fe-empty">
              <b>No tables yet</b>
              <p>Add your tables one by one, or start with ten (four for two, four for four, two round tables for six) and move them into place.</p>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
                <button type="button" className="ak-btn go" onClick={() => setPlan(p => ({ ...p, tables: starter(p.areas.length ? area : null) }))}>Start with ten tables</button>
                <button type="button" className="ak-btn" onClick={() => add('4')}>{Icon.plus}Add one table</button>
              </div>
            </div>
          ) : (
            <FloorCanvas label="Floor plan, editing" tables={shown} edit selected={sel}
              highlight={hoverCombo ? plan.combos.find(c => c.id === hoverCombo)?.table_ids : undefined}
              onTap={tap} onMove={(id, x, y) => setT(id, { x, y })} onResize={(id, w, h) => setT(id, { w, h })} />
          )}
          {!empty && <p className="ak-hint fe-tip">Drag tables into place; drag the corner to resize. To push tables together, Shift-click them (or tap a table, then “Push together with…”). Arrow keys move the selected table; Alt + arrows resize it.</p>}
        </div>

        <aside className="fe-side" aria-label="Details">
          {one ? (
            <div className="fe-card">
              <div className="fe-card-h"><h3>Table {one.label || '…'}</h3><button type="button" className="ak-icon-btn" onClick={() => setSel([])} aria-label="Done">{Icon.x}</button></div>
              <div><label className="ak-label" htmlFor="fe-label">Name or number</label><input id="fe-label" className="ak-field" value={one.label} maxLength={20} onChange={e => setT(one.id, { label: e.target.value })} /></div>
              <div className="fe-two">
                <div><span className="ak-label">Fewest guests</span><PartyStepper value={one.min_party} max={100} onChange={n => setT(one.id, { min_party: n, max_party: Math.max(n, one.max_party) })} /></div>
                <div><span className="ak-label">Most guests</span><PartyStepper value={one.max_party} max={100} onChange={n => setT(one.id, { max_party: n, min_party: Math.min(n, one.min_party) })} /></div>
              </div>
              <div>
                <span className="ak-label">Shape</span>
                <div className="rs-chips">
                  <button type="button" className={`rs-chip${one.shape === 'rect' ? ' on' : ''}`} onClick={() => setT(one.id, { shape: 'rect' })}>Square corners</button>
                  <button type="button" className={`rs-chip${one.shape === 'round' ? ' on' : ''}`} onClick={() => setT(one.id, { shape: 'round', h: one.w })}>Round</button>
                  <button type="button" className="rs-chip" onClick={() => setT(one.id, { w: one.h, h: one.w })} title="Swap width and depth">Turn</button>
                </div>
              </div>
              {plan.areas.length > 1 && (
                <div><label className="ak-label" htmlFor="fe-area">Area</label>
                  <select id="fe-area" className="ak-select" value={one.area_id || plan.areas[0].id} onChange={e => { setT(one.id, { area_id: e.target.value }); setArea(e.target.value) }}>
                    {plan.areas.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                  </select>
                </div>
              )}
              <div className="fe-row"><div><b>Book online</b><span>Off: only your team can give guests this table.</span></div><Toggle on={one.online} onChange={v => setT(one.id, { online: v })} label="Book online" /></div>
              <div className="fe-row"><div><b>Can be pushed together</b><span>For combinations with other tables.</span></div><Toggle on={one.combinable} onChange={v => setT(one.id, { combinable: v })} label="Can be pushed together" /></div>
              <div className="fe-acts">
                <button type="button" className="ak-btn sm" onClick={() => duplicate(one)}>Duplicate</button>
                <button type="button" className={`ak-btn sm${multi ? ' dark' : ''}`} onClick={() => setMulti(m => !m)} aria-pressed={multi}>{multi ? 'Tap the other tables…' : 'Push together with…'}</button>
                <button type="button" className="ak-btn sm danger" onClick={() => remove([one.id])}>{Icon.trash}Remove</button>
              </div>
            </div>
          ) : many.length > 1 ? (
            <div className="fe-card">
              <div className="fe-card-h"><h3>{many.map(t => tableName(t.label)).join(' + ')}</h3><button type="button" className="ak-icon-btn" onClick={() => setSel([])} aria-label="Clear selection">{Icon.x}</button></div>
              <p className="ak-hint" style={{ margin: 0 }}>Together they seat up to {many.reduce((n, t) => n + t.max_party, 0)}.</p>
              {many.some(t => !t.combinable) && <p className="ak-hint" style={{ margin: 0, color: '#b45309' }}>{many.filter(t => !t.combinable).map(t => tableName(t.label)).join(', ')} {many.filter(t => !t.combinable).length === 1 ? 'is' : 'are'} set not to be pushed together.</p>}
              <div className="fe-acts">
                <button type="button" className="ak-btn sm go" onClick={makeCombo} disabled={many.length > 8}>Make a combination</button>
                <button type="button" className="ak-btn sm danger" onClick={() => remove(sel)}>{Icon.trash}Remove {many.length}</button>
              </div>
            </div>
          ) : (
            <>
              {plan.areas.length > 0 && area && (
                <div className="fe-card">
                  <div><label className="ak-label" htmlFor="fe-aname">Area name</label>
                    <input id="fe-aname" className="ak-field" value={plan.areas.find(a => a.id === area)?.name || ''} maxLength={60}
                      onChange={e => setPlan(p => ({ ...p, areas: p.areas.map(a => (a.id === area ? { ...a, name: e.target.value } : a)) }))} />
                  </div>
                  <div className="fe-acts">
                    <button type="button" className="ak-btn sm" disabled={plan.areas.findIndex(a => a.id === area) <= 0}
                      onClick={() => setPlan(p => { const i = p.areas.findIndex(a => a.id === area); const a = [...p.areas]; [a[i - 1], a[i]] = [a[i], a[i - 1]]; return { ...p, areas: a } })}>Move left</button>
                    <button type="button" className="ak-btn sm danger" onClick={() => removeArea(area)}>{Icon.trash}Remove area</button>
                  </div>
                  {shown.length > 0 && <p className="ak-hint" style={{ margin: 0 }}>Removing it removes its {shown.length} {shown.length === 1 ? 'table' : 'tables'} too.</p>}
                </div>
              )}
              <div className="fe-card">
                <div className="fe-card-h"><h3>Combinations</h3></div>
                {!combosHere.length && <p className="ak-hint" style={{ margin: 0 }}>Tables you push together for a bigger group. Shift-click two or more tables, then “Make a combination”. Colvy uses one when no single table fits.</p>}
                {combosHere.map(c => (
                  <div key={c.id} className="fe-combo" onMouseEnter={() => setHoverCombo(c.id)} onMouseLeave={() => setHoverCombo(null)} onFocus={() => setHoverCombo(c.id)} onBlur={() => setHoverCombo(null)}>
                    <div className="fe-combo-h">
                      <input className="ak-field" value={c.name} maxLength={40} onChange={e => setC(c.id, { name: e.target.value })} aria-label="Combination name" />
                      <button type="button" className="ak-icon-btn" onClick={() => setPlan(p => ({ ...p, combos: p.combos.filter(x => x.id !== c.id) }))} aria-label={`Remove ${c.name}`}>{Icon.x}</button>
                    </div>
                    <div className="fe-combo-r">
                      <span>Seats</span>
                      <input className="ak-field fe-n" inputMode="numeric" value={c.min_party} onChange={e => setC(c.id, { min_party: Math.max(1, Number(e.target.value.replace(/\D/g, '')) || 1) })} aria-label="Fewest guests" />
                      <span>to</span>
                      <input className="ak-field fe-n" inputMode="numeric" value={c.max_party} onChange={e => setC(c.id, { max_party: Math.max(1, Number(e.target.value.replace(/\D/g, '')) || 1) })} aria-label="Most guests" />
                      <label className="fe-on"><input type="checkbox" checked={c.online} onChange={e => setC(c.id, { online: e.target.checked })} />Online</label>
                    </div>
                  </div>
                ))}
              </div>
              <div className="fe-card soft">
                <b>{plan.tables.length} {plan.tables.length === 1 ? 'table' : 'tables'}</b>
                <span>{plan.tables.reduce((n, t) => n + t.max_party, 0)} seats in all{plan.areas.length > 1 ? ` across ${plan.areas.length} areas` : ''}. Tap a table to change it.</span>
              </div>
            </>
          )}
        </aside>
      </div>

      {(dirty || err) && (
        <div className="fe-save" role="region" aria-label="Save the floor plan">
          <span className={err || problem ? 'bad' : ''}>{err || problem || 'You have unsaved changes.'}</span>
          {dirty && <button type="button" className="ak-btn ghost" onClick={() => { setPlan(JSON.parse(saved)); setSel([]); setErr('') }}>Discard</button>}
          {dirty && <button type="button" className="ak-btn go" onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Save floor plan'}</button>}
        </div>
      )}
    </div>
  )
}

const FE_CSS = `
.fe{display:flex;flex-direction:column;gap:14px}
.fe-bar{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.fe-sp{flex:1}
.fe-add{display:flex;gap:6px;flex-wrap:wrap}
.fe-grid{display:grid;grid-template-columns:minmax(0,1fr) 320px;gap:16px;align-items:start}
@media(max-width:980px){.fe-grid{grid-template-columns:minmax(0,1fr)}}
.fe-canvas{min-width:0;display:flex;flex-direction:column;gap:8px}
.fe-tip{margin:0}
.fe-side{display:flex;flex-direction:column;gap:12px;position:sticky;top:84px}
@media(max-width:980px){.fe-side{position:static}}
.fe-card{display:flex;flex-direction:column;gap:12px;padding:16px;border-radius:20px;background:var(--card,#fff);box-shadow:0 0 0 1px var(--line,rgba(0,0,0,.06))}
.fe-card.soft{gap:2px;background:var(--f);box-shadow:none;font-size:13.5px}
.fe-card.soft span{color:var(--mut)}
.fe-card-h{display:flex;align-items:center;justify-content:space-between;gap:8px}
.fe-card-h h3{margin:0;font-size:16px;font-weight:750}
.fe-two{display:grid;grid-template-columns:1fr 1fr;gap:10px}
.fe-row{display:flex;align-items:center;justify-content:space-between;gap:12px}
.fe-row>div{display:flex;flex-direction:column;gap:1px;min-width:0}
.fe-row b{font-size:14px;font-weight:650}
.fe-row span{font-size:12.5px;color:var(--mut)}
.fe-acts{display:flex;gap:6px;flex-wrap:wrap}
.fe-combo{display:flex;flex-direction:column;gap:6px;padding:10px;border-radius:14px;background:var(--f)}
.fe-combo-r{display:flex;align-items:center;gap:6px;font-size:13px;color:var(--mut);flex-wrap:wrap}
.fe-n{width:54px!important;height:36px!important;text-align:center}
.ak .fe-combo .ak-field{background-color:var(--card,#fff)!important}
.fe-combo-h{display:flex;align-items:center;gap:6px}
.fe-combo-h .ak-field{flex:1;min-width:0}
.fe-on{display:inline-flex;align-items:center;gap:5px;margin-left:auto;font-weight:600;color:var(--ink)}
.fe-on input{accent-color:var(--ink)}
.fe-empty{display:flex;flex-direction:column;align-items:center;gap:8px;padding:56px 20px;border-radius:22px;background:var(--f);text-align:center}
.fe-empty b{font-size:17px}
.fe-empty p{margin:0 0 6px;max-width:440px;font-size:14px;color:var(--mut);line-height:1.5}
.fe-save{position:sticky;bottom:16px;z-index:6;display:flex;align-items:center;justify-content:flex-end;gap:8px;padding:10px 12px 10px 18px;border-radius:999px;background:var(--card,#fff);box-shadow:0 0 0 1px rgba(0,0,0,.06),0 12px 32px rgba(0,0,0,.14)}
.fe-save span{margin-right:auto;font-size:14px;font-weight:600}
.fe-save span.bad{color:#b91c1c}
@media(max-width:560px){.fe-save{border-radius:20px;flex-wrap:wrap}.fe-save span{width:100%}}
.ak-btn.danger{color:#b91c1c}
`
