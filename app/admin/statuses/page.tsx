'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { resolveCompanyUser } from '@/lib/client-cache'
import { confirmDialog, alertDialog } from '@/components/ConfirmDialog'
import { TrashIcon, PlusIcon } from '@/components/Icons'
import { SkeletonList } from '@/components/Skeleton'
import { AdminPage, Panel } from '@/components/ui/AdminKit'


// Always on the board and roadmap, whatever else is added below.
const BUILT_IN = [
  { key: 'new', label: 'Under consideration', color: '#f97316' },
  { key: 'planned', label: 'Planned', color: '#3b82f6' },
  { key: 'in_progress', label: 'In Development', color: '#ea580c' },
  { key: 'shipped', label: 'Shipped', color: '#10b981' },
]

const COLORS = [
  '#f97316', '#ea580c', '#dc2626', '#ec4899', 
  '#7c3aed', '#3b82f6', '#06b6d4', '#10b981',
  '#84cc16', '#eab308', '#9ca3af', '#1f2937',
]

export default function StatusesPage() {
  const router = useRouter()
  const [user, setUser] = useState<any>(null)
  const [statuses, setStatuses] = useState<any[]>([])
  const [newLabel, setNewLabel] = useState('')
  const [newColor, setNewColor] = useState(COLORS[5])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [companyId, setCompanyId] = useState<string | null>(null)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      const u = data.session?.user
      setUser(u)
    })
    // Statuses belong to a workspace: the board and roadmap only show the
    // ones with its company_id, and only its staff may change them (COLVY_V412).
    resolveCompanyUser().then(({ companyId }) => {
      setCompanyId(companyId)
      fetchStatuses(companyId)
    })
  }, [router])

  const fetchStatuses = async (cid: string | null = companyId) => {
    try {
      let q = (supabase as any).from('statuses').select('*').order('order_index', { ascending: true })
      if (cid) q = q.eq('company_id', cid)
      const { data, error } = await q
      if (!error && data) setStatuses(data)
    } catch {}
    setLoading(false)
  }

  const addStatus = async () => {
    if (!newLabel.trim()) return
    setSaving(true)
    const key = newLabel.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_')
    const { error } = await supabase.from('statuses').insert({
      company_id: companyId,
      key,
      label: newLabel.trim(),
      color: newColor,
      order_index: statuses.length,
    })
    if (error) {
      await alertDialog({ title: 'Couldn’t add the status', message: error.message })
    } else {
      setNewLabel('')
      fetchStatuses()
    }
    setSaving(false)
  }

  const deleteStatus = async (id: string, label: string) => {
    const ok = await confirmDialog({
      title: `Delete “${label}”?`,
      message: 'Ideas with this status keep it, but its column won’t show on the roadmap.',
      confirmLabel: 'Delete', tone: 'danger',
    })
    if (!ok) return
    await supabase.from('statuses').delete().eq('id', id)
    fetchStatuses()
  }

  if (loading || !user) return <SkeletonList rows={6} />

  return (
    <AdminPage width="sm" title="Statuses" sub="Statuses show where each idea is on your roadmap. Every status gets its own column."
      back={{ href: '/admin/roadmap', label: 'Roadmap' }}>
      <Panel title="Add a status">
        <div className="st-add">
          <input className="ak-field" type="text" value={newLabel} onChange={e => setNewLabel(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && addStatus()} placeholder="e.g. Testing, Waiting on supplier" aria-label="Status name" />
          <button type="button" className="ak-btn go" onClick={addStatus} disabled={!newLabel.trim() || saving}>
            <PlusIcon size={15} color="currentColor" /> {saving ? 'Adding…' : 'Add status'}
          </button>
        </div>
        <span className="ak-label" style={{ margin: '16px 0 9px' }}>Colour</span>
        <div className="st-swatches" role="radiogroup" aria-label="Colour">
          {COLORS.map(c => (
            <button key={c} type="button" role="radio" aria-checked={newColor === c} aria-label={c}
              className={`st-swatch${newColor === c ? ' on' : ''}`} style={{ '--c': c } as React.CSSProperties} onClick={() => setNewColor(c)} />
          ))}
        </div>
        {newLabel.trim() && (
          <p className="ak-hint" style={{ marginTop: 14 }}>Preview: <span className="st-pill"><i style={{ background: newColor }} />{newLabel.trim()}</span></p>
        )}
      </Panel>

      <Panel title="Your statuses" sub={statuses.length ? `${statuses.length} added for this workspace` : undefined} flush>
        {statuses.length === 0 ? (
          <div className="ak-empty">
            <b>No statuses of your own yet</b>
            Add one above. The built-in ones below are always there.
          </div>
        ) : (
          <div className="ak-list" style={{ padding: '0 8px 8px' }}>
            {statuses.map(s => (
              <div key={s.id} className="ak-row">
                <span className="st-dot" style={{ background: s.color }} aria-hidden />
                <span className="ak-row-t"><b>{s.label || s.name}</b><small>{s.key}</small></span>
                <button type="button" className="ak-icon-btn danger" onClick={() => deleteStatus(s.id, s.label || s.name)} title="Delete status" aria-label={`Delete ${s.label || s.name}`}>
                  <TrashIcon size={15} color="currentColor" />
                </button>
              </div>
            ))}
          </div>
        )}
      </Panel>

      <Panel title="Built in" sub="Always on your board and roadmap." flush>
        <div className="ak-list" style={{ padding: '0 8px 8px' }}>
          {BUILT_IN.map(s => (
            <div key={s.key} className="ak-row">
              <span className="st-dot" style={{ background: s.color }} aria-hidden />
              <span className="ak-row-t"><b>{s.label}</b><small>{s.key}</small></span>
              <span className="ak-tag">Built in</span>
            </div>
          ))}
        </div>
      </Panel>
      <style>{ST_CSS}</style>
    </AdminPage>
  )
}

const ST_CSS = `
.st-add{display:flex;gap:8px}
@media (max-width:560px){.st-add{flex-direction:column}}
.st-swatches{display:flex;flex-wrap:wrap;gap:8px}
.st-swatch{width:30px;height:30px;padding:0;border:none;border-radius:50%;background:var(--c);cursor:pointer;box-shadow:inset 0 0 0 1px rgba(0,0,0,.08);transition:transform .12s,box-shadow .15s}
.st-swatch:hover{transform:scale(1.08)}
.st-swatch.on{box-shadow:0 0 0 3px var(--card,#fff),0 0 0 5px var(--c)}
.st-dot{width:12px;height:12px;flex-shrink:0;margin:0 4px;border-radius:50%;box-shadow:0 0 0 4px color-mix(in srgb,currentColor 0%,transparent)}
.st-pill{display:inline-flex;align-items:center;gap:7px;height:26px;padding:0 11px;margin-left:4px;border-radius:999px;background:var(--f);font-size:12.5px;font-weight:600;color:var(--ink)}
.st-pill i{width:8px;height:8px;border-radius:50%}
`
