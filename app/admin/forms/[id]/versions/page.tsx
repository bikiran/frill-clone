'use client'

import { authFetch } from '@/lib/auth-fetch'
import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { confirmDialog, alertDialog } from '@/components/ConfirmDialog'
import { AdminPage, Panel } from '@/components/ui/AdminKit'
import { countAllRules, readFormLogic } from '@/lib/form-logic'

// Why a version was saved (older versions have no reason).
const REASON_LABEL: Record<string, string> = {
  publish: 'Published',
  restore: 'Rolled back',
  before_restore: 'Before a rollback',
}

export default function FormVersionsPage() {
  const params = useParams()
  const router = useRouter()
  const formId = params.id as string

  const [form, setForm] = useState<any>(null)
  const [versions, setVersions] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedVersion, setSelectedVersion] = useState<any>(null)
  const [rolling, setRolling] = useState(false)

  useEffect(() => {
    loadData()
  }, [formId])

  const [currentId, setCurrentId] = useState<string | null>(null)

  const loadData = async () => {
    try {
      // Load current form
      const { data: formData } = await (supabase as any)
        .from('forms')
        .select('*')
        .eq('id', formId)
        .single()

      setForm(formData)

      // Version history comes through the server (it also says whether the
      // newest version still matches the form, and copes with a database
      // where version history isn't set up yet).
      const res = await authFetch(`/api/form-versions?formId=${encodeURIComponent(formId)}`)
      const d = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(d.error || 'Could not load versions')
      setVersions(Array.isArray(d.versions) ? d.versions : [])
      setCurrentId(d.current_version_id || null)
    } catch (error) {
      console.error('Failed to load versions:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleRollback = async (versionId: string, versionNumber: number) => {
    if (!await confirmDialog({ title: `Roll back to version ${versionNumber}?`, message: 'The form is replaced with this version. What’s there now is saved as a version first, so you can undo this.', confirmLabel: 'Roll back' })) return

    setRolling(true)
    try {
      // The server puts the version back (questions with their logic, theme
      // with its welcome settings and variables, messages and endings), after
      // first saving the form as it is now as a version of its own, so a
      // rollback can itself be rolled back.
      const res = await authFetch('/api/form-versions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ formId, action: 'restore', versionId }),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(d.error || 'Rollback failed')

      // Reload data
      await loadData()
      await alertDialog({ title: `Rolled back to version ${versionNumber}`, message: 'The form now matches that version.' })
    } catch (error: any) {
      await alertDialog({ title: 'Couldn’t roll back', message: error.message })
    } finally {
      setRolling(false)
    }
  }

  if (loading) return <div className="p-8" style={{ color: 'var(--slate)' }}>Loading…</div>
  if (!form) return <div className="p-8" style={{ color: 'var(--slate)' }}>Form not found</div>

  const ago = (iso: string) => {
    const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000)
    if (m < 1) return 'just now'
    if (m < 60) return `${m} min ago`
    const h = Math.round(m / 60); if (h < 24) return `${h} hr ago`
    const d = Math.round(h / 24); return d === 1 ? 'yesterday' : `${d} days ago`
  }

  return (
    <AdminPage width="sm" title="Version history" sub={<>{form.title} · {versions.length} version{versions.length === 1 ? '' : 's'}. A version is saved when you publish, and every ten minutes or so while you edit.</>}
      back={{ href: `/admin/forms/${formId}`, label: 'Back to the form' }}>
      {versions.length === 0 ? (
        <Panel>
          <div className="ak-empty"><b>No versions yet</b>Publish the form, or keep editing, and versions show up here.</div>
        </Panel>
      ) : (
        <ol className="fv-list">
          {versions.map(version => {
            const open = selectedVersion?.id === version.id
            const current = version.id === currentId
            const rules = countAllRules(readFormLogic(version))
            const qs: any[] = version.questions || []
            return (
              <li key={version.id} className={`fv-item${open ? ' fv-open' : ''}${current ? ' current' : ''}`}>
                <span className="fv-rail" aria-hidden><i /></span>
                <div className="fv-card">
                  <div className="fv-top">
                    <button type="button" className="fv-main" onClick={() => setSelectedVersion(open ? null : version)} aria-expanded={open}>
                      <span className="fv-tags">
                        <span className="ak-tag">v{version.version_number}</span>
                        {current && <span className="ak-tag green">Current</span>}
                        {REASON_LABEL[version.reason] && <span className="ak-tag blue">{REASON_LABEL[version.reason]}</span>}
                      </span>
                      <b>{version.title}</b>
                      <small>
                        <span title={new Date(version.created_at).toLocaleString('en-AU')}>{ago(version.created_at)}</span>
                        <span>{qs.length} question{qs.length === 1 ? '' : 's'}</span>
                        {rules > 0 && <span>{rules} logic rule{rules === 1 ? '' : 's'}</span>}
                      </small>
                    </button>
                    {!current && (
                      <button type="button" className="ak-btn sm" onClick={() => handleRollback(version.id, version.version_number)} disabled={rolling}>
                        {rolling ? 'Rolling back…' : 'Roll back'}
                      </button>
                    )}
                  </div>
                  {open && (
                    <ul className="fv-qs">
                      {qs.slice(0, 8).map((q: any, qi: number) => (
                        <li key={qi}><span>{qi + 1}</span><b>{q.title || 'Untitled question'}</b><small>{String(q.type || '').replace(/_/g, ' ')}</small></li>
                      ))}
                      {qs.length > 8 && <li className="more">+{qs.length - 8} more questions</li>}
                      {qs.length === 0 && <li className="more">No questions in this version</li>}
                    </ul>
                  )}
                </div>
              </li>
            )
          })}
        </ol>
      )}
      <style>{FV_CSS}</style>
    </AdminPage>
  )
}

const FV_CSS = `
.fv-list{list-style:none;margin:0;padding:0}
.fv-item{display:flex;gap:12px}
.fv-rail{position:relative;width:14px;flex-shrink:0;display:flex;justify-content:center}
.fv-rail::before{content:"";position:absolute;top:0;bottom:0;width:2px;background:var(--f2)}
.fv-item:first-child .fv-rail::before{top:26px}
.fv-item:last-child .fv-rail::before{bottom:calc(100% - 26px)}
.fv-rail i{position:relative;margin-top:20px;width:12px;height:12px;border-radius:50%;background:var(--card,#fff);box-shadow:inset 0 0 0 2.5px var(--soft)}
.fv-item.current .fv-rail i{box-shadow:inset 0 0 0 6px #22c55e}
.fv-card{flex:1;min-width:0;margin-bottom:10px;padding:14px 16px;border-radius:20px;background:var(--card,#fff);box-shadow:0 0 0 1px rgba(0,0,0,.05),0 1px 2px rgba(16,24,40,.04)}
.fv-item.fv-open .fv-card{box-shadow:0 0 0 1.5px var(--ink)}
.fv-top{display:flex;align-items:center;gap:12px}
.fv-main{flex:1;min-width:0;display:flex;flex-direction:column;gap:4px;padding:0;border:none;background:none;font:inherit;text-align:left;cursor:pointer}
.fv-tags{display:flex;flex-wrap:wrap;gap:5px}
.fv-main b{font-size:15px;font-weight:650;color:var(--ink);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.fv-main small{display:flex;flex-wrap:wrap;gap:4px 12px;font-size:12.5px;color:var(--soft)}
.fv-qs{list-style:none;margin:12px 0 0;padding:6px;border-radius:16px;background:var(--f)}
.fv-qs li{display:flex;align-items:center;gap:10px;padding:8px 10px;border-radius:12px;font-size:13.5px}
.fv-qs li+li{box-shadow:0 -1px 0 var(--f2)}
.fv-qs span{width:22px;height:22px;flex-shrink:0;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;background:var(--card,#fff);font-size:11.5px;font-weight:700;color:var(--mut)}
.fv-qs b{flex:1;min-width:0;font-weight:600;color:var(--ink);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.fv-qs small{flex-shrink:0;font-size:12px;color:var(--soft);text-transform:capitalize}
.fv-qs li.more{justify-content:center;font-size:12.5px;color:var(--mut)}
`
