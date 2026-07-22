'use client'

import { useEffect, useState } from 'react'
import { uploadQueue, type Batch } from '@/lib/upload-queue'

/**
 * A small floating card showing what's uploading in the background, so the work
 * is visible without blocking the composer. Stays out of the way: it only
 * appears while something is in flight, or when a file failed and can be
 * retried.
 */
export default function UploadQueueIndicator() {
  const [batches, setBatches] = useState<Batch[]>([])

  useEffect(() => uploadQueue.subscribe(setBatches), [])

  const visible = batches.filter(b =>
    b.items.some(i => i.status !== 'done') || !b.finished
  )
  if (visible.length === 0) return null

  return (
    <div style={{
      position: 'fixed', right: 18, bottom: 18, zIndex: 450,
      display: 'flex', flexDirection: 'column', gap: 8, width: 300, maxWidth: 'calc(100vw - 36px)',
    }}>
      {visible.map(batch => {
        const total = batch.items.length
        const done = batch.items.filter(i => i.status === 'done').length
        const failed = batch.items.filter(i => i.status === 'failed')
        const active = batch.items.find(i => i.status === 'uploading')
        // Overall progress counts finished files plus the one in flight.
        const pct = Math.round(
          ((done + (active ? active.progress : 0)) / Math.max(total, 1)) * 100
        )
        const allDone = done === total

        return (
          <div key={batch.id} className="rise" style={{
            background: '#fff', border: '1px solid var(--border)', borderRadius: 14,
            boxShadow: '0 8px 28px rgba(0,0,0,0.12)', padding: '12px 14px',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 8 }}>
              {failed.length > 0 ? (
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#dc2626" strokeWidth="2.4" strokeLinecap="round">
                  <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
                </svg>
              ) : allDone ? (
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#059669" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12"/>
                </svg>
              ) : (
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--coral)" strokeWidth="2.4" strokeLinecap="round"
                  style={{ animation: 'spin 0.9s linear infinite' }}>
                  <path d="M21 12a9 9 0 1 1-6.2-8.5"/>
                </svg>
              )}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {failed.length > 0
                    ? `${failed.length} of ${total} didn't upload`
                    : allDone ? 'Uploaded' : `Uploading ${Math.min(done + 1, total)} of ${total}`}
                </div>
                <div style={{ fontSize: 11.5, color: 'var(--slate)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {active ? active.name : batch.label}
                </div>
              </div>
              <button type="button" onClick={() => uploadQueue.dismiss(batch.id)} title="Hide"
                style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'var(--slate)', display: 'flex', padding: 2 }}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>

            {/* Progress */}
            {!allDone && failed.length === 0 && (
              <div style={{ height: 4, borderRadius: 2, background: 'var(--border)', overflow: 'hidden' }}>
                <div style={{
                  height: '100%', width: `${pct}%`, background: 'var(--coral)',
                  borderRadius: 2, transition: 'width 0.25s ease',
                }} />
              </div>
            )}

            {failed.length > 0 && (
              <>
                <p style={{ margin: '0 0 8px', fontSize: 11.5, color: 'var(--slate)', lineHeight: 1.4 }}>
                  {failed[0].error || 'The connection dropped.'} The rest were sent.
                </p>
                <button type="button" className="press" onClick={() => uploadQueue.retry(batch.id)}
                  style={{ width: '100%', padding: '7px 0', borderRadius: 8, border: 'none', background: 'var(--coral)', color: '#fff', fontSize: 12.5, fontWeight: 700, cursor: 'pointer' }}>
                  Try again
                </button>
              </>
            )}
          </div>
        )
      })}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}
