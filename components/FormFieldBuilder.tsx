'use client'

import { useState } from 'react'

export interface FormField {
  id: string
  type: 'text' | 'email' | 'number' | 'textarea' | 'select' | 'checkbox' | 'date' | 'file'
  label: string
  placeholder?: string
  description?: string
  isRequired: boolean
  options?: string[]
  minLength?: number
  maxLength?: number
}

export function FormFieldBuilder({
  fields,
  onFieldsChange
}: {
  fields: FormField[]
  onFieldsChange: (fields: FormField[]) => void
}) {
  const [activeId, setActiveId] = useState<string | null>(null)
  const [draggedId, setDraggedId] = useState<string | null>(null)

  const addField = () => {
    const newField: FormField = {
      id: `f_${Date.now()}`,
      type: 'text',
      label: '',
      isRequired: false,
      placeholder: '',
      description: '',
    }
    onFieldsChange([...fields, newField])
    setActiveId(newField.id)
  }

  const deleteField = (id: string) => {
    onFieldsChange(fields.filter(f => f.id !== id))
    if (activeId === id) setActiveId(null)
  }

  const updateField = (id: string, updates: Partial<FormField>) => {
    onFieldsChange(
      fields.map(f => f.id === id ? { ...f, ...updates } : f)
    )
  }

  const reorderFields = (fromId: string, toId: string) => {
    const fromIdx = fields.findIndex(f => f.id === fromId)
    const toIdx = fields.findIndex(f => f.id === toId)
    if (fromIdx === -1 || toIdx === -1) return

    const newFields = [...fields]
    ;[newFields[fromIdx], newFields[toIdx]] = [newFields[toIdx], newFields[fromIdx]]
    onFieldsChange(newFields)
  }

  const handleDragStart = (id: string) => {
    setDraggedId(id)
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
  }

  const handleDrop = (targetId: string) => {
    if (draggedId && draggedId !== targetId) {
      reorderFields(draggedId, targetId)
    }
    setDraggedId(null)
  }

  if (fields.length === 0) {
    return (
      <div className="p-6 border-2 border-dashed rounded-lg text-center" style={{ borderColor: 'var(--border)' }}>
        <p className="text-sm mb-4" style={{ color: 'var(--slate)' }}>No fields yet</p>
        <button
          onClick={addField}
          className="px-4 py-2 rounded-lg text-sm font-medium text-white transition-smooth cursor-pointer"
          style={{ background: 'var(--coral)' }}>
          + Add Field
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {fields.map((f, idx) => (
        <div
          key={f.id}
          draggable
          onDragStart={() => handleDragStart(f.id)}
          onDragOver={handleDragOver}
          onDrop={() => handleDrop(f.id)}
          className="border rounded-lg p-4 transition-all cursor-move"
          style={{
            borderColor: activeId === f.id ? 'var(--coral)' : 'var(--border)',
            background: draggedId === f.id ? 'var(--peach)' : 'white',
          }}>
          {/* Field Header */}
          <div className="flex items-center gap-3 mb-3">
            <span className="text-xs font-semibold px-2 py-1 rounded" style={{ background: 'var(--peach)', color: 'var(--coral)' }}>
              F{idx + 1}
            </span>
            <input
              type="text"
              value={f.label}
              onChange={(e) => updateField(f.id, { label: e.target.value })}
              onClick={() => setActiveId(f.id)}
              placeholder="Field label..."
              className="flex-1 text-sm font-medium border-0 focus:outline-none focus:ring-1 focus:ring-blue-500 rounded px-2 py-1"
              style={{ borderColor: 'var(--border)' }}
            />
            <button
              onClick={() => deleteField(f.id)}
              className="p-1 hover:bg-red-50 rounded text-red-600 transition-smooth cursor-pointer"
              title="Delete field">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            </button>
          </div>

          {/* Field Settings */}
          {activeId === f.id && (
            <div className="space-y-3 p-3 rounded-lg" style={{ background: 'var(--canvas)' }}>
              {/* Type Selector */}
              <div>
                <label className="text-xs font-medium block mb-2" style={{ color: 'var(--ink)' }}>Type</label>
                <select
                  value={f.type}
                  onChange={(e) => updateField(f.id, { type: e.target.value as any, options: undefined })}
                  className="w-full px-3 py-2 border rounded text-sm focus:outline-none"
                  style={{ borderColor: 'var(--border)' }}>
                  <option value="text">Short Text</option>
                  <option value="email">Email</option>
                  <option value="number">Number</option>
                  <option value="textarea">Long Text</option>
                  <option value="select">Dropdown Select</option>
                  <option value="checkbox">Checkbox Group</option>
                  <option value="date">Date Picker</option>
                  <option value="file">File Upload</option>
                </select>
              </div>

              {/* Placeholder */}
              <div>
                <label className="text-xs font-medium block mb-2" style={{ color: 'var(--ink)' }}>Placeholder (optional)</label>
                <input
                  type="text"
                  value={f.placeholder || ''}
                  onChange={(e) => updateField(f.id, { placeholder: e.target.value })}
                  placeholder="e.g., Enter your answer..."
                  className="w-full px-3 py-2 border rounded text-sm focus:outline-none"
                  style={{ borderColor: 'var(--border)' }}
                />
              </div>

              {/* Description */}
              <div>
                <label className="text-xs font-medium block mb-2" style={{ color: 'var(--ink)' }}>Description (optional)</label>
                <textarea
                  value={f.description || ''}
                  onChange={(e) => updateField(f.id, { description: e.target.value })}
                  placeholder="Add helper text..."
                  rows={2}
                  className="w-full px-3 py-2 border rounded text-sm focus:outline-none resize-none"
                  style={{ borderColor: 'var(--border)' }}
                />
              </div>

              {/* Required Toggle */}
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={f.isRequired}
                  onChange={(e) => updateField(f.id, { isRequired: e.target.checked })}
                  className="w-4 h-4 rounded"
                />
                <span className="text-sm" style={{ color: 'var(--ink)' }}>Required</span>
              </label>

              {/* Length validation for text/email */}
              {(f.type === 'text' || f.type === 'email' || f.type === 'textarea') && (
                <div className="space-y-2">
                  <label className="text-xs font-medium block" style={{ color: 'var(--ink)' }}>Length Validation</label>
                  <div className="flex gap-2">
                    <div className="flex-1">
                      <input
                        type="number"
                        value={f.minLength || ''}
                        onChange={(e) => updateField(f.id, { minLength: e.target.value ? parseInt(e.target.value) : undefined })}
                        placeholder="Min"
                        className="w-full px-2 py-1 border rounded text-xs focus:outline-none"
                        style={{ borderColor: 'var(--border)' }}
                      />
                    </div>
                    <div className="flex-1">
                      <input
                        type="number"
                        value={f.maxLength || ''}
                        onChange={(e) => updateField(f.id, { maxLength: e.target.value ? parseInt(e.target.value) : undefined })}
                        placeholder="Max"
                        className="w-full px-2 py-1 border rounded text-xs focus:outline-none"
                        style={{ borderColor: 'var(--border)' }}
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* Options for Select/Checkbox */}
              {(f.type === 'select' || f.type === 'checkbox') && (
                <div>
                  <label className="text-xs font-medium block mb-2" style={{ color: 'var(--ink)' }}>Options</label>
                  {(f.options || []).map((opt, i) => (
                    <div key={i} className="flex gap-2 mb-2">
                      <input
                        type="text"
                        value={opt}
                        onChange={(e) => {
                          const newOpts = [...(f.options || [])]
                          newOpts[i] = e.target.value
                          updateField(f.id, { options: newOpts })
                        }}
                        placeholder={`Option ${i + 1}`}
                        className="flex-1 px-3 py-2 border rounded text-sm focus:outline-none"
                        style={{ borderColor: 'var(--border)' }}
                      />
                      {(f.options?.length || 0) > 1 && (
                        <button
                          onClick={() => {
                            const newOpts = (f.options || []).filter((_, idx) => idx !== i)
                            updateField(f.id, { options: newOpts })
                          }}
                          className="p-2 hover:bg-red-50 rounded text-red-600 transition-smooth cursor-pointer">
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                          </svg>
                        </button>
                      )}
                    </div>
                  ))}
                  <button
                    onClick={() => {
                      const newOpts = [...(f.options || []), '']
                      updateField(f.id, { options: newOpts })
                    }}
                    className="text-xs font-medium py-1 px-2 rounded hover:bg-gray-100 mt-2"
                    style={{ color: 'var(--coral)' }}>
                    + Add option
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      ))}

      {/* Add Field Button */}
      <button
        onClick={addField}
        className="w-full py-2 rounded-lg border-2 border-dashed text-sm font-medium transition-smooth cursor-pointer hover:bg-gray-50"
        style={{ borderColor: 'var(--border)', color: 'var(--coral)' }}>
        + Add Field
      </button>
    </div>
  )
}
