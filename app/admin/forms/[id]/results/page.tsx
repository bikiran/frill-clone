'use client'

import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import Link from 'next/link'
import * as XLSX from 'xlsx'
import jsPDF from 'jspdf'

export default function FormResults() {
  const params = useParams()
  const formId = params.id as string

  const [form, setForm] = useState<any>(null)
  const [responses, setResponses] = useState<any[]>([])
  const [company, setCompany] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [view, setView] = useState<'summary' | 'individual'>('summary')
  const [selectedResponse, setSelectedResponse] = useState<any>(null)
  const [exporting, setExporting] = useState<'excel' | 'pdf' | null>(null)
  const [selectedResponses, setSelectedResponses] = useState<Set<string>>(new Set())
  const [bulkDeleting, setBulkDeleting] = useState(false)
  const [filters, setFilters] = useState<Record<string, any>>({})
  const [showFilterPanel, setShowFilterPanel] = useState(false)

  useEffect(() => {
    ;(async () => {
      const [formRes, responsesRes, companyRes] = await Promise.all([
        (supabase as any).from('forms').select('*').eq('id', formId).single(),
        (supabase as any).from('form_responses').select('*').eq('form_id', formId).order('created_at', { ascending: false }),
        // Load company data for branding
        (async () => {
          const { data: { session } } = await supabase.auth.getSession()
          if (!session?.user) return null
          const { data } = await (supabase as any).from('companies').select('*').eq('owner_id', session.user.id).maybeSingle()
          return data
        })()
      ])
      setForm(formRes.data)
      setResponses(responsesRes.data || [])
      setCompany((await companyRes) || null)
      setLoading(false)
    })()
  }, [formId])

  const exportToExcel = () => {
    if (exporting) return
    setExporting('excel')
    try {
      const questions = form.questions || []
      const headers = ['Response ID', 'Submitted At', ...questions.map((q: any) => q.title)]
      
      const data = responses.map((r: any) => [
        r.id.slice(0, 8),
        new Date(r.created_at).toLocaleString(),
        ...questions.map((q: any) => {
          const answer = r.answers?.[q.id]
          if (Array.isArray(answer)) return answer.join(', ')
          return answer || ''
        })
      ])

      const worksheet = XLSX.utils.aoa_to_sheet([headers, ...data])
      worksheet['!cols'] = Array(headers.length).fill({ wch: 20 })
      const workbook = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Responses')
      XLSX.writeFile(workbook, `${form.title}-responses.xlsx`)
    } catch (error) {
      console.error('Export failed:', error)
    } finally {
      setExporting(null)
    }
  }

  const exportToPDF = () => {
    if (exporting) return
    setExporting('pdf')
    try {
      const doc = new jsPDF()
      const pageWidth = doc.internal.pageSize.getWidth()
      const pageHeight = doc.internal.pageSize.getHeight()
      const questions = form.questions || []
      const accentColor = company?.accent_color || '#ff7a6b'
      
      // Convert hex to RGB for jsPDF
      const hexToRgb = (hex: string) => {
        const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex)
        return result ? [parseInt(result[1], 16), parseInt(result[2], 16), parseInt(result[3], 16)] : [255, 122, 107]
      }
      const rgb = hexToRgb(accentColor)
      
      let yPosition = 20
      
      // Header with accent color
      doc.setTextColor(...rgb)
      doc.setFontSize(16)
      doc.setFont(undefined, 'bold')
      doc.text(form.title, 20, yPosition)
      yPosition += 10
      
      doc.setFontSize(11)
      doc.setTextColor(120)
      doc.setFont(undefined, 'normal')
      doc.text(`Total responses: ${responses.length}`, 20, yPosition)
      doc.text(`Generated: ${new Date().toLocaleDateString()}`, 20, yPosition + 7)
      yPosition += 20
      
      // Responses
      doc.setTextColor(0)
      doc.setFontSize(10)
      
      responses.forEach((response, idx) => {
        // Response header with accent color
        doc.setFontSize(10)
        doc.setFont(undefined, 'bold')
        doc.setTextColor(...rgb)
        doc.text(`Response ${idx + 1} - ${new Date(response.created_at).toLocaleString()}`, 20, yPosition)
        yPosition += 7
        
        // Questions and answers
        doc.setFont(undefined, 'normal')
        doc.setTextColor(0)
        doc.setFontSize(9)
        questions.forEach((q: any) => {
          const answer = response.answers?.[q.id]
          const answerText = Array.isArray(answer) ? answer.join(', ') : (answer || '(No answer)')
          
          doc.text(`${q.title}:`, 20, yPosition)
          yPosition += 5
          
          const lines = doc.splitTextToSize(`${answerText}`, pageWidth - 40)
          lines.forEach((line: string) => {
            doc.text(line, 25, yPosition)
            yPosition += 5
          })
          yPosition += 2
        })
        
        yPosition += 5
        if (yPosition > pageHeight - 20) {
          doc.addPage()
          yPosition = 20
        }
      })
      
      doc.save(`${form.title}-responses.pdf`)
    } catch (error) {
      console.error('PDF export failed:', error)
    } finally {
      setExporting(null)
    }
  }

  const bulkDeleteResponses = async () => {
    if (selectedResponses.size === 0) return
    if (!confirm(`Delete ${selectedResponses.size} response(s)?`)) return
    
    setBulkDeleting(true)
    try {
      const ids = Array.from(selectedResponses)
      await (supabase as any).from('form_responses').delete().in('id', ids)
      setResponses(prev => prev.filter(r => !selectedResponses.has(r.id)))
      setSelectedResponses(new Set())
    } catch (error) {
      console.error('Bulk delete failed:', error)
    } finally {
      setBulkDeleting(false)
    }
  }

  const toggleResponseSelection = (id: string) => {
    const newSelected = new Set(selectedResponses)
    if (newSelected.has(id)) {
      newSelected.delete(id)
    } else {
      newSelected.add(id)
    }
    setSelectedResponses(newSelected)
  }

  const toggleSelectAll = () => {
    if (selectedResponses.size === filteredResponses.length) {
      setSelectedResponses(new Set())
    } else {
      setSelectedResponses(new Set(filteredResponses.map(r => r.id)))
    }
  }

  // Filter responses based on filter criteria
  const filteredResponses = responses.filter(r => {
    for (const [questionId, filterValue] of Object.entries(filters)) {
      if (filterValue === '' || filterValue === null) continue
      const answer = r.answers?.[questionId]
      if (Array.isArray(answer)) {
        if (!answer.includes(filterValue)) return false
      } else if (String(answer).toLowerCase() !== String(filterValue).toLowerCase()) {
        return false
      }
    }
    return true
  })
  if (!form) return <div className="p-8" style={{ color: 'var(--slate)' }}>Form not found</div>

  const questions = form.questions || []
  const themeColor = form.theme?.color || '#ff7a6b'
  const completionRate = responses.length > 0 ? 100 : 0 // all stored responses are completed submissions

  // Aggregate stats per question
  const getQuestionStats = (q: any) => {
    const answers = responses.map(r => r.answers?.[q.id]).filter(a => a !== undefined && a !== '')
    if (q.type === 'multiple_choice' || q.type === 'yes_no') {
      const counts: Record<string, number> = {}
      answers.forEach(a => { counts[a] = (counts[a] || 0) + 1 })
      return { type: 'distribution', counts, total: answers.length }
    }
    if (q.type === 'rating') {
      const nums = answers.map(a => Number(a)).filter(n => !isNaN(n))
      const avg = nums.length ? (nums.reduce((s, n) => s + n, 0) / nums.length) : 0
      return { type: 'average', avg, total: nums.length }
    }
    return { type: 'text', samples: answers.slice(0, 5), total: answers.length }
  }

  return (
    <div className="min-h-screen">
      <div className="max-w-5xl mx-auto px-4 md:px-6 py-8">
        <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
          <div>
            <Link href="/admin/forms" className="text-sm font-medium hover:opacity-70 transition-smooth" style={{ color: 'var(--coral)' }}>
              ← Back to forms
            </Link>
            <h1 className="text-2xl font-bold mt-2" style={{ color: 'var(--ink)' }}>{form.title}</h1>
            <p className="text-sm mt-1" style={{ color: 'var(--slate)' }}>{filteredResponses.length} of {responses.length} response{responses.length !== 1 ? 's' : ''}{Object.keys(filters).length > 0 ? ' (filtered)' : ''}</p>
          </div>
          <Link href={`/admin/forms/${formId}`} className="px-4 py-2 rounded-xl text-sm font-semibold border cursor-pointer hover:bg-gray-50" style={{ borderColor: 'var(--border)', color: 'var(--ink)' }}>
            ✎ Edit form
          </Link>
        </div>

        {/* View toggle */}
        <div className="flex gap-2 mb-6 flex-wrap items-center">
          <button onClick={() => setView('summary')}
            className="px-4 py-2 rounded-xl text-sm font-semibold cursor-pointer"
            style={{ background: view === 'summary' ? themeColor : 'transparent', color: view === 'summary' ? '#fff' : 'var(--slate)', border: view === 'summary' ? 'none' : '1px solid var(--border)' }}>
            Summary
          </button>
          <button onClick={() => setView('individual')}
            className="px-4 py-2 rounded-xl text-sm font-semibold cursor-pointer"
            style={{ background: view === 'individual' ? themeColor : 'transparent', color: view === 'individual' ? '#fff' : 'var(--slate)', border: view === 'individual' ? 'none' : '1px solid var(--border)' }}>
            Individual responses
          </button>
          
          <button onClick={() => setShowFilterPanel(!showFilterPanel)}
            className="px-4 py-2 rounded-xl text-sm font-semibold cursor-pointer border"
            style={{ borderColor: 'var(--border)', color: Object.keys(filters).length > 0 ? themeColor : 'var(--slate)', background: showFilterPanel ? 'var(--canvas)' : '#fff' }}>
            🔽 Filter {Object.keys(filters).length > 0 ? `(${Object.keys(filters).length})` : ''}
          </button>
          
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            {view === 'individual' && responses.length > 0 && (
              <>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={selectedResponses.size === responses.length && responses.length > 0}
                    onChange={toggleSelectAll}
                    style={{ cursor: 'pointer' }}
                  />
                  <span style={{ color: 'var(--slate)' }}>
                    {selectedResponses.size > 0 ? `${selectedResponses.size} selected` : 'Select all'}
                  </span>
                </label>
                {selectedResponses.size > 0 && (
                  <button
                    onClick={bulkDeleteResponses}
                    disabled={bulkDeleting}
                    className="px-4 py-2 rounded-xl text-sm font-semibold cursor-pointer border transition-all"
                    style={{ borderColor: '#dc2626', color: '#dc2626', background: bulkDeleting ? 'var(--canvas)' : '#fff' }}>
                    {bulkDeleting ? '🗑️ Deleting...' : '🗑️ Delete selected'}
                  </button>
                )}
              </>
            )}
            <button onClick={exportToExcel} disabled={responses.length === 0 || exporting !== null}
              className="px-4 py-2 rounded-xl text-sm font-semibold cursor-pointer border transition-all"
              style={{ borderColor: 'var(--border)', color: 'var(--ink)', background: exporting === 'excel' ? 'var(--canvas)' : '#fff', opacity: responses.length === 0 ? 0.5 : 1 }}>
              {exporting === 'excel' ? '↓ Exporting...' : '📊 Export to Excel'}
            </button>
            <button onClick={exportToPDF} disabled={responses.length === 0 || exporting !== null}
              className="px-4 py-2 rounded-xl text-sm font-semibold cursor-pointer border transition-all"
              style={{ borderColor: 'var(--border)', color: 'var(--ink)', background: exporting === 'pdf' ? 'var(--canvas)' : '#fff', opacity: responses.length === 0 ? 0.5 : 1 }}>
              {exporting === 'pdf' ? '↓ Exporting...' : '📄 Export to PDF'}
            </button>
          </div>
        </div>

        {/* Filter Panel */}
        {showFilterPanel && (
          <div className="mb-6 bg-white rounded-2xl border p-6" style={{ borderColor: 'var(--border)' }}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold" style={{ color: 'var(--ink)' }}>Filter responses</h3>
              {Object.keys(filters).length > 0 && (
                <button onClick={() => setFilters({})} className="text-xs font-semibold" style={{ color: 'var(--coral)', cursor: 'pointer' }}>
                  Clear all
                </button>
              )}
            </div>
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
              {questions.map(q => (
                <div key={q.id}>
                  <label className="block text-sm font-medium mb-2" style={{ color: 'var(--ink)' }}>{q.title}</label>
                  {(q.type === 'multiple_choice' || q.type === 'dropdown' || q.type === 'yes_no') ? (
                    <select
                      value={filters[q.id] || ''}
                      onChange={e => {
                        const newFilters = { ...filters }
                        if (e.target.value) {
                          newFilters[q.id] = e.target.value
                        } else {
                          delete newFilters[q.id]
                        }
                        setFilters(newFilters)
                      }}
                      className="w-full px-3 py-2 rounded-lg border text-sm"
                      style={{ borderColor: 'var(--border)', color: 'var(--ink)' }}>
                      <option value="">All</option>
                      {q.options?.map((opt: string) => (
                        <option key={opt} value={opt}>{opt}</option>
                      ))}
                    </select>
                  ) : (
                    <input
                      type="text"
                      placeholder="Search..."
                      value={filters[q.id] || ''}
                      onChange={e => {
                        const newFilters = { ...filters }
                        if (e.target.value) {
                          newFilters[q.id] = e.target.value
                        } else {
                          delete newFilters[q.id]
                        }
                        setFilters(newFilters)
                      }}
                      className="w-full px-3 py-2 rounded-lg border text-sm"
                      style={{ borderColor: 'var(--border)', color: 'var(--ink)' }}
                    />
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {responses.length === 0 ? (
          <div className="text-center py-20 rounded-2xl border" style={{ borderColor: 'var(--border)' }}>
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--slate)" strokeWidth="1.5" className="mx-auto mb-4"><rect x="3" y="3" width="18" height="18" rx="3"/><line x1="7" y1="8" x2="17" y2="8"/><line x1="7" y1="12" x2="13" y2="12"/></svg>
            <h3 className="text-lg font-semibold mb-2" style={{ color: 'var(--ink)' }}>No responses yet</h3>
            <p style={{ color: 'var(--slate)' }}>Share your form to start collecting responses.</p>
          </div>
        ) : view === 'summary' ? (
          <div className="space-y-4">
            {/* Top stats */}
            <div className="grid grid-cols-3 gap-4 mb-6">
              <div className="bg-white rounded-2xl border p-5" style={{ borderColor: 'var(--border)' }}>
                <p className="text-2xl font-black" style={{ color: 'var(--ink)' }}>{responses.length}</p>
                <p className="text-xs" style={{ color: 'var(--slate)' }}>Total responses</p>
              </div>
              <div className="bg-white rounded-2xl border p-5" style={{ borderColor: 'var(--border)' }}>
                <p className="text-2xl font-black" style={{ color: 'var(--ink)' }}>{questions.length}</p>
                <p className="text-xs" style={{ color: 'var(--slate)' }}>Questions</p>
              </div>
              <div className="bg-white rounded-2xl border p-5" style={{ borderColor: 'var(--border)' }}>
                <p className="text-2xl font-black" style={{ color: 'var(--ink)' }}>
                  {responses[0] ? new Date(responses[0].created_at).toLocaleDateString() : '—'}
                </p>
                <p className="text-xs" style={{ color: 'var(--slate)' }}>Last response</p>
              </div>
            </div>

            {/* Per-question breakdown */}
            {questions.map((q: any, qi: number) => {
              const stats = getQuestionStats(q)
              return (
                <div key={q.id} className="bg-white rounded-2xl border p-6" style={{ borderColor: 'var(--border)' }}>
                  <p className="text-xs font-bold mb-1" style={{ color: themeColor }}>QUESTION {qi + 1}</p>
                  <h3 className="text-base font-bold mb-4" style={{ color: 'var(--ink)' }}>{q.title}</h3>

                  {stats.type === 'distribution' && (
                    <div className="space-y-2">
                      {Object.entries(stats.counts).sort((a, b) => (b[1] as number) - (a[1] as number)).map(([opt, count]) => {
                        const pct = stats.total > 0 ? Math.round((count as number) / stats.total * 100) : 0
                        return (
                          <div key={opt}>
                            <div className="flex justify-between mb-1">
                              <span className="text-sm" style={{ color: 'var(--ink)' }}>{opt}</span>
                              <span className="text-sm font-semibold" style={{ color: 'var(--slate)' }}>{count} ({pct}%)</span>
                            </div>
                            <div className="h-2 rounded-full" style={{ background: 'var(--border)' }}>
                              <div className="h-full rounded-full" style={{ width: `${pct}%`, background: themeColor }} />
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}

                  {stats.type === 'average' && (
                    <div className="flex items-center gap-3">
                      <span className="text-3xl font-black" style={{ color: themeColor }}>{stats.avg.toFixed(1)}</span>
                      <span className="text-sm" style={{ color: 'var(--slate)' }}>average out of 5 ({stats.total} ratings)</span>
                    </div>
                  )}

                  {stats.type === 'text' && (
                    <div className="space-y-2">
                      {stats.samples.length === 0 ? (
                        <p className="text-sm" style={{ color: 'var(--slate)' }}>No answers yet</p>
                      ) : stats.samples.map((s: any, si: number) => (
                        <p key={si} className="text-sm p-3 rounded-lg" style={{ background: 'var(--canvas, #fafafa)', color: 'var(--ink)' }}>"{s}"</p>
                      ))}
                      {stats.total > 5 && <p className="text-xs" style={{ color: 'var(--slate)' }}>+{stats.total - 5} more responses</p>}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        ) : (
          <div className="grid md:grid-cols-2 gap-4">
            {filteredResponses.map(r => (
              <div key={r.id} style={{ position: 'relative' }}>
                <input
                  type="checkbox"
                  checked={selectedResponses.has(r.id)}
                  onChange={() => toggleResponseSelection(r.id)}
                  style={{ position: 'absolute', top: 12, left: 12, width: 20, height: 20, cursor: 'pointer', zIndex: 10 }}
                />
                <button onClick={() => setSelectedResponse(r)}
                  className="text-left bg-white rounded-2xl border p-5 hover:shadow-md transition-smooth cursor-pointer w-full" style={{ borderColor: selectedResponses.has(r.id) ? 'var(--coral)' : 'var(--border)', paddingLeft: 48 }}>
                  <p className="text-xs mb-2" style={{ color: 'var(--slate)' }}>{new Date(r.created_at).toLocaleString()}</p>
                  {questions.slice(0, 2).map((q: any) => (
                    <p key={q.id} className="text-sm mb-1 truncate" style={{ color: 'var(--ink)' }}>
                      <span style={{ color: 'var(--slate)' }}>{q.title}:</span> {String(r.answers?.[q.id] ?? '—')}
                    </p>
                  ))}
                  <p className="text-xs mt-2 font-semibold" style={{ color: themeColor }}>View full response →</p>
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Individual response modal */}
      {selectedResponse && (
        <>
          <div className="fixed inset-0 z-50 backdrop-blur-sm" style={{ background: 'rgba(0,0,0,0.4)' }} onClick={() => setSelectedResponse(null)} />
          <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-full max-w-lg bg-white rounded-2xl shadow-2xl mx-4 max-h-[85vh] overflow-y-auto">
            <div className="p-6 border-b flex items-center justify-between" style={{ borderColor: 'var(--border)' }}>
              <div>
                <h2 className="text-lg font-bold" style={{ color: 'var(--ink)' }}>Response</h2>
                <p className="text-xs" style={{ color: 'var(--slate)' }}>{new Date(selectedResponse.created_at).toLocaleString()}</p>
              </div>
              <button onClick={() => setSelectedResponse(null)} className="text-2xl cursor-pointer" style={{ color: 'var(--slate)' }}>×</button>
            </div>
            <div className="p-6 space-y-4">
              {questions.map((q: any) => {
                const answer = selectedResponse.answers?.[q.id]
                const isFileUpload = q.type === 'file_upload'
                const isMediaAnswer = answer && typeof answer === 'string' && (answer.match(/\.(jpg|jpeg|png|gif|webp|mp4|webm|mp3|wav)$/i) || answer.startsWith('data:'))
                
                return (
                  <div key={q.id}>
                    <p className="text-xs font-semibold mb-1" style={{ color: 'var(--slate)' }}>{q.title}</p>
                    {isFileUpload && answer ? (
                      <div>
                        {typeof answer === 'string' ? (
                          answer.startsWith('http') || answer.startsWith('data:') ? (
                            answer.match(/\.(jpg|jpeg|png|gif|webp)$/i) ? (
                              <img src={answer} alt="uploaded" style={{ maxWidth: '100%', maxHeight: 200, borderRadius: 8 }} />
                            ) : answer.match(/\.(mp4|webm)$/i) ? (
                              <video src={answer} style={{ maxWidth: '100%', maxHeight: 200, borderRadius: 8 }} controls />
                            ) : (
                              <a href={answer} target="_blank" rel="noopener" className="text-sm" style={{ color: 'var(--coral)', textDecoration: 'underline' }}>
                                📎 {answer.split('/').pop() || 'Download file'}
                              </a>
                            )
                          ) : (
                            <p className="text-sm" style={{ color: 'var(--ink)' }}>{answer}</p>
                          )
                        ) : Array.isArray(answer) ? (
                          <div className="space-y-2">
                            {answer.map((file: string, idx: number) => (
                              <a key={idx} href={file} target="_blank" rel="noopener" className="text-sm block" style={{ color: 'var(--coral)', textDecoration: 'underline' }}>
                                📎 {file.split('/').pop()}
                              </a>
                            ))}
                          </div>
                        ) : (
                          <p className="text-sm" style={{ color: 'var(--ink)' }}>—</p>
                        )}
                      </div>
                    ) : isMediaAnswer && typeof answer === 'string' ? (
                      answer.match(/\.(jpg|jpeg|png|gif|webp)$/i) ? (
                        <img src={answer} alt="uploaded" style={{ maxWidth: '100%', maxHeight: 200, borderRadius: 8 }} />
                      ) : (
                        <p className="text-sm" style={{ color: 'var(--ink)' }}>{String(answer)}</p>
                      )
                    ) : Array.isArray(answer) ? (
                      <p className="text-sm" style={{ color: 'var(--ink)' }}>{answer.join(', ')}</p>
                    ) : (
                      <p className="text-sm" style={{ color: 'var(--ink)' }}>{String(answer ?? '—')}</p>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
