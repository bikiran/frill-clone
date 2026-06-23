'use client'

import { useEffect } from 'react'

export default function ConfirmModal({ 
  title = 'Are you sure?',
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  variant = 'danger',
  onConfirm,
  onCancel,
}: {
  title?: string
  message: string
  confirmLabel?: string
  cancelLabel?: string
  variant?: 'danger' | 'primary'
  onConfirm: () => void
  onCancel: () => void
}) {
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel()
      if (e.key === 'Enter') onConfirm()
    }
    window.addEventListener('keydown', handleKey)
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', handleKey)
      document.body.style.overflow = ''
    }
  }, [onCancel, onConfirm])

  return (
    <>
      <div 
        className="fixed inset-0 z-50 animate-backdrop backdrop-blur-sm" 
        style={{ background: 'rgba(0,0,0,0.4)' }}
        onClick={onCancel} 
      />
      <div 
        className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-full max-w-md bg-white rounded-2xl shadow-2xl animate-modal mx-4"
        style={{ border: '1px solid var(--border)' }}>
        
        <div className="p-6">
          {/* Icon */}
          <div 
            className="w-12 h-12 rounded-full flex items-center justify-center mb-4"
            style={{ 
              background: variant === 'danger' ? '#fee2e2' : 'var(--peach)' 
            }}>
            <span className="text-2xl">
              {variant === 'danger' ? '⚠️' : '❓'}
            </span>
          </div>

          {/* Title */}
          <h2 className="text-xl font-bold mb-2" style={{ color: 'var(--ink)' }}>
            {title}
          </h2>

          {/* Message */}
          <p className="text-sm mb-6" style={{ color: 'var(--slate)' }}>
            {message}
          </p>

          {/* Actions */}
          <div className="flex gap-3 justify-end">
            <button
              onClick={onCancel}
              className="px-5 py-2.5 rounded-xl text-sm font-medium border transition-smooth press-effect hover:bg-gray-50"
              style={{ borderColor: 'var(--border)', color: 'var(--ink)' }}>
              {cancelLabel}
            </button>
            <button
              onClick={onConfirm}
              autoFocus
              className="px-5 py-2.5 rounded-xl text-sm font-semibold text-white transition-smooth press-effect"
              style={{ 
                background: variant === 'danger' ? '#dc2626' : 'var(--coral)',
                boxShadow: variant === 'danger' 
                  ? '0 4px 12px rgba(220, 38, 38, 0.3)' 
                  : '0 4px 12px rgba(255, 122, 107, 0.3)'
              }}>
              {confirmLabel}
            </button>
          </div>
        </div>
      </div>
    </>
  )
}
