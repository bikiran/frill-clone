'use client'

import { useState, useEffect, useRef } from 'react'
import TickSlider from '@/components/TickSlider'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import { notifyIntegrations } from '@/lib/integrations-notify'
import { resolveCompanyUser } from '@/lib/client-cache'
import { AdminPage, Panel, Toggle } from '@/components/ui/AdminKit'


type Idea = {
  id: string
  title: string
  votes: number
  status: string
  priority?: string
  effort?: number      // 1-5
  impact?: number      // 1-5
  confidence?: number  // 1-5 (RICE)
  reach?: number       // 1-5 (RICE)
  created_at: string
}

const QUADRANTS = [
  { key: 'quick_win',    label: 'Quick Wins',    desc: 'High Impact · Low Effort',   color: '#10b981', bg: '#ecfdf5', x: [0,50], y: [50,100] },
  { key: 'major',        label: 'Major Projects', desc: 'High Impact · High Effort',  color: '#f59e0b', bg: '#fffbeb', x: [50,100], y: [50,100] },
  { key: 'fill_in',      label: 'Fill Ins',       desc: 'Low Impact · Low Effort',    color: '#6b7280', bg: '#f9fafb', x: [0,50], y: [0,50] },
  { key: 'thankless',    label: 'Thankless Tasks', desc: 'Low Impact · High Effort',  color: '#ef4444', bg: '#fef2f2', x: [50,100], y: [0,50] },
]

function getQuadrant(effort: number, impact: number) {
  const lowEffort = effort <= 2.5
  const highImpact = impact >= 2.5
  if (lowEffort && highImpact) return 'quick_win'
  if (!lowEffort && highImpact) return 'major'
  if (lowEffort && !highImpact) return 'fill_in'
  return 'thankless'
}

function riceScore(reach: number, impact: number, confidence: number, effort: number) {
  if (!effort) return 0
  return Math.round((reach * impact * confidence) / effort)
}

function valueScore(impact: number, effort: number) {
  if (!effort) return 0
  return Math.round((impact / effort) * 100) / 100
}

export default function PrioritiesPage() {
  const router = useRouter()
  const [user, setUser] = useState<any>(null)
  const [ideas, setIdeas] = useState<Idea[]>([])
  const [loading, setLoading] = useState(true)
  const [view, setView] = useState<'matrix' | 'table' | 'rice' | 'settings'>('matrix')
  const [benefitFactors, setBenefitFactors] = useState([{ name: 'Votes', type: 'Vote Count', weight: 20 }, { name: 'Reward', type: 'Percentage', weight: 100 }])
  const [costFactors, setCostFactors] = useState([{ name: 'Effort', type: '0-5', weight: 100 }])
  const [showPriorityScore, setShowPriorityScore] = useState(true)
  const [normalizeScores, setNormalizeScores] = useState(true)
  const [scorePublic, setScorePublic] = useState(false)
  const [settingsSaved, setSettingsSaved] = useState(false)
  const [selected, setSelected] = useState<Idea | null>(null)
  const [hoveredIdea, setHoveredIdea] = useState<string | null>(null)
  const [saving, setSaving] = useState<string | null>(null)
  const [sortBy, setSortBy] = useState<'rice' | 'value' | 'votes' | 'impact'>('rice')
  const matrixRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }: any) => {
      const u = data?.session?.user
      setUser(u)
      fetchIdeas()
    })
  }, [router])

  const fetchIdeas = async () => {
    try {
      // Only this workspace's ideas (the ideas table is readable by the public
      // board, so without this every workspace's ideas were listed here).
      const { companyId } = await resolveCompanyUser()
      if (!companyId) { setIdeas([]); setLoading(false); return }
      const { data } = await (supabase as any).from('ideas').select('id,title,votes,status,priority,effort,impact,confidence,reach,created_at').eq('company_id', companyId).order('votes', { ascending: false })
      // Fill default values
      const list = (data || []).map((i: any) => ({
        ...i,
        effort: i.effort ?? 3,
        impact: i.impact ?? 3,
        confidence: i.confidence ?? 3,
        reach: i.reach ?? (i.votes || 1),
      }))
      setIdeas(list)
    } catch {}
    setLoading(false)
  }

  const updateIdea = async (id: string, fields: Partial<Idea>) => {
    setSaving(id)
    try {
      await (supabase as any).from('ideas').update(fields).eq('id', id)
      if ('status' in fields) notifyIntegrations('idea.status_changed', { id })
      setIdeas(prev => prev.map(i => i.id === id ? { ...i, ...fields } : i))
      if (selected?.id === id) setSelected(prev => prev ? { ...prev, ...fields } : null)
    } catch {}
    setSaving(null)
  }

  const getMatrixPos = (idea: Idea) => {
    const effort = idea.effort ?? 3
    const impact = idea.impact ?? 3
    // effort 1-5 → x 10-90%, impact 1-5 → y 90-10% (inverted)
    const x = ((effort - 1) / 4) * 80 + 10
    const y = 90 - ((impact - 1) / 4) * 80
    return { x, y }
  }

  const Slider = ({ label, value, onChange, color = 'var(--coral)' }: any) => (
    <TickSlider label={label} min={1} max={5} ticks={21} value={value} onChange={onChange} color={color} showMax={false} format={n => `${n} of 5`} />
  )

  const rice = ideas.map(i => ({ ...i, rice: riceScore(i.reach ?? 1, i.impact ?? 3, i.confidence ?? 3, i.effort ?? 3), value: valueScore(i.impact ?? 3, i.effort ?? 3) }))
  const sorted = [...rice].sort((a, b) => {
    if (sortBy === 'rice') return b.rice - a.rice
    if (sortBy === 'value') return b.value - a.value
    if (sortBy === 'votes') return (b.votes || 0) - (a.votes || 0)
    return (b.impact ?? 0) - (a.impact ?? 0)
  })

  if (!user || loading) return <div className="p-8" style={{ color: 'var(--slate)' }}>Loading…</div>

  const selQ = selected ? QUADRANTS.find(q => q.key === getQuadrant(selected.effort ?? 3, selected.impact ?? 3)) : null
  const maxRice = Math.max(...sorted.map(x => x.rice), 1)
  const VIEWS = [['matrix', 'Matrix'], ['table', 'Table'], ['rice', 'RICE'], ['settings', 'Settings']] as const
  const Dots = ({ idea, field }: { idea: Idea; field: 'impact' | 'effort' | 'confidence' }) => (
    <span className="pr-dots" role="radiogroup" aria-label={field}>
      {[1, 2, 3, 4, 5].map(v => (
        <button key={v} type="button" role="radio" aria-checked={(idea[field] ?? 0) === v} aria-label={`${field} ${v}`}
          className={v <= (idea[field] ?? 0) ? 'on' : ''} onClick={e => { e.stopPropagation(); updateIdea(idea.id, { [field]: v } as Partial<Idea>) }} />
      ))}
    </span>
  )
  const FactorTable = ({ rows, set, types, kind }: { rows: { name: string; type: string; weight: number }[]; set: (r: { name: string; type: string; weight: number }[]) => void; types: string[]; kind: string }) => (
    <>
      <div style={{ overflowX: 'auto' }}>
        <table className="ak-table">
          <thead><tr><th>{kind} factor</th><th>Type</th><th>Weight</th><th style={{ width: 44 }} /></tr></thead>
          <tbody>
            {rows.map((f, i) => (
              <tr key={i}>
                <td><input className="ak-field sm" value={f.name} aria-label={`${kind} factor name`} onChange={e => { const n = [...rows]; n[i] = { ...n[i], name: e.target.value }; set(n) }} /></td>
                <td><select className="ak-select sm" value={f.type} aria-label="Type" onChange={e => { const n = [...rows]; n[i] = { ...n[i], type: e.target.value }; set(n) }}>{types.map(t => <option key={t}>{t}</option>)}</select></td>
                <td><select className="ak-select sm" value={f.weight} aria-label="Weight" onChange={e => { const n = [...rows]; n[i] = { ...n[i], weight: parseInt(e.target.value) }; set(n) }}>{[10, 20, 25, 33, 50, 75, 100].map(w => <option key={w} value={w}>{w}%</option>)}</select></td>
                <td><button type="button" className="ak-icon-btn danger" aria-label="Remove factor" onClick={() => set(rows.filter((_, j) => j !== i))}>×</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div style={{ padding: '10px 14px 14px' }}>
        <button type="button" className="ak-btn ghost sm" onClick={() => set([...rows, { name: 'New factor', type: types[0], weight: 100 }])}>+ Add a factor</button>
      </div>
    </>
  )

  return (
    <AdminPage width="xl" title="Prioritisation" sub="Score ideas by impact, effort, reach and confidence, and see what to build next."
      actions={
        <div className="ak-seg" role="tablist" aria-label="View">
          {VIEWS.map(([k, l]) => <button key={k} type="button" role="tab" aria-selected={view === k} className={view === k ? 'on' : ''} onClick={() => setView(k)}>{l}</button>)}
        </div>
      }>
      <div className={`pr-cols${selected ? ' open' : ''}`}>
        <div style={{ minWidth: 0 }}>
          {ideas.length === 0 && view !== 'settings' ? (
            <Panel><div className="ak-empty"><b>No ideas to score yet</b>Ideas from your board show up here so you can weigh them up.</div></Panel>
          ) : null}

          {/* MATRIX */}
          {view === 'matrix' && ideas.length > 0 && (
            <Panel>
              <div className="pr-legend">
                {QUADRANTS.map(q => <span key={q.key}><i style={{ background: q.color }} />{q.label}<em>{q.desc}</em></span>)}
              </div>
              <div className="pr-matrix" ref={matrixRef}>
                <span className="pr-axis y">Impact</span>
                <span className="pr-axis x">Effort</span>
                <div className="pr-plot">
                  {QUADRANTS.map(q => <div key={q.key} className={`pr-q ${q.key}`} style={{ '--q': q.color } as React.CSSProperties}><span>{q.label}</span></div>)}
                  {ideas.map(idea => {
                    const pos = getMatrixPos(idea)
                    const q = QUADRANTS.find(q => q.key === getQuadrant(idea.effort ?? 3, idea.impact ?? 3))
                    const isSelected = selected?.id === idea.id
                    const isHovered = hoveredIdea === idea.id
                    const size = isSelected ? 42 : isHovered ? 38 : Math.max(28, Math.min(44, 24 + (idea.votes || 0)))
                    return (
                      <button key={idea.id} type="button" className={`pr-dot${isSelected ? ' on' : ''}`}
                        onClick={() => setSelected(isSelected ? null : idea)}
                        onMouseEnter={() => setHoveredIdea(idea.id)} onMouseLeave={() => setHoveredIdea(null)}
                        aria-label={`${idea.title}: impact ${idea.impact}, effort ${idea.effort}`}
                        style={{ left: `${pos.x}%`, top: `${pos.y}%`, width: size, height: size, background: q?.color, zIndex: isSelected || isHovered ? 20 : 10, '--q': q?.color } as React.CSSProperties}>
                        {idea.votes || 0}
                        {(isHovered || isSelected) && (
                          <span className="pr-tip">
                            <b>{idea.title}</b>
                            <small>Impact {idea.impact} · Effort {idea.effort}</small>
                            <em style={{ color: q?.color }}>{q?.label}</em>
                          </span>
                        )}
                      </button>
                    )
                  })}
                </div>
              </div>
            </Panel>
          )}

          {/* TABLE */}
          {view === 'table' && ideas.length > 0 && (
            <Panel flush>
              <div style={{ overflowX: 'auto' }}>
                <table className="ak-table pr-table">
                  <thead>
                    <tr>
                      <th>Idea</th>
                      <th className="c">Votes</th>
                      <th className="c"><button type="button" className={sortBy === 'impact' ? 'on' : ''} onClick={() => setSortBy('impact')}>Impact</button></th>
                      <th className="c">Effort</th>
                      <th className="c">Confidence</th>
                      <th className="c"><button type="button" className={sortBy === 'value' ? 'on' : ''} onClick={() => setSortBy('value')}>Value</button></th>
                      <th className="c">Quadrant</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sorted.map((idea, i) => {
                      const q = QUADRANTS.find(q => q.key === getQuadrant(idea.effort ?? 3, idea.impact ?? 3))
                      return (
                        <tr key={idea.id} className={selected?.id === idea.id ? 'on' : ''} onClick={() => setSelected(selected?.id === idea.id ? null : idea)} style={{ cursor: 'pointer' }}>
                          <td><span className="pr-title"><em>{i + 1}</em>{idea.title}</span></td>
                          <td className="c"><span className="pr-votes">{idea.votes || 0}</span></td>
                          <td className="c"><Dots idea={idea} field="impact" /></td>
                          <td className="c"><Dots idea={idea} field="effort" /></td>
                          <td className="c"><Dots idea={idea} field="confidence" /></td>
                          <td className="c"><b>{idea.value.toFixed(1)}×</b></td>
                          <td className="c"><span className="pr-qtag" style={{ '--q': q?.color } as React.CSSProperties}><i />{q?.label}</span></td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </Panel>
          )}

          {/* RICE */}
          {view === 'rice' && ideas.length > 0 && (
            <>
              <Panel title="RICE score" sub="Reach × Impact × Confidence ÷ Effort. The higher the score, the sooner it’s worth building.">
                <div className="pr-rice-key">
                  {[
                    { l: 'Reach', d: 'How many people it helps', c: '#2563eb' },
                    { l: 'Impact', d: 'How much it moves the needle', c: '#10b981' },
                    { l: 'Confidence', d: 'How sure you are', c: '#7c3aed' },
                    { l: 'Effort', d: 'How long it takes', c: '#ef4444' },
                  ].map(f => (
                    <div key={f.l} style={{ '--q': f.c } as React.CSSProperties}><b>{f.l[0]}</b><span>{f.l}</span><small>{f.d}</small></div>
                  ))}
                </div>
              </Panel>
              <Panel title="Ranked by RICE" flush right={sortBy !== 'rice' ? <button type="button" className="ak-btn ghost sm" onClick={() => setSortBy('rice')}>Sort by RICE</button> : undefined}>
                <div className="ak-list" style={{ padding: '0 8px 8px' }}>
                  {sorted.map((idea, i) => {
                    const q = QUADRANTS.find(q => q.key === getQuadrant(idea.effort ?? 3, idea.impact ?? 3))
                    return (
                      <button key={idea.id} type="button" className={`ak-row pr-rice${selected?.id === idea.id ? ' on' : ''}`} onClick={() => setSelected(selected?.id === idea.id ? null : idea)}>
                        <span className={`pr-rank${i < 3 ? ' top' : ''}`}>{i + 1}</span>
                        <span className="ak-row-t">
                          <span className="pr-rice-top"><b>{idea.title}</b><span className="pr-qtag" style={{ '--q': q?.color } as React.CSSProperties}><i />{q?.label}</span></span>
                          <span className="pr-bar"><i style={{ width: `${(idea.rice / maxRice) * 100}%`, background: q?.color }} /></span>
                        </span>
                        <span className="pr-rice-n">
                          <small>R {idea.reach} · I {idea.impact} · C {idea.confidence} · E {idea.effort}</small>
                          <b>{idea.rice}</b>
                        </span>
                      </button>
                    )
                  })}
                </div>
              </Panel>
            </>
          )}

          {/* SETTINGS */}
          {view === 'settings' && (
            <div style={{ maxWidth: 760 }}>
              <Panel title="Benefit factors" sub="What makes an idea worth doing: customer value, strategic value, revenue, cost savings." flush>
                <FactorTable rows={benefitFactors} set={setBenefitFactors} types={['Vote Count', 'Percentage', '1-5', '0-10', 'Currency']} kind="Benefit" />
              </Panel>
              <Panel title="Cost factors" sub="What makes an idea hard or expensive to build: effort, difficulty, person-months." flush>
                <FactorTable rows={costFactors} set={setCostFactors} types={['0-5', '1-5', 'Percentage', 'Hours', 'Days']} kind="Cost" />
              </Panel>
              <Panel title="Display">
                <div className="pr-opt">
                  <span><b>Priority score display</b><small>How the score shows on ideas</small></span>
                  <select className="ak-select sm" style={{ width: 170 }} aria-label="Priority score display"><option>Score and label</option><option>Score only</option><option>Label only</option></select>
                </div>
                {[
                  { label: 'Show priority score', desc: 'Show scores on your board and roadmap', state: showPriorityScore, set: setShowPriorityScore },
                  { label: 'Normalise scores', desc: 'Scale every score to 0–100', state: normalizeScores, set: setNormalizeScores },
                  { label: 'Public scores', desc: 'Let visitors to the public board see scores', state: scorePublic, set: setScorePublic },
                ].map(t => (
                  <div key={t.label} className="pr-opt">
                    <span><b>{t.label}</b><small>{t.desc}</small></span>
                    <Toggle on={t.state} onChange={t.set} label={t.label} />
                  </div>
                ))}
              </Panel>
              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <button type="button" className="ak-btn go" onClick={() => { setSettingsSaved(true); setTimeout(() => setSettingsSaved(false), 2000) }}>
                  {settingsSaved ? 'Saved' : 'Save changes'}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Scorer */}
        {selected && (
          <aside className="ak-panel pr-side" aria-label="Score this idea">
            <div className="pr-side-h">
              <h2>{selected.title}</h2>
              <button type="button" className="ak-icon-btn" onClick={() => setSelected(null)} aria-label="Close">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
              </button>
            </div>
            {selQ && <p className="pr-quad" style={{ '--q': selQ.color } as React.CSSProperties}><b>{selQ.label}</b>{selQ.desc}</p>}
            <div className="pr-sliders">
              <Slider label="Impact: how much it matters" value={selected.impact ?? 3}
                onChange={(v: number) => { setSelected(p => p ? { ...p, impact: v } : null); updateIdea(selected.id, { impact: v }) }} color="#10b981" />
              <Slider label="Effort: time to build" value={selected.effort ?? 3}
                onChange={(v: number) => { setSelected(p => p ? { ...p, effort: v } : null); updateIdea(selected.id, { effort: v }) }} color="#ef4444" />
              <Slider label="Confidence: how sure you are" value={selected.confidence ?? 3}
                onChange={(v: number) => { setSelected(p => p ? { ...p, confidence: v } : null); updateIdea(selected.id, { confidence: v }) }} color="#7c3aed" />
              <Slider label={`Reach: people it helps (${selected.votes || 0} votes)`} value={selected.reach ?? Math.min(selected.votes || 1, 5)}
                onChange={(v: number) => { setSelected(p => p ? { ...p, reach: v } : null); updateIdea(selected.id, { reach: v }) }} color="#2563eb" />
            </div>
            <div className="pr-scores">
              <div><small>RICE score</small><b>{riceScore(selected.reach ?? 1, selected.impact ?? 3, selected.confidence ?? 3, selected.effort ?? 3)}</b></div>
              <div><small>Value for effort</small><b>{valueScore(selected.impact ?? 3, selected.effort ?? 3).toFixed(1)}×</b></div>
            </div>
            <span className="ak-label" style={{ marginTop: 16 }}>Priority</span>
            <div className="pr-prio" role="radiogroup" aria-label="Priority">
              {[
                { value: 'critical', label: 'Critical', color: '#ef4444' },
                { value: 'high', label: 'High', color: '#f59e0b' },
                { value: 'medium', label: 'Medium', color: '#8b5cf6' },
                { value: 'low', label: 'Low', color: '#a1a1aa' },
              ].map(p => (
                <button key={p.value} type="button" role="radio" aria-checked={selected.priority === p.value}
                  className={selected.priority === p.value ? 'on' : ''} onClick={() => updateIdea(selected.id, { priority: p.value })}>
                  <i style={{ background: p.color }} />{p.label}
                </button>
              ))}
            </div>
            {saving === selected.id && <p className="ak-hint" style={{ textAlign: 'center' }}>Saving…</p>}
          </aside>
        )}
      </div>
      <style>{PR_CSS}</style>
    </AdminPage>
  )
}

const PR_CSS = `
.pr-cols{display:grid;grid-template-columns:minmax(0,1fr);gap:14px;align-items:start}
.pr-cols.open{grid-template-columns:minmax(0,1fr) 330px}
@media (max-width:1000px){.pr-cols.open{grid-template-columns:minmax(0,1fr)}}
.pr-side{position:sticky;top:76px;margin:0;max-height:calc(100vh - 96px);overflow-y:auto}
.pr-side-h{display:flex;align-items:flex-start;gap:8px;margin-bottom:12px}
.pr-side-h h2{flex:1;min-width:0;margin:4px 0 0;font-family:var(--font-display),-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:17px;font-weight:700;letter-spacing:-.02em;line-height:1.3;color:var(--ink)}
.pr-quad{margin:0 0 16px;padding:10px 13px;border-radius:14px;background:color-mix(in srgb,var(--q) 11%,var(--card,#fff));font-size:12.5px;color:var(--q)}
.pr-quad b{display:block;font-size:13.5px}
.pr-sliders{display:flex;flex-direction:column;gap:16px}
.pr-scores{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:18px}
.pr-scores div{padding:12px;border-radius:16px;background:var(--f);text-align:center}
.pr-scores small{display:block;font-size:12px;font-weight:600;color:var(--mut)}
.pr-scores b{display:block;margin-top:2px;font-family:var(--font-display),-apple-system,sans-serif;font-size:26px;font-weight:700;letter-spacing:-.03em;color:var(--ink)}
.pr-prio{display:grid;grid-template-columns:1fr 1fr;gap:6px}
.pr-prio button{display:flex;align-items:center;gap:8px;height:38px;padding:0 12px;border:none;border-radius:12px;background:var(--f);font:inherit;font-size:13.5px;font-weight:600;color:var(--ink);cursor:pointer}
.pr-prio button:hover{background:var(--f2)}
.pr-prio button.on{background:var(--card,#fff);box-shadow:0 0 0 2px var(--ink)}
.pr-prio i{width:9px;height:9px;border-radius:50%}
.pr-legend{display:flex;flex-wrap:wrap;gap:6px 16px;margin-bottom:14px}
.pr-legend span{display:inline-flex;align-items:center;gap:7px;font-size:13px;font-weight:600;color:var(--ink)}
.pr-legend i{width:9px;height:9px;border-radius:50%}
.pr-legend em{font-style:normal;font-weight:500;color:var(--soft)}
.pr-matrix{position:relative;height:540px;padding:8px 8px 30px 30px}
.pr-axis{position:absolute;font-size:12.5px;font-weight:650;color:var(--soft)}
.pr-axis.y{left:-10px;top:50%;transform:translateY(-50%) rotate(-90deg)}
.pr-axis.x{left:50%;bottom:4px;transform:translateX(-50%)}
.pr-plot{position:relative;width:100%;height:100%;display:grid;grid-template-columns:1fr 1fr;grid-template-rows:1fr 1fr;gap:6px}
.pr-q{position:relative;border-radius:18px;background:color-mix(in srgb,var(--q) 7%,var(--card,#fff))}
.pr-q span{position:absolute;top:12px;left:14px;font-size:12.5px;font-weight:650;color:var(--q)}
.pr-q.quick_win{order:1}.pr-q.major{order:2}.pr-q.fill_in{order:3}.pr-q.thankless{order:4}
.pr-q.major span,.pr-q.thankless span{left:auto;right:14px}
.pr-q.fill_in span,.pr-q.thankless span{top:auto;bottom:12px}
.pr-dot{position:absolute;transform:translate(-50%,-50%);display:inline-flex;align-items:center;justify-content:center;padding:0;border:2.5px solid var(--card,#fff);border-radius:50%;color:#fff;font:inherit;font-size:12px;font-weight:700;cursor:pointer;box-shadow:0 4px 12px -4px color-mix(in srgb,var(--q) 70%,transparent);transition:width .15s,height .15s}
.pr-dot.on{box-shadow:0 0 0 4px color-mix(in srgb,var(--q) 30%,transparent)}
.pr-tip{position:absolute;left:50%;bottom:calc(100% + 8px);transform:translateX(-50%);width:210px;padding:10px 12px;border-radius:14px;background:var(--card,#fff);box-shadow:0 0 0 1px rgba(0,0,0,.06),0 14px 30px -12px rgba(16,24,40,.3);text-align:left;pointer-events:none}
.pr-tip b{display:block;font-size:13px;font-weight:650;color:var(--ink);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.pr-tip small{display:block;margin-top:2px;font-size:12px;font-weight:500;color:var(--mut)}
.pr-tip em{display:block;margin-top:3px;font-style:normal;font-size:12px;font-weight:650}
.pr-table th.c,.pr-table td.c{text-align:center}
.pr-table th button{padding:0;border:none;background:none;font:inherit;color:inherit;cursor:pointer}
.pr-table th button.on{color:var(--ink)}
.pr-table tr.on td{background:var(--f)}
.pr-title{display:flex;align-items:center;gap:10px;max-width:340px;font-weight:600}
.pr-title em{flex-shrink:0;width:22px;height:22px;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;background:var(--f);font-style:normal;font-size:11.5px;font-weight:650;color:var(--mut)}
.pr-votes{display:inline-flex;align-items:center;height:24px;padding:0 9px;border-radius:999px;background:var(--f);font-weight:650}
.pr-dots{display:inline-flex;gap:4px}
.pr-dots button{width:12px;height:12px;padding:0;border:none;border-radius:50%;background:var(--f2);cursor:pointer;transition:transform .12s,background .15s}
.pr-dots button.on{background:var(--coral)}
.pr-dots button:hover{transform:scale(1.25)}
.pr-qtag{display:inline-flex;align-items:center;gap:6px;height:24px;padding:0 10px;border-radius:999px;background:color-mix(in srgb,var(--q) 12%,var(--card,#fff));font-size:12px;font-weight:650;color:var(--q);white-space:nowrap}
.pr-qtag i{width:7px;height:7px;border-radius:50%;background:var(--q)}
.pr-rice-key{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px}
@media (max-width:700px){.pr-rice-key{grid-template-columns:1fr 1fr}}
.pr-rice-key div{padding:12px;border-radius:16px;background:color-mix(in srgb,var(--q) 8%,var(--card,#fff))}
.pr-rice-key b{display:block;font-family:var(--font-display),-apple-system,sans-serif;font-size:22px;font-weight:700;color:var(--q)}
.pr-rice-key span{display:block;font-size:13px;font-weight:650;color:var(--ink)}
.pr-rice-key small{display:block;font-size:12px;color:var(--mut)}
button.pr-rice{width:100%;border:none;background:none;font:inherit;text-align:left;cursor:pointer}
.pr-rank{width:28px;height:28px;flex-shrink:0;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;background:var(--f);font-size:12.5px;font-weight:700;color:var(--mut)}
.pr-rank.top{background:color-mix(in srgb,var(--coral) 14%,var(--card,#fff));color:var(--coral)}
.pr-rice-top{display:flex;align-items:center;gap:8px;min-width:0}
.pr-rice-top b{min-width:0}
.pr-bar{display:block;height:6px;margin-top:8px;border-radius:999px;background:var(--f);overflow:hidden}
.pr-bar i{display:block;height:100%;border-radius:999px}
.pr-rice-n{flex-shrink:0;display:flex;flex-direction:column;align-items:flex-end;gap:1px}
.pr-rice-n small{font-size:11.5px;color:var(--soft);white-space:nowrap}
.pr-rice-n b{font-family:var(--font-display),-apple-system,sans-serif;font-size:20px;font-weight:700;color:var(--ink)}
@media (max-width:640px){.pr-rice-n small{display:none}}
.pr-opt{display:flex;align-items:center;justify-content:space-between;gap:14px;padding:12px 0}
.pr-opt+.pr-opt{box-shadow:0 -1px 0 var(--line)}
.pr-opt b{display:block;font-size:14px;font-weight:600;color:var(--ink)}
.pr-opt small{display:block;margin-top:1px;font-size:12.5px;color:var(--soft)}
@media (max-width:640px){.pr-matrix{height:420px}}
`
