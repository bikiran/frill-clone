'use client'

import { useState, useEffect } from 'react'

export interface Toast {
  id: string
  message: string
  type: 'success' | 'error' | 'info'
}

export function useToast() {
  const [toasts, setToasts] = useState<Toast[]>([])

  const showToast = (message: string, type: 'success' | 'error' | 'info' = 'success', duration = 3000) => {
    const id = Math.random().toString(36).substr(2, 9)
    const toast: Toast = { id, message, type }
    
    setToasts(prev => [...prev, toast])
    
    if (duration > 0) {
      setTimeout(() => {
        setToasts(prev => prev.filter(t => t.id !== id))
      }, duration)
    }
    
    return id
  }

  const removeToast = (id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id))
  }

  return { toasts, showToast, removeToast }
}

export function ToastContainer({ toasts, onRemove }: { toasts: Toast[], onRemove: (id: string) => void }) {
  return (
    <div style={{ position: 'fixed', top: 20, right: 20, zIndex: 9999, maxWidth: 400 }}>
      {toasts.map(toast => (
        <Toast key={toast.id} toast={toast} onRemove={() => onRemove(toast.id)} />
      ))}
    </div>
  )
}

function Toast({ toast, onRemove }: { toast: Toast, onRemove: () => void }) {
  const bgColor = toast.type === 'success' ? '#10b981' : toast.type === 'error' ? '#ef4444' : '#3b82f6'
  
  return (
    <div
      style={{
        background: bgColor,
        color: 'white',
        padding: '14px 16px',
        borderRadius: 10,
        marginBottom: 10,
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
        animation: 'slideDown 0.3s ease-out, slideUp 0.3s ease-in 2.7s forwards',
      }}>
      <style>{`
        @keyframes slideDown {
          from { transform: translateY(-20px); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }
        @keyframes slideUp {
          from { transform: translateY(0); opacity: 1; }
          to { transform: translateY(-20px); opacity: 0; }
        }
      `}</style>
      
      <span style={{ flex: 1, fontSize: 14, fontWeight: 500 }}>{toast.message}</span>
      
      <button
        onClick={onRemove}
        style={{
          background: 'rgba(255,255,255,0.2)',
          border: 'none',
          color: 'white',
          cursor: 'pointer',
          borderRadius: 4,
          padding: '4px 8px',
          fontSize: 18,
          fontWeight: 'bold',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}>
        ×
      </button>
    </div>
  )
}
