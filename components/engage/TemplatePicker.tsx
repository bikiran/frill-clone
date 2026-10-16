'use client'

// "New poll" / "New survey": pick a starting point (or Colvy AI). Each
// becomes a draft that opens in the editor.

import { useEffect } from 'react'
import { POLL_TEMPLATES, SURVEY_TEMPLATES } from '@/lib/engage-templates'
import type { EngageKind } from '@/lib/engage-core'
import { EngageIcon } from './icons'

export function TemplatePicker({ kind, busy, onPick, onAi, onClose }: {
  kind: EngageKind
  busy: boolean
  onPick: (key: string) => void
  onAi: () => void
  onClose: () => void
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  const list = kind === 'poll' ? POLL_TEMPLATES : SURVEY_TEMPLATES
  return (
    <>
      <div className="eg-modal-back" onClick={onClose} />
      <div className="eg-modal" role="dialog" aria-modal="true" aria-label={`New ${kind}`}>
        <div className="eg-modal-head">
          <div>
            <h2 className="eg-h2">New {kind}</h2>
            <p className="eg-help" style={{ margin: 0 }}>Start from one of these. It opens as a draft, so nothing goes live until you publish.</p>
          </div>
          <button type="button" className="fr-icon-btn" aria-label="Close" onClick={onClose}><EngageIcon name="x" size={18} /></button>
        </div>
        <div className="eg-modal-body">
          <div className="eg-tpls">
            {list.map(t => (
              <button key={t.key} type="button" className="eg-tpl" disabled={busy} onClick={() => onPick(t.key)}>
                <b>{t.title}</b>
                <span>{t.about}</span>
              </button>
            ))}
            <button type="button" className="eg-tpl is-ai" disabled={busy} onClick={onAi}>
              <b style={{ display: 'flex', alignItems: 'center', gap: 6 }}><EngageIcon name="spark" size={15} stroke="var(--coral)" />Draft with Colvy AI</b>
              <span>Describe what you want to ask and Colvy AI writes it for you.</span>
            </button>
          </div>
        </div>
      </div>
    </>
  )
}
