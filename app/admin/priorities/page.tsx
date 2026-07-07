'use client'

import { useState, useEffect, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import Link from 'next/link'


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
      const { data } = await (supabase as any).from('ideas').select('id,title,votes,status,priority,effort,impact,confidence,reach,created_at').order('votes', { ascending: false })
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
    <div>
      <div className="flex items-center justify-between mb-1">
        <label className="text-xs font-medium" style={{ color: 'var(--slate)' }}>{label}</label>
        <span className="text-xs font-bold w-6 text-center" style={{ color }}>{value}</span>
      </div>
      <input type="range" min={1} max={5} step={1} value={value}
        onChange={e => onChange(parseInt(e.target.value))}
        className="w-full h-1.5 rounded-full appearance-none cursor-pointer"
        style={{ accentColor: color }} />
      <div className="flex justify-between text-xs mt-0.5" style={{ color: 'var(--slate)' }}>
        <span>Low</span><span>High</span>
      </div>
    </div>
  )

  const rice = ideas.map(i => ({ ...i, rice: riceScore(i.reach ?? 1, i.impact ?? 3, i.confidence ?? 3, i.effort ?? 3), value: valueScore(i.impact ?? 3, i.effort ?? 3) }))
  const sorted = [...rice].sort((a, b) => {
    if (sortBy === 'rice') return b.rice - a.rice
    if (sortBy === 'value') return b.value - a.value
    if (sortBy === 'votes') return (b.votes || 0) - (a.votes || 0)
    return (b.impact ?? 0) - (a.impact ?? 0)
  })

  if (!user || loading) return <div className="p-8" style={{ color: 'var(--slate)' }}>Loading...</div>

  return (
    <div className="flex min-h-[calc(100vh-56px)]">
      {/* Main */}
      <div className="flex-1 overflow-y-auto">
        <div className="px-6 py-6 max-w-7xl mx-auto">
          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-2xl font-bold" style={{ color: 'var(--ink)' }}>Prioritization</h1>
              <p className="text-sm mt-0.5" style={{ color: 'var(--slate)' }}>
                Score and rank ideas by impact, effort, reach, and confidence
              </p>
            </div>
            <div className="flex gap-1 p-1 rounded-xl" style={{ background: 'var(--canvas)', border: '1px solid var(--border)' }}>
              {[
                { key: 'matrix', label: '⊞ Matrix' },
                { key: 'table',  label: '≡ Table' },
                { key: 'rice',   label: '⚡ RICE' },
                { key: 'settings', label: '⚙ Settings' },
              ].map(v => (
                <button key={v.key} onClick={() => setView(v.key as any)}
                  className="px-3 py-1.5 rounded-lg text-sm font-semibold cursor-pointer transition-all"
                  style={{ background: view === v.key ? 'white' : 'transparent', color: view === v.key ? 'var(--coral)' : 'var(--slate)', boxShadow: view === v.key ? '0 1px 3px rgba(0,0,0,0.1)' : 'none' }}>
                  {v.label}
                </button>
              ))}
            </div>
          </div>

          {/* Quadrant legend */}
          {view === 'matrix' && (
            <div className="flex gap-3 mb-4 flex-wrap">
              {QUADRANTS.map(q => (
                <div key={q.key} className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium" style={{ background: q.bg, color: q.color }}>
                  <div className="w-2 h-2 rounded-full" style={{ background: q.color }} />
                  {q.label} — {q.desc}
                </div>
              ))}
            </div>
          )}

          {/* MATRIX VIEW */}
          {view === 'matrix' && (
            <div className="bg-white rounded-2xl border overflow-hidden" style={{ borderColor: 'var(--border)' }}>
              <div className="relative" style={{ height: 520 }} ref={matrixRef}>
                {/* Axes */}
                <div className="absolute inset-0 flex">
                  {/* Y axis label */}
                  <div className="absolute left-2 top-1/2 -translate-y-1/2 -rotate-90 text-xs font-bold uppercase tracking-widest whitespace-nowrap" style={{ color: 'var(--slate)' }}>
                    Impact ↑
                  </div>
                  {/* X axis label */}
                  <div className="absolute bottom-2 left-1/2 -translate-x-1/2 text-xs font-bold uppercase tracking-widest" style={{ color: 'var(--slate)' }}>
                    Effort →
                  </div>

                  {/* Grid */}
                  <div className="absolute inset-8">
                    {/* Quadrant backgrounds */}
                    <div className="absolute inset-0 grid grid-cols-2 grid-rows-2">
                      <div className="rounded-tl-xl" style={{ background: '#ecfdf520', border: '1px dashed #10b98130' }} />
                      <div className="rounded-tr-xl" style={{ background: '#fffbeb20', border: '1px dashed #f59e0b30' }} />
                      <div className="rounded-bl-xl" style={{ background: '#f9fafb20', border: '1px dashed #6b728030' }} />
                      <div className="rounded-br-xl" style={{ background: '#fef2f220', border: '1px dashed #ef444430' }} />
                    </div>

                    {/* Quadrant labels */}
                    <div className="absolute top-2 left-4 text-xs font-bold" style={{ color: '#10b981' }}>⚡ Quick Wins</div>
                    <div className="absolute top-2 right-4 text-xs font-bold" style={{ color: '#f59e0b' }}>🏗 Major Projects</div>
                    <div className="absolute bottom-2 left-4 text-xs font-bold" style={{ color: '#9ca3af' }}>📋 Fill Ins</div>
                    <div className="absolute bottom-2 right-4 text-xs font-bold" style={{ color: '#ef4444' }}>⚠️ Thankless Tasks</div>

                    {/* Center crosshair */}
                    <div className="absolute top-0 bottom-0 left-1/2 border-l border-dashed" style={{ borderColor: 'var(--border)' }} />
                    <div className="absolute left-0 right-0 top-1/2 border-t border-dashed" style={{ borderColor: 'var(--border)' }} />

                    {/* Ideas as dots */}
                    {ideas.map(idea => {
                      const pos = getMatrixPos(idea)
                      const q = QUADRANTS.find(q => q.key === getQuadrant(idea.effort ?? 3, idea.impact ?? 3))
                      const isSelected = selected?.id === idea.id
                      const isHovered = hoveredIdea === idea.id
                      return (
                        <button
                          key={idea.id}
                          onClick={() => setSelected(isSelected ? null : idea)}
                          onMouseEnter={() => setHoveredIdea(idea.id)}
                          onMouseLeave={() => setHoveredIdea(null)}
                          className="absolute cursor-pointer transition-all"
                          style={{
                            left: `${pos.x}%`,
                            top: `${pos.y}%`,
                            transform: 'translate(-50%, -50%)',
                            zIndex: isSelected || isHovered ? 20 : 10,
                          }}>
                          <div className="relative">
                            <div className="rounded-full border-2 border-white shadow-md flex items-center justify-center text-white text-xs font-bold transition-all"
                              style={{
                                width: isSelected ? 40 : isHovered ? 36 : Math.max(28, Math.min(44, 24 + (idea.votes || 0))),
                                height: isSelected ? 40 : isHovered ? 36 : Math.max(28, Math.min(44, 24 + (idea.votes || 0))),
                                background: q?.color || 'var(--coral)',
                                boxShadow: isSelected ? `0 0 0 3px ${q?.color}40` : 'none',
                              }}>
                              {idea.votes || 0}
                            </div>
                            {(isHovered || isSelected) && (
                              <div className="absolute left-1/2 -translate-x-1/2 bottom-full mb-2 bg-white rounded-xl shadow-xl border px-3 py-2 w-48 text-left z-30"
                                style={{ borderColor: 'var(--border)' }}>
                                <p className="text-xs font-bold truncate" style={{ color: 'var(--ink)' }}>{idea.title}</p>
                                <div className="flex gap-2 mt-1">
                                  <span className="text-xs" style={{ color: 'var(--slate)' }}>Impact: {idea.impact}</span>
                                  <span className="text-xs" style={{ color: 'var(--slate)' }}>Effort: {idea.effort}</span>
                                </div>
                                <div className="text-xs mt-0.5" style={{ color: q?.color }}>
                                  {q?.label}
                                </div>
                              </div>
                            )}
                          </div>
                        </button>
                      )
                    })}
                  </div>
                </div>

                {/* Axis tick labels */}
                <div className="absolute bottom-6 left-8 right-8 flex justify-between text-xs" style={{ color: 'var(--slate)' }}>
                  <span>1</span><span>2</span><span>3</span><span>4</span><span>5</span>
                </div>
                <div className="absolute top-8 bottom-8 left-4 flex flex-col justify-between text-xs" style={{ color: 'var(--slate)' }}>
                  <span>5</span><span>4</span><span>3</span><span>2</span><span>1</span>
                </div>
              </div>
            </div>
          )}

          {/* TABLE VIEW */}
          {view === 'table' && (
            <div className="bg-white rounded-2xl border overflow-hidden" style={{ borderColor: 'var(--border)' }}>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b" style={{ borderColor: 'var(--border)', background: 'var(--canvas)' }}>
                      <th className="text-left px-4 py-3 font-semibold" style={{ color: 'var(--slate)' }}>Idea</th>
                      <th className="px-4 py-3 font-semibold text-center" style={{ color: 'var(--slate)' }}>Votes</th>
                      <th className="px-4 py-3 font-semibold text-center cursor-pointer" onClick={() => setSortBy('impact')} style={{ color: sortBy === 'impact' ? 'var(--coral)' : 'var(--slate)' }}>Impact</th>
                      <th className="px-4 py-3 font-semibold text-center" style={{ color: 'var(--slate)' }}>Effort</th>
                      <th className="px-4 py-3 font-semibold text-center" style={{ color: 'var(--slate)' }}>Confidence</th>
                      <th className="px-4 py-3 font-semibold text-center cursor-pointer" onClick={() => setSortBy('value')} style={{ color: sortBy === 'value' ? 'var(--coral)' : 'var(--slate)' }}>Value ↕</th>
                      <th className="px-4 py-3 font-semibold text-center" style={{ color: 'var(--slate)' }}>Quadrant</th>
                      <th className="px-4 py-3 font-semibold text-center" style={{ color: 'var(--slate)' }}>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sorted.map((idea, i) => {
                      const q = QUADRANTS.find(q => q.key === getQuadrant(idea.effort ?? 3, idea.impact ?? 3))
                      return (
                        <tr key={idea.id} className="border-b hover:bg-gray-50 transition-all cursor-pointer"
                          style={{ borderColor: 'var(--border)' }}
                          onClick={() => setSelected(selected?.id === idea.id ? null : idea)}>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-bold w-5 text-center" style={{ color: 'var(--slate)' }}>#{i+1}</span>
                              <span className="font-medium truncate max-w-48" style={{ color: 'var(--ink)' }}>{idea.title}</span>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-center font-bold" style={{ color: 'var(--coral)' }}>▲{idea.votes || 0}</td>
                          {['impact','effort','confidence'].map(field => (
                            <td key={field} className="px-4 py-3 text-center">
                              <div className="flex items-center justify-center gap-1">
                                {[1,2,3,4,5].map(v => (
                                  <button key={v} onClick={e => { e.stopPropagation(); updateIdea(idea.id, { [field]: v } as any) }}
                                    className="w-3.5 h-3.5 rounded-full cursor-pointer transition-all hover:scale-125"
                                    style={{ background: v <= (idea as any)[field] ? 'var(--coral)' : 'var(--border)' }} />
                                ))}
                              </div>
                            </td>
                          ))}
                          <td className="px-4 py-3 text-center">
                            <span className="text-sm font-bold" style={{ color: 'var(--ink)' }}>{idea.value.toFixed(1)}x</span>
                          </td>
                          <td className="px-4 py-3 text-center">
                            <span className="px-2 py-1 rounded-full text-xs font-semibold" style={{ background: q?.bg, color: q?.color }}>
                              {q?.label}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-center">
                            <button onClick={e => { e.stopPropagation(); setSelected(idea) }}
                              className="px-3 py-1 rounded-lg text-xs font-semibold cursor-pointer border hover:bg-gray-50"
                              style={{ borderColor: 'var(--border)', color: 'var(--ink)' }}>
                              Score
                            </button>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* RICE VIEW */}
          {view === 'rice' && (
            <div className="space-y-4">
              <div className="bg-white rounded-2xl border p-5" style={{ borderColor: 'var(--border)' }}>
                <h3 className="font-bold mb-1" style={{ color: 'var(--ink)' }}>RICE Scoring Framework</h3>
                <p className="text-sm" style={{ color: 'var(--slate)' }}>
                  <strong>R</strong>each × <strong>I</strong>mpact × <strong>C</strong>onfidence ÷ <strong>E</strong>ffort — higher score = higher priority
                </p>
                <div className="grid grid-cols-4 gap-4 mt-4">
                  {[
                    { label: 'Reach', desc: 'How many users affected', color: '#2563eb' },
                    { label: 'Impact', desc: 'How much it moves the needle', color: '#10b981' },
                    { label: 'Confidence', desc: 'How confident in estimates', color: '#7c3aed' },
                    { label: 'Effort', desc: 'Team-weeks to ship', color: '#ef4444' },
                  ].map(f => (
                    <div key={f.label} className="p-3 rounded-xl text-center" style={{ background: f.color + '10' }}>
                      <p className="font-bold text-lg" style={{ color: f.color }}>{f.label[0]}</p>
                      <p className="font-semibold text-xs" style={{ color: f.color }}>{f.label}</p>
                      <p className="text-xs mt-1" style={{ color: 'var(--slate)' }}>{f.desc}</p>
                    </div>
                  ))}
                </div>
              </div>

              <div className="bg-white rounded-2xl border overflow-hidden" style={{ borderColor: 'var(--border)' }}>
                <div className="px-4 py-3 border-b flex items-center justify-between" style={{ borderColor: 'var(--border)' }}>
                  <p className="font-semibold text-sm" style={{ color: 'var(--ink)' }}>Ranked by RICE Score</p>
                  <button onClick={() => setSortBy('rice')}
                    className="text-xs px-3 py-1 rounded-lg cursor-pointer"
                    style={{ background: 'var(--peach)', color: 'var(--coral)' }}>
                    Sort by RICE
                  </button>
                </div>
                <div className="divide-y" style={{ borderColor: 'var(--border)' }}>
                  {sorted.map((idea, i) => {
                    const maxRice = Math.max(...sorted.map(s => s.rice), 1)
                    const q = QUADRANTS.find(q => q.key === getQuadrant(idea.effort ?? 3, idea.impact ?? 3))
                    return (
                      <div key={idea.id} className="px-5 py-4 hover:bg-gray-50 cursor-pointer transition-all"
                        onClick={() => setSelected(selected?.id === idea.id ? null : idea)}>
                        <div className="flex items-center justify-between gap-4 mb-2">
                          <div className="flex items-center gap-3 min-w-0">
                            <span className="text-xs font-black w-6" style={{ color: i < 3 ? 'var(--coral)' : 'var(--slate)' }}>#{i+1}</span>
                            <p className="font-semibold text-sm truncate" style={{ color: 'var(--ink)' }}>{idea.title}</p>
                            <span className="px-2 py-0.5 rounded-full text-xs font-semibold shrink-0" style={{ background: q?.bg, color: q?.color }}>{q?.label}</span>
                          </div>
                          <div className="flex items-center gap-4 shrink-0 text-xs" style={{ color: 'var(--slate)' }}>
                            <span>R:{idea.reach}</span>
                            <span>I:{idea.impact}</span>
                            <span>C:{idea.confidence}</span>
                            <span>E:{idea.effort}</span>
                            <span className="text-base font-black" style={{ color: 'var(--coral)' }}>{idea.rice}</span>
                          </div>
                        </div>
                        <div className="h-2 rounded-full overflow-hidden" style={{ background: 'var(--border)' }}>
                          <div className="h-full rounded-full transition-all" style={{ width: `${(idea.rice / maxRice) * 100}%`, background: q?.color || 'var(--coral)' }} />
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>
          )}

          {/* Prioritization Settings View */}
          {view === 'settings' && (
            <div style={{ maxWidth: 700 }}>
              {/* Benefit Factors */}
              <div style={{ marginBottom: 28, borderRadius: 14, border: '1px solid var(--border)', background: '#fff', overflow: 'hidden' }}>
                <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--coral)" strokeWidth="2" strokeLinecap="round"><polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/></svg>
                    <h3 style={{ fontWeight: 700, fontSize: 14, color: 'var(--ink)', margin: 0 }}>Benefit Factors</h3>
                  </div>
                  <p style={{ fontSize: 12, color: 'var(--slate)', margin: 0 }}>Benefits can include customer value, strategic value, revenue potential and cost reduction.</p>
                </div>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead><tr style={{ borderBottom: '1px solid var(--border)', background: 'var(--canvas)' }}>
                    <th style={{ textAlign: 'left', padding: '10px 16px', fontWeight: 600, color: 'var(--slate)' }}>Benefit Factor</th>
                    <th style={{ textAlign: 'left', padding: '10px 16px', fontWeight: 600, color: 'var(--slate)' }}>Type</th>
                    <th style={{ textAlign: 'left', padding: '10px 16px', fontWeight: 600, color: 'var(--slate)' }}>Weight</th>
                    <th style={{ width: 40 }} />
                  </tr></thead>
                  <tbody>
                    {benefitFactors.map((f, i) => (
                      <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
                        <td style={{ padding: '10px 16px' }}><input value={f.name} onChange={e => { const n=[...benefitFactors]; n[i]={...n[i],name:e.target.value}; setBenefitFactors(n) }} style={{ border:'1px solid var(--border)', borderRadius:6, padding:'5px 8px', fontSize:13, outline:'none', width:'100%' }} /></td>
                        <td style={{ padding: '10px 16px' }}><select value={f.type} onChange={e => { const n=[...benefitFactors]; n[i]={...n[i],type:e.target.value}; setBenefitFactors(n) }} style={{ border:'1px solid var(--border)', borderRadius:6, padding:'5px 8px', fontSize:13, outline:'none' }}>{['Vote Count','Percentage','1-5','0-10','Currency'].map(t => <option key={t}>{t}</option>)}</select></td>
                        <td style={{ padding: '10px 16px' }}><select value={f.weight} onChange={e => { const n=[...benefitFactors]; n[i]={...n[i],weight:parseInt(e.target.value)}; setBenefitFactors(n) }} style={{ border:'1px solid var(--border)', borderRadius:6, padding:'5px 8px', fontSize:13, outline:'none' }}>{[10,20,25,33,50,75,100].map(w => <option key={w} value={w}>{w}%</option>)}</select></td>
                        <td style={{ padding: '0 8px' }}><button type="button" onClick={() => setBenefitFactors(benefitFactors.filter((_,j)=>j!==i))} style={{ color:'#ef4444', background:'none', border:'none', cursor:'pointer', fontSize:18 }}>×</button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div style={{ padding: '12px 16px' }}><button type="button" onClick={() => setBenefitFactors([...benefitFactors, { name: 'New Factor', type: 'Percentage', weight: 100 }])} style={{ fontSize:13, color:'var(--coral)', background:'none', border:'none', cursor:'pointer', fontWeight:600 }}>+ Add a new factor</button></div>
              </div>

              {/* Cost Factors */}
              <div style={{ marginBottom: 28, borderRadius: 14, border: '1px solid var(--border)', background: '#fff', overflow: 'hidden' }}>
                <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2" strokeLinecap="round"><polyline points="22 17 13.5 8.5 8.5 13.5 2 7"/><polyline points="16 17 22 17 22 11"/></svg>
                    <h3 style={{ fontWeight: 700, fontSize: 14, color: 'var(--ink)', margin: 0 }}>Cost Factors</h3>
                  </div>
                  <p style={{ fontSize: 12, color: 'var(--slate)', margin: 0 }}>Costs encompass how hard or expensive it is to build an Idea. Common examples: Effort, Developer difficulty, Person months.</p>
                </div>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead><tr style={{ borderBottom: '1px solid var(--border)', background: 'var(--canvas)' }}>
                    <th style={{ textAlign: 'left', padding: '10px 16px', fontWeight: 600, color: 'var(--slate)' }}>Cost Factor</th>
                    <th style={{ textAlign: 'left', padding: '10px 16px', fontWeight: 600, color: 'var(--slate)' }}>Type</th>
                    <th style={{ textAlign: 'left', padding: '10px 16px', fontWeight: 600, color: 'var(--slate)' }}>Weight</th>
                    <th style={{ width: 40 }} />
                  </tr></thead>
                  <tbody>
                    {costFactors.map((f, i) => (
                      <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
                        <td style={{ padding: '10px 16px' }}><input value={f.name} onChange={e => { const n=[...costFactors]; n[i]={...n[i],name:e.target.value}; setCostFactors(n) }} style={{ border:'1px solid var(--border)', borderRadius:6, padding:'5px 8px', fontSize:13, outline:'none', width:'100%' }} /></td>
                        <td style={{ padding: '10px 16px' }}><select value={f.type} onChange={e => { const n=[...costFactors]; n[i]={...n[i],type:e.target.value}; setCostFactors(n) }} style={{ border:'1px solid var(--border)', borderRadius:6, padding:'5px 8px', fontSize:13, outline:'none' }}>{['0-5','1-5','Percentage','Hours','Days'].map(t => <option key={t}>{t}</option>)}</select></td>
                        <td style={{ padding: '10px 16px' }}><select value={f.weight} onChange={e => { const n=[...costFactors]; n[i]={...n[i],weight:parseInt(e.target.value)}; setCostFactors(n) }} style={{ border:'1px solid var(--border)', borderRadius:6, padding:'5px 8px', fontSize:13, outline:'none' }}>{[10,20,25,33,50,75,100].map(w => <option key={w} value={w}>{w}%</option>)}</select></td>
                        <td style={{ padding: '0 8px' }}><button type="button" onClick={() => setCostFactors(costFactors.filter((_,j)=>j!==i))} style={{ color:'#ef4444', background:'none', border:'none', cursor:'pointer', fontSize:18 }}>×</button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div style={{ padding: '12px 16px' }}><button type="button" onClick={() => setCostFactors([...costFactors, { name: 'New Factor', type: '0-5', weight: 100 }])} style={{ fontSize:13, color:'var(--coral)', background:'none', border:'none', cursor:'pointer', fontWeight:600 }}>+ Add a new factor</button></div>
              </div>

              {/* Display Options */}
              <div style={{ marginBottom: 28, borderRadius: 14, border: '1px solid var(--border)', background: '#fff', padding: '16px 20px' }}>
                <h3 style={{ fontWeight: 700, fontSize: 14, color: 'var(--ink)', margin: '0 0 14px 0' }}>Display Options</h3>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingBottom: 14, borderBottom: '1px solid var(--border)', marginBottom: 14 }}>
                  <div><p style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink)', margin: 0 }}>Priority score display</p><p style={{ fontSize: 12, color: 'var(--slate)', margin: '2px 0 0 0' }}>Choose how to display the priority score</p></div>
                  <select style={{ border:'1px solid var(--border)', borderRadius:8, padding:'6px 10px', fontSize:13, outline:'none' }}><option>Score &amp; label</option><option>Score only</option><option>Label only</option></select>
                </div>
                {[
                  { label: 'Show priority score', desc: 'Show/hide priority scores in your Board & Roadmap', state: showPriorityScore, set: setShowPriorityScore },
                  { label: 'Normalize priority scores', desc: 'Normalize priority scores (0-100)', state: normalizeScores, set: setNormalizeScores },
                  { label: 'Make priority scores public', desc: 'Show priority scores to users on the public board', state: scorePublic, set: setScorePublic },
                ].map(tog => (
                  <div key={tog.label} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingBottom: 14, marginBottom: 14, borderBottom: '1px solid var(--border)' }}>
                    <div><p style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink)', margin: 0 }}>{tog.label}</p><p style={{ fontSize: 12, color: 'var(--slate)', margin: '2px 0 0 0' }}>{tog.desc}</p></div>
                    <button type="button" onClick={() => tog.set(!tog.state)} style={{ width:40, height:22, borderRadius:11, background: tog.state ? 'var(--coral)' : '#d1d5db', border:'none', cursor:'pointer', position:'relative', transition:'background 0.2s', flexShrink:0 }}>
                      <span style={{ position:'absolute', top:3, left: tog.state ? 21 : 3, width:16, height:16, background:'#fff', borderRadius:'50%', transition:'left 0.2s', boxShadow:'0 1px 3px rgba(0,0,0,0.2)' }} />
                    </button>
                  </div>
                ))}
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 32 }}>
                <button type="button" onClick={() => { setSettingsSaved(true); setTimeout(()=>setSettingsSaved(false), 2000) }} style={{ padding:'10px 24px', borderRadius:10, background:'var(--coral)', color:'#fff', border:'none', fontSize:14, fontWeight:700, cursor:'pointer' }}>
                  {settingsSaved ? '✓ Saved!' : 'Save changes'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Right panel - Idea scorer */}
      {selected && (
        <aside className="w-80 shrink-0 bg-white border-l overflow-y-auto" style={{ borderColor: 'var(--border)' }}>
          <div className="p-5">
            <div className="flex items-start justify-between mb-4">
              <h3 className="font-bold text-sm leading-tight pr-2" style={{ color: 'var(--ink)' }}>{selected.title}</h3>
              <button onClick={() => setSelected(null)} className="text-lg cursor-pointer shrink-0" style={{ color: 'var(--slate)' }}>×</button>
            </div>

            {/* Current quadrant */}
            {(() => {
              const q = QUADRANTS.find(q => q.key === getQuadrant(selected.effort ?? 3, selected.impact ?? 3))
              return (
                <div className="px-4 py-3 rounded-xl mb-4" style={{ background: q?.bg }}>
                  <p className="font-bold text-sm" style={{ color: q?.color }}>{q?.label}</p>
                  <p className="text-xs" style={{ color: q?.color }}>{q?.desc}</p>
                </div>
              )
            })()}

            {/* Scores */}
            <div className="space-y-5 mb-5">
              <Slider label="Impact (how much it matters)" value={selected.impact ?? 3}
                onChange={(v: number) => { setSelected(p => p ? { ...p, impact: v } : null); updateIdea(selected.id, { impact: v }) }}
                color="#10b981" />
              <Slider label="Effort (time to build)" value={selected.effort ?? 3}
                onChange={(v: number) => { setSelected(p => p ? { ...p, effort: v } : null); updateIdea(selected.id, { effort: v }) }}
                color="#ef4444" />
              <Slider label="Confidence (certainty)" value={selected.confidence ?? 3}
                onChange={(v: number) => { setSelected(p => p ? { ...p, confidence: v } : null); updateIdea(selected.id, { confidence: v }) }}
                color="#7c3aed" />
              <Slider label={`Reach (users affected — votes: ${selected.votes || 0})`} value={selected.reach ?? Math.min(selected.votes || 1, 5)}
                onChange={(v: number) => { setSelected(p => p ? { ...p, reach: v } : null); updateIdea(selected.id, { reach: v }) }}
                color="#2563eb" />
            </div>

            {/* Scores summary */}
            <div className="grid grid-cols-2 gap-3 mb-4">
              <div className="p-3 rounded-xl text-center" style={{ background: 'var(--peach)' }}>
                <p className="text-xs font-medium mb-0.5" style={{ color: 'var(--slate)' }}>RICE Score</p>
                <p className="text-2xl font-black" style={{ color: 'var(--coral)' }}>
                  {riceScore(selected.reach ?? 1, selected.impact ?? 3, selected.confidence ?? 3, selected.effort ?? 3)}
                </p>
              </div>
              <div className="p-3 rounded-xl text-center" style={{ background: 'var(--canvas)' }}>
                <p className="text-xs font-medium mb-0.5" style={{ color: 'var(--slate)' }}>Value / Effort</p>
                <p className="text-2xl font-black" style={{ color: 'var(--ink)' }}>
                  {valueScore(selected.impact ?? 3, selected.effort ?? 3).toFixed(1)}x
                </p>
              </div>
            </div>

            {/* Priority label */}
            <div>
              <label className="text-xs font-medium block mb-2" style={{ color: 'var(--slate)' }}>Priority Label</label>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { value: 'critical', label: '🔴 Critical', color: '#ef4444', bg: '#fef2f2' },
                  { value: 'high',     label: '🟠 High',     color: '#f59e0b', bg: '#fffbeb' },
                  { value: 'medium',   label: '🟡 Medium',   color: '#8b5cf6', bg: '#faf5ff' },
                  { value: 'low',      label: '⚪ Low',      color: '#6b7280', bg: '#f9fafb' },
                ].map(p => (
                  <button key={p.value} onClick={() => updateIdea(selected.id, { priority: p.value })}
                    className="px-2 py-2 rounded-lg text-xs font-semibold border cursor-pointer transition-all"
                    style={{
                      background: selected.priority === p.value ? p.bg : 'white',
                      borderColor: selected.priority === p.value ? p.color : 'var(--border)',
                      color: selected.priority === p.value ? p.color : 'var(--slate)',
                    }}>
                    {p.label}
                  </button>
                ))}
              </div>
            </div>

            {saving === selected.id && (
              <p className="text-xs text-center mt-3" style={{ color: 'var(--slate)' }}>Saving...</p>
            )}
          </div>
        </aside>
      )}
    </div>
  )
}
