'use client'

import { authFetch } from '@/lib/auth-fetch'
import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import Link from 'next/link'
import { confirmDialog } from '@/components/ConfirmDialog'
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
    if (!await confirmDialog(`Roll back to version ${versionNumber}? The current form will be replaced.`)) return

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
      alert(`Rolled back to version ${versionNumber}`)
    } catch (error: any) {
      alert('Rollback failed: ' + error.message)
    } finally {
      setRolling(false)
    }
  }

  if (loading) return <div className="p-8" style={{ color: 'var(--slate)' }}>Loading...</div>
  if (!form) return <div className="p-8" style={{ color: 'var(--slate)' }}>Form not found</div>

  return (
    <div className="min-h-screen p-8" style={{ background: 'var(--canvas)' }}>
      <div className="max-w-4xl mx-auto">
        <div className="mb-8">
          <Link href={`/admin/forms/${formId}`} className="text-sm font-medium hover:opacity-70" style={{ color: 'var(--coral)' }}>
            ← Back to form
          </Link>
          <h1 className="text-3xl font-bold mt-3" style={{ color: 'var(--ink)' }}>Version History</h1>
          <p style={{ color: 'var(--slate)' }}>{form.title} • {versions.length} versions</p>
        </div>

        {versions.length === 0 ? (
          <div className="bg-white rounded-2xl border p-8 text-center" style={{ borderColor: 'var(--border)' }}>
            <p style={{ color: 'var(--slate)' }}>No version history yet. A version is saved automatically when you publish, and every ten minutes or so while you edit.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {versions.map((version) => (
              <div
                key={version.id}
                className="bg-white rounded-2xl border p-6 hover:shadow-md transition-all"
                style={{ borderColor: selectedVersion?.id === version.id ? 'var(--coral)' : 'var(--border)' }}>
                <div className="flex items-start justify-between">
                  <div className="flex-1 cursor-pointer" onClick={() => setSelectedVersion(selectedVersion?.id === version.id ? null : version)}>
                    <div className="flex items-center gap-3 mb-2">
                      <span className="px-2 py-1 rounded-full text-xs font-bold" style={{ background: 'var(--canvas)', color: 'var(--slate)' }}>
                        v{version.version_number}
                      </span>
                      {version.id === currentId && (
                        <span className="px-2 py-1 rounded-full text-xs font-bold" style={{ background: 'var(--coral)', color: 'white' }}>
                          Current
                        </span>
                      )}
                    </div>
                    <h3 className="font-semibold mb-1" style={{ color: 'var(--ink)' }}>{version.title}</h3>
                    <p className="text-sm" style={{ color: 'var(--slate)' }}>
                      {new Date(version.created_at).toLocaleString()} • {version.questions?.length || 0} questions{REASON_LABEL[version.reason] ? ` • ${REASON_LABEL[version.reason]}` : ''}
                    </p>
                    {(() => {
                      const rules = countAllRules(readFormLogic(version))
                      return rules > 0 ? (
                        <p className="text-xs mt-1" style={{ color: 'var(--slate)', opacity: 0.8 }}>
                          {rules} logic rule{rules === 1 ? '' : 's'}
                        </p>
                      ) : null
                    })()}
                  </div>
                  {version.id !== currentId && (
                    <button
                      onClick={() => handleRollback(version.id, version.version_number)}
                      disabled={rolling}
                      className="px-4 py-2 rounded-lg text-sm font-semibold cursor-pointer border"
                      style={{
                        borderColor: 'var(--border)',
                        color: 'var(--ink)',
                        background: rolling ? 'var(--canvas)' : '#fff',
                        opacity: rolling ? 0.6 : 1,
                      }}>
                      {rolling ? 'Rolling back…' : 'Roll back'}
                    </button>
                  )}
                </div>

                {selectedVersion?.id === version.id && (
                  <div className="mt-4 pt-4 border-t" style={{ borderColor: 'var(--border)' }}>
                    <p className="text-xs font-semibold mb-3" style={{ color: 'var(--slate)' }}>Preview</p>
                    <div className="space-y-2">
                      {version.questions?.slice(0, 3).map((q: any, qi: number) => (
                        <div key={qi} className="p-2 rounded-lg" style={{ background: 'var(--canvas)' }}>
                          <p className="text-sm font-medium" style={{ color: 'var(--ink)' }}>{q.title}</p>
                          <p className="text-xs" style={{ color: 'var(--slate)' }}>{q.type}</p>
                        </div>
                      ))}
                      {version.questions?.length > 3 && (
                        <p className="text-xs" style={{ color: 'var(--slate)' }}>+{version.questions.length - 3} more questions</p>
                      )}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
