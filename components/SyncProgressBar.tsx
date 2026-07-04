'use client'

import { useState, useEffect } from 'react'

interface SyncProgressProps {
  companyId: string
  isVisible: boolean
}

export function SyncProgressBar({ companyId, isVisible }: SyncProgressProps) {
  const [progress, setProgress] = useState({
    percentComplete: 0,
    customersProcessed: 0,
    totalCustomers: 0,
    ordersProcessed: 0,
    currentCustomer: '',
    estimatedTimeRemaining: 0,
    status: 'idle'
  })

  useEffect(() => {
    if (!isVisible) return

    let pollInterval: NodeJS.Timeout

    const pollProgress = async () => {
      try {
        const res = await fetch(`/api/woocommerce/sync/progress?companyId=${companyId}`)
        const data = await res.json()

        setProgress({
          percentComplete: data.percentComplete || 0,
          customersProcessed: data.customersProcessed || 0,
          totalCustomers: data.totalCustomers || 0,
          ordersProcessed: data.ordersProcessed || 0,
          currentCustomer: data.currentCustomer || '',
          estimatedTimeRemaining: data.estimatedTimeRemaining || 0,
          status: data.status || 'idle'
        })

        if (data.status === 'complete' || data.status === 'error') {
          clearInterval(pollInterval)
        }
      } catch (err) {
        console.error('Failed to fetch progress:', err)
      }
    }

    pollInterval = setInterval(pollProgress, 500)
    pollProgress()

    return () => clearInterval(pollInterval)
  }, [companyId, isVisible])

  if (!isVisible || progress.status === 'idle') {
    return null
  }

  const formatTime = (seconds: number) => {
    if (seconds < 60) return `${Math.ceil(seconds)}s`
    const minutes = Math.floor(seconds / 60)
    const secs = Math.ceil(seconds % 60)
    return `${minutes}m ${secs}s`
  }

  return (
    <div
      style={{
        borderRadius: '12px',
        border: '1px solid var(--border)',
        padding: '20px',
        background: 'var(--peach)',
        marginBottom: '20px'
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
        <p style={{ margin: '0', fontSize: '14px', fontWeight: 600, color: 'var(--ink)' }}>
          Syncing WooCommerce Data
        </p>
        <p style={{ margin: '0', fontSize: '13px', color: '#666' }}>
          {progress.percentComplete}% • {progress.customersProcessed} of {progress.totalCustomers}
        </p>
      </div>

      <div style={{ width: '100%', height: '8px', background: '#fff', borderRadius: '4px', overflow: 'hidden', marginBottom: '12px', border: '1px solid var(--border)' }}>
        <div style={{ height: '100%', width: `${progress.percentComplete}%`, background: 'var(--coral)', transition: 'width 0.3s ease' }} />
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px' }}>
        <div>
          {progress.currentCustomer && (
            <p style={{ margin: '0', color: '#666' }}>📦 Processing: <strong>{progress.currentCustomer}</strong></p>
          )}
          <p style={{ margin: '4px 0 0 0', color: '#666' }}>📋 Orders: <strong>{progress.ordersProcessed}</strong></p>
        </div>
        <div style={{ textAlign: 'right' }}>
          {progress.estimatedTimeRemaining > 0 && (
            <p style={{ margin: '0', color: '#666' }}>⏱️ ETA: <strong>{formatTime(progress.estimatedTimeRemaining)}</strong></p>
          )}
          {progress.status === 'complete' && (
            <p style={{ margin: '0', color: '#059669', fontWeight: 600 }}>✅ Complete!</p>
          )}
          {progress.status === 'error' && (
            <p style={{ margin: '0', color: '#dc2626', fontWeight: 600 }}>❌ Failed</p>
          )}
        </div>
      </div>
    </div>
  )
}
