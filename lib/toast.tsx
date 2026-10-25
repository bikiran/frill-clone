'use client'

import { useState } from 'react'
import ToastStack, { TOAST_EXIT_MS } from '@/components/ToastStack'

export interface Toast {
  id: string
  message: string
  type: 'success' | 'error' | 'info'
  leaving?: boolean
}

export function useToast() {
  const [toasts, setToasts] = useState<Toast[]>([])

  // Eases the toast out, then removes it.
  const removeToast = (id: string) => {
    setToasts(prev => prev.map(t => (t.id === id ? { ...t, leaving: true } : t)))
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), TOAST_EXIT_MS)
  }

  const showToast = (message: string, type: 'success' | 'error' | 'info' = 'success', duration = 3000) => {
    const id = Math.random().toString(36).slice(2, 11)
    setToasts(prev => [...prev, { id, message, type }])
    if (duration > 0) setTimeout(() => removeToast(id), duration)
    return id
  }

  return { toasts, showToast, removeToast }
}

export function ToastContainer({ toasts, onRemove }: { toasts: Toast[], onRemove: (id: string) => void }) {
  return <ToastStack toasts={toasts} onDismiss={onRemove} placement="top" />
}
