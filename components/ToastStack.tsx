'use client'

// The look of Colvy's toasts: a small frosted card with a coloured icon that
// springs in, and eases out when it's done (`leaving`). Used by
// components/ToastProvider and lib/toast. Tap a toast to dismiss it.

export type ToastKind = 'success' | 'error' | 'info' | 'warning'
export type StackItem = { id: string; message: string; type: ToastKind; leaving?: boolean }

/** How long the exit takes; callers remove the toast after this. */
export const TOAST_EXIT_MS = 220

const TONE: Record<ToastKind, string> = { success: '#34c759', error: '#ff3b30', info: '#007aff', warning: '#ff9f0a' }

const Glyph = ({ type }: { type: ToastKind }) => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {type === 'success' ? <polyline points="20 6 9 17 4 12" />
      : type === 'info' ? <><line x1="12" y1="11" x2="12" y2="17" /><line x1="12" y1="7" x2="12.01" y2="7" /></>
      : <><line x1="12" y1="6" x2="12" y2="13" /><line x1="12" y1="18" x2="12.01" y2="18" /></>}
  </svg>
)

export default function ToastStack({ toasts, onDismiss, placement }: { toasts: StackItem[]; onDismiss: (id: string) => void; placement: 'top' | 'bottom' }) {
  if (!toasts.length) return null
  return (
    <div className={`cv-toasts cv-toasts-${placement}`}>
      <style>{`
        .cv-toasts { position: fixed; z-index: 100003; display: flex; flex-direction: column; gap: 8px; align-items: flex-end; pointer-events: none; right: 20px; max-width: min(380px, calc(100vw - 24px)); }
        .cv-toasts-bottom { bottom: 20px; }
        .cv-toasts-top { top: 72px; }
        @media (max-width: 860px) {
          .cv-toasts { left: 12px; right: 12px; max-width: none; align-items: center; }
          .cv-toasts-bottom { bottom: calc(70px + env(safe-area-inset-bottom, 0px)); }
          .cv-toasts-top { top: calc(env(safe-area-inset-top, 0px) + 64px); }
        }
        .cv-toast { pointer-events: auto; cursor: pointer; display: flex; align-items: center; gap: 10px; max-width: 100%; padding: 11px 16px 11px 12px; border-radius: 14px; background: rgba(255,255,255,0.92); -webkit-backdrop-filter: blur(18px) saturate(180%); backdrop-filter: blur(18px) saturate(180%); border: 1px solid rgba(0,0,0,0.06); box-shadow: 0 10px 30px rgba(0,0,0,0.10), 0 1px 2px rgba(0,0,0,0.04); color: #1c1c1e; font-size: 14px; font-weight: 500; line-height: 1.35; animation: cvToastIn .42s cubic-bezier(.2,.9,.3,1.12) both; }
        .cv-toasts-top .cv-toast { animation-name: cvToastInTop; }
        .cv-toast.leaving { animation: cvToastOut ${TOAST_EXIT_MS}ms ease both; }
        .cv-toast-ic { width: 22px; height: 22px; border-radius: 50%; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
        @keyframes cvToastIn { from { opacity: 0; transform: translateY(14px) scale(.96); } to { opacity: 1; transform: none; } }
        @keyframes cvToastInTop { from { opacity: 0; transform: translateY(-14px) scale(.96); } to { opacity: 1; transform: none; } }
        @keyframes cvToastOut { to { opacity: 0; transform: scale(.97); } }
        @media (prefers-reduced-motion: reduce) { .cv-toast, .cv-toast.leaving { animation-duration: .01ms; } }
      `}</style>
      {toasts.map(t => (
        <div key={t.id} role={t.type === 'error' ? 'alert' : 'status'} aria-live="polite"
          className={`cv-toast${t.leaving ? ' leaving' : ''}`} onClick={() => onDismiss(t.id)}>
          <span className="cv-toast-ic" style={{ background: TONE[t.type] || TONE.info }}><Glyph type={t.type} /></span>
          <span style={{ minWidth: 0 }}>{t.message}</span>
        </div>
      ))}
    </div>
  )
}
